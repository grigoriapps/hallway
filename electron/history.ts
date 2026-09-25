import fs from 'node:fs'
import path from 'node:path'
import {
  CHAT_EVENTS,
  EVERYONE_ID,
  isGroupId,
  type ChatEvent,
  type ChatItem,
  type FilePart,
  type FileStatus,
  type HistoryRetention,
  type TextStatus
} from '../src/types'
import type { ScopedLogger } from './logger'
import type { KnownPeer } from './store'
import { cleanName, parseReplyRef, parseSha256, parseThumbnail } from './protocol'
import type { TranslateFn } from '../src/i18n'

// История переписки на диске: history/<id собеседника>.json.
// Один файл на собеседника — при новом сообщении перезаписывается только он, а не вся история.
// Запись отложенная (прогресс передачи файла меняется несколько раз в секунду) и атомарная (tmp + rename).

export interface ConversationRecord {
  version: 1
  peer: KnownPeer
  unread: number
  items: ChatItem[]
  /** пути к файлам на диске: полученные файлы и исходные файлы отправленных */
  filePaths: Record<string, string>
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Сколько хранить; null — всегда */
export function retentionMs(retention: Exclude<HistoryRetention, 'none'>): number | null {
  switch (retention) {
    case '1d':
      return DAY_MS
    case '7d':
      return 7 * DAY_MS
    case '30d':
      return 30 * DAY_MS
    case '90d':
      return 90 * DAY_MS
    case 'forever':
      return null
  }
}

const ID_RE = /^[\w-]{1,64}$/
const TEXT_STATUSES: readonly TextStatus[] = ['sending', 'sent', 'read', 'failed', 'received']
const FILE_STATUSES: readonly FileStatus[] = [
  'offering',
  'pending',
  'connecting',
  'transferring',
  'done',
  'declined',
  'canceled',
  'failed'
]

function isValidItem(value: unknown): value is ChatItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (typeof item.id !== 'string' || !item.id || item.id.length > 64) return false
  if (typeof item.peerId !== 'string' || typeof item.timestamp !== 'number') return false
  // у служебной строки нет направления: она не от кого-то, а о событии
  if (item.kind === 'event') return CHAT_EVENTS.includes(item.event as ChatEvent)
  if (item.direction !== 'in' && item.direction !== 'out') return false
  if (item.kind === 'text') {
    return typeof item.text === 'string' && TEXT_STATUSES.includes(item.status as TextStatus)
  }
  if (item.kind === 'file') {
    return (
      typeof item.name === 'string' &&
      typeof item.size === 'number' &&
      typeof item.transferred === 'number' &&
      FILE_STATUSES.includes(item.status as FileStatus)
    )
  }
  return false
}

const ids = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined
  const list = [...new Set(value.filter((v): v is string => typeof v === 'string' && ID_RE.test(v)))].slice(0, 100)
  return list.length ? list : undefined
}

function sanitizeParts(value: unknown): FilePart[] | undefined {
  if (!Array.isArray(value)) return undefined
  const parts: FilePart[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const part = entry as Record<string, unknown>
    if (typeof part.peerId !== 'string' || !ID_RE.test(part.peerId)) continue
    if (!FILE_STATUSES.includes(part.status as FileStatus)) continue
    parts.push({
      peerId: part.peerId,
      name: cleanName(part.name),
      status: part.status as FileStatus,
      transferred: typeof part.transferred === 'number' && part.transferred >= 0 ? part.transferred : 0,
      error: typeof part.error === 'string' ? part.error.slice(0, 300) : undefined
    })
    if (parts.length >= 50) break
  }
  return parts.length ? parts : undefined
}

/** Необязательные поля проверяются так же строго, как пришедшие по сети */
function sanitizeItem(item: ChatItem): ChatItem {
  if (item.kind === 'event') {
    return {
      ...item,
      actorName: cleanName(item.actorName) || undefined,
      targetName: cleanName(item.targetName) || undefined
    }
  }
  const authorId = typeof item.authorId === 'string' && ID_RE.test(item.authorId) ? item.authorId : undefined
  const author = { authorId, authorName: authorId ? cleanName(item.authorName) || undefined : undefined }
  if (item.kind === 'text') {
    return {
      ...item,
      ...author,
      replyTo: parseReplyRef(item.replyTo),
      broadcast: item.broadcast === true ? true : undefined,
      readBy: ids(item.readBy),
      deliveredTo: ids(item.deliveredTo),
      queued: item.queued === true ? true : undefined,
      pendingTo: ids(item.pendingTo)
    }
  }
  return {
    ...item,
    ...author,
    thumbnail: parseThumbnail(item.thumbnail),
    parts: sanitizeParts(item.parts),
    sha256: parseSha256(item.sha256),
    downloadedBy: ids(item.downloadedBy),
    queued: item.queued === true ? true : undefined
  }
}

/** Разбор файла истории; всё сомнительное отбрасывается, а не роняет приложение */
export function parseRecord(value: unknown): ConversationRecord | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const peer = raw.peer as Record<string, unknown> | undefined
  if (raw.version !== 1 || !peer || typeof peer.id !== 'string' || !ID_RE.test(peer.id)) return null
  const peerId = peer.id

  const items = Array.isArray(raw.items)
    ? raw.items.filter((item): item is ChatItem => isValidItem(item) && item.peerId === peerId).map(sanitizeItem)
    : []
  const filePaths: Record<string, string> = {}
  if (raw.filePaths && typeof raw.filePaths === 'object') {
    for (const [id, filePath] of Object.entries(raw.filePaths as Record<string, unknown>)) {
      if (typeof filePath === 'string' && path.isAbsolute(filePath)) filePaths[id] = filePath
    }
  }
  const unread = typeof raw.unread === 'number' && Number.isInteger(raw.unread) && raw.unread > 0 ? raw.unread : 0

  return {
    version: 1,
    peer: {
      id: peerId,
      name: typeof peer.name === 'string' ? peer.name.slice(0, 64) : '',
      platform: typeof peer.platform === 'string' ? peer.platform.slice(0, 16) : 'unknown'
    },
    unread: Math.min(unread, 9999),
    items,
    filePaths
  }
}

/** Сообщения и передачи, прерванные закрытием приложения, после перезапуска честно помечаются */
const TERMINAL_FILE: ReadonlySet<FileStatus> = new Set(['done', 'declined', 'canceled', 'failed'])

export function reviveItem(t: TranslateFn, item: ChatItem): ChatItem {
  if (item.kind === 'event') return item
  if (item.kind === 'text') {
    // очередь отправки переживает перезапуск: сообщение уйдёт само, когда появится связь
    return item.status === 'sending' && item.direction === 'out' ? { ...item, queued: true } : item
  }
  // рассылка в группу: незаконченные передачи участникам тоже прерваны закрытием
  if (item.parts?.length) {
    const parts = item.parts.map((part) =>
      TERMINAL_FILE.has(part.status)
        ? part
        : { ...part, status: 'failed' as FileStatus, error: t('history.transferInterrupted') }
    )
    const done = parts.some((p) => p.status === 'done')
    return {
      ...item,
      parts,
      speed: 0,
      status: TERMINAL_FILE.has(item.status) ? item.status : done ? 'done' : 'failed',
      error: done ? undefined : t('history.transferInterrupted')
    }
  }
  // личное предложение файла ещё не дошло до получателя — остаётся в очереди
  if (item.direction === 'out' && item.status === 'offering' && item.peerId !== EVERYONE_ID && !isGroupId(item.peerId)) {
    return { ...item, speed: 0, queued: true }
  }
  switch (item.status) {
    case 'offering':
    case 'connecting':
    case 'transferring':
      return { ...item, status: 'failed', speed: 0, error: t('history.transferInterrupted') }
    default:
      // pending остаётся: предложение можно принять и после перезапуска
      return { ...item, speed: 0 }
  }
}

export class HistoryPersistence {
  private readonly timers = new Map<string, NodeJS.Timeout>()
  private readonly pending = new Map<string, () => ConversationRecord | null>()

  constructor(
    private readonly dir: string,
    private readonly log: ScopedLogger,
    private readonly delayMs = 1500
  ) {}

  loadAll(): ConversationRecord[] {
    let entries: string[]
    try {
      entries = fs.readdirSync(this.dir)
    } catch {
      return []
    }
    const records: ConversationRecord[] = []
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      try {
        const record = parseRecord(JSON.parse(fs.readFileSync(path.join(this.dir, entry), 'utf8')))
        if (record) records.push(record)
        else this.log.warn(`skipping invalid history file ${entry}`)
      } catch (err) {
        this.log.warn(`cannot read history file ${entry}: ${(err as Error).message}`)
      }
    }
    return records
  }

  /** Запланировать запись; build вызывается в момент записи и берёт актуальное состояние */
  schedule(peerId: string, build: () => ConversationRecord | null): void {
    if (!ID_RE.test(peerId)) return
    this.pending.set(peerId, build)
    if (this.timers.has(peerId)) return
    this.timers.set(
      peerId,
      setTimeout(() => this.writeNow(peerId), this.delayMs)
    )
  }

  /** Записать одну переписку прямо сейчас (пришло сообщение — сохранить до подтверждения) */
  flushOne(peerId: string): void {
    if (this.pending.has(peerId)) this.writeNow(peerId)
  }

  /** Записать всё отложенное прямо сейчас (при выходе из приложения) */
  flush(): void {
    for (const peerId of [...this.pending.keys()]) this.writeNow(peerId)
  }

  /** Удалить всю историю с диска (выбрано «Не сохранять») */
  deleteAll(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    this.pending.clear()
    try {
      for (const entry of fs.readdirSync(this.dir)) {
        if (entry.endsWith('.json') || entry.endsWith('.tmp')) fs.rmSync(path.join(this.dir, entry), { force: true })
      }
    } catch {
      // папки нет — нечего удалять
    }
  }

  private writeNow(peerId: string): void {
    const timer = this.timers.get(peerId)
    if (timer) clearTimeout(timer)
    this.timers.delete(peerId)
    const build = this.pending.get(peerId)
    this.pending.delete(peerId)
    if (!build) return

    const file = path.join(this.dir, `${peerId}.json`)
    try {
      const record = build()
      if (!record || record.items.length === 0) {
        fs.rmSync(file, { force: true })
        return
      }
      fs.mkdirSync(this.dir, { recursive: true })
      const tmp = `${file}.${process.pid}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(record))
      fs.renameSync(tmp, file)
    } catch (err) {
      this.log.error(`failed to save history for ${peerId.slice(0, 8)}: ${(err as Error).message}`)
    }
  }
}
