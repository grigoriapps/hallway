import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent
} from 'react'
import type { ArchivedView, ChatItem, EventItem, FileItem, GroupMember, GroupView, PeerView, ReplyRef, TextItem } from '../types'
import { useApp, useT } from '../state'
import type { Translator } from '../i18n'
import { bigEmojiCount, errorMessage, formatDay, formatTime, isSameDay } from '../format'
import { findOccurrences } from '../text-utils'
import { RichText, type Highlight } from '../rich-text'
import { Avatar } from './Avatar'
import { EmojiPicker } from './EmojiPicker'
import { FileCard } from './FileCard'
import {
  IconAlert,
  IconChat,
  IconCheck,
  IconChecks,
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconClose,
  IconMegaphone,
  IconMore,
  IconPaperclip,
  IconReply,
  IconSearch,
  IconSend,
  IconSmile,
  IconUpload,
  IconUsers
} from './Icons'

const MAX_TEXT_LENGTH = 20000
const MOD_KEY = window.api.platform === 'darwin' ? '⌘' : 'Ctrl'
/** «печатает…» отправляется не чаще раза в 3 с и гасится через 4 с тишины */
const TYPING_REFRESH_MS = 3000
const TYPING_IDLE_MS = 4000
/** поле ввода растёт вместе с текстом до этой высоты (как max-height в styles.css), дальше прокрутка */
const COMPOSER_MAX_HEIGHT = 160
/** черновики по собеседникам переживают переключение между чатами */
const drafts = new Map<string, string>()
/** «Ответить лично» из общего чата: цитата ждёт, пока откроется личный чат с автором */
const pendingReplies = new Map<string, ReplyRef>()

/** Открытый чат: личный, групповой, общий или архивный. Дальше окно работает только с этой моделью. */
export interface ChatTarget {
  kind: 'peer' | 'group' | 'everyone' | 'archive'
  id: string
  title: string
  subtitle: string
  /** есть кому доставить сообщение */
  online: boolean
  canSendFiles: boolean
  peer?: PeerView
  group?: GroupView
  archived?: ArchivedView
}

interface Match {
  itemId: string
  start: number
  end: number
}

export function ChatWindow({ target }: { target: ChatTarget | null }) {
  const { state } = useApp()
  const t = useT()

  if (!target) {
    return (
      <main className="chat chat-empty">
        <div className="drag-strip" aria-hidden="true" />
        <div className="placeholder">
          <IconChat size={44} />
          <h2>{t('chat.placeholderTitle')}</h2>
          <p>{t('chat.placeholderHint')}</p>
        </div>
      </main>
    )
  }

  return <Conversation key={target.id} target={target} items={state.conversations[target.id] ?? []} />
}

function replyRefFor(t: Translator, item: TextItem | FileItem, selfId: string): ReplyRef {
  const text =
    item.kind === 'text' ? item.text.replace(/\s+/g, ' ').slice(0, 200) : t('sidebar.filePreview', { name: item.name })
  const authorId =
    item.direction === 'out' ? selfId : item.kind === 'text' && item.authorId ? item.authorId : item.peerId
  return { id: item.id, text, authorId }
}

function Conversation({ target, items }: { target: ChatTarget; items: ChatItem[] }) {
  const { state, dispatch } = useApp()
  const t = useT()
  const { appearance } = state.settings
  const selfId = state.self.id
  const isGroup = target.kind === 'group'
  const isEveryone = target.kind === 'everyone'
  /** переписка на несколько человек: над сообщениями подписан автор */
  const shared = isGroup || isEveryone
  const archived = target.kind === 'archive'
  const typingNames = (state.typing[target.id] ?? []).filter(Boolean)
  const typing = !archived && typingNames.length > 0
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)
  // цитата из «Ответить лично» (initializer без побочных эффектов: StrictMode зовёт его дважды)
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(() => pendingReplies.get(target.id) ?? null)
  useEffect(() => {
    pendingReplies.delete(target.id)
  }, [target.id])

  /** имена авторов общего чата: кто сейчас не в списке, того знаем по его сообщениям */
  const knownAuthors = useMemo(() => {
    const map = new Map<string, string>()
    if (!isEveryone) return map
    for (const item of items) if (item.kind === 'text' && item.authorId && item.authorName) map.set(item.authorId, item.authorName)
    for (const peer of state.peers) if (peer.name) map.set(peer.id, peer.name)
    return map
  }, [isEveryone, items, state.peers])
  const everyoneMembers = useMemo(
    () => [...knownAuthors.entries()].map(([id, name]) => ({ id, name })),
    [knownAuthors]
  )

  const authorName = (authorId: string) => {
    if (authorId === selfId) return t('chat.you')
    if (target.group) return target.group.members.find((m) => m.id === authorId)?.name || t('common.peer')
    if (isEveryone) return knownAuthors.get(authorId) || t('common.peer')
    return target.title
  }

  /** «Ответить лично»: личный чат с автором, цитата уже в поле ввода */
  const replyPrivately = (item: TextItem) => {
    if (!item.authorId) return
    pendingReplies.set(item.authorId, replyRefFor(t, item, selfId))
    dispatch({ type: 'select', peerId: item.authorId })
  }
  /** Подпись под своим сообщением в очереди: кому и почему ещё не доставлено */
  const waitingNote = (item: TextItem): string | undefined => {
    if (item.direction !== 'out' || item.status === 'failed') return undefined
    if (isGroup && item.pendingTo?.length) {
      const names = item.pendingTo.map((id) => authorName(id)).join(', ')
      return t('outbox.groupWaiting', { names })
    }
    if (target.kind === 'peer' && item.status === 'sending' && item.queued) {
      return target.peer?.online ? t('outbox.retrying') : t('outbox.waitingFor', { name: target.title })
    }
    return undefined
  }

  const canReplyPrivately = (item: TextItem) =>
    isEveryone && item.direction === 'in' && !!item.authorId && state.peers.some((p) => p.id === item.authorId)

  // ─── поиск ───
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [current, setCurrent] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const seenSearchNonce = useRef(state.searchNonce)

  const openSearch = () => {
    setSearchOpen(true)
    requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  }
  const closeSearch = () => {
    setSearchOpen(false)
    setQuery('')
  }

  useEffect(() => {
    if (state.searchNonce === seenSearchNonce.current) return
    seenSearchNonce.current = state.searchNonce
    openSearch()
  }, [state.searchNonce])

  const matches = useMemo<Match[]>(() => {
    const q = query.trim()
    if (!searchOpen || !q) return []
    const result: Match[] = []
    for (const item of items) {
      if (item.kind === 'event') continue
      const text = item.kind === 'text' ? item.text : item.name
      for (const [start, end] of findOccurrences(text, q)) result.push({ itemId: item.id, start, end })
    }
    return result
  }, [items, query, searchOpen])

  // новый запрос — начинаем с самого свежего совпадения
  useEffect(() => {
    setCurrent(Math.max(0, matches.length - 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const currentIndex = matches.length ? Math.min(current, matches.length - 1) : -1
  const currentMatch = currentIndex >= 0 ? matches[currentIndex] : undefined

  const highlights = useMemo(() => {
    const map = new Map<string, Highlight[]>()
    matches.forEach((match, index) => {
      const list = map.get(match.itemId) ?? []
      list.push({ start: match.start, end: match.end, current: index === currentIndex })
      map.set(match.itemId, list)
    })
    return map
  }, [matches, currentIndex])

  const scrollToItem = (itemId: string, flash: boolean) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(itemId)}"]`)
    if (!el) return
    stickToBottom.current = false
    el.scrollIntoView({ block: 'center' })
    if (flash) {
      el.classList.remove('flash')
      void el.offsetWidth
      el.classList.add('flash')
      setTimeout(() => el.classList.remove('flash'), 1300)
    }
  }

  useEffect(() => {
    if (currentMatch) scrollToItem(currentMatch.itemId, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMatch?.itemId, currentMatch?.start])

  const stepMatch = (delta: number) => {
    if (!matches.length) return
    setCurrent((c) => (Math.min(c, matches.length - 1) + delta + matches.length) % matches.length)
  }

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      stepMatch(event.shiftKey ? 1 : -1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeSearch()
    }
  }

  // ─── прочитано и прокрутка ───
  useEffect(() => {
    const markRead = () => {
      if (document.hasFocus()) window.api.markRead(target.id)
    }
    markRead()
    window.addEventListener('focus', markRead)
    return () => window.removeEventListener('focus', markRead)
  }, [target.id, items.length])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const last = items.at(-1)
    if (stickToBottom.current || (last?.kind !== 'event' && last?.direction === 'out')) {
      el.scrollTop = el.scrollHeight
    }
  }, [items.length])

  const onScroll = () => {
    const el = scrollRef.current
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  // ─── перетаскивание файлов ───
  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files')
  // личному коллеге не в сети — можно: предложение файла подождёт в очереди
  const canDropFiles = target.canSendFiles && (target.online || target.kind === 'peer')

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (!canDropFiles) return
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => window.api.getPathForFile(file))
      .filter(Boolean)
    if (paths.length) void window.api.sendFilePaths(target.id, paths)
  }

  const startReply = (item: TextItem | FileItem) => setReplyTo(replyRefFor(t, item, selfId))

  return (
    <main
      className="chat"
      onDragEnter={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        dragDepth.current++
        setDragging(true)
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = canDropFiles ? 'copy' : 'none'
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <header className="chat-header">
        {target.peer ? (
          <Avatar
            name={target.peer.name}
            id={target.peer.id}
            size={appearance.compact ? 32 : 38}
            online={target.peer.online}
            status={target.peer.status}
          />
        ) : archived && target.archived?.kind === 'peer' ? (
          <Avatar name={target.title} id={target.id} size={appearance.compact ? 32 : 38} online={false} />
        ) : isEveryone ? (
          <span
            className="group-avatar everyone-avatar"
            style={{ width: appearance.compact ? 32 : 38, height: appearance.compact ? 32 : 38 }}
          >
            <IconMegaphone size={appearance.compact ? 16 : 19} />
          </span>
        ) : (
          <span className="group-avatar" style={{ width: appearance.compact ? 32 : 38, height: appearance.compact ? 32 : 38 }}>
            <IconUsers size={appearance.compact ? 16 : 19} />
          </span>
        )}
        <div className="chat-heading">
          <div className="chat-title">{target.title}</div>
          <div className="chat-sub">
            {typing ? (
              <span className="typing">
                <span className="typing-dots">
                  <i />
                  <i />
                  <i />
                </span>
                {shared
                  ? typingNames.length === 1
                    ? t('group.typingOne', { name: typingNames[0] })
                    : t('group.typingMany', { names: typingNames.join(', ') })
                  : t('sidebar.typing')}
              </span>
            ) : target.peer && target.peer.online ? (
              <>
                <span className={`status-dot status-${target.peer.status}`} />
                {target.subtitle}
              </>
            ) : (
              target.subtitle
            )}
          </div>
        </div>
        <div className="chat-actions">
          <button
            className={`icon-button${searchOpen ? ' active' : ''}`}
            title={t('chat.searchShortcut', { mod: MOD_KEY })}
            aria-label={t('chat.searchInChat')}
            onClick={() => (searchOpen ? closeSearch() : openSearch())}
          >
            <IconSearch />
          </button>
          <button
            className="icon-button"
            title={t('common.more')}
            aria-label={t(isGroup ? 'chat.menuGroup' : 'chat.menuPeer')}
            onClick={() => void (isGroup ? window.api.showGroupMenu(target.id) : window.api.showChatMenu(target.id))}
          >
            <IconMore />
          </button>
        </div>
      </header>

      {searchOpen && (
        <div className="search-bar">
          <IconSearch size={16} />
          <input
            ref={searchInputRef}
            autoFocus
            className="search-input"
            placeholder={t('chat.searchInChat')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
          />
          <span className="search-count">
            {query.trim()
              ? matches.length
                ? t('chat.searchCount', { current: currentIndex + 1, total: matches.length })
                : t('chat.searchNotFound')
              : ''}
          </span>
          <button
            className="icon-button small"
            title={t('chat.searchEarlier')}
            aria-label={t('chat.searchPrev')}
            disabled={!matches.length}
            onClick={() => stepMatch(-1)}
          >
            <IconChevronUp size={16} />
          </button>
          <button
            className="icon-button small"
            title={t('chat.searchLater')}
            aria-label={t('chat.searchNext')}
            disabled={!matches.length}
            onClick={() => stepMatch(1)}
          >
            <IconChevronDown size={16} />
          </button>
          <button
            className="icon-button small"
            title={t('chat.searchClose')}
            aria-label={t('chat.closeSearch')}
            onClick={closeSearch}
          >
            <IconClose size={16} />
          </button>
        </div>
      )}

      <div className="messages-wrap">
        <div className={`messages-bg bg-pattern-${appearance.chatBackground}`} />
        <div className="messages" ref={scrollRef} onScroll={onScroll}>
          {items.length === 0 && (
            <div className="messages-empty">
              {t(archived ? 'archive.readOnly' : isEveryone ? 'everyone.empty' : isGroup ? 'chat.emptyGroup' : 'chat.emptyPeer')}
            </div>
          )}
          {items.map((item, index) => {
            const previous = items[index - 1]
            return (
              <Fragment key={item.id}>
                {(!previous || !isSameDay(previous.timestamp, item.timestamp)) && (
                  <div className="day-separator">
                    <span>{formatDay(t, t.locale, item.timestamp)}</span>
                  </div>
                )}
                {item.kind === 'event' ? (
                  <EventLine item={item} />
                ) : item.kind === 'text' ? (
                  <TextBubble
                    item={item}
                    highlights={highlights.get(item.id)}
                    authorName={authorName}
                    showAuthor={(shared || archived) && item.direction === 'in'}
                    members={isEveryone ? everyoneMembers : target.group?.members}
                    everyone={isEveryone}
                    waitingNote={waitingNote(item)}
                    onReply={() => startReply(item)}
                    onReplyPrivately={canReplyPrivately(item) ? () => replyPrivately(item) : undefined}
                    onQuoteClick={(id) => scrollToItem(id, true)}
                  />
                ) : (
                  <FileCard
                    item={item}
                    peerOnline={isEveryone ? state.peers.some((p) => p.online) : target.online}
                    readOnly={archived}
                    showAuthor={shared || archived}
                    nameOf={authorName}
                    highlights={highlights.get(item.id)}
                    onReply={() => startReply(item)}
                  />
                )}
              </Fragment>
            )
          })}
        </div>
      </div>

      {archived ? <ArchiveBar target={target} /> : (
        <Composer
          target={target}
          replyTo={replyTo}
          replyAuthor={replyTo ? authorName(replyTo.authorId) : ''}
          onCancelReply={() => setReplyTo(null)}
        />
      )}

      {dragging && (
        <div className={`drop-overlay${canDropFiles ? '' : ' disabled'}`}>
          <div>
            <IconUpload size={32} />
            <div>
              {!target.canSendFiles
                ? t('archive.readOnly')
                : target.online
                  ? t('chat.dropFiles', { name: target.title })
                  : t(isGroup ? 'chat.composerGroupOffline' : 'chat.dropOffline')}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

/** Серая строка по центру: «в сети · 9:15», «Алиса добавила Веру» */
function EventLine({ item }: { item: EventItem }) {
  const t = useT()
  const time = formatTime(t.locale, item.timestamp)
  const actor = item.actorName || t('common.peer')
  const target = item.targetName ?? ''
  let text: string
  switch (item.event) {
    case 'peer-online':
      text = t('event.online', { time })
      break
    case 'peer-offline':
      text = t('event.offline', { time })
      break
    case 'group-created':
      text = t('event.groupCreated', { time })
      break
    case 'group-joined':
      text = t('event.groupJoined', { actor })
      break
    case 'group-renamed':
      text = t('event.groupRenamed', { actor, target })
      break
    case 'group-member-added':
      text = t('event.groupMemberAdded', { actor, target })
      break
    case 'group-member-removed':
      text = t('event.groupMemberRemoved', { actor, target })
      break
    case 'group-member-left':
      text = t('event.groupMemberLeft', { actor })
      break
    case 'group-deleted':
      text = t('event.groupDeleted', { actor })
      break
  }
  return (
    <div className="chat-event" data-item-id={item.id}>
      <span>{text}</span>
    </div>
  )
}

/** Вместо поля ввода в архивной переписке: пояснение и что с ней можно сделать */
function ArchiveBar({ target }: { target: ChatTarget }) {
  const t = useT()
  return (
    <div className="archive-bar">
      <span className="archive-note">{t('archive.readOnly')}</span>
      <div className="archive-actions">
        {target.archived?.kind === 'peer' && (
          <button className="btn" onClick={() => void window.api.unarchiveChat(target.id)}>
            {t('archive.restore')}
          </button>
        )}
        <button className="btn danger" onClick={() => void window.api.deleteArchived(target.id)}>
          {t('archive.delete')}
        </button>
      </div>
    </div>
  )
}

/**
 * Отметка у своего сообщения:
 *  часики — отправляется; одна бледная галочка — доставлено;
 *  две цветные — прочитано (в группе — прочитали все);
 *  в группе ещё две белые — прочитали не все (кто именно — в подсказке).
 */
function DeliveryIcon({
  item,
  members,
  everyone,
  waitingNote
}: {
  item: TextItem
  members?: readonly GroupMember[]
  everyone?: boolean
  waitingNote?: string
}) {
  const t = useT()
  /** в группе и общем чате показываем, кто прочитал: имена по id */
  const readers = item.readBy ?? []
  const readNames = readers
    .map((id) => members?.find((m) => m.id === id)?.name)
    .filter((name): name is string => !!name)
  const unnamed = readers.length - readNames.length
  const readTitle = () => {
    if (!members) return item.status === 'read' ? t('chat.read') : t('chat.delivered')
    if (item.status === 'read') return t('group.readAll')
    if (!readers.length) return t('group.notReadYet')
    const names = [...readNames, ...(unnamed > 0 ? [t('everyone.readOthers', { n: unnamed })] : [])]
    return t('group.readBy', { names: names.join(', ') })
  }
  if (item.status === 'failed') {
    return (
      <span title={t('chat.notDelivered')}>
        <IconAlert size={12} />
      </span>
    )
  }
  if (item.direction !== 'out') return null
  switch (item.status) {
    case 'sending':
      return (
        <span title={waitingNote ?? t('chat.delivering')} className="mark-sending">
          <IconClock size={12} />
        </span>
      )
    case 'sent': {
      // общий чат: пока никому не дошло (никого не было в сети) — это ещё не «доставлено»
      if (everyone && !(item.deliveredTo ?? []).length && !readers.length) {
        return (
          <span title={t('everyone.notDelivered')} className="mark-sending">
            <IconClock size={12} />
          </span>
        )
      }
      // недоставленные в группе (ошибка) и кто прочитал — обе строки в подсказке
      const title = [item.error, readTitle()].filter(Boolean).join('\n')
      if (members && readers.length > 0) {
        return (
          <span title={title} className="mark-partial">
            <IconChecks size={14} />
          </span>
        )
      }
      return (
        <span title={title} className="mark-delivered">
          <IconCheck size={14} />
        </span>
      )
    }
    case 'read':
      return (
        <span title={readTitle()} className="read-mark">
          <IconChecks size={14} />
        </span>
      )
    default:
      return null
  }
}

function TextBubble({
  item,
  highlights,
  authorName,
  showAuthor,
  members,
  everyone,
  waitingNote,
  onReply,
  onReplyPrivately,
  onQuoteClick
}: {
  item: TextItem
  highlights?: Highlight[]
  authorName: (authorId: string) => string
  showAuthor: boolean
  members?: readonly GroupMember[]
  everyone?: boolean
  /** сообщение ждёт в очереди отправки — кому и почему ещё не доставлено */
  waitingNote?: string
  onReply: () => void
  /** общий чат: ответить автору в личном чате */
  onReplyPrivately?: () => void
  onQuoteClick: (itemId: string) => void
}) {
  const t = useT()
  // Сообщение только из 1–3 смайликов показываем крупно и без «пузыря»
  const emojiCount = item.replyTo || item.broadcast ? 0 : bigEmojiCount(item.text)
  const classes = ['bubble']
  if (emojiCount) classes.push('bubble-emoji', `emoji-${emojiCount}`)
  if (item.status === 'failed') classes.push('bubble-failed')

  return (
    <div className={`row ${item.direction}`} data-item-id={item.id}>
      <div className="bubble-line">
        <div className={classes.join(' ')}>
          {item.broadcast && (
            <div className="broadcast-label">
              <IconMegaphone size={12} /> {t('chat.broadcastLabel')}
            </div>
          )}
          {showAuthor && item.authorId && <div className="bubble-author">{authorName(item.authorId)}</div>}
          {item.replyTo && (
            <button
              className="reply-quote"
              onClick={() => onQuoteClick(item.replyTo!.id)}
              title={t('chat.showMessage')}
            >
              <span className="reply-author">{authorName(item.replyTo.authorId)}</span>
              <span className="reply-text">{item.replyTo.text}</span>
            </button>
          )}
          <div className="bubble-text">
            <RichText text={item.text} highlights={highlights} />
          </div>
          <div className="meta meta-marks">
            <span className="meta-time">{formatTime(t.locale, item.timestamp)}</span>
            <DeliveryIcon item={item} members={members} everyone={everyone} waitingNote={waitingNote} />
          </div>
        </div>
        <button className="row-action" title={t('common.reply')} aria-label={t('common.reply')} onClick={onReply}>
          <IconReply size={15} />
        </button>
        {onReplyPrivately && (
          <button
            className="row-action"
            title={t('everyone.replyPrivately')}
            aria-label={t('everyone.replyPrivately')}
            onClick={onReplyPrivately}
          >
            <IconChat size={15} />
          </button>
        )}
      </div>
      {item.status === 'failed' && (
        <div className="failed-note">
          {item.error ? t('chat.notDeliveredWhy', { error: item.error }) : t('chat.notDelivered')} ·{' '}
          <button className="link" onClick={() => void window.api.retryText(item.peerId, item.id)}>
            {t('common.retry')}
          </button>
        </div>
      )}
      {item.status === 'sent' && item.error && <div className="partial-note">{item.error}</div>}
      {waitingNote && (
        <div className="waiting-note">
          {waitingNote} ·{' '}
          <button className="link" onClick={() => void window.api.cancelSend(item.peerId, item.id)}>
            {t('outbox.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}

/** Имя для картинки из буфера обмена: вместо безликого image.png — «Снимок 2026-09-15 18.20.05.png» */
function pastedFileName(prefix: string, file: File): string {
  if (file.name && !/^image\.\w+$/i.test(file.name)) return file.name
  const ext = (file.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg').replace(/[^\w]/g, '') || 'png'
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${prefix} ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}.${ext}`
}

async function sendPastedFiles(t: Translator, peerId: string, pasted: File[]): Promise<void> {
  const paths: string[] = []
  for (const file of pasted) {
    // файлы, скопированные в Finder/Проводнике, имеют путь; скриншоты — только данные
    const filePath = window.api.getPathForFile(file)
    if (filePath) {
      paths.push(filePath)
      continue
    }
    const result = await window.api.sendFileData(
      peerId,
      pastedFileName(t('chat.screenshotPrefix'), file),
      await file.arrayBuffer()
    )
    if (!result.ok) throw new Error(result.error ?? t('chat.sendFileFailed'))
  }
  if (paths.length) await window.api.sendFilePaths(peerId, paths)
}

function Composer({
  target,
  replyTo,
  replyAuthor,
  onCancelReply
}: {
  target: ChatTarget
  replyTo: ReplyRef | null
  replyAuthor: string
  onCancelReply: () => void
}) {
  const { state } = useApp()
  const t = useT()
  const { sendKey } = state.settings
  const [text, setText] = useState(() => drafts.get(target.id) ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const emojiButtonRef = useRef<HTMLButtonElement>(null)
  /** куда поставить курсор после вставки смайлика */
  const pendingCaret = useRef<number | null>(null)
  const typingSentAt = useRef(0)
  const typingIdleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // писать можно и тем, кто не в сети: сообщение ждёт в очереди и уйдёт само
  const canType = target.kind !== 'archive'

  const stopTyping = () => {
    clearTimeout(typingIdleTimer.current)
    if (!typingSentAt.current) return
    typingSentAt.current = 0
    window.api.sendTyping(target.id, false)
  }

  const signalTyping = (value: string) => {
    // в группе пакет уходит каждому участнику, поэтому не чаще раза в TYPING_REFRESH_MS
    if (target.kind === 'archive' || !target.online || !value.trim()) {
      stopTyping()
      return
    }
    const now = Date.now()
    if (now - typingSentAt.current > TYPING_REFRESH_MS) {
      typingSentAt.current = now
      window.api.sendTyping(target.id, true)
    }
    clearTimeout(typingIdleTimer.current)
    typingIdleTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS)
  }

  // при уходе из чата «печатает…» у собеседника должно погаснуть
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => stopTyping(), [])

  useEffect(() => {
    if (canType) inputRef.current?.focus()
    else setPickerOpen(false)
  }, [target.id, canType])

  useEffect(() => {
    if (replyTo) inputRef.current?.focus()
  }, [replyTo])

  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    // scrollHeight — без рамки, а высота считается с рамкой (border-box): без этой поправки
    // поле на 2 px меньше текста и справа появляется полоса прокрутки
    const full = el.scrollHeight + (el.offsetHeight - el.clientHeight)
    el.style.height = `${Math.min(full, COMPOSER_MAX_HEIGHT)}px`
    // прокрутка нужна, только когда текст длиннее самого высокого поля
    el.style.overflowY = full > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden'
    if (pendingCaret.current !== null) {
      el.focus()
      el.setSelectionRange(pendingCaret.current, pendingCaret.current)
      pendingCaret.current = null
    }
  }, [text])

  const update = (value: string) => {
    setText(value)
    drafts.set(target.id, value)
  }

  const insertEmoji = (emoji: string) => {
    const el = inputRef.current
    const start = el ? el.selectionStart : text.length
    const end = el ? el.selectionEnd : text.length
    const next = text.slice(0, start) + emoji + text.slice(end)
    if (next.length > MAX_TEXT_LENGTH) return
    pendingCaret.current = start + emoji.length
    update(next)
    signalTyping(next)
  }

  const send = () => {
    const value = text.trim()
    if (!value || !canType) return
    const reply = replyTo ?? undefined
    update('')
    setError(null)
    stopTyping()
    onCancelReply()
    window.api.sendText(target.id, value, reply).catch((err) => {
      update(value)
      setError(errorMessage(err))
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape' && replyTo) {
      event.preventDefault()
      onCancelReply()
      return
    }
    // isComposing — не отправлять, пока идёт ввод через IME
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    const mod = event.metaKey || event.ctrlKey
    const shouldSend = sendKey === 'enter' ? !event.shiftKey && !mod : mod
    if (shouldSend) {
      event.preventDefault()
      send()
    }
  }

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = Array.from(event.clipboardData.files)
    if (!pasted.length) return
    event.preventDefault()
    if (!canType) return
    if (!target.canSendFiles) {
      setError(t('archive.readOnly'))
      return
    }
    setError(null)
    sendPastedFiles(t, target.id, pasted).catch((err) => setError(errorMessage(err)))
  }

  const nobodyOnline = target.kind === 'everyone' && !state.peers.some((p) => p.online)
  const placeholder = !canType
    ? t(target.kind === 'group' ? 'chat.composerGroupOffline' : 'chat.composerOffline')
    : !target.online && target.kind === 'peer'
      ? t('outbox.composerOffline', { name: target.title })
      : !target.online && target.kind === 'group'
        ? t('outbox.composerGroupOffline')
        : nobodyOnline
      ? t('everyone.composerNobody')
      : sendKey === 'enter'
      ? t('chat.composerEnter')
      : t('chat.composerModEnter', { mod: MOD_KEY })

  return (
    <div className="composer-wrap">
      {pickerOpen && (
        <EmojiPicker anchorRef={emojiButtonRef} onSelect={insertEmoji} onClose={() => setPickerOpen(false)} />
      )}
      {error && <div className="composer-error">{error}</div>}
      {replyTo && (
        <div className="composer-reply">
          <IconReply size={16} />
          <div className="composer-reply-body">
            <span className="reply-author">{t('chat.replyTo', { name: replyAuthor })}</span>
            <span className="reply-text">{replyTo.text}</span>
          </div>
          <button
            className="icon-button small"
            aria-label={t('chat.cancelReply')}
            title={t('chat.cancelEsc')}
            onClick={onCancelReply}
          >
            <IconClose size={14} />
          </button>
        </div>
      )}
      <div className="composer">
        {target.canSendFiles && (
          <button
            className="icon-button"
            title={
              target.group
                ? t('chat.sendFilesGroup', { n: target.group.members.length - 1 })
                : t('chat.sendFiles')
            }
            aria-label={t('chat.sendFiles')}
            disabled={!canType}
            onClick={() => void window.api.pickAndSendFiles(target.id)}
          >
            <IconPaperclip size={20} />
          </button>
        )}
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          maxLength={MAX_TEXT_LENGTH}
          disabled={!canType}
          placeholder={placeholder}
          onChange={(e) => {
            update(e.target.value)
            signalTyping(e.target.value)
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
        <button
          ref={emojiButtonRef}
          className={`icon-button${pickerOpen ? ' active' : ''}`}
          title={t('chat.emoji')}
          aria-label={t('chat.emoji')}
          aria-expanded={pickerOpen}
          disabled={!canType}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setPickerOpen((open) => !open)}
        >
          <IconSmile size={20} />
        </button>
        <button
          className="send-button"
          title={sendKey === 'enter' ? t('chat.sendEnter') : t('chat.sendModEnter', { mod: MOD_KEY })}
          aria-label={t('common.send')}
          disabled={!canType || !text.trim()}
          onClick={send}
        >
          <IconSend size={18} />
        </button>
      </div>
    </div>
  )
}
