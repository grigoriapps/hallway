import fs from 'node:fs'
import path from 'node:path'
import type { ScopedLogger } from './logger'

// Отметки «прочитано», которые ещё не дошли до автора: read-receipts.json в папке данных.
// Раньше они жили только в памяти и терялись, если между приходом сообщения и его прочтением
// Hallway перезапускался (выключили компьютер на ночь), а отметка, отправленная, когда автора
// не было в сети, пропадала сразу. Теперь очередь переживает перезапуск и досылается,
// как только автор появится.

/** Отметки одного автора в одной переписке */
export interface ReceiptBatch {
  authorId: string
  /** id группы или общего чата; '' — личная переписка */
  scope: string
  ids: string[]
}

interface Entry {
  authorId: string
  scope: string
  /** пришли, пока пользователь чат не видел: отметка уйдёт, когда он его откроет */
  unseen: string[]
  /** прочитаны, ждут отправки автору */
  ready: string[]
  /** последнее изменение — старые записи со временем выбрасываются */
  at: number
}

const ID_RE = /^[\w-]{1,64}$/
/** столько id принимает получатель в одном пакете «прочитано» */
export const MAX_RECEIPT_IDS = 500
const MAX_ENTRIES = 1000
/** автор месяц не появлялся — отметки ему уже не нужны */
const ENTRY_TTL_MS = 30 * 24 * 60 * 60 * 1000
const SAVE_DELAY_MS = 1000

const key = (authorId: string, scope: string) => `${authorId}|${scope}`

function keepLast(ids: string[]): string[] {
  return ids.length > MAX_RECEIPT_IDS ? ids.slice(-MAX_RECEIPT_IDS) : ids
}

export class ReadReceipts {
  private readonly entries = new Map<string, Entry>()
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly file: string,
    private readonly log: ScopedLogger,
    private readonly now: () => number = Date.now
  ) {
    this.load()
  }

  /**
   * Пришло сообщение, за которое автору полагается «прочитано».
   * seen — пользователь смотрит на эту переписку прямо сейчас: отметка сразу готова к отправке.
   */
  add(authorId: string, messageId: string, scope: string, seen: boolean): void {
    if (!ID_RE.test(authorId) || !ID_RE.test(messageId)) return
    const entry = this.entry(authorId, scope)
    const list = seen ? entry.ready : entry.unseen
    if (list.includes(messageId)) return
    list.push(messageId)
    if (seen) entry.ready = keepLast(entry.ready)
    else entry.unseen = keepLast(entry.unseen)
    entry.at = this.now()
    this.scheduleSave()
  }

  /**
   * Пользователь открыл переписку: всё непросмотренное в ней становится готовым к отправке.
   * scoped — переписка группы или общего чата (отметки там от разных авторов),
   * иначе личная переписка с chatId. Возвращает авторов, которым есть что отправить.
   */
  markSeen(chatId: string, scoped: boolean): string[] {
    const authors: string[] = []
    for (const entry of this.entries.values()) {
      const matches = scoped ? entry.scope === chatId : entry.scope === '' && entry.authorId === chatId
      if (!matches || !entry.unseen.length) continue
      entry.ready = keepLast([...entry.ready, ...entry.unseen.filter((id) => !entry.ready.includes(id))])
      entry.unseen = []
      entry.at = this.now()
      authors.push(entry.authorId)
    }
    if (authors.length) this.scheduleSave()
    return authors
  }

  /** Готовые к отправке отметки автору — по пакету на переписку */
  ready(authorId: string): ReceiptBatch[] {
    return [...this.entries.values()]
      .filter((entry) => entry.authorId === authorId && entry.ready.length)
      .map((entry) => ({ authorId, scope: entry.scope, ids: [...entry.ready] }))
  }

  /** Авторы, у которых есть неотправленные готовые отметки */
  authorsWithReady(): string[] {
    const authors = new Set<string>()
    for (const entry of this.entries.values()) if (entry.ready.length) authors.add(entry.authorId)
    return [...authors]
  }

  /** Пакет ушёл автору: убираем отправленное (пока шла отправка, могли добавиться новые) */
  sent(batch: ReceiptBatch): void {
    const entry = this.entries.get(key(batch.authorId, batch.scope))
    if (!entry) return
    const done = new Set(batch.ids)
    entry.ready = entry.ready.filter((id) => !done.has(id))
    this.dropIfEmpty(entry)
    this.scheduleSave()
  }

  /** Отметки о прочтении выключили в настройках — очередь больше не нужна */
  clear(): void {
    if (!this.entries.size) return
    this.entries.clear()
    this.scheduleSave()
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.save()
  }

  private entry(authorId: string, scope: string): Entry {
    const k = key(authorId, scope)
    let entry = this.entries.get(k)
    if (!entry) {
      entry = { authorId, scope, unseen: [], ready: [], at: this.now() }
      this.entries.set(k, entry)
    }
    return entry
  }

  private dropIfEmpty(entry: Entry): void {
    if (!entry.unseen.length && !entry.ready.length) this.entries.delete(key(entry.authorId, entry.scope))
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
    const cutoff = this.now() - ENTRY_TTL_MS
    const ids = (value: unknown): string[] =>
      Array.isArray(value) ? keepLast([...new Set(value.filter((id): id is string => typeof id === 'string' && ID_RE.test(id)))]) : []
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const r = item as Record<string, unknown>
      if (typeof r.authorId !== 'string' || !ID_RE.test(r.authorId)) continue
      const scope = typeof r.scope === 'string' && (r.scope === '' || ID_RE.test(r.scope)) ? r.scope : null
      const at = typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : 0
      if (scope === null || at < cutoff) continue
      const entry: Entry = { authorId: r.authorId, scope, unseen: ids(r.unseen), ready: ids(r.ready), at }
      if (!entry.unseen.length && !entry.ready.length) continue
      this.entries.set(key(entry.authorId, scope), entry)
      if (this.entries.size >= MAX_ENTRIES) break
    }
  }

  private save(): void {
    const cutoff = this.now() - ENTRY_TTL_MS
    const list = [...this.entries.values()]
      .filter((entry) => entry.at >= cutoff)
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_ENTRIES)
    try {
      if (!list.length) {
        fs.rmSync(this.file, { force: true })
        return
      }
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      const tmp = `${this.file}.${process.pid}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(list))
      fs.renameSync(tmp, this.file)
    } catch (err) {
      this.log.warn(`cannot save read receipts: ${(err as Error).message}`)
    }
  }
}
