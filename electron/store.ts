import { EventEmitter } from 'node:events'
import type { ChatItem, FileStatus } from '../src/types'
import type { ConversationRecord } from './history'

export interface KnownPeer {
  id: string
  name: string
  platform: string
}

const MAX_ITEMS_PER_CONVERSATION = 5000
const ACTIVE_FILE_STATUSES: ReadonlySet<FileStatus> = new Set(['offering', 'pending', 'connecting', 'transferring'])

/** Незавершённая передача файла: её не удаляют ни очистка истории, ни срок хранения */
export function isActiveItem(item: ChatItem): boolean {
  return item.kind === 'file' && ACTIVE_FILE_STATUSES.has(item.status)
}

/**
 * История переписки в main-процессе. Хранится здесь, а не в React: окно можно закрыть
 * или перезагрузить, а сообщения, пришедшие в это время, не потеряются.
 * На диск сама не пишет — при каждом изменении испускает 'changed', сохранением
 * занимается HistoryPersistence.
 *
 * События: 'item' (item), 'unread' (peerId, count), 'peer' (peer), 'changed' (peerId)
 */
export class ConversationStore extends EventEmitter {
  private readonly conversations = new Map<string, Map<string, ChatItem>>()
  private readonly unread = new Map<string, number>()
  private readonly known = new Map<string, KnownPeer>()
  private readonly filePaths = new Map<string, string>()

  upsert(item: ChatItem): void {
    let conversation = this.conversations.get(item.peerId)
    if (!conversation) {
      conversation = new Map()
      this.conversations.set(item.peerId, conversation)
    }
    const isNew = !conversation.has(item.id)
    conversation.set(item.id, item)
    // Элемент может прийти «задним числом»: «в сети» с временем из анонса, «вышел» спустя
    // время после обрыва, пропущенное в общем чате — ставим его на своё место по времени
    if (isNew) this.placeByTime(conversation, item)
    while (conversation.size > MAX_ITEMS_PER_CONVERSATION) {
      const oldest = conversation.keys().next().value
      if (oldest === undefined) break
      conversation.delete(oldest)
      this.filePaths.delete(oldest)
    }
    this.emit('item', item)
    this.emit('changed', item.peerId)
  }

  /** Все элементы переписки по порядку */
  items(peerId: string): ChatItem[] {
    return [...(this.conversations.get(peerId)?.values() ?? [])]
  }

  get(peerId: string, itemId: string): ChatItem | undefined {
    return this.conversations.get(peerId)?.get(itemId)
  }

  hasConversation(peerId: string): boolean {
    return (this.conversations.get(peerId)?.size ?? 0) > 0
  }

  /** Время последнего элемента переписки — для строки в архиве */
  lastItemAt(peerId: string): number {
    let last = 0
    for (const item of this.conversations.get(peerId)?.values() ?? []) {
      if (item.timestamp > last) last = item.timestamp
    }
    return last
  }

  /** Последняя строка «в сети» или «вышел» — от неё решается, писать ли новую */
  lastPresenceEvent(peerId: string): { event: 'peer-online' | 'peer-offline'; timestamp: number } | null {
    let last: { event: 'peer-online' | 'peer-offline'; timestamp: number } | null = null
    for (const item of this.conversations.get(peerId)?.values() ?? []) {
      if (item.kind !== 'event' || (item.event !== 'peer-online' && item.event !== 'peer-offline')) continue
      if (!last || item.timestamp >= last.timestamp) last = { event: item.event, timestamp: item.timestamp }
    }
    return last
  }

  /**
   * Новая строка уже стоит в конце. Если по времени она раньше последних элементов —
   * переставляем её перед первым более поздним, остальной порядок не трогаем
   * (интерфейс вставляет её на то же место).
   */
  private placeByTime(conversation: Map<string, ChatItem>, item: ChatItem): void {
    const entries = [...conversation.values()]
    const index = entries.findIndex((other) => other.id !== item.id && other.timestamp > item.timestamp)
    if (index === -1) return
    conversation.clear()
    for (const entry of entries) {
      if (entry.id === item.id) continue
      if (entry === entries[index]) conversation.set(item.id, item)
      conversation.set(entry.id, entry)
    }
  }

  peerIds(): string[] {
    return [...this.conversations.keys()]
  }

  conversationsSnapshot(): Record<string, ChatItem[]> {
    const result: Record<string, ChatItem[]> = {}
    for (const [peerId, items] of this.conversations) {
      if (items.size) result[peerId] = [...items.values()]
    }
    return result
  }

  incrementUnread(peerId: string): void {
    const count = (this.unread.get(peerId) ?? 0) + 1
    this.unread.set(peerId, count)
    this.emit('unread', peerId, count)
    this.emit('changed', peerId)
  }

  clearUnread(peerId: string): void {
    if (!this.unread.get(peerId)) return
    this.unread.set(peerId, 0)
    this.emit('unread', peerId, 0)
    this.emit('changed', peerId)
  }

  unreadSnapshot(): Record<string, number> {
    return Object.fromEntries(this.unread)
  }

  totalUnread(): number {
    let total = 0
    for (const n of this.unread.values()) total += n
    return total
  }

  rememberPeer(peer: KnownPeer): void {
    const prev = this.known.get(peer.id)
    if (prev && prev.name === peer.name && prev.platform === peer.platform) return
    this.known.set(peer.id, { id: peer.id, name: peer.name, platform: peer.platform })
    this.emit('peer', peer)
    if (this.conversations.has(peer.id)) this.emit('changed', peer.id)
  }

  knownPeers(): KnownPeer[] {
    return [...this.known.values()]
  }

  setFilePath(peerId: string, itemId: string, filePath: string): void {
    this.filePaths.set(itemId, filePath)
    this.emit('changed', peerId)
  }

  getFilePath(itemId: string): string | undefined {
    return this.filePaths.get(itemId)
  }

  // ─── история ──────────────────────────────────────────────────────────────────

  /** Загрузка сохранённой истории при старте (без событий: интерфейс получит снимок) */
  load(records: ConversationRecord[]): void {
    for (const record of records) {
      if (!record.items.length) continue
      this.known.set(record.peer.id, { ...record.peer })
      const conversation = new Map<string, ChatItem>()
      for (const item of [...record.items].sort((a, b) => a.timestamp - b.timestamp)) conversation.set(item.id, item)
      this.conversations.set(record.peer.id, conversation)
      if (record.unread > 0) this.unread.set(record.peer.id, record.unread)
      for (const [itemId, filePath] of Object.entries(record.filePaths)) {
        if (conversation.has(itemId)) this.filePaths.set(itemId, filePath)
      }
    }
  }

  /** Состояние переписки для записи на диск; null — переписки нет */
  record(peerId: string): ConversationRecord | null {
    const conversation = this.conversations.get(peerId)
    if (!conversation || conversation.size === 0) return null
    const items = [...conversation.values()]
    const filePaths: Record<string, string> = {}
    for (const item of items) {
      const filePath = this.filePaths.get(item.id)
      if (filePath) filePaths[item.id] = filePath
    }
    return {
      version: 1,
      peer: this.known.get(peerId) ?? { id: peerId, name: '', platform: 'unknown' },
      unread: this.unread.get(peerId) ?? 0,
      items,
      filePaths
    }
  }

  /** Очистить переписку, кроме незавершённых передач. true — что-то удалено. */
  clearConversation(peerId: string): boolean {
    return this.removeWhere(peerId, () => true, true)
  }

  /** Очистить всю историю; возвращает затронутых собеседников */
  clearAll(): string[] {
    return this.peerIds().filter((peerId) => this.clearConversation(peerId))
  }

  /** Удалить сообщения старше cutoff (срок хранения истории) */
  pruneOlderThan(cutoff: number): string[] {
    return this.peerIds().filter((peerId) => this.removeWhere(peerId, (item) => item.timestamp < cutoff, false))
  }

  private removeWhere(peerId: string, predicate: (item: ChatItem) => boolean, resetUnread: boolean): boolean {
    const conversation = this.conversations.get(peerId)
    if (!conversation) return false
    let removed = 0
    for (const [itemId, item] of conversation) {
      if (isActiveItem(item) || !predicate(item)) continue
      conversation.delete(itemId)
      this.filePaths.delete(itemId)
      removed++
    }
    if (!conversation.size) this.conversations.delete(peerId)
    if ((resetUnread || !conversation.size) && this.unread.get(peerId)) {
      this.unread.set(peerId, 0)
      this.emit('unread', peerId, 0)
    }
    if (removed) this.emit('changed', peerId)
    return removed > 0
  }
}
