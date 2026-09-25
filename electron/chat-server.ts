import net from 'node:net'
import { EventEmitter } from 'node:events'
import { PROTOCOL_VERSION } from './config'
import type { PeerInfo } from './discovery'
import type { ScopedLogger } from './logger'
import { normalizeIp } from './net-utils'
import {
  LineReader,
  MAX_EVERYONE_IDS,
  MAX_LINE_BYTES,
  MAX_TEXT_LENGTH,
  asInt,
  asString,
  cleanName,
  encodeLine,
  isValidGroupId,
  parseEveryoneMeta,
  parseGroupInfo,
  parsePacket,
  parseReplyRef,
  parseSha256,
  parseThumbnail,
  readFirstLine,
  type EveryoneMeta,
  type GroupInfo,
  type Packet
} from './protocol'
import type { ReplyRef } from '../src/types'
import type { TranslateFn } from '../src/i18n'

export const CONNECT_TIMEOUT_MS = 4000
export const HANDSHAKE_TIMEOUT_MS = 5000
const ACK_TIMEOUT_MS = 6000
const REVERSE_CONNECT_WAIT_MS = 5000
const KEEPALIVE_MS = 15000
const MAX_LINKS_PER_PEER = 4
const SEEN_IDS_LIMIT = 10000

export interface PeerDirectory {
  getPeer(id: string): PeerInfo | undefined
  sendConnectRequest(id: string): void
}

export interface ChatServiceOptions {
  /** тексты ошибок, которые увидит пользователь, — на языке интерфейса */
  t: TranslateFn
  selfId: string
  getSelfName: () => string
  platform: string
  tcpPort: number
  tcpPortAttempts: number
  directory: PeerDirectory
  log: ScopedLogger
}

export interface HelloInfo {
  id: string
  name: string
  platform: string
  tcpPort: number | null
  ip: string
}

export interface IncomingMessage {
  id: string
  text: string
  timestamp: number
  replyTo?: ReplyRef
  broadcast?: boolean
  /** сообщение в группу: состав приходит вместе с сообщением, поэтому группа не потеряется */
  group?: GroupInfo
  /**
   * id сообщения у автора. В группе каждому участнику уходит свой пакет со своим id,
   * а отметка «прочитано» должна ссылаться на то, что понимает автор.
   */
  origin?: string
  /** сообщение общего чата (автор мог быть и не тем, кто прислал пакет, — досылка) */
  everyone?: EveryoneMeta
}

export interface IncomingOffer {
  id: string
  name: string
  size: number
  timestamp: number
  thumbnail?: string
  /** предложение файла в группу: карточка появится в переписке группы */
  group?: GroupInfo
  /** карточка файла в общем чате */
  everyone?: EveryoneMeta
  sha256?: string
}

export interface FileConnection {
  socket: net.Socket
  packet: Packet
  rest: Buffer
  remote: string
}

function parseHello(packet: Packet, ip: string): HelloInfo | null {
  if (packet.type !== 'hello') return null
  const id = asString(packet.id, 64)
  if (!id) return null
  return {
    id,
    name: cleanName(packet.name) || 'Unknown',
    platform: asString(packet.platform, 16) ?? 'unknown',
    tcpPort: asInt(packet.tcpPort, 1, 65535),
    ip
  }
}

/** Одно TCP-соединение с собеседником после успешного hello. Работает в обе стороны. */
export class PeerConnection {
  closed = false
  closeReason: string | null = null
  readonly pendingAcks = new Set<string>()
  readonly remote: string
  private readonly reader = new LineReader(MAX_LINE_BYTES)

  constructor(
    readonly socket: net.Socket,
    readonly peerId: string,
    readonly peerName: string,
    readonly direction: 'in' | 'out',
    private readonly handlers: {
      onPacket: (conn: PeerConnection, packet: Packet) => void
      onClose: (conn: PeerConnection) => void
    }
  ) {
    this.remote = `${normalizeIp(socket.remoteAddress)}:${socket.remotePort}`
    socket.setNoDelay(true)
    socket.setKeepAlive(true, KEEPALIVE_MS)
    if (socket.destroyed) {
      this.closed = true
      return
    }
    socket.once('close', () => {
      if (this.closed) return
      this.closed = true
      this.handlers.onClose(this)
    })
  }

  /** initial — байты, пришедшие сразу за hello */
  start(initial: Buffer): void {
    if (initial.length) this.onData(initial)
    if (this.closed) return
    this.socket.on('data', (chunk: Buffer) => this.onData(chunk))
    this.socket.resume()
  }

  send(packet: object): boolean {
    if (this.closed || this.socket.destroyed || !this.socket.writable) return false
    this.socket.write(encodeLine(packet))
    return true
  }

  destroy(reason: string): void {
    if (this.closed || this.socket.destroyed) return
    this.closeReason = reason
    this.socket.destroy()
  }

  private onData(chunk: Buffer): void {
    let lines: string[]
    try {
      lines = this.reader.push(chunk)
    } catch (err) {
      this.destroy((err as Error).message)
      return
    }
    for (const line of lines) {
      if (this.closed) return
      if (!line.trim()) continue
      const packet = parsePacket(line)
      if (packet) this.handlers.onPacket(this, packet)
    }
  }
}

/**
 * TCP-сервер + исходящие соединения + доставка с подтверждением.
 *
 * События:
 *  'message'         (peerId, IncomingMessage)
 *  'group-info'      (peerId, GroupInfo)
 *  'group-leave'     (peerId, groupId)
 *  'group-delete'    (peerId, groupId)
 *  'file-offer'      (peerId, IncomingOffer)
 *  'file-control'    (peerId, type, fileId, reason?)
 *  'file-connection' (FileConnection)
 *  'peer-hello'      (HelloInfo)
 *  'link-up' / 'link-down' (peerId)
 */
export class ChatService extends EventEmitter {
  port: number | null = null
  private server: net.Server | null = null
  private readonly links = new Map<string, PeerConnection[]>()
  private readonly connecting = new Map<string, Promise<PeerConnection>>()
  private readonly acks = new Map<string, { peerId: string; settle: (err?: Error) => void }>()
  private readonly queues = new Map<string, Promise<void>>()
  private readonly seen = new Set<string>()
  private readonly sockets = new Set<net.Socket>()
  private stopped = false

  constructor(private readonly opts: ChatServiceOptions) {
    super()
  }

  // ─── сервер ───────────────────────────────────────────────────────────────────

  async start(): Promise<number> {
    const { tcpPort, tcpPortAttempts, log } = this.opts
    for (let i = 0; i < tcpPortAttempts && tcpPort + i <= 65535; i++) {
      const port = tcpPort + i
      try {
        await this.listen(port)
        this.port = port
        log.info(`TCP server listening on 0.0.0.0:${port}${i > 0 ? ` (base port ${tcpPort} was unavailable)` : ''}`)
        return port
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        // EACCES на Windows — порт в диапазоне, зарезервированном Hyper-V/WinNAT
        if (code !== 'EADDRINUSE' && code !== 'EACCES') throw err
        log.warn(`TCP port ${port} unavailable (${code}), trying next`)
      }
    }
    throw new Error(`no free TCP port in range ${tcpPort}..${tcpPort + tcpPortAttempts - 1}`)
  }

  private listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => this.onInbound(socket))
      server.once('error', reject)
      server.listen({ port, host: '0.0.0.0', exclusive: true }, () => {
        server.off('error', reject)
        server.on('error', (err) => this.opts.log.error('TCP server error:', err.message))
        this.server = server
        resolve()
      })
    })
  }

  stop(): void {
    this.stopped = true
    this.server?.close()
    this.server = null
    for (const socket of this.sockets) socket.destroy()
    for (const pending of [...this.acks.values()]) pending.settle(new Error(this.opts.t('error.appClosing')))
  }

  private track(socket: net.Socket): void {
    this.sockets.add(socket)
    // Постоянный обработчик ошибок: без него ECONNRESET превращается в uncaught exception
    socket.on('error', (err: NodeJS.ErrnoException) => {
      this.opts.log.debug(`socket ${normalizeIp(socket.remoteAddress)} error: ${err.code ?? err.message}`)
    })
    socket.once('close', () => this.sockets.delete(socket))
  }

  private onInbound(socket: net.Socket): void {
    this.track(socket)
    if (this.stopped) {
      socket.destroy()
      return
    }
    const remote = normalizeIp(socket.remoteAddress)
    this.opts.log.debug(`inbound TCP from ${remote}:${socket.remotePort}`)

    readFirstLine(socket, HANDSHAKE_TIMEOUT_MS)
      .then(({ packet, rest }) => {
        if (packet.type === 'hello') {
          this.acceptHello(socket, packet, rest, remote)
        } else if (
          (packet.type === 'file-request' || packet.type === 'file-push') &&
          this.listenerCount('file-connection') > 0
        ) {
          this.emit('file-connection', { socket, packet, rest, remote } satisfies FileConnection)
        } else {
          this.opts.log.warn(`unexpected first packet "${packet.type}" from ${remote}`)
          socket.destroy()
        }
      })
      .catch((err: Error) => {
        this.opts.log.warn(`inbound handshake from ${remote} failed: ${err.message}`)
        socket.destroy()
      })
  }

  private acceptHello(socket: net.Socket, packet: Packet, rest: Buffer, remote: string): void {
    const hello = parseHello(packet, remote)
    if (!hello || hello.id === this.opts.selfId) {
      socket.destroy()
      return
    }
    socket.write(encodeLine(this.helloPacket()))
    this.emit('peer-hello', hello)
    const conn = this.createConnection(socket, hello, 'in')
    if (!conn) return
    this.opts.log.info(`TCP link <- "${hello.name}" ${conn.remote} (inbound)`)
    conn.start(rest)
  }

  private helloPacket() {
    return {
      type: 'hello',
      v: PROTOCOL_VERSION,
      id: this.opts.selfId,
      name: this.opts.getSelfName(),
      tcpPort: this.port,
      platform: this.opts.platform
    }
  }

  private createConnection(socket: net.Socket, hello: HelloInfo, direction: 'in' | 'out'): PeerConnection | null {
    const conn = new PeerConnection(socket, hello.id, hello.name, direction, {
      onPacket: (c, p) => this.onPacket(c, p),
      onClose: (c) => this.onConnectionClosed(c)
    })
    if (conn.closed) return null
    const list = this.links.get(hello.id) ?? []
    list.push(conn)
    while (list.length > MAX_LINKS_PER_PEER) list.shift()?.destroy('too many links to the same peer')
    this.links.set(hello.id, list)
    this.emit('link-up', hello.id)
    return conn
  }

  private onConnectionClosed(conn: PeerConnection): void {
    const rest = (this.links.get(conn.peerId) ?? []).filter((c) => c !== conn)
    if (rest.length) this.links.set(conn.peerId, rest)
    else this.links.delete(conn.peerId)
    for (const id of [...conn.pendingAcks]) this.acks.get(id)?.settle(new Error(this.opts.t('error.linkLost')))
    this.opts.log.info(
      `TCP link closed: "${conn.peerName}" ${conn.remote} (${conn.direction})${conn.closeReason ? ': ' + conn.closeReason : ''}`
    )
    if (!rest.length) this.emit('link-down', conn.peerId)
  }

  // ─── исходящие соединения ─────────────────────────────────────────────────────

  hasLink(peerId: string): boolean {
    return this.getLink(peerId) !== undefined
  }

  /** С кем сейчас есть живое чат-соединение (бывает раньше, чем пир найден по UDP) */
  linkedPeerIds(): string[] {
    return [...this.links.keys()].filter((id) => this.getLink(id))
  }

  private getLink(peerId: string): PeerConnection | undefined {
    return this.links
      .get(peerId)
      // закрываемое (destroy уже вызван, событие close ещё не пришло) — не годится:
      // иначе повтор после «нет подтверждения» сразу упирался бы в то же мёртвое соединение
      ?.filter((c) => !c.closed && !c.socket.destroyed)
      .at(-1)
  }

  /** Существующее соединение или новое (с дедупликацией параллельных попыток). */
  getConnection(peerId: string): Promise<PeerConnection> {
    const existing = this.getLink(peerId)
    if (existing) return Promise.resolve(existing)
    let pending = this.connecting.get(peerId)
    if (!pending) {
      pending = this.establish(peerId).finally(() => this.connecting.delete(peerId))
      this.connecting.set(peerId, pending)
    }
    return pending
  }

  private async establish(peerId: string): Promise<PeerConnection> {
    if (this.stopped) throw new Error(this.opts.t('error.appClosing'))
    const peer = this.opts.directory.getPeer(peerId)
    if (!peer) throw new Error(this.opts.t('error.peerOffline'))

    const errors: string[] = []
    for (const ip of peer.addresses) {
      try {
        return await this.connectTo(ip, peer.tcpPort, peerId)
      } catch (err) {
        errors.push(`${ip}:${peer.tcpPort} ${(err as Error).message}`)
        const link = this.getLink(peerId)
        if (link) return link
      }
    }

    // Входящие к собеседнику закрыты (брандмауэр), но он, возможно, может подключиться к нам
    this.opts.log.warn(`direct TCP to "${peer.name}" failed: ${errors.join('; ')}`)
    this.opts.directory.sendConnectRequest(peerId)
    const link = await this.waitForLink(peerId, REVERSE_CONNECT_WAIT_MS)
    if (link) {
      this.opts.log.info(`reverse TCP link with "${peer.name}" established`)
      return link
    }
    throw new Error(this.opts.t('error.noTcp', { address: `${peer.ip}:${peer.tcpPort}` }))
  }

  private async connectTo(ip: string, port: number, expectedId: string): Promise<PeerConnection> {
    const socket = await this.openSocket(ip, port)
    try {
      socket.write(encodeLine(this.helloPacket()))
      const { packet, rest } = await readFirstLine(socket, HANDSHAKE_TIMEOUT_MS)
      const hello = parseHello(packet, ip)
      if (!hello) throw new Error('invalid hello')
      if (hello.id !== expectedId) throw new Error(`another client answered (id ${hello.id.slice(0, 8)})`)
      this.emit('peer-hello', hello)
      const conn = this.createConnection(socket, hello, 'out')
      if (!conn) throw new Error('connection closed')
      this.opts.log.info(`TCP link -> "${hello.name}" ${ip}:${port} (outbound)`)
      conn.start(rest)
      return conn
    } catch (err) {
      socket.destroy()
      throw err
    }
  }

  /** Обычный TCP connect с таймаутом (без hello). */
  openSocket(ip: string, port: number): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      if (this.stopped) {
        reject(new Error(this.opts.t('error.appClosing')))
        return
      }
      const socket = net.connect({ host: ip, port })
      this.track(socket)
      const timer = setTimeout(() => {
        socket.destroy()
        reject(new Error('connect timeout'))
      }, CONNECT_TIMEOUT_MS)
      socket.once('connect', () => {
        clearTimeout(timer)
        socket.setNoDelay(true)
        socket.setKeepAlive(true, KEEPALIVE_MS)
        resolve(socket)
      })
      socket.once('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timer)
        reject(new Error(err.code ?? err.message))
      })
    })
  }

  /** Сырой сокет к собеседнику для передачи файла: перебирает все его известные адреса. */
  async connectRaw(peerId: string): Promise<net.Socket> {
    const peer = this.opts.directory.getPeer(peerId)
    if (!peer) throw new Error(this.opts.t('error.peerOffline'))
    const errors: string[] = []
    for (const ip of peer.addresses) {
      try {
        return await this.openSocket(ip, peer.tcpPort)
      } catch (err) {
        errors.push(`${ip}:${peer.tcpPort} ${(err as Error).message}`)
      }
    }
    throw new Error(errors.join('; '))
  }

  private waitForLink(peerId: string, timeoutMs: number): Promise<PeerConnection | null> {
    const existing = this.getLink(peerId)
    if (existing) return Promise.resolve(existing)
    return new Promise((resolve) => {
      const done = (link: PeerConnection | null) => {
        clearTimeout(timer)
        this.off('link-up', onLink)
        resolve(link)
      }
      const onLink = (id: string) => {
        const link = id === peerId ? this.getLink(peerId) : undefined
        if (link) done(link)
      }
      const timer = setTimeout(() => done(null), timeoutMs)
      this.on('link-up', onLink)
    })
  }

  /** Собеседник не смог подключиться к нам и просит подключиться к нему самим. */
  handleConnectRequest(peerId: string, ip: string, tcpPort: number): void {
    if (this.stopped || this.getLink(peerId) || this.connecting.has(peerId)) return
    // Только прямое подключение — без встречного connect-request, чтобы не зациклиться
    const attempt = this.connectTo(ip, tcpPort, peerId).finally(() => this.connecting.delete(peerId))
    this.connecting.set(peerId, attempt)
    attempt.then(
      (conn) => this.opts.log.info(`connected back to "${conn.peerName}" on request`),
      (err: Error) => this.opts.log.warn(`connect-back to ${ip}:${tcpPort} failed: ${err.message}`)
    )
  }

  /** Закрыть все соединения с пиром (ушёл офлайн, сменил адрес или перезапустился). */
  dropPeer(peerId: string, reason: string): void {
    for (const conn of this.links.get(peerId) ?? []) conn.destroy(reason)
  }

  // ─── отправка ─────────────────────────────────────────────────────────────────

  /**
   * Отправка с подтверждением (ack). Пакеты к одному собеседнику уходят строго по очереди,
   * поэтому порядок сообщений сохраняется даже при повторах.
   */
  sendReliable(peerId: string, packet: Packet & { id: string }, stillWanted?: () => boolean): Promise<void> {
    const previous = this.queues.get(peerId) ?? Promise.resolve()
    // пока пакет ждал своей очереди, отправку могли отменить
    const run = previous.then(() => {
      if (stillWanted && !stillWanted()) throw new Error(this.opts.t('outbox.canceled'))
      return this.deliver(peerId, packet)
    })
    const tail = run.catch(() => undefined)
    this.queues.set(peerId, tail)
    void tail.then(() => {
      if (this.queues.get(peerId) === tail) this.queues.delete(peerId)
    })
    return run
  }

  private async deliver(peerId: string, packet: Packet & { id: string }): Promise<void> {
    let lastError: Error = new Error(this.opts.t('error.notSent'))
    for (let attempt = 1; attempt <= 2; attempt++) {
      // Не удалось даже подключиться — повторять сразу бессмысленно
      const conn = await this.getConnection(peerId)
      try {
        await this.sendAndWaitAck(conn, packet)
        this.opts.log.debug(`-> ${packet.type} ${packet.id.slice(0, 8)} delivered to "${conn.peerName}"`)
        return
      } catch (err) {
        lastError = err as Error
        this.opts.log.warn(
          `${packet.type} ${packet.id.slice(0, 8)} to "${conn.peerName}" not acknowledged (attempt ${attempt}): ${lastError.message}`
        )
        // Соединение, скорее всего, «полуживое» (собеседник сменил сеть/уснул) — открываем новое
        conn.destroy('no ack')
      }
    }
    throw lastError
  }

  private sendAndWaitAck(conn: PeerConnection, packet: Packet & { id: string }): Promise<void> {
    return new Promise((resolve, reject) => {
      const settle = (err?: Error) => {
        clearTimeout(timer)
        this.acks.delete(packet.id)
        conn.pendingAcks.delete(packet.id)
        if (err) reject(err)
        else resolve()
      }
      const timer = setTimeout(() => settle(new Error(this.opts.t('error.noAck'))), ACK_TIMEOUT_MS)
      this.acks.set(packet.id, { peerId: conn.peerId, settle })
      conn.pendingAcks.add(packet.id)
      if (!conn.send(packet)) settle(new Error(this.opts.t('error.linkLost')))
    })
  }

  /** Отправить, только если соединение уже есть (для «печатает…» не стоит открывать новое) */
  sendIfLinked(peerId: string, packet: Packet): boolean {
    return this.getLink(peerId)?.send(packet) ?? false
  }

  /** Служебный пакет без подтверждения. */
  async sendBestEffort(peerId: string, packet: Packet): Promise<boolean> {
    try {
      const conn = await this.getConnection(peerId)
      return conn.send(packet)
    } catch (err) {
      this.opts.log.warn(`could not send ${packet.type} to ${peerId.slice(0, 8)}: ${(err as Error).message}`)
      return false
    }
  }

  // ─── приём ────────────────────────────────────────────────────────────────────

  private onPacket(conn: PeerConnection, packet: Packet): void {
    switch (packet.type) {
      case 'ack': {
        const id = asString(packet.id, 64)
        const pending = id ? this.acks.get(id) : undefined
        if (pending && pending.peerId === conn.peerId) pending.settle()
        break
      }
      case 'message': {
        const id = asString(packet.id, 64)
        if (!id || typeof packet.text !== 'string') return
        if (!this.markSeen(conn.peerId, id)) {
          // ack и на дубликаты: предыдущий ack мог потеряться
          conn.send({ type: 'ack', id })
          this.opts.log.debug(`duplicate message ${id.slice(0, 8)} from "${conn.peerName}" ignored`)
          return
        }
        const text = packet.text.slice(0, MAX_TEXT_LENGTH)
        this.opts.log.debug(`<- message ${id.slice(0, 8)} from "${conn.peerName}" (${text.length} chars)`)
        // ack — только когда main сохранил сообщение (обработчик синхронный и пишет его на диск)
        this.processThenAck(conn, id, () => this.emit('message', conn.peerId, {
          id,
          text,
          timestamp: asInt(packet.timestamp, 0, Number.MAX_SAFE_INTEGER) ?? Date.now(),
          replyTo: parseReplyRef(packet.reply),
          broadcast: packet.broadcast === true ? true : undefined,
          group: parseGroupInfo(packet.group),
          origin: asString(packet.origin, 64) ?? undefined,
          everyone: parseEveryoneMeta(packet.everyone)
        } satisfies IncomingMessage))
        break
      }
      case 'group': {
        const group = parseGroupInfo(packet.group)
        if (!group) return
        this.opts.log.info(`<- group "${group.name}" (${group.members.length} members) from "${conn.peerName}"`)
        this.emit('group-info', conn.peerId, group)
        break
      }
      case 'group-leave': {
        if (!isValidGroupId(packet.groupId)) return
        this.opts.log.info(`<- group-leave ${packet.groupId.slice(0, 10)} from "${conn.peerName}"`)
        this.emit('group-leave', conn.peerId, packet.groupId)
        break
      }
      case 'group-delete': {
        if (!isValidGroupId(packet.groupId)) return
        this.opts.log.info(`<- group-delete ${packet.groupId.slice(0, 10)} from "${conn.peerName}"`)
        this.emit('group-delete', conn.peerId, packet.groupId)
        break
      }
      case 'file-offer': {
        const id = asString(packet.id, 64)
        const name = asString(packet.name, 1024)
        const size = asInt(packet.size, 0, Number.MAX_SAFE_INTEGER)
        if (!id || !name || size === null) return
        if (!this.markSeen(conn.peerId, id)) {
          conn.send({ type: 'ack', id })
          return
        }
        this.opts.log.info(`<- file offer from "${conn.peerName}": "${name}" (${size} bytes)`)
        this.processThenAck(conn, id, () => this.emit('file-offer', conn.peerId, {
          id,
          name,
          size,
          timestamp: asInt(packet.timestamp, 0, Number.MAX_SAFE_INTEGER) ?? Date.now(),
          thumbnail: parseThumbnail(packet.thumb),
          group: parseGroupInfo(packet.group),
          everyone: parseEveryoneMeta(packet.everyone),
          sha256: parseSha256(packet.sha256)
        } satisfies IncomingOffer))
        break
      }
      case 'file-decline':
      case 'file-cancel':
      case 'file-error':
      case 'file-push-request': {
        const fileId = asString(packet.fileId, 64)
        const reason = typeof packet.reason === 'string' ? packet.reason.slice(0, 300) : undefined
        if (fileId) this.emit('file-control', conn.peerId, packet.type, fileId, reason)
        break
      }
      case 'typing':
        // группа: печатает участник, значит «печатает…» показывается в переписке группы
        this.emit('typing', conn.peerId, packet.active === true, parseGroupInfo(packet.group), packet.everyone === true)
        break
      case 'read': {
        const ids = Array.isArray(packet.ids)
          ? packet.ids.filter((id): id is string => typeof id === 'string' && id.length <= 64).slice(0, 500)
          : []
        if (ids.length) {
          this.emit('read', conn.peerId, ids, isValidGroupId(packet.groupId) ? packet.groupId : undefined, packet.everyone === true)
        }
        break
      }
      case 'file-got': {
        const fileId = asString(packet.fileId, 64)
        if (fileId) this.emit('file-got', conn.peerId, fileId)
        break
      }
      case 'everyone-have': {
        // какие сообщения общего чата у собеседника уже есть — в ответ пошлём недостающие
        const ids = Array.isArray(packet.ids)
          ? packet.ids.filter((id): id is string => typeof id === 'string' && id.length <= 64).slice(0, MAX_EVERYONE_IDS)
          : []
        this.emit('everyone-have', conn.peerId, ids, packet.reply === true)
        break
      }
      default:
        this.opts.log.debug(`unknown packet "${packet.type}" from "${conn.peerName}"`)
    }
  }

  /**
   * Сначала сохранить, потом подтвердить: получивший ack отправитель больше не повторяет,
   * значит, к этому моменту сообщение должно лежать на диске. Сбой обработки — ack не шлём
   * и забываем id, чтобы повтор отправителя обработался заново.
   */
  private processThenAck(conn: PeerConnection, id: string, process: () => void): void {
    try {
      process()
    } catch (err) {
      this.seen.delete(`${conn.peerId}:${id}`)
      this.opts.log.error(`failed to process ${id.slice(0, 8)} from "${conn.peerName}":`, err)
      return
    }
    conn.send({ type: 'ack', id })
  }

  private markSeen(peerId: string, id: string): boolean {
    const key = `${peerId}:${id}`
    if (this.seen.has(key)) return false
    this.seen.add(key)
    if (this.seen.size > SEEN_IDS_LIMIT) {
      const oldest = this.seen.values().next().value
      if (oldest !== undefined) this.seen.delete(oldest)
    }
    return true
  }
}
