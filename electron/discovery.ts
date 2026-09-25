import dgram from 'node:dgram'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { APP_TAG, PROTOCOL_VERSION } from './config'
import type { ScopedLogger } from './logger'
import type { TranslateFn } from '../src/i18n'
import { asInt, asString, cleanName } from './protocol'
import { getBroadcastTargets, getLocalIPv4, normalizeIp } from './net-utils'
import { isVirtualInterface } from './presence'
import { PRESENCE_STATUSES, type PresenceStatus } from '../src/types'

export interface DiscoveryOptions {
  /** текст ошибок для интерфейса — на языке интерфейса */
  t: TranslateFn
  selfId: string
  getSelfName: () => string
  platform: string
  udpPort: number
  tcpPort: number
  intervalMs: number
  timeoutMs: number
  /** IP-адреса, добавленные вручную: им presence шлётся адресно (сети без broadcast) */
  getManualHosts: () => string[]
  /** статус «В сети / Отошёл / Не беспокоить» — передаётся в каждом анонсе */
  getStatus: () => PresenceStatus
  /** версия приложения — коллеги видят её в «Настройки → Сеть» */
  version?: string
  /** с какого момента мы в сети (запуск, пробуждение, появление сети) — время по нашим часам */
  getOnlineSince?: () => number
  /** с какого момента действует текущий статус */
  getStatusSince?: () => number
  /**
   * true — компьютер ушёл в сон: не анонсируемся, не принимаем анонсы и не считаем таймауты.
   * На macOS процесс ненадолго просыпается и во сне (Power Nap) — иначе коллеги видели бы
   * нас «в сети» посреди ночи, а мы бы записывали им уходы.
   */
  isPaused?: () => boolean
  log: ScopedLogger
}

export interface PeerInfo {
  id: string
  name: string
  platform: string
  status: PresenceStatus
  tcpPort: number
  /** основной адрес */
  ip: string
  /** все адреса, с которых недавно приходили пакеты, основной — первым */
  addresses: string[]
  lastSeen: number
  /** версия приложения; null — клиент до 1.3, версию не сообщает */
  version: string | null
  /** с какого момента коллега в сети — по нашим часам; null — клиент этого не сообщает */
  onlineSince: number | null
  /** с какого момента действует его статус — по нашим часам; null — не сообщает */
  statusSince: number | null
}

interface PeerRecord {
  id: string
  name: string
  platform: string
  status: PresenceStatus
  tcpPort: number
  session: string
  ip: string
  addresses: Map<string, number>
  lastSeen: number
  lastDirectReply: number
  version: string | null
  onlineSince: number | null
  statusSince: number | null
}

/** «1.3.0», «1.3.0-beta.1» */
const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,6}(?:[-+][\w.]{1,20})?$/
/** длительности в анонсе — в секундах, не больше года */
const MAX_DURATION_S = 366 * 24 * 60 * 60
/**
 * Длительность из анонса переводим в момент по нашим часам: так расхождение часов на
 * компьютерах не мешает. От пакета к пакету значение дрожит на секунду-другую
 * (округление, задержка сети) — меняем его, только если сдвиг заметный.
 */
const SINCE_JITTER_MS = 5000
/** процесс стоял дольше — считаем это сном и собираем таблицу собеседников заново */
const LONG_FREEZE_MS = 60_000

function sinceFromDuration(value: unknown, now: number): number | null {
  const seconds = asInt(value, 0, MAX_DURATION_S)
  return seconds === null ? null : now - seconds * 1000
}

function sameMoment(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b
  return Math.abs(a - b) <= SINCE_JITTER_MS
}

/**
 * События:
 *  'peer-online'  (peer: PeerInfo)
 *  'peer-offline' (peer: PeerInfo, reason: string)
 *  'peer-updated' (peer: PeerInfo)
 *  'peer-reset'   (peerId: string, reason: string) — сменился IP/порт/сессия: старые TCP-соединения мертвы
 *  'connect-request' (peerId: string, ip: string, tcpPort: number)
 *  'status'       ()
 *  'resumed'      () — процесс стоял несколько секунд (сон без события «проснулся»)
 */
export class Discovery extends EventEmitter {
  private socket: dgram.Socket | null = null
  private readonly peers = new Map<string, PeerRecord>()
  private readonly session = randomUUID()
  private announceTimer: NodeJS.Timeout | null = null
  private sweepTimer: NodeJS.Timeout | null = null
  private restartTimer: NodeJS.Timeout | null = null
  private summaryTimer: NodeJS.Timeout | null = null
  private burstTimers: NodeJS.Timeout[] = []
  private readonly sendErrorLog = new Map<string, number>()
  private running = false
  /** когда последний раз отработал sweep: большой разрыв — процесс стоял (сон компьютера) */
  private lastSweepAt = 0
  listening = false
  lastError: string | null = null

  constructor(private readonly opts: DiscoveryOptions) {
    super()
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.openSocket()
    this.announceTimer = setInterval(() => this.announce(), this.opts.intervalMs)
    this.lastSweepAt = Date.now()
    this.sweepTimer = setInterval(() => this.sweep(), 1000)
    this.summaryTimer = setInterval(() => this.logPeerTable('periodic'), 30000)
  }

  async stop(): Promise<void> {
    if (!this.running) return
    this.running = false
    for (const t of [this.announceTimer, this.sweepTimer, this.summaryTimer]) if (t) clearInterval(t)
    for (const t of [this.restartTimer, ...this.burstTimers]) if (t) clearTimeout(t)
    this.burstTimers = []
    const socket = this.socket
    await Promise.race([this.sayBye(), new Promise((r) => setTimeout(r, 300))])
    this.listening = false
    this.socket = null
    try {
      socket?.close()
    } catch {
      // уже закрыт
    }
  }

  getPeer(id: string): PeerInfo | undefined {
    const record = this.peers.get(id)
    return record ? this.toInfo(record) : undefined
  }

  getPeers(): PeerInfo[] {
    return [...this.peers.values()].map((r) => this.toInfo(r))
  }

  /** Немедленный анонс (при старте, смене имени, добавлении ручного адреса) */
  announce(): void {
    if (!this.socket || !this.listening || this.paused()) return
    const packet = this.presence(false)
    const targets = this.targets()
    for (const host of targets) this.send(packet, host)
    this.opts.log.debug(`-> presence to ${targets.join(', ')}`)
  }

  /**
   * «bye» всем: собеседники уберут нас из списка сразу, а не через peerTimeoutMs.
   * Вызывается при выходе, выключении компьютера и уходе в сон.
   */
  sayBye(): Promise<void> {
    if (!this.socket || !this.listening) return Promise.resolve()
    const bye = { type: 'bye', app: APP_TAG, v: PROTOCOL_VERSION, id: this.opts.selfId }
    const targets = this.targets()
    this.opts.log.info(`-> bye to ${targets.join(', ')}`)
    return Promise.all(targets.map((host) => this.sendAsync(bye, host).catch(() => undefined))).then(() => undefined)
  }

  /**
   * После сна компьютера отметки «последний пакет» устарели, но собеседники никуда не делись:
   * даём им полный таймаут, чтобы откликнуться, и сразу анонсируемся сами.
   */
  handleResume(): void {
    const now = Date.now()
    for (const record of this.peers.values()) {
      record.lastSeen = now
      for (const ip of record.addresses.keys()) record.addresses.set(ip, now)
    }
    for (const t of this.burstTimers) clearTimeout(t)
    this.announce()
    this.burstTimers = [400, 1200].map((ms) => setTimeout(() => this.announce(), ms))
  }

  /**
   * Забыть всех: компьютер уснул. Кто за время сна ушёл, а кто пришёл — неизвестно, поэтому
   * после пробуждения каждый появится заново («peer-online»), и main возьмёт время его прихода
   * из анонса. События 'peer-offline' идут с причиной; main в это время строк не пишет.
   */
  resetPeers(reason: string): void {
    for (const record of [...this.peers.values()]) this.removePeer(record, reason)
  }

  /** Просим пира самому открыть TCP к нам (у нас не получилось подключиться к нему). */
  sendConnectRequest(peerId: string): void {
    const record = this.peers.get(peerId)
    if (!record) return
    const packet = {
      type: 'connect-request',
      app: APP_TAG,
      v: PROTOCOL_VERSION,
      id: this.opts.selfId,
      tcpPort: this.opts.tcpPort
    }
    for (const ip of record.addresses.keys()) this.send(packet, ip)
    this.opts.log.info(`-> connect-request to "${record.name}" (${[...record.addresses.keys()].join(', ')})`)
  }

  private paused(): boolean {
    return this.opts.isPaused?.() ?? false
  }

  // ─── сокет ────────────────────────────────────────────────────────────────────

  private openSocket(): void {
    // reuseAddr: второй экземпляр (или другое приложение) на той же машине тоже сможет
    // слушать порт; broadcast-пакеты получат оба.
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    this.socket = socket

    socket.on('error', (err: NodeJS.ErrnoException) => {
      this.opts.log.error(`UDP socket error: ${err.code ?? ''} ${err.message}`)
      // текст показывается пользователю в интерфейсе
      this.lastError =
        err.code === 'EADDRINUSE'
          ? this.opts.t('error.udpBusy', { port: this.opts.udpPort })
          : this.opts.t('error.udpOther', { code: err.code ?? err.message })
      this.listening = false
      this.emit('status')
      try {
        socket.close()
      } catch {
        // уже закрыт
      }
      if (this.socket === socket) this.socket = null
      this.scheduleRestart()
    })

    socket.on('listening', () => {
      try {
        socket.setBroadcast(true)
      } catch (err) {
        this.opts.log.error('setBroadcast failed:', err)
      }
      this.listening = true
      this.lastError = null
      this.opts.log.info(
        `listening on UDP 0.0.0.0:${this.opts.udpPort}, announcing TCP port ${this.opts.tcpPort}, id=${this.opts.selfId}`
      )
      this.emit('status')
      // Серия анонсов при старте: broadcast в Wi-Fi идёт без подтверждений и повторов,
      // а macOS может задержать первые пакеты нового процесса на пару секунд.
      // Без серии собеседник появлялся бы только через broadcastIntervalMs.
      this.announce()
      this.burstTimers = [400, 1200].map((ms) => setTimeout(() => this.announce(), ms))
    })

    socket.on('message', (buf, rinfo) => this.onMessage(buf, rinfo))
    socket.bind({ port: this.opts.udpPort, address: '0.0.0.0' })
  }

  private scheduleRestart(): void {
    if (!this.running || this.restartTimer) return
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      if (this.running && !this.socket) {
        this.opts.log.info('reopening UDP socket')
        this.openSocket()
      }
    }, 3000)
  }

  private targets(): string[] {
    const set = new Set(getBroadcastTargets())
    for (const host of this.opts.getManualHosts()) set.add(host)
    return [...set]
  }

  private presence(direct: boolean) {
    return {
      type: 'presence',
      app: APP_TAG,
      v: PROTOCOL_VERSION,
      id: this.opts.selfId,
      name: this.opts.getSelfName(),
      tcpPort: this.opts.tcpPort,
      platform: this.opts.platform,
      status: this.opts.getStatus(),
      session: this.session,
      direct,
      ...this.presenceExtras()
    }
  }

  /** Поля 1.3: клиенты до 1.3 их не читают и не ломаются — лишние поля они пропускают */
  private presenceExtras(): Record<string, string | number> {
    const now = Date.now()
    const extras: Record<string, string | number> = {}
    if (this.opts.version) extras.ver = this.opts.version
    const onlineSince = this.opts.getOnlineSince?.()
    if (onlineSince !== undefined) extras.up = Math.max(0, Math.round((now - onlineSince) / 1000))
    const statusSince = this.opts.getStatusSince?.()
    if (statusSince !== undefined) extras.st = Math.max(0, Math.round((now - statusSince) / 1000))
    return extras
  }

  private send(packet: object, host: string, port = this.opts.udpPort): void {
    this.sendAsync(packet, host, port).catch(() => {
      // ошибки уже залогированы в sendAsync
    })
  }

  private sendAsync(packet: object, host: string, port = this.opts.udpPort): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.socket
      if (!socket) return resolve()
      const data = Buffer.from(JSON.stringify(packet), 'utf8')
      try {
        socket.send(data, port, host, (err) => {
          if (err) {
            this.logSendError(host, err as NodeJS.ErrnoException)
            reject(err)
          } else resolve()
        })
      } catch (err) {
        this.logSendError(host, err as NodeJS.ErrnoException)
        reject(err)
      }
    })
  }

  private logSendError(host: string, err: NodeJS.ErrnoException): void {
    // Limited broadcast часто недоступен (macOS с VPN, несколько интерфейсов) — это нормально,
    // пакеты всё равно уходят через broadcast-адреса подсетей.
    if (host === '255.255.255.255') {
      this.opts.log.debug(`UDP send to 255.255.255.255 failed: ${err.code ?? err.message} (subnet broadcasts are used)`)
      return
    }
    const key = `${host}|${err.code}`
    const now = Date.now()
    if (now - (this.sendErrorLog.get(key) ?? 0) < 60000) return
    this.sendErrorLog.set(key, now)
    let hint = ''
    // Совет про разрешение «Локальная сеть» уместен для настоящей сети. Broadcast в подсеть
    // Parallels/VirtualBox при выключенной виртуальной машине недоступен и так.
    const iface = getLocalIPv4().find((a) => a.broadcast === host)?.iface
    if (
      process.platform === 'darwin' &&
      (err.code === 'EHOSTUNREACH' || err.code === 'EACCES' || err.code === 'EPERM') &&
      host !== '255.255.255.255' &&
      !(iface && isVirtualInterface(iface))
    ) {
      hint =
        ' (macOS: check System Settings -> Privacy & Security -> Local Network permission for this app)'
    }
    this.opts.log.warn(`UDP send to ${host}:${this.opts.udpPort} failed: ${err.code ?? err.message}${hint}`)
  }

  // ─── входящие пакеты ──────────────────────────────────────────────────────────

  private onMessage(buf: Buffer, rinfo: dgram.RemoteInfo): void {
    if (buf.length > 4096) return
    let packet: Record<string, unknown>
    try {
      packet = JSON.parse(buf.toString('utf8'))
    } catch {
      return
    }
    if (!packet || typeof packet !== 'object' || packet.app !== APP_TAG) return
    const id = asString(packet.id, 64)
    if (!id || id === this.opts.selfId) return
    // во сне (Power Nap) чужие анонсы не принимаем: иначе коллеги «появлялись» бы ночью
    if (this.paused()) return
    // IP берём из сокета, а не из тела пакета
    const ip = normalizeIp(rinfo.address)

    switch (packet.type) {
      case 'presence':
        this.onPresence(id, packet, ip, rinfo.port)
        break
      case 'bye': {
        const record = this.peers.get(id)
        this.opts.log.debug(`<- bye from ${id.slice(0, 8)} ${ip}`)
        if (record) this.removePeer(record, 'said bye')
        break
      }
      case 'connect-request': {
        const tcpPort = asInt(packet.tcpPort, 1, 65535)
        this.opts.log.info(`<- connect-request from ${id.slice(0, 8)} ${ip}:${tcpPort}`)
        if (tcpPort) this.emit('connect-request', id, ip, tcpPort)
        break
      }
    }
  }

  private onPresence(id: string, packet: Record<string, unknown>, ip: string, port: number): void {
    const tcpPort = asInt(packet.tcpPort, 1, 65535)
    if (!tcpPort) return
    const name = cleanName(packet.name) || 'Unknown'
    const platform = asString(packet.platform, 16) ?? 'unknown'
    const session = asString(packet.session, 64) ?? ''
    const direct = packet.direct === true
    // клиенты без поддержки статусов его не присылают — считаем «в сети»
    const status = PRESENCE_STATUSES.includes(packet.status as PresenceStatus)
      ? (packet.status as PresenceStatus)
      : 'online'
    const now = Date.now()
    const rawVersion = asString(packet.ver, 32)
    const version = rawVersion && VERSION_RE.test(rawVersion) ? rawVersion : null
    const onlineSince = sinceFromDuration(packet.up, now)
    const statusSince = sinceFromDuration(packet.st, now)

    this.opts.log.debug(
      `<- presence${direct ? ' (direct)' : ''} from "${name}" id=${id.slice(0, 8)} ${ip}:${port} tcp=${tcpPort} ${platform}`
    )

    let record = this.peers.get(id)
    if (!record) {
      record = {
        id,
        name,
        platform,
        status,
        tcpPort,
        session,
        ip,
        addresses: new Map([[ip, now]]),
        lastSeen: now,
        lastDirectReply: 0,
        version,
        onlineSince,
        statusSince
      }
      this.peers.set(id, record)
      this.opts.log.info(`+ peer online: "${name}" id=${id.slice(0, 8)} at ${ip}, tcp ${tcpPort} (${platform})`)
      this.emit('peer-online', this.toInfo(record))
      this.logPeerTable('changed')
    } else {
      record.lastSeen = now
      record.addresses.set(ip, now)
      let updated = false
      let reset: string | null = null

      if (record.session !== session) {
        reset = 'peer restarted'
        record.session = session
      }
      if (record.tcpPort !== tcpPort) {
        reset = `tcp port ${record.tcpPort} -> ${tcpPort}`
        record.tcpPort = tcpPort
        updated = true
      }
      if (record.name !== name || record.platform !== platform) {
        this.opts.log.info(`~ peer "${record.name}" is now "${name}"`)
        record.name = name
        record.platform = platform
        updated = true
      }
      if (record.status !== status) {
        this.opts.log.info(`~ peer "${name}" status ${record.status} -> ${status}`)
        record.status = status
        updated = true
      }
      if (record.version !== version) {
        this.opts.log.info(`~ peer "${name}" version ${record.version ?? '-'} -> ${version ?? '-'}`)
        record.version = version
        updated = true
      }
      if (!sameMoment(record.onlineSince, onlineSince)) {
        record.onlineSince = onlineSince
        updated = true
      }
      if (!sameMoment(record.statusSince, statusSince)) {
        record.statusSince = statusSince
        updated = true
      }
      // Пир с несколькими интерфейсами (Wi-Fi + Ethernet) шлёт с разных адресов:
      // основной адрес меняем, только если с него давно ничего не приходило.
      const currentSeen = record.addresses.get(record.ip) ?? 0
      if (record.ip !== ip && now - currentSeen > this.opts.intervalMs * 2 + 500) {
        this.opts.log.info(`~ peer "${name}" address ${record.ip} -> ${ip}`)
        reset = `address ${record.ip} -> ${ip}`
        record.ip = ip
        updated = true
      }
      if (reset) this.emit('peer-reset', id, reset)
      if (updated) this.emit('peer-updated', this.toInfo(record))
    }

    // Адресный ответ: новый пир видит нас сразу, а при «односторонней» доставке broadcast
    // (роутер не пропускает broadcast из Wi-Fi в Ethernet и т.п.) пир не пропадает из списка.
    if (!direct && now - record.lastDirectReply >= this.opts.intervalMs * 1.5) {
      record.lastDirectReply = now
      this.send(this.presence(true), ip, port)
    }
  }

  private sweep(): void {
    const now = Date.now()
    const gap = now - this.lastSweepAt
    this.lastSweepAt = now
    if (this.paused()) return
    // Таймер секундный: разрыв в несколько секунд значит, что процесс стоял — компьютер спал,
    // а событие «проснулся» система не прислала (так бывает на macOS). Коллеги от этого
    // никуда не ушли: даём им полный таймаут откликнуться, а не записываем всем уход.
    if (gap > Math.max(5000, this.opts.intervalMs * 2)) {
      this.opts.log.info(`process was frozen for ${Math.round(gap / 1000)}s (system sleep?) — refreshing peer table`)
      this.handleResume()
      this.emit('resumed')
      // долгая остановка — как сон: кто ушёл и кто пришёл, неизвестно, собираем таблицу заново
      if (gap >= LONG_FREEZE_MS) this.resetPeers(`frozen for ${Math.round(gap / 1000)}s`)
      return
    }
    for (const record of this.peers.values()) {
      for (const [ip, seen] of record.addresses) {
        if (now - seen > this.opts.timeoutMs && record.addresses.size > 1) record.addresses.delete(ip)
      }
      if (now - record.lastSeen > this.opts.timeoutMs) {
        this.removePeer(record, `no presence for ${Math.round((now - record.lastSeen) / 1000)}s`)
      } else if (!record.addresses.has(record.ip)) {
        const freshest = [...record.addresses.entries()].sort((a, b) => b[1] - a[1])[0]
        if (freshest) {
          this.opts.log.info(`~ peer "${record.name}" address ${record.ip} -> ${freshest[0]}`)
          record.ip = freshest[0]
          this.emit('peer-reset', record.id, 'address expired')
          this.emit('peer-updated', this.toInfo(record))
        }
      }
    }
  }

  private removePeer(record: PeerRecord, reason: string): void {
    if (!this.peers.delete(record.id)) return
    this.opts.log.info(`- peer offline: "${record.name}" id=${record.id.slice(0, 8)} (${reason})`)
    this.emit('peer-offline', this.toInfo(record), reason)
    this.logPeerTable('changed')
  }

  private toInfo(record: PeerRecord): PeerInfo {
    const others = [...record.addresses.entries()]
      .filter(([ip]) => ip !== record.ip)
      .sort((a, b) => b[1] - a[1])
      .map(([ip]) => ip)
    return {
      id: record.id,
      name: record.name,
      platform: record.platform,
      status: record.status,
      tcpPort: record.tcpPort,
      ip: record.ip,
      addresses: [record.ip, ...others],
      lastSeen: record.lastSeen,
      version: record.version,
      onlineSince: record.onlineSince,
      statusSince: record.statusSince
    }
  }

  private logPeerTable(reason: 'changed' | 'periodic'): void {
    if (reason === 'periodic' && this.peers.size === 0 && !this.listening) return
    const list = [...this.peers.values()]
      .map((p) => `"${p.name}"@${p.ip}:${p.tcpPort}`)
      .join(', ')
    this.opts.log.info(`online peers (${this.peers.size}): ${list || '-'}`)
  }
}
