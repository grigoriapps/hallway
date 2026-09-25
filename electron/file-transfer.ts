import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type net from 'node:net'
import { EventEmitter, once } from 'node:events'
import { createHash, randomUUID } from 'node:crypto'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { EVERYONE_ID, isImageFileName, type FileItem, type FilePart, type FileStatus } from '../src/types'
import { PROTOCOL_VERSION } from './config'
import { HANDSHAKE_TIMEOUT_MS, type ChatService, type FileConnection, type IncomingOffer } from './chat-server'
import type { GroupInfo } from './protocol'
import type { ScopedLogger } from './logger'
import type { TranslateFn } from '../src/i18n'
import type { ConversationStore } from './store'
import { asString, encodeLine, readFirstLine } from './protocol'

// Передача файла:
//  1. Отправитель шлёт по чат-соединению file-offer (с ack) — у получателя карточка «Принять / Отклонить».
//  2. Получатель принимает → открывает ОТДЕЛЬНОЕ TCP-соединение к отправителю: file-request.
//     Отправитель отвечает file-response {ok, size} и следом отдаёт сырые байты, затем закрывает запись.
//  3. Если к отправителю подключиться нельзя (брандмауэр), получатель просит file-push-request —
//     и отправитель сам подключается к получателю (file-push → file-response ok → байты).
// Чат при этом не блокируется, а отдать можно только файлы, которые пользователь сам предложил.
//
// Общий чат устроен иначе: всем уходит только карточка (имя, размер, миниатюра и SHA-256),
// а байты каждый забирает сам, когда нажмёт «Скачать», — у автора или у любого, кто уже
// скачал. Отдаём только файлы общего чата, которые лежат на месте и совпадают с суммой автора;
// получатель сверяет сумму и при несовпадении идёт к следующему коллеге.

const IDLE_TIMEOUT_MS = 30000
const PUSH_WAIT_MS = 12000
const CLOSE_WAIT_MS = 15000
const PROGRESS_INTERVAL_MS = 200
/** миниатюры не делаем для огромных картинок — это медленно */
const MAX_THUMBNAIL_SOURCE_BYTES = 50 * 1024 * 1024
const PART_FILE_RE = /^\.[0-9a-f-]{36}\.hallway-part$/

const TERMINAL: ReadonlySet<FileStatus> = new Set(['done', 'declined', 'canceled', 'failed'])

interface TransferBase {
  item: FileItem
  /**
   * Собеседник на другом конце соединения. У файла в группе item.peerId — это id группы
   * (там его карточка), а байты всё равно идут одному человеку, вот он.
   */
  peer: string
  socket: net.Socket | null
  lastTime: number
  lastBytes: number
}

/** Рассылка файла в группу: у отправителя одна карточка, а передач — по числу участников */
interface GroupSend {
  /** id карточки в переписке группы */
  itemId: string
  info: GroupInfo
  memberName: string
}

/**
 * Передача без своей карточки: раздача файла общего чата по запросу или копия для клиента
 * до 1.3. В переписку она не пишется; автору только отмечается, кто скачал.
 */
interface Detached {
  cardId: string
  /** мы автор этого файла — отмечаем в своей карточке «скачали» */
  author: boolean
}

interface Outgoing extends TransferBase {
  direction: 'out'
  path: string
  group?: GroupSend
  detached?: Detached
}

interface Incoming extends TransferBase {
  direction: 'in'
  partPath: string | null
  finalPath: string | null
  pushTimer: NodeJS.Timeout | null
  /** скачивание из общего чата: сверяем SHA-256 и при неудаче идём к следующему источнику */
  everyone?: boolean
  /** ждём, пока источник сам подключится к нам (запасной путь) */
  pushWaiter?: { resolve: (ok: boolean) => void; reject: (err: unknown) => void }
}

type Transfer = Outgoing | Incoming

export interface FileTransferOptions {
  /** тексты ошибок, которые увидит пользователь, — на языке интерфейса */
  t: TranslateFn
  selfId: string
  chat: ChatService
  store: ConversationStore
  getDownloadDir: () => string
  /** миниатюра картинки для предложения файла (в main — через nativeImage) */
  makeThumbnail?: (filePath: string) => Promise<string | undefined>
  log: ScopedLogger
}

/**
 * События:
 *  'incoming-offer' (item: FileItem)
 *  'everyone-offer' (peerId: string, offer: IncomingOffer) — карточка файла общего чата, кладёт main
 *  'everyone-file-ready' (card: FileItem) — свой файл для общего чата готов (посчитана сумма)
 */
export class FileTransfers extends EventEmitter {
  private readonly outgoing = new Map<string, Outgoing>()
  private readonly incoming = new Map<string, Incoming>()
  /** карточки рассылок файлов в группы: id карточки → её текущее состояние */
  private readonly groupCards = new Map<string, FileItem>()
  /**
   * Файлы общего чата, которые мы проверили: id → mtime файла в момент проверки. Изменился
   * mtime (или это первый запрос после перезапуска) — сверяем содержимое с суммой автора заново.
   */
  private readonly verifiedShares = new Map<string, number>()
  /** предложения, которые сейчас отправляются (чтобы очередь не слала одно и то же дважды) */
  private readonly offering = new Set<string>()

  constructor(private readonly opts: FileTransferOptions) {
    super()
    opts.chat.on('file-offer', (peerId: string, offer: IncomingOffer) => this.onOffer(peerId, offer))
    opts.chat.on('file-control', (peerId: string, type: string, fileId: string, reason?: string) =>
      this.onControl(peerId, type, fileId, reason)
    )
    opts.chat.on('file-connection', (conn: FileConnection) => this.onFileConnection(conn))
  }

  // ─── отправитель ──────────────────────────────────────────────────────────────

  async offerFiles(peerId: string, paths: string[]): Promise<void> {
    // Сначала создаём все карточки (в исходном порядке), потом отправляем предложения
    const ready: Outgoing[] = []
    for (const filePath of paths) {
      const { name, size, error, thumbnail } = await this.prepare(filePath)
      const item: FileItem = {
        kind: 'file',
        id: randomUUID(),
        peerId,
        direction: 'out',
        name,
        size,
        transferred: 0,
        speed: 0,
        status: error ? 'failed' : 'offering',
        timestamp: Date.now(),
        error,
        thumbnail
      }
      const t: Outgoing = { direction: 'out', item, peer: peerId, path: filePath, socket: null, lastTime: 0, lastBytes: 0 }
      this.outgoing.set(item.id, t)
      this.opts.store.upsert(item)
      if (!error) {
        // путь сохраняется с историей: предложение можно будет отдать и после перезапуска
        this.opts.store.setFilePath(peerId, item.id, filePath)
        ready.push(t)
      }
    }
    await Promise.all(ready.map((t) => this.sendOffer(t)))
  }

  /**
   * Рассылка файла в группу: одна карточка в переписке группы, а под ней — отдельная
   * передача каждому участнику. Сервера нет, поэтому файл уходит столько раз, сколько
   * участников; они забирают его параллельно и делят вашу отдачу.
   */
  async offerFilesToGroup(info: GroupInfo, paths: string[]): Promise<void> {
    const targets = info.members.filter((m) => m.id !== this.opts.selfId)
    if (!targets.length) return
    const pending: Outgoing[] = []
    for (const filePath of paths) {
      const prepared = await this.prepare(filePath)
      const card: FileItem = {
        kind: 'file',
        id: randomUUID(),
        peerId: info.id,
        direction: 'out',
        name: prepared.name,
        size: prepared.size,
        transferred: 0,
        speed: 0,
        status: prepared.error ? 'failed' : 'offering',
        timestamp: Date.now(),
        error: prepared.error,
        thumbnail: prepared.thumbnail,
        authorId: this.opts.selfId,
        parts: targets.map((m) => ({
          peerId: m.id,
          name: m.name,
          status: prepared.error ? 'failed' : 'offering',
          transferred: 0,
          error: prepared.error
        }))
      }
      this.groupCards.set(card.id, card)
      this.opts.store.upsert(card)
      if (prepared.error) continue
      this.opts.store.setFilePath(info.id, card.id, filePath)
      for (const member of targets) {
        pending.push(this.createGroupPart(card, info, member.id, member.name, filePath))
      }
    }
    await Promise.all(pending.map((t) => this.sendOffer(t)))
  }

  /**
   * Файлы в общий чат: карточка у нас сразу («Готовится…»), а коллегам она уходит,
   * когда посчитана контрольная сумма (событие 'everyone-file-ready' — рассылает main).
   */
  async offerFilesToEveryone(paths: string[], authorName: string): Promise<void> {
    for (const filePath of paths) {
      const prepared = await this.prepare(filePath)
      const card: FileItem = {
        kind: 'file',
        id: randomUUID(),
        peerId: EVERYONE_ID,
        direction: 'out',
        name: prepared.name,
        size: prepared.size,
        transferred: 0,
        speed: 0,
        status: prepared.error ? 'failed' : 'offering',
        timestamp: Date.now(),
        error: prepared.error,
        thumbnail: prepared.thumbnail,
        authorId: this.opts.selfId,
        authorName,
        downloadedBy: []
      }
      this.opts.store.upsert(card)
      if (prepared.error) continue
      this.opts.store.setFilePath(EVERYONE_ID, card.id, filePath)
      try {
        const st = await fsp.stat(filePath)
        const sha256 = await hashFile(filePath)
        this.verifiedShares.set(card.id, st.mtimeMs)
        const ready: FileItem = { ...card, sha256, status: 'done' }
        this.opts.store.upsert(ready)
        this.opts.log.info(`everyone file ready: "${card.name}" (${card.size} bytes)`)
        this.emit('everyone-file-ready', ready)
      } catch (err) {
        this.opts.store.upsert({ ...card, status: 'failed', error: (err as Error).message })
      }
    }
  }

  /** Клиенту до 1.3 общего чата нет — файл уходит ему обычным предложением в личный чат */
  async offerLegacyCopy(card: FileItem, peerId: string): Promise<void> {
    const filePath = this.opts.store.getFilePath(card.id)
    if (!filePath) return
    const item: FileItem = {
      ...card,
      id: randomUUID(),
      status: 'offering',
      transferred: 0,
      speed: 0,
      downloadedBy: undefined,
      parts: undefined
    }
    const t: Outgoing = {
      direction: 'out',
      item,
      peer: peerId,
      path: filePath,
      socket: null,
      lastTime: 0,
      lastBytes: 0,
      detached: { cardId: card.id, author: true }
    }
    this.outgoing.set(item.id, t)
    await this.sendOffer(t)
  }

  /** Коллега скачал наш файл из общего чата (сам сообщил или скачал у нас) */
  noteDownloaded(cardId: string, peerId: string): void {
    const card = this.opts.store.get(EVERYONE_ID, cardId)
    if (card?.kind !== 'file' || card.direction !== 'out') return
    if (card.downloadedBy?.includes(peerId)) return
    this.opts.store.upsert({ ...card, downloadedBy: [...(card.downloadedBy ?? []), peerId] })
  }

  /**
   * Скачать файл общего чата: источники по очереди (сначала автор), у каждого — прямое
   * соединение, а если оно не проходит — просим источник подключиться к нам самому.
   * Не отдал, файл не совпал с суммой — следующий источник. Список спрашиваем заново после
   * каждой попытки: коллега мог появиться в сети, пока мы пробовали остальных.
   */
  async downloadEveryone(fileId: string, getSources: () => string[]): Promise<void> {
    const card = this.opts.store.get(EVERYONE_ID, fileId)
    if (card?.kind !== 'file' || card.direction !== 'in' || !card.sha256) return
    const running = this.incoming.get(fileId)
    if (running && (running.item.status === 'connecting' || running.item.status === 'transferring')) return
    if (card.status === 'done') return

    const dir = this.opts.getDownloadDir()
    const t: Incoming = {
      direction: 'in',
      item: { ...card, status: 'connecting', transferred: 0, speed: 0, error: undefined },
      peer: '',
      socket: null,
      partPath: path.join(dir, `.${fileId}.hallway-part`),
      finalPath: null,
      pushTimer: null,
      lastTime: 0,
      lastBytes: 0,
      everyone: true
    }
    this.incoming.set(fileId, t)
    this.update(t, { status: 'connecting', transferred: 0, speed: 0, error: undefined })
    try {
      await fsp.mkdir(dir, { recursive: true })
      await fsp.access(dir, fs.constants.W_OK)
    } catch {
      this.finish(t, { status: 'failed', error: this.opts.t('error.noDownloadsAccess', { dir }) })
      return
    }

    let lastError = this.opts.t('everyone.fileNoSource')
    const tried = new Set<string>()
    for (let source = getSources().find((id) => !tried.has(id)); source; source = getSources().find((id) => !tried.has(id))) {
      tried.add(source)
      if (!this.is(t, 'connecting')) return
      t.peer = source
      try {
        if (await this.downloadFrom(t, source)) {
          // автор узнаёт, что файл скачали, даже если отдал его кто-то другой
          if (card.authorId) void this.opts.chat.sendBestEffort(card.authorId, { type: 'file-got', fileId })
          return
        }
      } catch (err) {
        lastError = (err as Error).message
        this.opts.log.warn(`everyone file "${card.name}" from ${source.slice(0, 8)} failed: ${lastError}`)
      }
      // пользователь отменил, пока шла попытка, — дальше не идём
      if (!this.is(t, 'connecting', 'transferring')) return
      t.socket = null
      this.update(t, { status: 'connecting', transferred: 0, speed: 0 })
    }
    this.opts.log.info(`everyone file "${card.name}": not available from ${tried.size} source(s)`)
    this.finish(t, { status: 'failed', error: lastError })
  }

  /** Одна попытка скачать у одного источника: true — скачано, false — у него файла нет */
  private async downloadFrom(t: Incoming, source: string): Promise<boolean> {
    let socket: net.Socket
    try {
      socket = await this.opts.chat.connectRaw(source)
    } catch (err) {
      this.opts.log.warn(`pull for "${t.item.name}" from ${source.slice(0, 8)} failed (${(err as Error).message}), asking to push`)
      return this.waitForPush(t, source)
    }
    if (!this.is(t, 'connecting')) {
      socket.destroy()
      return false
    }
    t.socket = socket
    try {
      socket.write(
        encodeLine({ type: 'file-request', v: PROTOCOL_VERSION, fileId: t.item.id, from: this.opts.selfId, everyone: true })
      )
      const { packet, rest } = await readFirstLine(socket, HANDSHAKE_TIMEOUT_MS)
      if (packet.type !== 'file-response') throw new Error(this.opts.t('error.badSenderResponse'))
      if (packet.ok !== true) {
        socket.destroy()
        t.socket = null
        return false
      }
      await this.receive(t, socket, rest)
      return true
    } catch (err) {
      socket.destroy()
      t.socket = null
      throw err
    }
  }

  /** Запасной путь: источник сам подключается к нам (file-push) */
  private waitForPush(t: Incoming, source: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const settle = (fn: () => void) => {
        if (t.pushTimer) clearTimeout(t.pushTimer)
        t.pushTimer = null
        t.pushWaiter = undefined
        fn()
      }
      t.pushWaiter = {
        resolve: (ok) => settle(() => resolve(ok)),
        reject: (err) => settle(() => reject(err))
      }
      t.pushTimer = setTimeout(() => t.pushWaiter?.resolve(false), PUSH_WAIT_MS)
      void this.opts.chat
        .sendBestEffort(source, { type: 'file-push-request', fileId: t.item.id, everyone: true })
        .then((sent) => {
          if (!sent) t.pushWaiter?.resolve(false)
        })
    })
  }

  /** Что мы можем отдать из общего чата: свой исходный файл или полностью скачанный и проверенный */
  private async everyoneShare(fileId: string): Promise<{ path: string; item: FileItem } | null> {
    const item = this.opts.store.get(EVERYONE_ID, fileId)
    if (item?.kind !== 'file' || !item.sha256) return null
    if (item.direction === 'in' && item.status !== 'done') return null
    if (item.direction === 'out' && item.status !== 'done') return null
    const filePath = this.localPath(fileId)
    if (!filePath) return null
    const st = await fsp.stat(filePath).catch(() => null)
    if (!st || !st.isFile() || st.size !== item.size) return null
    if (this.verifiedShares.get(fileId) !== st.mtimeMs) {
      // первый запрос после перезапуска или файл трогали — сверяем содержимое
      const hash = await hashFile(filePath).catch(() => null)
      if (hash !== item.sha256) {
        this.opts.log.info(`everyone file "${item.name}" changed on disk — not sharing it`)
        return null
      }
      this.verifiedShares.set(fileId, st.mtimeMs)
    }
    return { path: filePath, item }
  }

  private shareTransfer(share: { path: string; item: FileItem }, peer: string): Outgoing {
    return {
      direction: 'out',
      item: { ...share.item, status: 'pending', transferred: 0, speed: 0, error: undefined, downloadedBy: undefined },
      peer,
      path: share.path,
      socket: null,
      lastTime: 0,
      lastBytes: 0,
      detached: { cardId: share.item.id, author: share.item.direction === 'out' }
    }
  }

  private async serveEveryone(socket: net.Socket, fileId: string, from: string, remote: string): Promise<void> {
    const share = await this.everyoneShare(fileId)
    if (!share) return refuse(socket, 'not-found')
    this.opts.log.info(`everyone file "${share.item.name}" requested by ${remote}`)
    await this.stream(this.shareTransfer(share, from), socket, true)
  }

  private async pushEveryone(peerId: string, fileId: string): Promise<void> {
    const share = await this.everyoneShare(fileId)
    if (!share) return
    this.opts.log.info(`pushing everyone file "${share.item.name}" to ${peerId.slice(0, 8)}`)
    await this.push(this.shareTransfer(share, peerId))
  }

  /** Предложить файл ещё раз тем участникам, кому он не дошёл */
  async retryGroupParts(itemId: string): Promise<void> {
    const card = this.groupCards.get(itemId)
    const filePath = this.opts.store.getFilePath(itemId)
    if (!card || !filePath) return
    const info = this.groupInfoFor(itemId)
    if (!info) return
    const retry: Outgoing[] = []
    for (const part of card.parts ?? []) {
      if (part.status !== 'failed' && part.status !== 'canceled') continue
      // прежнюю передачу выбрасываем: у неё уже свой id и терминальный статус
      for (const [id, t] of [...this.outgoing.entries()]) {
        if (t.group?.itemId === itemId && t.peer === part.peerId) this.outgoing.delete(id)
      }
      retry.push(this.createGroupPart(card, info, part.peerId, part.name, filePath))
    }
    if (!retry.length) return
    this.opts.log.info(`retrying "${card.name}" for ${retry.length} member(s)`)
    this.updateGroupCard(itemId)
    await Promise.all(retry.map((t) => this.sendOffer(t)))
  }

  private createGroupPart(
    card: FileItem,
    info: GroupInfo,
    peerId: string,
    memberName: string,
    filePath: string
  ): Outgoing {
    const item: FileItem = {
      ...card,
      id: randomUUID(),
      status: 'offering',
      transferred: 0,
      speed: 0,
      error: undefined,
      parts: undefined
    }
    const t: Outgoing = {
      direction: 'out',
      item,
      peer: peerId,
      path: filePath,
      socket: null,
      lastTime: 0,
      lastBytes: 0,
      group: { itemId: card.id, info, memberName }
    }
    this.outgoing.set(item.id, t)
    return t
  }

  private groupInfoFor(itemId: string): GroupInfo | undefined {
    for (const t of this.outgoing.values()) {
      if (t.group?.itemId === itemId) return t.group.info
    }
    return undefined
  }

  /** Общая подготовка файла: размер, проверка и миниатюра */
  private async prepare(filePath: string): Promise<{ name: string; size: number; error?: string; thumbnail?: string }> {
    let size = 0
    let error: string | undefined
    try {
      const st = await fsp.stat(filePath)
      if (st.isDirectory()) error = this.opts.t('error.folderNotSupported')
      else if (!st.isFile()) error = this.opts.t('error.notRegularFile')
      else size = st.size
    } catch (err) {
      error = this.opts.t('error.fileUnavailable', {
        code: (err as NodeJS.ErrnoException).code ?? (err as Error).message
      })
    }
    const name = path.basename(filePath)
    let thumbnail: string | undefined
    if (!error && this.opts.makeThumbnail && isImageFileName(name) && size <= MAX_THUMBNAIL_SOURCE_BYTES) {
      thumbnail = await this.opts.makeThumbnail(filePath).catch(() => undefined)
    }
    return { name, size, error, thumbnail }
  }

  private async sendOffer(t: Outgoing): Promise<void> {
    const { item } = t
    if (this.offering.has(item.id)) return
    this.offering.add(item.id)
    try {
      await this.opts.chat.sendReliable(t.peer, {
        type: 'file-offer',
        id: item.id,
        from: this.opts.selfId,
        name: item.name,
        size: item.size,
        timestamp: item.timestamp,
        thumb: item.thumbnail,
        group: t.group?.info
      })
      this.opts.log.info(`-> file offer delivered: "${item.name}" (${item.size} bytes)`)
      if (t.item.status === 'offering') this.update(t, { status: 'pending', queued: undefined })
    } catch (err) {
      if (t.item.status !== 'offering') return
      if (!t.group && !t.detached) {
        // личное предложение ждёт в очереди: уйдёт, когда получатель появится (kickOffers)
        if (!t.item.queued) {
          this.opts.log.info(`file offer "${item.name}" queued: ${(err as Error).message}`)
          this.update(t, { queued: true })
        }
        return
      }
      this.finish(t, { status: 'failed', error: (err as Error).message })
    } finally {
      this.offering.delete(item.id)
    }
  }

  /** Очередь: разослать личные предложения, которые ещё не дошли (получатель появился в сети) */
  kickOffers(peerId: string | undefined, reachable: (id: string) => boolean): void {
    for (const t of this.outgoing.values()) {
      if (t.item.status !== 'offering' || t.group || t.detached) continue
      if (peerId ? t.peer !== peerId : !reachable(t.peer)) continue
      void this.sendOffer(t)
    }
  }

  private onFileConnection({ socket, packet, rest, remote }: FileConnection): void {
    const fileId = asString(packet.fileId, 64)
    const from = asString(packet.from, 64)

    if (packet.type === 'file-request' && packet.everyone === true) {
      if (!fileId || !from) return refuse(socket, 'not-found')
      socket.pause()
      void this.serveEveryone(socket, fileId, from, remote)
      return
    }

    if (packet.type === 'file-request') {
      const t = fileId ? this.outgoing.get(fileId) : undefined
      if (!t || t.peer !== from) return refuse(socket, 'not-found')
      if (t.item.status === 'canceled') return refuse(socket, 'canceled')
      if (t.item.status !== 'pending' && t.item.status !== 'offering') return refuse(socket, 'not-available')
      this.opts.log.info(`file-request for "${t.item.name}" from ${remote}`)
      void this.stream(t, socket, true)
      return
    }

    if (packet.type === 'file-push') {
      const t = fileId ? this.incoming.get(fileId) : undefined
      if (!t || t.peer !== from || t.item.status !== 'connecting' || t.socket || !t.pushTimer) {
        return refuse(socket, t?.item.status === 'canceled' ? 'canceled' : 'not-available')
      }
      clearTimeout(t.pushTimer)
      t.pushTimer = null
      t.socket = socket
      this.opts.log.info(`file-push for "${t.item.name}" from ${remote}`)
      socket.write(encodeLine({ type: 'file-response', ok: true }))
      const waiter = t.pushWaiter
      if (waiter) {
        // скачивание из общего чата: исход решает цикл по источникам
        this.receive(t, socket, rest).then(
          () => waiter.resolve(true),
          (err) => waiter.reject(err)
        )
      } else {
        this.receive(t, socket, rest).catch((err) => this.fail(t, err))
      }
      return
    }

    socket.destroy()
  }

  /** Отдаёт файл в сокет. sendHeader=true — режим pull (нужно ответить на file-request). */
  private async stream(t: Outgoing, socket: net.Socket, sendHeader: boolean): Promise<void> {
    if (TERMINAL.has(t.item.status)) {
      socket.destroy()
      return
    }
    const { size, name } = t.item
    t.socket = socket
    this.update(t, { status: 'transferring', transferred: 0, speed: 0, error: undefined })
    this.resetProgress(t)
    socket.setTimeout(IDLE_TIMEOUT_MS, () => socket.destroy(new Error(this.opts.t('error.receiverSilent'))))

    try {
      const st = await fsp.stat(t.path).catch(() => null)
      if (!st || !st.isFile() || st.size !== size) {
        if (sendHeader) socket.end(encodeLine({ type: 'file-response', ok: false, reason: 'changed' }))
        throw new Error(this.opts.t('error.fileChanged'))
      }
      if (t.item.status !== 'transferring') throw new Error(this.opts.t('error.transferCanceled'))
      if (sendHeader) socket.write(encodeLine({ type: 'file-response', ok: true, size }))

      // Успех = все байты записаны И получатель сам закрыл соединение (значит, дочитал до конца)
      const closed = waitForCleanClose(socket, this.opts.t('error.connectionBroken'))
      closed.catch(() => undefined)
      socket.resume()

      let sent = 0
      const counter = new Transform({
        transform: (chunk: Buffer, _encoding, callback) => {
          sent += chunk.length
          this.progress(t, sent)
          callback(null, chunk)
        }
      })
      this.opts.log.info(`sending "${name}" (${size} bytes)`)
      if (size > 0) {
        await pipeline(fs.createReadStream(t.path, { start: 0, end: size - 1 }), counter, socket)
      } else {
        socket.end()
      }
      await withTimeout(closed, CLOSE_WAIT_MS, this.opts.t('error.receiverNoConfirm'))
      if (sent !== size) throw new Error(this.opts.t('error.partialRead'))
      this.opts.log.info(`sent "${name}"`)
      this.finish(t, { status: 'done', transferred: size })
    } catch (err) {
      socket.destroy()
      this.fail(t, err)
    } finally {
      t.socket = null
    }
  }

  /** Получатель не смог подключиться к нам — подключаемся к нему сами. */
  private async push(t: Outgoing): Promise<void> {
    if (t.item.status !== 'pending' && t.item.status !== 'offering') return
    this.update(t, { status: 'connecting' })
    let socket: net.Socket
    try {
      socket = await this.opts.chat.connectRaw(t.peer)
    } catch (err) {
      this.fail(t, this.opts.t('error.connectReceiver', { error: (err as Error).message }))
      return
    }
    if (!this.is(t, 'connecting')) {
      socket.destroy()
      return
    }
    t.socket = socket
    try {
      socket.write(encodeLine({ type: 'file-push', v: PROTOCOL_VERSION, fileId: t.item.id, from: this.opts.selfId }))
      const { packet } = await readFirstLine(socket, HANDSHAKE_TIMEOUT_MS)
      if (packet.type !== 'file-response' || packet.ok !== true) {
        socket.destroy()
        if (packet.reason === 'canceled') this.finish(t, { status: 'canceled' })
        else this.fail(t, describeReason(this.opts.t, packet.reason), false)
        return
      }
      await this.stream(t, socket, false)
    } catch (err) {
      socket.destroy()
      this.fail(t, err)
    }
  }

  // ─── получатель ───────────────────────────────────────────────────────────────

  private onOffer(peerId: string, offer: IncomingOffer): void {
    // карточка файла общего чата: её кладёт main (повторы от нескольких коллег, звук, время)
    if (offer.everyone) {
      this.emit('everyone-offer', peerId, offer)
      return
    }
    if (this.incoming.has(offer.id)) return
    // повтор из очереди отправителя после нашего перезапуска: карточка уже есть в истории
    if (this.opts.store.get(offer.group ? offer.group.id : peerId, offer.id)) return
    // предложение в группу: карточка появится в переписке группы, автор подписан сверху
    const group = offer.group
    const item: FileItem = {
      kind: 'file',
      id: offer.id,
      peerId: group ? group.id : peerId,
      ...(group
        ? { authorId: peerId, authorName: group.members.find((m) => m.id === peerId)?.name || '' }
        : {}),
      direction: 'in',
      name: sanitizeFileName(offer.name),
      size: offer.size,
      transferred: 0,
      speed: 0,
      status: 'pending',
      timestamp: Date.now(),
      thumbnail: offer.thumbnail
    }
    this.incoming.set(item.id, {
      direction: 'in',
      item,
      peer: peerId,
      socket: null,
      partPath: null,
      finalPath: null,
      pushTimer: null,
      lastTime: 0,
      lastBytes: 0
    })
    this.opts.store.upsert(item)
    this.emit('incoming-offer', item)
  }

  async accept(fileId: string): Promise<void> {
    const t = this.incoming.get(fileId)
    if (!t || t.item.status !== 'pending') return

    const dir = this.opts.getDownloadDir()
    try {
      await fsp.mkdir(dir, { recursive: true })
      await fsp.access(dir, fs.constants.W_OK)
    } catch {
      this.fail(t, this.opts.t('error.noDownloadsAccess', { dir }))
      return
    }
    t.partPath = path.join(dir, `.${fileId}.hallway-part`)
    this.update(t, { status: 'connecting', error: undefined })

    let socket: net.Socket
    try {
      socket = await this.opts.chat.connectRaw(t.peer)
    } catch (err) {
      if (!this.is(t, 'connecting')) return
      this.opts.log.warn(`pull connection for "${t.item.name}" failed (${(err as Error).message}), asking sender to push`)
      this.requestPush(t)
      return
    }
    if (!this.is(t, 'connecting')) {
      socket.destroy()
      return
    }

    t.socket = socket
    try {
      socket.write(encodeLine({ type: 'file-request', v: PROTOCOL_VERSION, fileId, from: this.opts.selfId }))
      const { packet, rest } = await readFirstLine(socket, HANDSHAKE_TIMEOUT_MS)
      if (packet.type !== 'file-response') throw new Error(this.opts.t('error.badSenderResponse'))
      if (packet.ok !== true) {
        socket.destroy()
        if (packet.reason === 'canceled') this.finish(t, { status: 'canceled' })
        else this.fail(t, describeReason(this.opts.t, packet.reason), false)
        return
      }
      await this.receive(t, socket, rest)
    } catch (err) {
      socket.destroy()
      this.fail(t, err)
    }
  }

  private requestPush(t: Incoming): void {
    t.pushTimer = setTimeout(() => {
      t.pushTimer = null
      if (t.item.status === 'connecting' && !t.socket) {
        this.fail(t, this.opts.t('error.noSenderConnection'))
      }
    }, PUSH_WAIT_MS)
    void this.opts.chat.sendBestEffort(t.peer, { type: 'file-push-request', fileId: t.item.id }).then((sent) => {
      if (!sent && t.item.status === 'connecting' && !t.socket) {
        this.fail(t, this.opts.t('error.senderUnreachable'), false)
      }
    })
  }

  private async receive(t: Incoming, socket: net.Socket, rest: Buffer): Promise<void> {
    const { size, name } = t.item
    const partPath = t.partPath
    if (!partPath || TERMINAL.has(t.item.status)) {
      socket.destroy()
      return
    }
    this.update(t, { status: 'transferring', transferred: 0, speed: 0 })
    this.resetProgress(t)
    this.opts.log.info(`receiving "${name}" (${size} bytes)`)
    socket.setTimeout(IDLE_TIMEOUT_MS, () => socket.destroy(new Error(this.opts.t('error.transferStalled'))))

    let received = 0
    // файл общего чата могли отдать не автор, а коллега: сверяем с суммой автора
    const hash = t.everyone ? createHash('sha256') : null
    const counter = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        received += chunk.length
        if (received > size) {
          callback(new Error(this.opts.t('error.tooMuchData')))
          return
        }
        hash?.update(chunk)
        this.progress(t, received)
        callback(null, chunk)
      }
    })
    const out = fs.createWriteStream(partPath)
    if (rest.length) socket.unshift(rest)

    try {
      await pipeline(socket, counter, out)
      if (!out.closed) await once(out, 'close')
      if (received !== size) {
        throw new Error(
          this.opts.t('error.transferStalledBytes', {
            done: formatBytes(this.opts.t, received),
            total: formatBytes(this.opts.t, size)
          })
        )
      }
      if (hash && hash.digest('hex') !== t.item.sha256) throw new Error(this.opts.t('everyone.fileCorrupt'))
      const finalPath = await moveIntoPlace(this.opts.t, partPath, path.dirname(partPath), name)
      t.partPath = null
      t.finalPath = finalPath
      this.opts.store.setFilePath(t.item.peerId, t.item.id, finalPath)
      if (t.everyone) {
        // теперь и мы можем отдать этот файл коллегам — он только что проверен
        const st = await fsp.stat(finalPath).catch(() => null)
        if (st) this.verifiedShares.set(t.item.id, st.mtimeMs)
      }
      socket.setTimeout(0)
      socket.end()
      t.socket = null
      this.opts.log.info(`received "${name}" -> ${finalPath}`)
      this.finish(t, { status: 'done', transferred: size })
    } catch (err) {
      socket.destroy()
      if (!out.closed) await once(out, 'close').catch(() => undefined)
      await fsp.rm(partPath, { force: true }).catch(() => undefined)
      t.socket = null
      throw err
    }
  }

  decline(fileId: string): void {
    const t = this.incoming.get(fileId)
    if (!t || t.item.status !== 'pending') return
    this.finish(t, { status: 'declined' })
    void this.opts.chat.sendBestEffort(t.peer, { type: 'file-decline', fileId })
  }

  // ─── общее ────────────────────────────────────────────────────────────────────

  cancel(fileId: string): void {
    const t = this.outgoing.get(fileId) ?? this.incoming.get(fileId)
    if (!t || TERMINAL.has(t.item.status)) return
    this.opts.log.info(`transfer "${t.item.name}" canceled by user`)
    this.finish(t, { status: 'canceled' })
    void this.opts.chat.sendBestEffort(t.peer, { type: 'file-cancel', fileId })
  }

  private onControl(peerId: string, type: string, fileId: string, reason?: string): void {
    const t = this.outgoing.get(fileId) ?? this.incoming.get(fileId)
    if (!t || t.peer !== peerId) {
      // коллега не может подключиться к нам за файлом общего чата — подключимся сами
      if (type === 'file-push-request') void this.pushEveryone(peerId, fileId)
      return
    }
    switch (type) {
      case 'file-decline':
        if (t.direction === 'out' && (t.item.status === 'pending' || t.item.status === 'offering')) {
          this.opts.log.info(`"${t.item.name}" declined by peer`)
          this.finish(t, { status: 'declined' })
        }
        break
      case 'file-cancel':
        // может прийти после того, как разрыв сокета уже пометил передачу как failed
        if (!TERMINAL.has(t.item.status) || t.item.status === 'failed') {
          this.opts.log.info(`"${t.item.name}" canceled by peer`)
          this.finish(t, { status: 'canceled', error: undefined })
        }
        break
      case 'file-error':
        if (t.item.status === 'canceled' || t.item.status === 'declined') break
        if (t.direction === 'in' && t.item.status === 'done') break
        this.finish(t, {
          status: 'failed',
          error: this.opts.t('error.peerSide', { reason: reason ?? this.opts.t('error.unknown') })
        })
        break
      case 'file-push-request':
        if (t.direction === 'out') void this.push(t)
        break
    }
  }

  /** Путь к файлу на диске: полученный файл или исходный файл отправителя. */
  localPath(fileId: string): string | null {
    const incoming = this.incoming.get(fileId)
    if (incoming) return incoming.item.status === 'done' ? incoming.finalPath : null
    const outgoing = this.outgoing.get(fileId)
    if (outgoing) return outgoing.path
    // передачи из прошлых запусков: путь хранится вместе с историей
    // (сохраняется только у исходящих и у полностью полученных файлов)
    return this.opts.store.getFilePath(fileId) ?? null
  }

  /** Восстанавливает ожидающие предложения из истории: их можно принять или отдать и после перезапуска */
  restore(items: FileItem[]): void {
    for (const item of items) {
      // личное предложение, не дошедшее до перезапуска, — снова в очередь
      if (item.status === 'offering' && item.direction === 'out' && !item.parts?.length && item.peerId !== EVERYONE_ID) {
        const filePath = this.opts.store.getFilePath(item.id)
        if (filePath && !this.outgoing.has(item.id)) {
          this.outgoing.set(item.id, {
            direction: 'out',
            item,
            peer: item.peerId,
            path: filePath,
            socket: null,
            lastTime: 0,
            lastBytes: 0
          })
        }
        continue
      }
      if (item.status !== 'pending') continue
      // карточка рассылки в группу — не передача: её части уже помечены прерванными
      if (item.parts?.length) continue
      // файл общего чата скачивают по кнопке, у любого, у кого он есть, — не передача
      if (item.peerId === EVERYONE_ID) continue
      const peer = item.authorId ?? item.peerId
      if (item.direction === 'in' && !this.incoming.has(item.id)) {
        this.incoming.set(item.id, {
          direction: 'in',
          item,
          peer,
          socket: null,
          partPath: null,
          finalPath: null,
          pushTimer: null,
          lastTime: 0,
          lastBytes: 0
        })
      } else if (item.direction === 'out' && !this.outgoing.has(item.id)) {
        const filePath = this.opts.store.getFilePath(item.id)
        if (filePath) {
          this.outgoing.set(item.id, {
            direction: 'out',
            item,
            peer,
            path: filePath,
            socket: null,
            lastTime: 0,
            lastBytes: 0
          })
        }
      }
    }
  }

  shutdown(): void {
    for (const t of [...this.outgoing.values(), ...this.incoming.values()]) {
      t.socket?.destroy()
      if (t.direction === 'in') {
        if (t.pushTimer) clearTimeout(t.pushTimer)
        if (t.partPath) {
          try {
            fs.rmSync(t.partPath, { force: true })
          } catch {
            // файл ещё открыт (Windows) — удалится при следующем запуске
          }
        }
      }
    }
  }

  private fail(t: Transfer, err: unknown, notifyPeer = true): void {
    if (TERMINAL.has(t.item.status)) return
    const message = err instanceof Error ? err.message : String(err)
    this.opts.log.warn(`transfer "${t.item.name}" failed: ${message}`)
    this.finish(t, { status: 'failed', error: message })
    if (notifyPeer) {
      void this.opts.chat.sendBestEffort(t.peer, { type: 'file-error', fileId: t.item.id, reason: message })
    }
  }

  private finish(t: Transfer, patch: Partial<FileItem>): void {
    // скачивание из общего чата ждало подключения источника — отпускаем цикл по источникам
    if (t.direction === 'in' && t.pushWaiter) t.pushWaiter.resolve(false)
    if (t.direction === 'in' && t.pushTimer) {
      clearTimeout(t.pushTimer)
      t.pushTimer = null
    }
    const socket = t.socket
    this.update(t, { speed: 0, ...patch })
    if (patch.status !== 'done' && socket && !socket.destroyed) socket.destroy()
  }

  /** Статус меняется во время await (отмена пользователем), поэтому сравнение через метод, а не сужение типа */
  private is(t: Transfer, ...statuses: FileStatus[]): boolean {
    return statuses.includes(t.item.status)
  }

  private update(t: Transfer, patch: Partial<FileItem>): void {
    t.item = { ...t.item, ...patch }
    if (t.direction === 'out' && t.detached) {
      // раздача и копии для старых клиентов своей карточки не имеют; автору — «скачали»
      if (patch.status === 'done' && t.detached.author) this.noteDownloaded(t.detached.cardId, t.peer)
      return
    }
    if (t.direction === 'out' && t.group) this.updateGroupCard(t.group.itemId)
    else this.opts.store.upsert(t.item)
  }

  /**
   * Пересобирает карточку рассылки из состояний передач: прогресс — средний,
   * скорость — сумма активных, статус — самый «живой» из частей.
   */
  private updateGroupCard(itemId: string): void {
    const parts: FilePart[] = []
    let speed = 0
    let transferred = 0
    for (const t of this.outgoing.values()) {
      if (t.group?.itemId !== itemId) continue
      parts.push({
        peerId: t.peer,
        name: t.group.memberName,
        status: t.item.status,
        transferred: t.item.transferred,
        error: t.item.error
      })
      transferred += t.item.transferred
      if (t.item.status === 'transferring') speed += t.item.speed
    }
    const card = this.groupCards.get(itemId)
    if (!parts.length || !card) return
    const active = parts.filter((p) => !TERMINAL.has(p.status))
    const status: FileStatus = parts.some((p) => p.status === 'transferring')
      ? 'transferring'
      : parts.some((p) => p.status === 'connecting')
        ? 'connecting'
        : active.length
          ? 'pending'
          : parts.some((p) => p.status === 'done')
            ? 'done'
            : parts.every((p) => p.status === 'declined')
              ? 'declined'
              : parts.every((p) => p.status === 'canceled')
                ? 'canceled'
                : 'failed'
    const failed = parts.filter((p) => p.status === 'failed')
    const item: FileItem = {
      ...card,
      status,
      parts,
      transferred: Math.round(transferred / parts.length),
      speed,
      error: status === 'failed' && failed[0] ? failed[0].error : undefined
    }
    this.groupCards.set(itemId, item)
    this.opts.store.upsert(item)
  }

  private resetProgress(t: Transfer): void {
    t.lastTime = Date.now()
    t.lastBytes = 0
  }

  private progress(t: Transfer, bytes: number): void {
    const now = Date.now()
    const elapsed = now - t.lastTime
    if (elapsed < PROGRESS_INTERVAL_MS) return
    const instant = ((bytes - t.lastBytes) * 1000) / elapsed
    const speed = t.item.speed > 0 ? t.item.speed * 0.6 + instant * 0.4 : instant
    t.lastTime = now
    t.lastBytes = bytes
    this.update(t, { transferred: bytes, speed })
  }
}

// ─── утилиты ────────────────────────────────────────────────────────────────────

/** SHA-256 файла потоком — большие файлы не читаются в память целиком */
export async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(fs.createReadStream(filePath), hash)
  return hash.digest('hex')
}

function refuse(socket: net.Socket, reason: string): void {
  socket.end(encodeLine({ type: 'file-response', ok: false, reason }))
  socket.resume()
  setTimeout(() => socket.destroy(), 5000).unref()
}

function describeReason(t: TranslateFn, reason: unknown): string {
  switch (reason) {
    case 'not-found':
      return t('error.fileGone')
    case 'changed':
      return t('error.fileModified')
    case 'not-available':
      return t('error.transferGone')
    case 'canceled':
      return t('error.transferCanceled')
    default:
      return t('error.requestDeclined')
  }
}

function waitForCleanClose(socket: net.Socket, brokenMessage: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('close', (hadError) => (hadError ? reject(new Error(brokenMessage)) : resolve()))
  })
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms)
    })
  ])
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function formatBytes(t: TranslateFn, bytes: number): string {
  if (bytes < 1024) return `${bytes} ${t('size.b')}`
  const units = [t('size.kb'), t('size.mb'), t('size.gb'), t('size.tb')]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}

/**
 * Имя файла от собеседника — недоверенные данные: убираем пути (защита от ../../),
 * запрещённые в Windows символы и имена (CON, NUL…), ведущие точки и хвостовые пробелы.
 */
export function sanitizeFileName(input: string): string {
  let name = input.normalize('NFC')
  name = name.split(/[/\\]/).pop() ?? ''
  name = name.replace(/[<>:"|?*\u0000-\u001f\u007f]/g, '_')
  name = name.replace(/^[\s.]+/, '').replace(/[\s.]+$/, '')
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i.test(name)) name = '_' + name
  if (!name) name = 'file'
  if (Buffer.byteLength(name) > 200) {
    const ext = path.extname(name).slice(0, 16)
    const chars = Array.from(name.slice(0, name.length - ext.length))
    while (chars.length && Buffer.byteLength(chars.join('') + ext) > 200) chars.pop()
    name = chars.join('') + ext
  }
  return name
}

function uniquePath(dir: string, name: string): string {
  const ext = path.extname(name)
  const base = ext ? name.slice(0, -ext.length) : name
  let candidate = path.join(dir, name)
  for (let i = 1; fs.existsSync(candidate); i++) candidate = path.join(dir, `${base} (${i})${ext}`)
  return candidate
}

async function moveIntoPlace(t: TranslateFn, partPath: string, dir: string, name: string): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt < 10; attempt++) {
    // Проверка и rename — синхронно, без await между ними: два одноимённых файла,
    // завершившихся одновременно, не перезапишут друг друга.
    const target = uniquePath(dir, name)
    try {
      fs.renameSync(partPath, target)
      return target
    } catch (err) {
      lastError = err
      const code = (err as NodeJS.ErrnoException).code
      // Windows: антивирус/индексатор может ненадолго держать файл
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES' && code !== 'EEXIST') break
      await delay(200)
    }
  }
  throw new Error(t('error.saveFailed', { error: (lastError as Error).message }))
}

/** Удаляет недокачанные .hallway-part, оставшиеся после аварийного завершения. */
export function cleanupStalePartFiles(dir: string, log: ScopedLogger): void {
  try {
    for (const entry of fs.readdirSync(dir)) {
      if (PART_FILE_RE.test(entry)) {
        fs.rmSync(path.join(dir, entry), { force: true })
        log.info(`removed stale partial file ${entry}`)
      }
    }
  } catch {
    // папки может ещё не быть
  }
}
