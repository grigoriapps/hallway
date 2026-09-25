// Общие типы main ↔ preload ↔ renderer.
// Файл ничего не импортирует: он попадает во все три сборки.

import type { Locale } from './i18n'

export type PresenceStatus = 'online' | 'away' | 'dnd'
export const PRESENCE_STATUSES: readonly PresenceStatus[] = ['online', 'away', 'dnd']

export interface SelfInfo {
  id: string
  name: string
  platform: string
  /** итоговый статус, который видят собеседники */
  status: PresenceStatus
  /** «Отошёл» выставлен автоматически (бездействие или заблокированный экран) */
  statusAuto: boolean
}

export interface PeerView {
  id: string
  name: string
  platform: string
  online: boolean
  pinned: boolean
  status: PresenceStatus
  ip: string | null
  tcpPort: number | null
  /** когда коллега последний раз был в сети; null — не знаем */
  lastSeenAt: number | null
  /** с какого момента коллега в сети — для «в сети с 7:49»; null — не знаем */
  onlineSince: number | null
  /** с какого момента действует его статус — для «отошёл с 12:26»; null — не знаем */
  statusSince: number | null
  /** версия Hallway у коллеги; null — клиент до 1.3 или не видели */
  version: string | null
}

/** Строка сводки «Коллеги и версии» в «Настройки → Сеть» */
export interface ColleagueView {
  id: string
  name: string
  platform: string
  online: boolean
  status: PresenceStatus
  /** null — клиент до 1.3, версию не сообщает */
  version: string | null
  lastSeenAt: number | null
}

export type Direction = 'in' | 'out'

// ─── группы ─────────────────────────────────────────────────────────────────────
// Группа живёт без сервера: её состав хранит каждый участник у себя, а сообщения
// уходят каждому участнику отдельным личным соединением. Id группы начинается с "g-",
// поэтому его нельзя спутать с id собеседника.

export const GROUP_ID_PREFIX = 'g-'

/**
 * «Общий чат»: одна переписка на всех, у кого стоит Hallway 1.3+. Состава нет — сообщение
 * получают все, кто в сети, а кто был не в сети — от любого коллеги, когда появится
 * (досылка за последние 3 дня). Id не похож ни на id собеседника (UUID), ни на группу.
 */
export const EVERYONE_ID = 'everyone'

export function isEveryoneId(id: string | null | undefined): boolean {
  return id === EVERYONE_ID
}
export const MAX_GROUP_MEMBERS = 50
export const MAX_GROUPS = 50

export function isGroupId(id: string): boolean {
  return id.startsWith(GROUP_ID_PREFIX)
}

export interface GroupMember {
  id: string
  name: string
}

export interface GroupView {
  id: string
  name: string
  /** все участники, включая вас */
  members: GroupMember[]
  /** сколько участников сейчас в сети (без вас) */
  online: number
  /**
   * Номер ревизии состава: каждое изменение (имя, участники) его увеличивает.
   * Состав с большим номером побеждает — так он сходится у всех без сервера.
   */
  rev: number
  /** кто создал группу: только он может удалить её у всех */
  ownerId: string
}

// sent — доставлено (пришёл ack), read — собеседник открыл чат и увидел сообщение
export type TextStatus = 'sending' | 'sent' | 'read' | 'failed' | 'received'

/** Цитата сообщения, на которое отвечают */
export interface ReplyRef {
  id: string
  /** начало текста цитируемого сообщения */
  text: string
  /** id автора цитируемого сообщения — свой или собеседника */
  authorId: string
}

export interface TextItem {
  kind: 'text'
  id: string
  /** собеседник или группа: ключ переписки */
  peerId: string
  direction: Direction
  text: string
  timestamp: number
  status: TextStatus
  error?: string
  replyTo?: ReplyRef
  /** отправлено через «Написать всем» */
  broadcast?: boolean
  /** кто написал — только в группах (в личном чате автор понятен из direction) */
  authorId?: string
  authorName?: string
  /** id участников группы, прочитавших сообщение (только у своих сообщений в группе и общем чате) */
  readBy?: string[]
  /** кому доставлено своё сообщение в общем чате (состава нет — считаем по факту) */
  deliveredTo?: string[]
  /**
   * Очередь отправки: сообщение ждёт, потому что получатель сейчас недоступен (не в сети или
   * не удалось связаться). Уйдёт само, как только появится связь; «не доставлено» не бывает.
   */
  queued?: boolean
  /** своё сообщение в группе: кому из участников ещё не доставлено (дойдёт, когда появятся) */
  pendingTo?: string[]
}

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] as const

export function isImageFileName(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext)
}

// offering     — исходящее предложение ещё не подтверждено получателем
// pending      — ждём решения получателя (in: ждём решения пользователя)
// connecting   — устанавливается соединение для передачи данных
// transferring — идёт передача
export type FileStatus =
  | 'offering'
  | 'pending'
  | 'connecting'
  | 'transferring'
  | 'done'
  | 'declined'
  | 'canceled'
  | 'failed'

/** Передача одному участнику группы: из таких состоит рассылка файла в группу */
export interface FilePart {
  peerId: string
  name: string
  status: FileStatus
  transferred: number
  error?: string
}

export interface FileItem {
  kind: 'file'
  id: string
  peerId: string
  direction: Direction
  name: string
  size: number
  transferred: number
  /** байт/сек, сглаженное значение */
  speed: number
  status: FileStatus
  timestamp: number
  error?: string
  /** миниатюра картинки (data:image/…;base64), приходит вместе с предложением файла */
  thumbnail?: string
  /** кто отправил — только в группах */
  authorId?: string
  authorName?: string
  /**
   * Рассылка файла в группу: у отправителя одна карточка, а под ней — отдельная
   * передача каждому участнику. Сервера нет, поэтому файл уходит столько раз,
   * сколько участников.
   */
  parts?: FilePart[]
  /**
   * Файл в общем чате: контрольная сумма SHA-256 от автора. Скачать его можно у любого,
   * у кого он есть, — по ней получатель проверяет, что файл не испорчен и не подменён.
   */
  sha256?: string
  /** своя карточка в общем чате: кто уже скачал файл */
  downloadedBy?: string[]
  /** предложение файла ждёт в очереди: получатель сейчас недоступен */
  queued?: boolean
}

// ─── служебные строки в переписке ───────────────────────────────────────────────

export const CHAT_EVENTS = [
  'peer-online',
  'peer-offline',
  'group-created',
  'group-joined',
  'group-renamed',
  'group-member-added',
  'group-member-removed',
  'group-member-left',
  'group-deleted'
] as const
export type ChatEvent = (typeof CHAT_EVENTS)[number]

/** Серая строка по центру переписки: «в сети · 9:15», «Алиса добавила Веру» */
export interface EventItem {
  kind: 'event'
  id: string
  peerId: string
  timestamp: number
  event: ChatEvent
  /** кто сделал (для событий группы) */
  actorName?: string
  /** над кем или новое название группы */
  targetName?: string
}

export type ChatItem = TextItem | FileItem | EventItem

/** Переписка, убранная из списка: удалённая группа или свёрнутый личный чат */
export interface ArchivedView {
  id: string
  kind: 'peer' | 'group'
  name: string
  /** участников — для групп */
  members: number
  /** время последнего сообщения */
  lastAt: number
  /** почему в архиве: вышли сами, удалил другой участник, убрали чат из списка */
  reason: 'left' | 'deleted' | 'hidden'
}

export interface LocalAddressInfo {
  iface: string
  address: string
  broadcast: string | null
}

export interface NetworkStatus {
  udpPort: number
  tcpPort: number | null
  udpListening: boolean
  addresses: LocalAddressInfo[]
  error: string | null
}

// ─── настройки ──────────────────────────────────────────────────────────────────

export const THEMES = ['system', 'light', 'dark', 'graphite', 'midnight', 'mint', 'lavender', 'sand'] as const
export type ThemeId = (typeof THEMES)[number]

export const FONTS = ['system', 'inter', 'nunito', 'pt-serif', 'jetbrains-mono'] as const
export type FontId = (typeof FONTS)[number]

export const CHAT_BACKGROUNDS = ['none', 'dots', 'grid', 'diagonal', 'gradient', 'doodles'] as const
export type ChatBackgroundId = (typeof CHAT_BACKGROUNDS)[number]

export const HISTORY_RETENTIONS = ['none', '1d', '7d', '30d', '90d', 'forever'] as const
export type HistoryRetention = (typeof HISTORY_RETENTIONS)[number]

export const SEND_KEYS = ['enter', 'mod-enter'] as const
export type SendKey = (typeof SEND_KEYS)[number]

/** через сколько минут бездействия ставить «Отошёл»; 0 — никогда */
export const AUTO_AWAY_MINUTES = [0, 5, 10, 15, 30] as const

export const AUTO_ACCEPT_MODES = ['off', 'pinned', 'all'] as const
export type AutoAcceptMode = (typeof AUTO_ACCEPT_MODES)[number]
/** максимальный размер автоматически принимаемого файла, МБ; 0 — без ограничения */
export const AUTO_ACCEPT_SIZES_MB = [10, 50, 200, 1000, 0] as const

export interface AutoAcceptSettings {
  mode: AutoAcceptMode
  maxSizeMb: number
}

export interface PinnedPeer {
  id: string
  /** имя на момент закрепления — чтобы показывать закреплённого коллегу, даже когда его нет в сети */
  name: string
}

export const UI_SCALE = { min: 80, max: 150, step: 10, default: 100 } as const
export const MESSAGE_FONT_SIZE = { min: 12, max: 20, default: 14 } as const

export interface AppearanceSettings {
  theme: ThemeId
  font: FontId
  /** масштаб интерфейса, % */
  uiScale: number
  /** размер текста сообщений, px */
  messageFontSize: number
  chatBackground: ChatBackgroundId
  compact: boolean
}

/** 'none' — без звука (можно выбрать отдельно для личных, групп и общего чата) */
export const MESSAGE_TONES = ['chime', 'birds', 'whistle', 'drop', 'marimba', 'pop', 'harp', 'none'] as const
export type MessageTone = (typeof MESSAGE_TONES)[number]

export interface NotificationSettings {
  /** системные уведомления о сообщениях и файлах */
  system: boolean
  messageSound: boolean
  /** звук сообщения в личном чате */
  messageTone: MessageTone
  /** звук сообщения в группе */
  groupTone: MessageTone
  /** звук сообщения в общем чате */
  everyoneTone: MessageTone
  presenceSound: boolean
}

export interface SettingsView {
  name: string
  downloadDir: string
  manualHosts: string[]
  /** язык интерфейса */
  language: Locale
  appearance: AppearanceSettings
  notifications: NotificationSettings
  sendKey: SendKey
  historyRetention: HistoryRetention
  autoAwayMinutes: number
  /** Windows: крестик сворачивает в трей */
  runInBackground: boolean
  openAtLogin: boolean
  /** отправлять собеседнику отметку «Прочитано» */
  readReceipts: boolean
  autoAccept: AutoAcceptSettings
  pinnedPeers: PinnedPeer[]
  /** показывать в переписке, когда коллега зашёл и вышел */
  presenceEvents: boolean
  /** свёрнутые разделы списка слева */
  collapsed: CollapsedSections
}

export interface CollapsedSections {
  groups: boolean
  online: boolean
  offline: boolean
  archive: boolean
}

export const SECTION_IDS = ['groups', 'online', 'offline', 'archive'] as const
export type SectionId = (typeof SECTION_IDS)[number]

export interface SettingsPatch {
  language?: Locale
  presenceEvents?: boolean
  collapsed?: Partial<CollapsedSections>
  appearance?: Partial<AppearanceSettings>
  notifications?: Partial<NotificationSettings>
  sendKey?: SendKey
  historyRetention?: HistoryRetention
  autoAwayMinutes?: number
  runInBackground?: boolean
  openAtLogin?: boolean
  readReceipts?: boolean
  autoAccept?: Partial<AutoAcceptSettings>
}

export interface Capabilities {
  /** автозапуск доступен только в установленном приложении */
  openAtLogin: boolean
  /** значок в трее (Windows) */
  tray: boolean
}

export type SoundKind = 'online' | 'offline' | 'message'

export interface SoundEvent {
  kind: SoundKind
  /** вариант звука сообщения, выбранный в настройках */
  tone: MessageTone
}

export interface AppInfo {
  version: string
  electron: string
  platform: string
  arch: string
}

export interface Snapshot {
  /** номер ревизии состояния; события с rev <= этого значения уже учтены в снимке */
  rev: number
  self: SelfInfo
  settings: SettingsView
  network: NetworkStatus
  peers: PeerView[]
  groups: GroupView[]
  archive: ArchivedView[]
  conversations: Record<string, ChatItem[]>
  unread: Record<string, number>
  /** чат, который нужно открыть (например, после клика по уведомлению) */
  activeChatId: string | null
  capabilities: Capabilities
  appInfo: AppInfo
  paths: { logDir: string; configFile: string }
  /** показать окно «Что нового»: первый запуск после обновления */
  whatsNew: boolean
}

/** Полная замена переписки в интерфейсе (после очистки истории или удаления старых сообщений) */
export interface ConversationsReset {
  conversations: Record<string, ChatItem[]>
  unread: Record<string, number>
}

export const IPC = {
  getSnapshot: 'app:get-snapshot',
  listColleagues: 'peers:list-colleagues',
  openLogs: 'app:open-logs',
  copyText: 'app:copy-text',
  setName: 'settings:set-name',
  chooseDownloadDir: 'settings:choose-download-dir',
  addManualHost: 'settings:add-manual-host',
  removeManualHost: 'settings:remove-manual-host',
  updateSettings: 'settings:update',
  setStatus: 'status:set',
  clearHistory: 'history:clear',
  showChatMenu: 'chat:show-menu',
  setPinned: 'peers:set-pinned',
  createGroup: 'group:create',
  renameGroup: 'group:rename',
  leaveGroup: 'group:leave',
  deleteGroup: 'group:delete',
  addGroupMembers: 'group:add-members',
  removeGroupMember: 'group:remove-member',
  showGroupMenu: 'group:show-menu',
  showMembers: 'group:show-members',
  archiveChat: 'archive:add',
  unarchiveChat: 'archive:restore',
  deleteArchived: 'archive:delete',
  sendText: 'chat:send-text',
  sendTyping: 'chat:typing',
  retryText: 'chat:retry-text',
  cancelSend: 'chat:cancel-send',
  dismissWhatsNew: 'app:dismiss-whats-new',
  markRead: 'chat:mark-read',
  setActiveChat: 'chat:set-active',
  pickFiles: 'file:pick-and-send',
  sendFiles: 'file:send-paths',
  sendFileData: 'file:send-data',
  acceptFile: 'file:accept',
  declineFile: 'file:decline',
  cancelFile: 'file:cancel',
  retryFile: 'file:retry',
  openFile: 'file:open',
  showFile: 'file:show-in-folder',

  evPeers: 'event:peers',
  evGroups: 'event:groups',
  evItem: 'event:item',
  evUnread: 'event:unread',
  evNetwork: 'event:network',
  evSelf: 'event:self',
  evSettings: 'event:settings',
  evOpenChat: 'event:open-chat',
  evSound: 'event:sound',
  evConversations: 'event:conversations',
  evOpenSearch: 'event:open-search',
  evOpenSettings: 'event:open-settings',
  evRenameGroup: 'event:rename-group',
  evAddMembers: 'event:add-members',
  evArchive: 'event:archive',
  evTyping: 'event:typing'
} as const

export interface RevEnvelope<T> {
  rev: number
  data: T
}

export type Listener<T> = (data: T, rev: number) => void
export type Unsubscribe = () => void

export interface ActionResult {
  ok: boolean
  error?: string
}

export interface LanApi {
  platform: string
  getSnapshot(): Promise<Snapshot>
  /** все, кого видели в сети: имя, система, версия — для сводки в настройках */
  listColleagues(): Promise<ColleagueView[]>
  openLogs(): Promise<void>
  copyText(text: string): Promise<void>

  setName(name: string): Promise<void>
  chooseDownloadDir(): Promise<void>
  addManualHost(host: string): Promise<ActionResult>
  removeManualHost(host: string): Promise<void>
  updateSettings(patch: SettingsPatch): Promise<void>
  setStatus(status: PresenceStatus): Promise<void>
  /** peerId = null — вся история; спрашивает подтверждение, возвращает true, если очищено */
  clearHistory(peerId: string | null): Promise<boolean>
  showChatMenu(peerId: string): Promise<void>
  setPinned(peerId: string, pinned: boolean): Promise<void>

  /** создать группу из выбранных коллег; возвращает id созданной группы */
  createGroup(name: string, memberIds: string[]): Promise<ActionResult & { id?: string }>
  renameGroup(groupId: string, name: string): Promise<ActionResult>
  /** выйти из группы (спрашивает подтверждение); true — вышли */
  leaveGroup(groupId: string): Promise<boolean>
  /** удалить группу у всех участников (только создатель); спрашивает подтверждение */
  deleteGroup(groupId: string): Promise<boolean>
  addGroupMembers(groupId: string, memberIds: string[]): Promise<ActionResult>
  /** убрать участника из группы (спрашивает подтверждение) */
  removeGroupMember(groupId: string, memberId: string): Promise<boolean>
  showGroupMenu(groupId: string): Promise<void>
  /** меню со списком участников: у каждого — «Написать» и «Убрать из группы» */
  showMembers(groupId: string): Promise<void>

  /** убрать переписку из списка в архив */
  archiveChat(chatId: string): Promise<void>
  /** вернуть личный чат из архива в список */
  unarchiveChat(chatId: string): Promise<void>
  /** удалить переписку из архива навсегда (спрашивает подтверждение) */
  deleteArchived(chatId: string): Promise<boolean>

  /** peerId может быть и id группы: сообщение уйдёт каждому участнику */
  sendText(peerId: string, text: string, replyTo?: ReplyRef): Promise<void>
  /** «печатает…»: true — пользователь набирает текст, false — перестал или отправил */
  sendTyping(peerId: string, active: boolean): void
  retryText(peerId: string, itemId: string): Promise<void>
  /** убрать сообщение из очереди отправки (пока оно не доставлено) */
  cancelSend(chatId: string, itemId: string): Promise<void>
  /** окно «Что нового» закрыто: больше само не показывать */
  dismissWhatsNew(): void
  markRead(peerId: string): void
  setActiveChat(peerId: string | null): void

  pickAndSendFiles(peerId: string): Promise<void>
  sendFilePaths(peerId: string, paths: string[]): Promise<void>
  /** файл без пути на диске (картинка из буфера обмена) */
  sendFileData(peerId: string, name: string, data: ArrayBuffer): Promise<ActionResult>
  /** путь к файлу из drag & drop (File.path убран из Electron 32+) */
  getPathForFile(file: File): string
  acceptFile(fileId: string): Promise<void>
  declineFile(fileId: string): Promise<void>
  cancelFile(fileId: string): Promise<void>
  /** предложить файл ещё раз тем участникам группы, кому он не дошёл */
  retryFile(fileId: string): Promise<void>
  openFile(fileId: string): Promise<void>
  showFileInFolder(fileId: string): Promise<void>

  onPeers(cb: Listener<PeerView[]>): Unsubscribe
  onGroups(cb: Listener<GroupView[]>): Unsubscribe
  onArchive(cb: Listener<ArchivedView[]>): Unsubscribe
  onItem(cb: Listener<ChatItem>): Unsubscribe
  onUnread(cb: Listener<{ peerId: string; count: number }>): Unsubscribe
  onNetwork(cb: Listener<NetworkStatus>): Unsubscribe
  onSelf(cb: Listener<SelfInfo>): Unsubscribe
  onSettings(cb: Listener<SettingsView>): Unsubscribe
  onOpenChat(cb: Listener<string>): Unsubscribe
  /** main уже решил, что звук уместен (настройки, «Не беспокоить», старт, пробуждение) */
  onSound(cb: Listener<SoundEvent>): Unsubscribe
  onConversations(cb: Listener<ConversationsReset>): Unsubscribe
  onOpenSearch(cb: Listener<string | null>): Unsubscribe
  onOpenSettings(cb: Listener<null>): Unsubscribe
  /** выбрано «Переименовать…» в меню группы — интерфейс открывает окно ввода */
  onRenameGroup(cb: Listener<string>): Unsubscribe
  /** выбрано «Добавить участников…» — интерфейс открывает выбор коллег */
  onAddMembers(cb: Listener<string>): Unsubscribe
  /** кто сейчас печатает в переписке: имена (в личном чате — одно или ни одного) */
  onTyping(cb: Listener<{ chatId: string; names: string[] }>): Unsubscribe
}
