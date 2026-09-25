import type net from 'node:net'
import { GROUP_ID_PREFIX, MAX_GROUP_MEMBERS, type GroupMember, type ReplyRef } from '../src/types'

// ─── UDP (discovery) ────────────────────────────────────────────────────────────
// { "type": "presence", "app": "hallway", "v": 1, "id": "<uuid>", "name": "Иван",
//   "tcpPort": 41235, "platform": "darwin", "session": "<uuid запуска>", "direct": false }
//   direct=true — адресный ответ на чужой анонс; на такие пакеты не отвечаем (нет пинг-понга).
//   С 1.3 ещё "ver": "1.3.0", "up": секунд в сети, "st": секунд в текущем статусе.
//   Длительности, а не время: часы на компьютерах могут расходиться. Старые клиенты
//   эти поля пропускают.
// { "type": "bye", ... }              — клиент закрывается, убрать из списка сразу
// { "type": "connect-request", ... } — «не могу подключиться к тебе по TCP, подключись ко мне сам»

// ─── TCP ────────────────────────────────────────────────────────────────────────
// Newline-delimited JSON. Первая строка любого соединения определяет его тип:
//   hello        → чат-соединение (двунаправленное, дальше поток JSON-строк)
//   file-request → получатель забирает файл: ответ file-response + сырые байты
//   file-push    → отправитель отдаёт файл сам (запасной путь, если к нему нельзя подключиться)
//
// Внутри чат-соединения:
//   message / file-offer    — требуют ack { "type": "ack", "id" } (иначе повтор, получатель дедуплицирует)
//   file-decline / file-cancel / file-error / file-push-request — без подтверждения
//   typing { active }      — «печатает…», без подтверждения
//   read { ids: [...] }    — собеседник увидел сообщения, без подтверждения
//   group { group: {...} } — состав группы (при создании, изменении и когда участник появился в сети)
//   group-leave { groupId }— участник вышел из группы
//   group-delete { groupId }— создатель удалил группу у всех
//   typing / read       — могут нести group: тогда относятся к переписке группы
// В message могут быть reply { id, text, authorId }, broadcast: true
// и group { id, name, rev, owner, members: [{id,name}] } — тогда сообщение относится
// к группе, а не к личной переписке, и origin — id этого сообщения у автора (в группе
// каждому уходит свой пакет, а «прочитано» должно ссылаться на понятный автору id).
// Состав с большим rev побеждает: так он сходится
// у всех без сервера. То же поле group бывает и в file-offer — это рассылка файла в группу.
// В file-offer — thumb: миниатюра data:image/jpeg;base64,…
//
// Общий чат (1.3+): message с everyone { id, author, name, age } — id сообщения один у всех
// (по нему отсекаются повторы и ставятся отметки), автор может быть не тем, кто прислал пакет
// (досылка пропущенного), age — сколько миллисекунд назад сообщение написано (длительность,
// а не время: часы расходятся). Там же broadcast: true — клиент до 1.3 покажет сообщение
// в личном чате с пометкой «Всем в сети».
//   everyone-have { ids, reply? } — какие сообщения общего чата за 3 дня у меня уже есть; в ответ
//                            присылают недостающие и свой список с reply: true (на него уже
//                            не отвечают) — так сверка всегда идёт в обе стороны
//   typing / read с everyone: true — «печатает…» и «прочитано» в общем чате
//   file-offer с everyone { … } и sha256 — карточка файла в общем чате (байты не шлются:
//                            каждый скачивает сам, когда нажмёт «Скачать»)
//   file-got { fileId }    — «я скачал ваш файл из общего чата» (автору, для «скачали: N»)
// Скачивание файла общего чата — file-request с everyone: true по отдельному соединению
// к автору или любому, кто уже скачал; отдающий проверяет, что файл на месте и не изменился.

export const MAX_LINE_BYTES = 1024 * 1024
/** общий чат: пропущенное досылается за это время */
export const EVERYONE_SYNC_MS = 3 * 24 * 60 * 60 * 1000
/** столько id в одном everyone-have */
export const MAX_EVERYONE_IDS = 1000
export const MAX_HANDSHAKE_BYTES = 64 * 1024
export const MAX_TEXT_LENGTH = 20000
export const MAX_NAME_LENGTH = 40

export type Packet = Record<string, unknown> & { type: string }

export function encodeLine(packet: object): Buffer {
  return Buffer.from(JSON.stringify(packet) + '\n', 'utf8')
}

export function asString(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : null
}

export function asInt(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null
}

const EVERYONE_ID_RE = /^[\w-]{1,64}$/
const SHA256_RE = /^[0-9a-f]{64}$/

export function parseSha256(value: unknown): string | undefined {
  return typeof value === 'string' && SHA256_RE.test(value) ? value : undefined
}

export interface EveryoneMeta {
  /** id сообщения — один и тот же у всех */
  id: string
  author: string
  authorName: string
  /** сколько миллисекунд назад сообщение написано */
  age: number
}

/** Метка сообщения общего чата — недоверенные данные */
export function parseEveryoneMeta(value: unknown): EveryoneMeta | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const id = asString(raw.id, 64)
  const author = asString(raw.author, 64)
  // чуть больше окна досылки: задержка в пути
  const age = asInt(raw.age, 0, EVERYONE_SYNC_MS + 60 * 60 * 1000)
  if (!id || !EVERYONE_ID_RE.test(id) || !author || !EVERYONE_ID_RE.test(author) || age === null) return undefined
  return { id, author, authorName: cleanName(raw.name), age }
}

export const MAX_THUMBNAIL_LENGTH = 200_000
const THUMBNAIL_RE = /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+=*$/

/** Цитата от собеседника — недоверенные данные */
export function parseReplyRef(value: unknown): ReplyRef | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const id = asString(raw.id, 64)
  const authorId = asString(raw.authorId, 64)
  if (!id || !authorId || typeof raw.text !== 'string') return undefined
  return { id, authorId, text: raw.text.slice(0, 300) }
}

export interface GroupInfo {
  id: string
  name: string
  members: GroupMember[]
  /** номер ревизии состава: больше — новее */
  rev: number
  /** создатель группы: только он может удалить её у всех */
  ownerId: string
}

const GROUP_ID_RE = /^[\w-]{1,64}$/

export function isValidGroupId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(GROUP_ID_PREFIX) && GROUP_ID_RE.test(value)
}

/** Состав группы приходит от собеседника — проверяем каждое поле */
export function parseGroupInfo(value: unknown): GroupInfo | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  if (!isValidGroupId(raw.id)) return undefined
  const members: GroupMember[] = []
  const seen = new Set<string>()
  if (Array.isArray(raw.members)) {
    for (const entry of raw.members) {
      if (!entry || typeof entry !== 'object') continue
      const member = entry as Record<string, unknown>
      const id = asString(member.id, 64)
      if (!id || !GROUP_ID_RE.test(id) || seen.has(id)) continue
      seen.add(id)
      members.push({ id, name: cleanName(member.name) })
      if (members.length >= MAX_GROUP_MEMBERS) break
    }
  }
  if (!members.length) return undefined
  const rev = asInt(raw.rev, 0, Number.MAX_SAFE_INTEGER) ?? 1
  // владелец обязан быть в составе; иначе им считается первый участник (так группа и создаётся)
  const owner = asString(raw.owner, 64)
  const ownerId = owner && members.some((m) => m.id === owner) ? owner : members[0].id
  // пустое имя заменит main: он знает язык интерфейса
  return { id: raw.id, name: cleanName(raw.name), members, rev, ownerId }
}

/** Миниатюра попадает в <img>: принимаем только base64 JPEG/PNG разумного размера */
export function parseThumbnail(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= MAX_THUMBNAIL_LENGTH && THUMBNAIL_RE.test(value)
    ? value
    : undefined
}

export function cleanName(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
}

/**
 * Разбивает поток байт на строки по '\n'. Резать по байту 0x0A безопасно для UTF-8:
 * этот байт не встречается внутри многобайтовых символов, поэтому кириллица/эмодзи,
 * разорванные между TCP-чанками, склеиваются корректно.
 */
export class LineReader {
  private pending: Buffer = Buffer.alloc(0)

  constructor(private readonly maxLineBytes = MAX_LINE_BYTES) {}

  push(chunk: Buffer): string[] {
    const data = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk
    const lines: string[] = []
    let start = 0
    let nl: number
    while ((nl = data.indexOf(0x0a, start)) !== -1) {
      lines.push(data.toString('utf8', start, nl))
      start = nl + 1
    }
    this.pending = start >= data.length ? Buffer.alloc(0) : Buffer.from(data.subarray(start))
    if (this.pending.length > this.maxLineBytes) {
      throw new Error(`line exceeds ${this.maxLineBytes} bytes`)
    }
    return lines
  }
}

export function parsePacket(line: string): Packet | null {
  try {
    const value: unknown = JSON.parse(line)
    if (value && typeof value === 'object' && typeof (value as Packet).type === 'string') {
      return value as Packet
    }
  } catch {
    // невалидная строка — игнорируем
  }
  return null
}

/**
 * Читает первую JSON-строку соединения и возвращает её вместе с байтами, пришедшими следом
 * (для file-соединений это уже начало файла). По завершении сокет остаётся на паузе —
 * вызывающий код сам решает, как читать дальше.
 * Обработчик 'error' на сокете должен быть установлен заранее и навсегда: без него
 * ECONNRESET после handshake уронит main-процесс.
 */
export function readFirstLine(
  socket: net.Socket,
  timeoutMs: number,
  maxBytes = MAX_HANDSHAKE_BYTES
): Promise<{ packet: Packet; rest: Buffer }> {
  return new Promise((resolve, reject) => {
    let buffer: Buffer = Buffer.alloc(0)
    let settled = false

    const finish = (err: Error | null, result?: { packet: Packet; rest: Buffer }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.off('data', onData)
      socket.off('end', onClosed)
      socket.off('close', onClosed)
      socket.off('error', onError)
      if (err) reject(err)
      else resolve(result!)
    }

    const onData = (chunk: Buffer) => {
      buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk
      const nl = buffer.indexOf(0x0a)
      if (nl === -1) {
        if (buffer.length > maxBytes) finish(new Error('handshake line too long'))
        return
      }
      socket.pause()
      const packet = parsePacket(buffer.toString('utf8', 0, nl))
      if (!packet) {
        finish(new Error('invalid handshake packet'))
        return
      }
      finish(null, { packet, rest: Buffer.from(buffer.subarray(nl + 1)) })
    }
    const onClosed = () => finish(new Error('connection closed during handshake'))
    const onError = (err: Error) => finish(err)
    const timer = setTimeout(() => finish(new Error('handshake timeout')), timeoutMs)

    socket.on('data', onData)
    socket.once('end', onClosed)
    socket.once('close', onClosed)
    socket.once('error', onError)
    socket.resume()
  })
}
