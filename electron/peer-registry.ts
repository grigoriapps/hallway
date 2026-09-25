import fs from 'node:fs'
import path from 'node:path'
import type { ScopedLogger } from './logger'
import { cleanName } from './protocol'

// Кого мы вообще видели в сети и когда последний раз: known-peers.json в папке данных.
// Нужен для строки «был в сети в 18:03» — переписки с человеком может и не быть,
// поэтому в файлах истории это хранить негде.

export interface KnownPeerRecord {
  id: string
  name: string
  platform: string
  /** когда последний раз видели в сети */
  lastSeenAt: number
  /** версия Hallway; null — клиент до 1.3 */
  version: string | null
}

const ID_RE = /^[\w-]{1,64}$/
const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,6}(?:[-+][\w.]{1,20})?$/
const MAX_PEERS = 500
const SAVE_DELAY_MS = 5000

export class PeerRegistry {
  private readonly peers = new Map<string, KnownPeerRecord>()
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly file: string,
    private readonly log: ScopedLogger
  ) {
    this.load()
  }

  /**
   * Видели в сети сейчас: обновляем имя, систему, версию и время.
   * version: undefined — источник версию не знает (TCP-приветствие), оставляем прежнюю;
   * null — коллега версию не сообщает (клиент до 1.3).
   */
  seen(peer: { id: string; name?: string; platform?: string; version?: string | null }, at = Date.now()): void {
    if (!ID_RE.test(peer.id)) return
    const previous = this.peers.get(peer.id)
    const record: KnownPeerRecord = {
      id: peer.id,
      name: cleanName(peer.name) || previous?.name || '',
      platform: peer.platform || previous?.platform || 'unknown',
      lastSeenAt: Math.max(at, previous?.lastSeenAt ?? 0),
      version: peer.version === undefined ? (previous?.version ?? null) : peer.version
    }
    this.peers.set(peer.id, record)
    this.scheduleSave()
  }

  lastSeenAt(id: string): number | null {
    return this.peers.get(id)?.lastSeenAt ?? null
  }

  get(id: string): KnownPeerRecord | undefined {
    return this.peers.get(id)
  }

  all(): KnownPeerRecord[] {
    return [...this.peers.values()]
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.save()
  }

  private scheduleSave(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.save()
    }, SAVE_DELAY_MS)
  }

  private load(): void {
    let raw: unknown
    try {
      raw = JSON.parse(fs.readFileSync(this.file, 'utf8'))
    } catch {
      return // первый запуск или повреждённый файл
    }
    if (!Array.isArray(raw)) return
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue
      const peer = entry as Record<string, unknown>
      if (typeof peer.id !== 'string' || !ID_RE.test(peer.id)) continue
      const lastSeenAt = typeof peer.lastSeenAt === 'number' && Number.isFinite(peer.lastSeenAt) ? peer.lastSeenAt : 0
      this.peers.set(peer.id, {
        id: peer.id,
        name: cleanName(peer.name),
        platform: typeof peer.platform === 'string' ? peer.platform.slice(0, 16) : 'unknown',
        lastSeenAt,
        version: typeof peer.version === 'string' && VERSION_RE.test(peer.version) ? peer.version : null
      })
      if (this.peers.size >= MAX_PEERS) break
    }
  }

  private save(): void {
    // самые свежие сверху: если список переполнится, отбросятся давно не появлявшиеся
    const list = this.all()
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .slice(0, MAX_PEERS)
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      const tmp = `${this.file}.${process.pid}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(list))
      fs.renameSync(tmp, this.file)
    } catch (err) {
      this.log.warn(`cannot save known peers: ${(err as Error).message}`)
    }
  }
}
