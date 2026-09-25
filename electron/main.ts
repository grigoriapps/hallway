import {
  app,
  BrowserWindow,
  Menu,
  Notification,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  powerMonitor,
  session,
  shell,
  type MenuItemConstructorOptions,
  type NativeImage,
  type WebContents
} from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import {
  EVERYONE_ID,
  GROUP_ID_PREFIX,
  IPC,
  MAX_GROUPS,
  MAX_GROUP_MEMBERS,
  PRESENCE_STATUSES,
  UI_SCALE,
  isGroupId,
  type ActionResult,
  type ArchivedView,
  type ChatEvent,
  type ChatItem,
  type ColleagueView,
  type EventItem,
  type FileItem,
  type GroupMember,
  type GroupView,
  type MessageTone,
  type NetworkStatus,
  type PeerView,
  type PresenceStatus,
  type RevEnvelope,
  type SelfInfo,
  type SettingsPatch,
  type Snapshot,
  type SoundKind,
  type TextItem,
  type ThemeId
} from '../src/types'
import {
  createTranslator,
  localeFromSystem,
  spellcheckLanguages,
  type TranslateFn,
  type Translator
} from '../src/i18n'
import { loadConfig, type AppConfig } from './config'
import { createLogger, type Logger, type ScopedLogger } from './logger'
import { SettingsStore, type ArchivedChat, type StoredGroup } from './settings'
import { ConversationStore } from './store'
import { PeerRegistry } from './peer-registry'
import { HistoryPersistence, retentionMs, reviveItem } from './history'
import { Discovery, type PeerInfo } from './discovery'
import { ChatService, type HelloInfo, type IncomingMessage, type IncomingOffer } from './chat-server'
import { FileTransfers, cleanupStalePartFiles, sanitizeFileName } from './file-transfer'
import { getLocalIPv4 } from './net-utils'
import { NetworkArrival, PRESENCE_FLAP_MS, arrivalLineTime, isRealReturn, physicalSubnets } from './presence'
import { EVERYONE_SYNC_MS, MAX_EVERYONE_IDS, MAX_TEXT_LENGTH, cleanName, parseReplyRef, type GroupInfo } from './protocol'
import { compareVersions } from '../src/format'
import { shouldShowWhatsNew } from '../src/whats-new'
import { buildAppMenu } from './menu'
import { TrayController, statusMenuItems, type StatusState } from './tray'

/**
 * Переводчик главного процесса. Пересоздаётся при смене языка, поэтому в модули
 * передаётся не он сам, а функция tr — она всегда спросит актуальный.
 */
let translator: Translator = createTranslator('ru')
const tr: TranslateFn = (key, params) => translator(key, params)

// ─── отдельные папки данных ─────────────────────────────────────────────────────
// Dev-сборка не делит id с установленным приложением, а HALLWAY_PROFILE позволяет запустить
// второй экземпляр на той же машине (у каждого будет свой id и свои настройки).
{
  const profile = (process.env.HALLWAY_PROFILE ?? '').replace(/[^\w-]/g, '')
  const suffix = [app.isPackaged ? '' : 'dev', profile].filter(Boolean).join('-')
  if (suffix) app.setPath('userData', `${app.getPath('userData')}-${suffix}`)
}

if (process.platform === 'win32') app.setAppUserModelId('com.hallway.app')

const DARK_THEMES: readonly ThemeId[] = ['dark', 'graphite', 'midnight']
/**
 * Цвета «хрома» окна для каждой темы: фон до отрисовки интерфейса и кнопки окна Windows,
 * которые рисуются поверх области чата. Должны совпадать с --bg и --text-2 в styles.css.
 */
const THEME_CHROME: Record<Exclude<ThemeId, 'system'>, { bg: string; symbol: string }> = {
  light: { bg: '#ffffff', symbol: '#5b616d' },
  dark: { bg: '#16171b', symbol: '#a3a8b3' },
  graphite: { bg: '#1c1c1e', symbol: '#a9a9ae' },
  midnight: { bg: '#0f1626', symbol: '#9fb0c8' },
  mint: { bg: '#fbfefc', symbol: '#4f6457' },
  lavender: { bg: '#fdfcff', symbol: '#5e5570' },
  sand: { bg: '#fffdf9', symbol: '#6a5d4b' }
}
/** высота полосы с кнопками окна на Windows — совпадает с .titlebar в styles.css */
const WINDOWS_TITLEBAR_HEIGHT = 34
const MAX_PASTE_BYTES = 100 * 1024 * 1024
const PASTED_FILES_TTL_MS = 30 * 24 * 60 * 60 * 1000
const THUMBNAIL_SIZE = 320
const MAX_THUMBNAIL_BYTES = 120_000
/** «печатает…» гаснет, если собеседник замолчал и не прислал «перестал» */
const TYPING_TIMEOUT_MS = 6000
/** «вышел» с тем же временем уже записан — второй такой строки не нужно */
const DUPLICATE_EVENT_MS = 2 * 60 * 1000
/** очередь отправки: как часто повторять, пока получатель в сети, но не отвечает */
const OUTBOX_RETRY_MS = 30 * 1000
/** общий чат: как часто сверять, у кого чего не хватает (кроме появления коллеги в сети) */
const EVERYONE_RESYNC_MS = 10 * 60 * 1000
/** с какой версии клиент понимает общий чат */
const EVERYONE_MIN_VERSION = '1.3.0'
/** сообщение общего чата «живое» (звук и уведомление), а не досланное позже */
const EVERYONE_LIVE_MS = 60 * 1000

let started = false
let quitting = false
/** запуск при входе в систему: окно не показываем */
let startHidden = false
let mainWindow: BrowserWindow | null = null
let logger!: Logger
let log!: ScopedLogger
let config!: AppConfig
let configFile = ''
let settings!: SettingsStore
let store!: ConversationStore
let peers!: PeerRegistry
let history!: HistoryPersistence
let chat!: ChatService
let files!: FileTransfers
let tray: TrayController | null = null
let discovery: Discovery | null = null
let tcpPort: number | null = null
let startupError: string | null = null
let activeChatId: string | null = null
let discoveryStartedAt = 0
/** до этого момента звуки присутствия не играют (пробуждение, смена сети) */
let quietUntil = 0
/**
 * Компьютер уснул (событие suspend) и ещё не проснулся. В это время мы в сети не видны:
 * macOS ненадолго будит процесс и во сне (Power Nap), и без паузы коллеги видели бы нас ночью.
 */
let suspended = false
let suspendedAt = 0
/** для проверки «процесс работает без остановок» — сон без события resume */
let tickAt = Date.now()
let runningSince = Date.now()
/** с какого момента мы в сети — уходит коллегам в анонсе (запуск, пробуждение, появление сети) */
let onlineSince = Date.now()
/** с какого момента действует наш статус */
let statusSince = Date.now()
let lastAnnouncedStatus: PresenceStatus = 'online'
const networkArrival = new NetworkArrival()
/** обрыв без «bye»: «вышел» пишем, только если коллега не вернулся за PRESENCE_FLAP_MS */
const pendingOffline = new Map<string, PendingOffline>()
/**
 * Общий чат у клиента до 1.3 — это личное сообщение с пометкой «Всем в сети», и «прочитано»
 * от него приходит с id пакета. Запоминаем, какому сообщению общего чата этот пакет соответствует.
 */
const legacyEveryonePackets = new Map<string, string>()
/** приход и смена статуса коллеги, которые мы видели сами, — для клиентов до 1.3 */
const observedOnline = new Map<string, number>()
const observedStatus = new Map<string, ObservedStatus>()

interface ObservedStatus {
  status: PresenceStatus
  /** null — застали коллегу уже в этом статусе и не знаем, с какого времени */
  since: number | null
}

interface PendingOffline {
  /** когда пропала связь */
  at: number
  timer: NodeJS.Timeout
  /** что знали о коллеге до обрыва — вернём, если это был просто сбой связи */
  onlineSince: number | undefined
  status: ObservedStatus | undefined
}
let rev = 0
/** показать окно «Что нового» (первый запуск после обновления) */
let whatsNewPending = false
let manualStatus: PresenceStatus = 'online'
let autoAway = false
let screenLocked = false
const notifications = new Set<Notification>()
const peersWithHistory = new Set<string>()
/** кто сейчас печатает: переписка → участник → имя и таймер угасания */
const typingPeers = new Map<string, Map<string, { name: string; timer: NodeJS.Timeout }>>()
/**
 * Входящие сообщения, которые пользователь ещё не видел: отметка «Прочитано» уйдёт
 * при открытии чата. Ключ — автор и переписка: в группе отметка нужна только автору.
 */
const pendingReceipts = new Map<string, Set<string>>()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
  app
    .whenReady()
    .then(start)
    .catch((err: Error) => {
      console.error(err)
      dialog.showErrorBox('Hallway', err.stack ?? String(err))
      app.exit(1)
    })
}

async function start(): Promise<void> {
  const userData = app.getPath('userData')
  const loaded = loadConfig(userData, !app.isPackaged)
  config = loaded.config
  configFile = loaded.file
  logger = createLogger({ verbose: config.verboseLogs, file: path.join(userData, 'logs', 'main.log') })
  log = logger.scope('main')
  log.info(
    `Hallway ${app.getVersion()} ${process.platform}/${process.arch} electron ${process.versions.electron}; data: ${userData}`
  )
  if (loaded.warning) log.warn(loaded.warning)
  log.info(`config: ${JSON.stringify(config)} (${configFile})`)

  const icon = devIconPath()
  if (icon && process.platform === 'darwin') app.dock?.setIcon(icon)

  process.on('uncaughtException', (err) => log.error('uncaught exception:', err.stack ?? err))
  process.on('unhandledRejection', (reason) => log.error('unhandled rejection:', reason))

  settings = new SettingsStore(path.join(userData, 'settings.json'), {
    downloadDir: app.getPath('downloads'),
    // только для новой установки: у кого файл настроек уже есть, язык не меняется
    language: localeFromSystem(app.getPreferredSystemLanguages())
  })
  // до того, как этот запуск что-то запишет: по следам прежней работы понятно, обновление ли это
  initWhatsNew(userData)
  translator = createTranslator(settings.get().language)
  log.info(`interface language: ${translator.locale}`)
  store = new ConversationStore()
  peers = new PeerRegistry(path.join(userData, 'known-peers.json'), logger.scope('peers'))
  history = new HistoryPersistence(path.join(userData, 'history'), logger.scope('history'))
  const selfId = settings.get().id

  chat = new ChatService({
    t: tr,
    selfId,
    getSelfName: selfName,
    platform: process.platform,
    tcpPort: config.tcpPort,
    tcpPortAttempts: config.tcpPortAttempts,
    directory: {
      getPeer: (id) => discovery?.getPeer(id),
      sendConnectRequest: (id) => discovery?.sendConnectRequest(id)
    },
    log: logger.scope('tcp')
  })
  files = new FileTransfers({
    t: tr,
    selfId,
    chat,
    store,
    getDownloadDir: () => settings.get().downloadDir,
    makeThumbnail,
    log: logger.scope('files')
  })

  loadHistory()
  cleanupStalePartFiles(settings.get().downloadDir, logger.scope('files'))
  cleanupPastedFiles()
  syncLoginItem()
  applySpellcheck()
  applyNativeTheme()
  nativeTheme.on('updated', () => {
    if (settings.get().appearance.theme === 'system') applyWindowChrome()
  })

  tray = new TrayController({
    t: tr,
    onShow: showWindow,
    onQuit: () => app.quit(),
    onStatus: setManualStatus,
    getStatus: statusState
  })

  wireEvents()
  registerIpc()
  Menu.setApplicationMenu(
    buildAppMenu({
      t: tr,
      openSettings,
      find: () => send(IPC.evOpenSearch, activeChatId),
      zoom: changeScale,
      quit: () => app.quit()
    })
  )
  started = true
  startHidden = computeStartHidden()
  updateTray()
  updateStatusMenus()
  createWindow()

  try {
    tcpPort = await chat.start()
  } catch (err) {
    startupError = tr('error.tcpNotStarted', { error: (err as Error).message })
    log.error(startupError)
  }
  // Пока пользователь не ввёл имя, в сети не анонсируемся
  if (settings.get().name) startDiscovery()
  pushNetwork(true)
  setInterval(() => {
    watchSleep()
    pushNetwork()
    // «был в сети в …» должно быть свежим: отмечаем всех, кто сейчас виден
    for (const peer of discovery?.getPeers() ?? []) peers.seen(peer, peer.lastSeen)
  }, 5000)
  setInterval(refreshAutoAway, 15000)
  setInterval(() => kickOutbox(), OUTBOX_RETRY_MS)
  setInterval(pruneHistory, 60 * 60 * 1000)
  // кому-то сообщение общего чата могло не дойти, хотя он был в сети (обрыв) — сверяемся
  setInterval(() => {
    for (const peer of discovery?.getPeers() ?? []) if (supportsEveryone(peer)) syncEveryone(peer.id)
  }, EVERYONE_RESYNC_MS)

  // Сон и выключение: сразу говорим соседям «bye» и до пробуждения в сети не показываемся,
  // а после пробуждения не пугаем звуками — таблица собеседников ещё не обновилась
  powerMonitor.on('suspend', () => {
    log.info('system suspend')
    void discovery?.sayBye()
    suspended = true
    suspendedAt = Date.now()
    runningSince = suspendedAt
    quietUntil = Number.POSITIVE_INFINITY
    // после пробуждения каждый коллега появится заново — со своим временем прихода
    discovery?.resetPeers('system sleep')
  })
  powerMonitor.on('resume', () => wokeUp('system resume'))
  powerMonitor.on('shutdown', () => {
    log.info('system shutdown')
    // выключение компьютера: всё несохранённое — на диск сразу
    history.flush()
    peers.flush()
    void discovery?.sayBye()
  })
  powerMonitor.on('lock-screen', () => {
    screenLocked = true
    refreshAutoAway()
  })
  powerMonitor.on('unlock-screen', () => {
    screenLocked = false
    refreshAutoAway()
  })
}

/**
 * Окно «Что нового» — один раз после обновления. До 1.3 версию не запоминали, поэтому
 * обновление со старой версии узнаём по следам прежней работы: имя и история или список
 * коллег. При новой установке окна нет — версия записывается сразу.
 */
function initWhatsNew(userData: string): void {
  const current = app.getVersion()
  const seen = settings.get().lastSeenVersion
  let usedBefore = false
  if (!seen && settings.get().name) {
    const historyDir = path.join(userData, 'history')
    const hasHistory = fs.existsSync(historyDir) && fs.readdirSync(historyDir).some((f) => f.endsWith('.json'))
    usedBefore = hasHistory || fs.existsSync(path.join(userData, 'known-peers.json'))
  }
  whatsNewPending = shouldShowWhatsNew({ seen, current, usedBefore })
  if (whatsNewPending) log.info(`what's new: showing ${current} (last seen ${seen || 'before 1.3'})`)
  else if (seen !== current) settings.update({ lastSeenVersion: current })
}

function selfName(): string {
  return settings.get().name || tr('common.noName')
}

// ─── проверка орфографии ────────────────────────────────────────────────────────
// Отдельной настройки нет: словари подбираются по языку интерфейса. На macOS языки
// задаёт система (список Electron там пуст) — тогда просто ничего не делаем.

function applySpellcheck(): void {
  if (process.platform === 'darwin') return
  try {
    const chosen = spellcheckLanguages(translator.locale, session.defaultSession.availableSpellCheckerLanguages)
    session.defaultSession.setSpellCheckerLanguages(chosen)
    log.info(`spellchecker languages: ${chosen.length ? chosen.join(', ') : 'off'}`)
  } catch (err) {
    log.warn('spellchecker languages:', (err as Error).message)
  }
}

/** Смена языка интерфейса: меню, трей и словари собираются заново */
function applyLanguage(): void {
  translator = createTranslator(settings.get().language)
  log.info(`interface language: ${translator.locale}`)
  Menu.setApplicationMenu(
    buildAppMenu({
      t: tr,
      openSettings,
      find: () => send(IPC.evOpenSearch, activeChatId),
      zoom: changeScale,
      quit: () => app.quit()
    })
  )
  updateStatusMenus()
  applySpellcheck()
}

/**
 * Подтверждение действия. В автотестах нативные диалоги нажать нельзя, поэтому при
 * HALLWAY_AUTO_CONFIRM=1 (переменная окружения, в обычной работе её нет) считаем,
 * что пользователь согласился.
 */
async function confirm(options: Electron.MessageBoxOptions): Promise<boolean> {
  const win = mainWindow
  if (!win) return false
  if (process.env.HALLWAY_AUTO_CONFIRM === '1') {
    log.warn(`auto-confirmed: ${options.message}`)
    return true
  }
  const { response } = await dialog.showMessageBox(win, options)
  return response === 0
}

function openSettings(): void {
  showWindow()
  send(IPC.evOpenSettings, null)
}

function startDiscovery(): void {
  if (discovery || tcpPort === null) return
  const d = new Discovery({
    t: tr,
    selfId: settings.get().id,
    getSelfName: selfName,
    platform: process.platform,
    udpPort: config.udpPort,
    tcpPort,
    intervalMs: config.broadcastIntervalMs,
    timeoutMs: config.peerTimeoutMs,
    getManualHosts: () => settings.get().manualHosts,
    getStatus: effectiveStatus,
    version: app.getVersion(),
    getOnlineSince: () => onlineSince,
    getStatusSince: currentStatusSince,
    isPaused: () => suspended,
    log: logger.scope('discovery')
  })
  d.on('peer-online', (peer: PeerInfo) => {
    rememberPeer(peer)
    announceGroupsTo(peer.id)
    kickOutbox(peer.id)
    if (supportsEveryone(peer)) syncEveryone(peer.id)
    sendGroups()
    presenceChanged(peer, true)
  })
  d.on('peer-updated', (peer: PeerInfo) => {
    const seen = observedStatus.get(peer.id)
    if (seen && seen.status !== peer.status) observedStatus.set(peer.id, { status: peer.status, since: Date.now() })
    rememberPeer(peer)
    schedulePeers()
  })
  d.on('peer-offline', (peer: PeerInfo, reason: string) => {
    chat.dropPeer(peer.id, `peer offline (${reason})`)
    clearTypingFor(peer.id)
    schedulePeers()
    sendGroups()
    presenceChanged(peer, false, reason)
  })
  d.on('peer-reset', (peerId: string, reason: string) => chat.dropPeer(peerId, reason))
  d.on('connect-request', (peerId: string, ip: string, port: number) => chat.handleConnectRequest(peerId, ip, port))
  d.on('status', () => pushNetwork())
  d.on('resumed', () => wokeUp('process was frozen'))
  discovery = d
  discoveryStartedAt = Date.now()
  d.start()
}

function rememberPeer(peer: { id: string; name: string; platform: string; version?: string | null }): void {
  store.rememberPeer({ id: peer.id, name: peer.name, platform: peer.platform })
  peers.seen(peer)
  // у закреплённого коллеги держим актуальное имя — оно показывается, когда его нет в сети
  const pinned = settings.get().pinnedPeers
  if (pinned.some((p) => p.id === peer.id && p.name !== peer.name)) {
    settings.update({ pinnedPeers: pinned.map((p) => (p.id === peer.id ? { ...p, name: peer.name } : p)) })
    send(IPC.evSettings, settings.view())
  }
  schedulePeers()
}

// ─── статус ─────────────────────────────────────────────────────────────────────

function effectiveStatus(): PresenceStatus {
  if (manualStatus !== 'online') return manualStatus
  return autoAway ? 'away' : 'online'
}

function statusState(): StatusState {
  return { status: effectiveStatus(), auto: manualStatus === 'online' && autoAway }
}

function setManualStatus(status: PresenceStatus): void {
  const before = effectiveStatus()
  manualStatus = status
  // пользователь только что что-то нажал — он точно не «отошёл»
  if (status === 'online') autoAway = false
  if (effectiveStatus() !== before || status === 'online') onStatusChanged('manual')
}

/** «Отошёл» после N минут бездействия или при заблокированном экране */
function refreshAutoAway(): void {
  const minutes = settings.get().autoAwayMinutes
  let idle = false
  if (minutes > 0) {
    try {
      idle = screenLocked || powerMonitor.getSystemIdleTime() >= minutes * 60
    } catch {
      idle = screenLocked
    }
  }
  if (idle === autoAway) return
  autoAway = idle
  if (manualStatus === 'online') onStatusChanged(idle ? 'idle' : 'activity')
}

/** С какого момента действует наш статус — уходит коллегам в анонсе («отошёл с 12:26») */
function currentStatusSince(): number {
  const status = effectiveStatus()
  if (status !== lastAnnouncedStatus) {
    lastAnnouncedStatus = status
    statusSince = Date.now()
  }
  return statusSince
}

function onStatusChanged(reason: string): void {
  currentStatusSince()
  log.info(`status: ${effectiveStatus()} (${reason})`)
  send(IPC.evSelf, selfInfo())
  discovery?.announce()
  updateStatusMenus()
}

function updateStatusMenus(): void {
  tray?.refresh()
  if (process.platform === 'darwin') {
    app.dock?.setMenu(Menu.buildFromTemplate(statusMenuItems(tr, statusState(), setManualStatus)))
  }
}

// ─── история ────────────────────────────────────────────────────────────────────

function loadHistory(): void {
  const retention = settings.get().historyRetention
  if (retention === 'none') return
  const maxAge = retentionMs(retention)
  const cutoff = maxAge === null ? -Infinity : Date.now() - maxAge
  const records = history.loadAll().map((record) => ({
    ...record,
    items: record.items.map((item) => reviveItem(tr, item)).filter((item) => item.timestamp >= cutoff)
  }))
  store.load(records)
  files.restore(records.flatMap((r) => r.items).filter((item): item is FileItem => item.kind === 'file'))

  let count = 0
  for (const record of records) {
    count += record.items.length
    if (record.items.length) peersWithHistory.add(record.peer.id)
    // перезаписываем: прерванные передачи помечены, устаревшее удалено
    history.schedule(record.peer.id, () => store.record(record.peer.id))
  }
  if (records.length) log.info(`history loaded: ${records.length} conversation(s), ${count} item(s)`)
}

function persist(peerId: string): void {
  if (settings.get().historyRetention !== 'none') history.schedule(peerId, () => store.record(peerId))
}

/** Сохранить переписку сразу: пришло сообщение (до подтверждения) или своё ушло в очередь */
function persistNow(peerId: string): void {
  persist(peerId)
  history.flushOne(peerId)
}

function pruneHistory(): void {
  const retention = settings.get().historyRetention
  if (retention === 'none') return
  const maxAge = retentionMs(retention)
  if (maxAge === null) return
  const affected = store.pruneOlderThan(Date.now() - maxAge)
  if (affected.length) {
    log.info(`history: removed old messages in ${affected.length} conversation(s)`)
    sendConversations()
  }
}

function onRetentionChanged(): void {
  if (settings.get().historyRetention === 'none') {
    history.deleteAll()
    log.info('history persistence disabled, saved history removed')
    return
  }
  pruneHistory()
  for (const peerId of store.peerIds()) persist(peerId)
}

async function confirmClearHistory(peerId: string | null): Promise<boolean> {
  const win = mainWindow
  if (!win) return false
  const name = peerId ? chatTitle(peerId) : null
  const ok = await confirm({
    type: 'warning',
    buttons: [tr('common.clear'), tr('common.cancel')],
    defaultId: 1,
    cancelId: 1,
    message: !name
      ? tr('history.clearAllTitle')
      : peerId === EVERYONE_ID
        ? tr('everyone.clearTitle')
        : peerId && isGroupId(peerId)
          ? tr('history.clearGroupTitle', { name })
          : tr('history.clearPeerTitle', { name }),
    detail: peerId === EVERYONE_ID ? tr('everyone.clearDetail') : tr('history.clearDetail')
  })
  if (!ok) return false
  // очищенное в общем чате не должно вернуться досылкой от коллег
  if (!peerId || peerId === EVERYONE_ID) settings.update({ everyoneClearedAt: Date.now() })
  const affected = peerId ? (store.clearConversation(peerId) ? [peerId] : []) : store.clearAll()
  log.info(`history cleared: ${peerId ? `conversation ${peerId.slice(0, 8)}` : 'all'} (${affected.length})`)
  sendConversations()
  return true
}

function sendConversations(): void {
  send(IPC.evConversations, { conversations: store.conversationsSnapshot(), unread: store.unreadSnapshot() })
  schedulePeers()
  if (process.platform === 'darwin') app.setBadgeCount(store.totalUnread())
}

// ─── «печатает…», «прочитано», закрепление, автоприём ───────────────────────────

function typingNames(chatId: string): string[] {
  return [...(typingPeers.get(chatId)?.values() ?? [])].map((entry) => entry.name)
}

/** «печатает…» в переписке chatId: в личном чате это сам собеседник, в группе — участник */
function setTyping(chatId: string, peerId: string, name: string, typing: boolean): void {
  const before = typingNames(chatId).join('\u0000')
  let map = typingPeers.get(chatId)
  const existing = map?.get(peerId)
  if (existing) clearTimeout(existing.timer)
  if (typing) {
    if (!map) {
      map = new Map()
      typingPeers.set(chatId, map)
    }
    map.set(peerId, {
      name,
      timer: setTimeout(() => setTyping(chatId, peerId, name, false), TYPING_TIMEOUT_MS)
    })
  } else if (map) {
    map.delete(peerId)
    if (!map.size) typingPeers.delete(chatId)
  }
  const after = typingNames(chatId).join('\u0000')
  if (before !== after) send(IPC.evTyping, { chatId, names: typingNames(chatId) })
}

/** Собеседник ушёл из сети — гасим «печатает…» во всех переписках, где он был */
function clearTypingFor(peerId: string): void {
  for (const chatId of [...typingPeers.keys()]) {
    if (typingPeers.get(chatId)?.has(peerId)) setTyping(chatId, peerId, '', false)
  }
}

/** scope — id группы или общего чата; у личной переписки его нет */
const receiptKey = (authorId: string, scope?: string) => `${authorId}|${scope ?? ''}`

function readPacket(ids: string[], scope: string | undefined) {
  return scope === EVERYONE_ID ? { type: 'read', ids, everyone: true } : { type: 'read', ids, groupId: scope }
}

/** Отметка «прочитано» уходит автору сообщения: в группе и общем чате остальным она не нужна */
function queueReadReceipt(authorId: string, messageId: string, scope: string | undefined, viewing: boolean): void {
  if (!settings.get().readReceipts || authorId === settings.get().id) return
  if (viewing) {
    void chat.sendBestEffort(authorId, readPacket([messageId], scope))
    return
  }
  const key = receiptKey(authorId, scope)
  let ids = pendingReceipts.get(key)
  if (!ids) {
    ids = new Set()
    pendingReceipts.set(key, ids)
  }
  ids.add(messageId)
}

/** Пользователь открыл чат — отправляем «прочитано» за всё, что пришло без него */
function flushReadReceipts(chatId: string): void {
  const scoped = isGroupId(chatId) || chatId === EVERYONE_ID
  const suffix = `|${scoped ? chatId : ''}`
  for (const [key, ids] of [...pendingReceipts.entries()]) {
    if (!key.endsWith(suffix)) continue
    const authorId = key.slice(0, key.length - suffix.length)
    if (!scoped && authorId !== chatId) continue
    pendingReceipts.delete(key)
    if (!ids.size || !settings.get().readReceipts) continue
    void chat.sendBestEffort(authorId, readPacket([...ids].slice(-500), scoped ? chatId : undefined))
  }
}

function isPinned(peerId: string): boolean {
  return settings.get().pinnedPeers.some((p) => p.id === peerId)
}

function setPinned(peerId: string, pinned: boolean): void {
  const rest = settings.get().pinnedPeers.filter((p) => p.id !== peerId)
  settings.update({ pinnedPeers: pinned ? [{ id: peerId, name: peerName(peerId) }, ...rest] : rest })
  log.info(`${pinned ? 'pinned' : 'unpinned'} "${peerName(peerId)}"`)
  send(IPC.evSettings, settings.view())
  schedulePeers()
}

function maybeAutoAccept(item: FileItem): void {
  const { mode, maxSizeMb } = settings.get().autoAccept
  if (mode === 'off') return
  if (mode === 'pinned' && !isPinned(item.peerId)) return
  if (maxSizeMb > 0 && item.size > maxSizeMb * 1024 * 1024) return
  log.info(`auto-accepting "${item.name}" (${item.size} bytes) from "${peerName(item.peerId)}"`)
  files.accept(item.id).catch((err: Error) => log.error('auto-accept failed:', err))
}

// ─── архив переписок ────────────────────────────────────────────────────────────
// Удалённая группа или убранный из списка чат не теряет переписку: она уезжает
// в раздел «Архив» и живёт там до срока хранения истории или до удаления вручную.

function archiveSnapshot(): ArchivedView[] {
  return settings
    .archived()
    .filter((chat) => store.hasConversation(chat.id))
    .map((chat) => ({
      id: chat.id,
      kind: chat.kind,
      name: chat.name || (chat.kind === 'group' ? tr('group.untitled') : tr('common.peer')),
      members: chat.members,
      lastAt: store.lastItemAt(chat.id) || chat.at,
      reason: chat.reason
    }))
    .sort((a, b) => b.lastAt - a.lastAt)
}

function sendArchive(): void {
  send(IPC.evArchive, archiveSnapshot())
}

function archiveChat(chatId: string, reason: 'left' | 'deleted' | 'hidden', name: string, members = 0): void {
  settings.addArchived({
    id: chatId,
    kind: isGroupId(chatId) ? 'group' : 'peer',
    name,
    members,
    reason,
    at: Date.now()
  })
  log.info(`archived ${isGroupId(chatId) ? 'group' : 'chat'} "${name}" (${reason})`)
  setTyping(chatId, chatId, '', false)
  sendArchive()
  schedulePeers()
}

/** Личный чат вернулся в список — сам собой при новом сообщении или по кнопке */
function unarchiveChat(chatId: string): void {
  if (!settings.removeArchived(chatId)) return
  log.info(`restored chat ${chatId.slice(0, 8)} from archive`)
  sendArchive()
  schedulePeers()
}

async function confirmDeleteArchived(chatId: string): Promise<boolean> {
  const win = mainWindow
  const entry = settings.archived().find((c) => c.id === chatId)
  if (!win || !entry) return false
  const ok = await confirm({
    type: 'warning',
    buttons: [tr('common.delete'), tr('common.cancel')],
    defaultId: 1,
    cancelId: 1,
    message: tr('archive.deleteTitle', { name: entry.name || tr('common.peer') }),
    detail: tr('archive.deleteDetail')
  })
  if (!ok) return false
  store.clearConversation(chatId)
  store.clearUnread(chatId)
  settings.removeArchived(chatId)
  log.info(`archived chat "${entry.name}" deleted`)
  sendArchive()
  sendConversations()
  return true
}

// ─── группы ─────────────────────────────────────────────────────────────────────
// Сервера нет: состав группы хранит у себя каждый участник, а сообщение уходит
// каждому участнику отдельно по личному соединению. Состав едет вместе с каждым
// сообщением и несёт номер ревизии — состав с большим номером побеждает,
// поэтому он сходится у всех без сервера.

function groupsSnapshot(): GroupView[] {
  const online = new Set((discovery?.getPeers() ?? []).map((p) => p.id))
  const selfId = settings.get().id
  return settings
    .groups()
    .map((g) => ({
      id: g.id,
      name: groupName(g),
      members: g.members.map((m) => ({ ...m })),
      online: g.members.filter((m) => m.id !== selfId && online.has(m.id)).length,
      rev: g.rev,
      ownerId: g.ownerId
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function sendGroups(): void {
  send(IPC.evGroups, groupsSnapshot())
}

/** История группы хранится как обычная переписка, только «собеседник» — сама группа */
function rememberGroup(group: StoredGroup): void {
  store.rememberPeer({ id: group.id, name: groupName(group), platform: 'group' })
}

function groupName(group: StoredGroup | ArchivedChat): string {
  return group.name || tr('group.untitled')
}

function memberName(group: StoredGroup, id: string): string {
  if (id === settings.get().id) return selfName()
  return discovery?.getPeer(id)?.name || group.members.find((m) => m.id === id)?.name || peerName(id)
}

/** Серая строка в переписке: «Алиса добавила Веру», «в сети · 9:15» */
function addChatEvent(
  chatId: string,
  event: ChatEvent,
  actorName?: string,
  targetName?: string,
  timestamp = Date.now()
): void {
  store.upsert({
    kind: 'event',
    id: randomUUID(),
    peerId: chatId,
    timestamp,
    event,
    actorName,
    targetName
  } satisfies EventItem)
}

function groupPacket(group: StoredGroup) {
  return {
    type: 'group',
    group: { id: group.id, name: group.name, members: group.members, rev: group.rev, owner: group.ownerId }
  }
}

function announceGroup(group: StoredGroup, extraTargets: string[] = []): void {
  const selfId = settings.get().id
  const targets = new Set([...group.members.map((m) => m.id), ...extraTargets])
  for (const id of targets) {
    if (id !== selfId) void chat.sendBestEffort(id, groupPacket(group))
  }
}

/** Коллега появился в сети — напоминаем ему состав общих групп (мог пропустить анонс) */
function announceGroupsTo(peerId: string): void {
  for (const group of settings.groups()) {
    if (group.members.some((m) => m.id === peerId)) void chat.sendBestEffort(peerId, groupPacket(group))
  }
}

/** Сохранить изменённую группу: ревизия растёт, состав уезжает участникам */
function saveGroup(group: StoredGroup, extraTargets: string[] = []): StoredGroup | null {
  const stored = settings.upsertGroup({ ...group, rev: group.rev + 1 })
  if (!stored) return null
  rememberGroup(stored)
  announceGroup(stored, extraTargets)
  sendGroups()
  persist(stored.id)
  return stored
}

function createGroup(name: unknown, memberIds: unknown): ActionResult & { id?: string } {
  const selfId = settings.get().id
  const list = Array.isArray(memberIds) ? memberIds : []
  const ids = [...new Set(list.filter((id): id is string => isId(id) && id !== selfId && !isGroupId(id)))].slice(
    0,
    MAX_GROUP_MEMBERS - 1
  )
  if (!ids.length) return { ok: false, error: tr('group.pickMembers') }
  if (settings.groups().length >= MAX_GROUPS) return { ok: false, error: tr('group.tooMany', { n: MAX_GROUPS }) }

  const members: GroupMember[] = [
    { id: selfId, name: selfName() },
    ...ids.map((id) => ({ id, name: peerName(id) }))
  ]
  const stored = settings.upsertGroup({
    id: GROUP_ID_PREFIX + randomUUID(),
    name: cleanName(name) || tr('group.untitled'),
    members,
    createdAt: Date.now(),
    rev: 1,
    ownerId: selfId
  })
  if (!stored) return { ok: false, error: tr('group.createFailed') }
  rememberGroup(stored)
  log.info(`group "${stored.name}" created (${members.length} members)`)
  addChatEvent(stored.id, 'group-created')
  announceGroup(stored)
  sendGroups()
  return { ok: true, id: stored.id }
}

function renameGroup(groupId: string, name: unknown): ActionResult {
  const group = settings.getGroup(groupId)
  if (!group) return { ok: false, error: tr('group.notFound') }
  const clean = cleanName(name)
  if (!clean) return { ok: false, error: tr('group.renameEmpty') }
  if (clean === group.name) return { ok: true }
  const stored = saveGroup({ ...group, name: clean })
  if (!stored) return { ok: false, error: tr('group.renameFailed') }
  log.info(`group renamed to "${clean}"`)
  addChatEvent(groupId, 'group-renamed', selfName(), clean)
  return { ok: true }
}

function addGroupMembers(groupId: string, memberIds: unknown): ActionResult {
  const group = settings.getGroup(groupId)
  if (!group) return { ok: false, error: tr('group.notFound') }
  const known = new Set(group.members.map((m) => m.id))
  const list = Array.isArray(memberIds) ? memberIds : []
  const ids = [...new Set(list.filter((id): id is string => isId(id) && !isGroupId(id) && !known.has(id)))].slice(
    0,
    MAX_GROUP_MEMBERS - group.members.length
  )
  if (!ids.length) return { ok: false, error: tr('group.pickMembers') }
  const added = ids.map((id) => ({ id, name: peerName(id) }))
  const stored = saveGroup({ ...group, members: [...group.members, ...added] })
  if (!stored) return { ok: false, error: tr('group.addFailed') }
  log.info(`group "${stored.name}": added ${added.map((m) => m.name).join(', ')}`)
  addChatEvent(groupId, 'group-member-added', selfName(), added.map((m) => m.name).join(', '))
  return { ok: true }
}

async function confirmRemoveMember(groupId: string, memberId: string): Promise<boolean> {
  const group = settings.getGroup(groupId)
  const win = mainWindow
  if (!group || !win || memberId === settings.get().id) return false
  if (!group.members.some((m) => m.id === memberId)) return false
  const name = memberName(group, memberId)
  const ok = await confirm({
    type: 'warning',
    buttons: [tr('group.removeMember'), tr('common.cancel')],
    defaultId: 1,
    cancelId: 1,
    message: tr('group.removeTitle', { name, group: groupName(group) }),
    detail: tr('group.removeDetail')
  })
  if (!ok) return false
  const members = group.members.filter((m) => m.id !== memberId)
  // исключённому анонс тоже нужен: он увидит, что его больше нет в составе
  const stored = saveGroup({ ...group, members }, [memberId])
  if (!stored) return false
  log.info(`group "${stored.name}": removed "${name}"`)
  addChatEvent(groupId, 'group-member-removed', selfName(), name)
  return true
}

/** Состав группы пришёл от участника: применяем, если он новее нашего */
function handleGroupInfo(peerId: string, info: GroupInfo): void {
  const selfId = settings.get().id
  if (!info.members.some((m) => m.id === peerId)) {
    log.debug(`group "${info.name}" from "${peerName(peerId)}" ignored (sender is not a member)`)
    return
  }
  const existing = settings.getGroup(info.id)
  const leftRev = settings.leftGroupRev(info.id)
  // старый анонс не должен возвращать покинутую или удалённую группу
  if (leftRev !== null && info.rev <= leftRev) return

  if (!info.members.some((m) => m.id === selfId)) {
    // нас убрали из состава
    if (existing) {
      const actor = memberName(existing, peerId)
      settings.removeGroup(info.id)
      archiveChat(info.id, 'deleted', groupName(existing), existing.members.length)
      addChatEvent(info.id, 'group-member-removed', actor, selfName())
      log.info(`removed from group "${existing.name}" by "${actor}"`)
      sendGroups()
      sendConversations()
    }
    return
  }

  if (existing) {
    if (info.rev < existing.rev) return
    const same =
      info.rev === existing.rev &&
      info.name === existing.name &&
      info.members.length === existing.members.length &&
      info.members.every((m) => existing.members.some((e) => e.id === m.id))
    if (same) return
    if (!existing.members.some((m) => m.id === peerId)) {
      log.warn(`group "${existing.name}" update from "${peerName(peerId)}" ignored (outsider)`)
      return
    }
  }

  const members = info.members.map((m) => (m.id === selfId ? { id: selfId, name: selfName() } : m))
  const stored = settings.upsertGroup({
    id: info.id,
    name: info.name || existing?.name || tr('group.untitled'),
    members,
    createdAt: existing?.createdAt ?? Date.now(),
    rev: info.rev,
    ownerId: info.ownerId
  })
  if (!stored) return
  if (leftRev !== null) settings.forgetLeftGroup(info.id)
  rememberGroup(stored)

  if (existing) {
    // служебные строки только о том, что действительно изменилось
    const actor = memberName(stored, peerId)
    if (info.name && existing.name !== info.name) addChatEvent(stored.id, 'group-renamed', actor, info.name)
    const added = members.filter((m) => !existing.members.some((e) => e.id === m.id))
    const removed = existing.members.filter((m) => !members.some((e) => e.id === m.id))
    if (added.length) {
      addChatEvent(stored.id, 'group-member-added', actor, added.map((m) => m.name || tr('common.peer')).join(', '))
    }
    for (const member of removed) {
      addChatEvent(stored.id, 'group-member-removed', actor, member.name || tr('common.peer'))
    }
  } else {
    log.info(`added to group "${stored.name}" by "${peerName(peerId)}" (${members.length} members)`)
    unarchiveChat(stored.id)
    addChatEvent(stored.id, 'group-joined', peerName(peerId))
    notifyGroupInvite(stored, peerId)
  }
  sendGroups()
}

function handleGroupLeave(peerId: string, groupId: string): void {
  const group = settings.getGroup(groupId)
  if (!group || !group.members.some((m) => m.id === peerId)) return
  const members = group.members.filter((m) => m.id !== peerId)
  if (!members.length) return
  const name = memberName(group, peerId)
  settings.upsertGroup({ ...group, members, rev: group.rev + 1 })
  log.info(`"${name}" left group "${group.name}"`)
  addChatEvent(groupId, 'group-member-left', name)
  setTyping(groupId, peerId, '', false)
  sendGroups()
  persist(groupId)
}

/** Создатель удалил группу у всех */
function handleGroupDelete(peerId: string, groupId: string): void {
  const group = settings.getGroup(groupId)
  if (!group) return
  if (group.ownerId !== peerId) {
    log.warn(`group-delete for "${group.name}" from "${peerName(peerId)}" ignored (not the owner)`)
    return
  }
  const actor = memberName(group, peerId)
  settings.removeGroup(groupId)
  archiveChat(groupId, 'deleted', groupName(group), group.members.length)
  addChatEvent(groupId, 'group-deleted', actor)
  log.info(`group "${group.name}" deleted by "${actor}"`)
  sendGroups()
  sendConversations()
}

async function confirmLeaveGroup(groupId: string): Promise<boolean> {
  const group = settings.getGroup(groupId)
  const win = mainWindow
  if (!group || !win) return false
  const ok = await confirm({
    type: 'warning',
    buttons: [tr('common.exit'), tr('common.cancel')],
    defaultId: 1,
    cancelId: 1,
    message: tr('group.leaveTitle', { name: groupName(group) }),
    detail: tr('group.leaveDetail')
  })
  if (!ok) return false
  const selfId = settings.get().id
  for (const member of group.members) {
    if (member.id !== selfId) void chat.sendBestEffort(member.id, { type: 'group-leave', groupId })
  }
  settings.removeGroup(groupId)
  archiveChat(groupId, 'left', groupName(group), group.members.length)
  addChatEvent(groupId, 'group-member-left', selfName())
  log.info(`left group "${group.name}"`)
  sendGroups()
  sendConversations()
  return true
}

/** Удалить группу у всех участников — может только её создатель */
async function confirmDeleteGroup(groupId: string): Promise<boolean> {
  const group = settings.getGroup(groupId)
  const win = mainWindow
  if (!group || !win) return false
  if (group.ownerId !== settings.get().id) {
    await dialog.showMessageBox(win, { type: 'info', message: tr('group.deleteOwnerOnly') })
    return false
  }
  const ok = await confirm({
    type: 'warning',
    buttons: [tr('common.delete'), tr('common.cancel')],
    defaultId: 1,
    cancelId: 1,
    message: tr('group.deleteTitle', { name: groupName(group) }),
    detail: tr('group.deleteDetail')
  })
  if (!ok) return false
  const selfId = settings.get().id
  for (const member of group.members) {
    if (member.id !== selfId) void chat.sendBestEffort(member.id, { type: 'group-delete', groupId })
  }
  settings.removeGroup(groupId)
  archiveChat(groupId, 'deleted', groupName(group), group.members.length)
  addChatEvent(groupId, 'group-deleted', selfName())
  log.info(`group "${group.name}" deleted for everyone`)
  sendGroups()
  sendConversations()
  return true
}

/** Меню состава: у каждого участника — «Написать лично» и «Убрать из группы» */
async function showMembersMenu(groupId: string): Promise<void> {
  const group = settings.getGroup(groupId)
  const win = mainWindow
  if (!group || !win) return
  const selfId = settings.get().id
  const items: MenuItemConstructorOptions[] = [
    { label: tr('group.memberCount', { n: group.members.length }), enabled: false },
    { type: 'separator' }
  ]
  for (const member of group.members) {
    const name = memberName(group, member.id)
    const online = !!discovery?.getPeer(member.id)
    if (member.id === selfId) {
      items.push({ label: `${name} (${tr('event.you')})`, enabled: false })
      continue
    }
    items.push({
      label: online ? name : tr('group.memberOffline', { name }),
      submenu: [
        { label: tr('group.writeTo'), click: () => send(IPC.evOpenChat, member.id) },
        { type: 'separator' },
        { label: tr('group.removeMember'), click: () => void confirmRemoveMember(groupId, member.id) }
      ]
    })
  }
  items.push({ type: 'separator' }, { label: tr('group.addMembers'), click: () => send(IPC.evAddMembers, groupId) })
  Menu.buildFromTemplate(items).popup({ window: win })
}

function notifyGroupInvite(group: StoredGroup, peerId: string): void {
  const { notifications: prefs } = settings.get()
  if (!prefs.system || effectiveStatus() === 'dnd' || !Notification.isSupported()) return
  const notification = new Notification({
    title: tr('group.inviteTitle', { name: groupName(group) }),
    body: tr('group.inviteBody', { name: memberName(group, peerId), count: group.members.length }),
    silent: true
  })
  notifications.add(notification)
  if (notifications.size > 20) notifications.delete(notifications.values().next().value!)
  notification.on('click', () => {
    notifications.delete(notification)
    activeChatId = group.id
    showWindow()
    send(IPC.evOpenChat, group.id)
  })
  notification.on('close', () => notifications.delete(notification))
  notification.show()
}

/** Миниатюра картинки для предложения файла: до 320 px, JPEG, не больше ~120 КБ */
async function makeThumbnail(filePath: string): Promise<string | undefined> {
  let image: NativeImage
  try {
    image = await nativeImage.createThumbnailFromPath(filePath, { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE })
  } catch {
    image = nativeImage.createFromPath(filePath)
  }
  if (image.isEmpty()) return undefined
  const { width, height } = image.getSize()
  const scale = Math.min(1, THUMBNAIL_SIZE / Math.max(width, height))
  if (scale < 1) {
    image = image.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'good' })
  }
  let jpeg = image.toJPEG(80)
  if (jpeg.length > MAX_THUMBNAIL_BYTES) {
    jpeg = image.resize({ width: Math.round(image.getSize().width / 2), quality: 'good' }).toJPEG(70)
  }
  if (jpeg.length > MAX_THUMBNAIL_BYTES) return undefined
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

// ─── события → renderer ─────────────────────────────────────────────────────────

function send<T>(channel: string, data: T): void {
  rev++
  const win = mainWindow
  if (win && !win.isDestroyed()) win.webContents.send(channel, { rev, data } satisfies RevEnvelope<T>)
}

function isViewing(peerId: string): boolean {
  const win = mainWindow
  return !!win && !win.isDestroyed() && win.isVisible() && win.isFocused() && activeChatId === peerId
}

function wireEvents(): void {
  store.on('item', (item: ChatItem) => {
    send(IPC.evItem, item)
    if (!peersWithHistory.has(item.peerId)) {
      peersWithHistory.add(item.peerId)
      schedulePeers()
    }
  })
  store.on('unread', (peerId: string, count: number) => {
    send(IPC.evUnread, { peerId, count })
    if (count === 0) flushReadReceipts(peerId)
    if (process.platform === 'darwin') app.setBadgeCount(store.totalUnread())
  })
  store.on('changed', persist)

  chat.on('peer-hello', (hello: HelloInfo) => rememberPeer(hello))
  chat.on('link-up', (peerId: string) => {
    schedulePeers()
    // есть связь (бывает раньше, чем UDP нашёл коллегу) — самое время отдать очередь
    kickOutbox(peerId)
  })
  chat.on('link-down', schedulePeers)
  chat.on('message', (peerId: string, msg: IncomingMessage) => {
    if (msg.everyone) {
      onEveryoneMessage(peerId, msg)
      return
    }
    if (msg.group) {
      onGroupMessage(peerId, msg)
      return
    }
    // повтор из очереди отправителя (ack потерялся, мы перезапускались) — уже есть, не звеним
    if (store.get(peerId, msg.id)) return
    const item: TextItem = {
      kind: 'text',
      id: msg.id,
      peerId,
      direction: 'in',
      text: msg.text,
      // время получения, а не часы отправителя: они могут расходиться
      timestamp: Date.now(),
      status: 'received',
      replyTo: msg.replyTo,
      broadcast: msg.broadcast
    }
    setTyping(peerId, peerId, '', false)
    unarchiveChat(peerId)
    store.upsert(item)
    // на диск — до подтверждения отправителю (ack уходит после этого обработчика)
    persistNow(peerId)
    queueReadReceipt(peerId, msg.id, undefined, isViewing(peerId))
    onIncoming(peerId, msg.broadcast ? tr('notify.broadcastPrefix', { text: msg.text }) : msg.text)
  })
  chat.on('group-info', handleGroupInfo)
  chat.on('group-leave', handleGroupLeave)
  chat.on('group-delete', handleGroupDelete)
  chat.on('typing', (peerId: string, active: boolean, group?: GroupInfo, everyone?: boolean) => {
    if (everyone) {
      setTyping(EVERYONE_ID, peerId, peerName(peerId), active)
      return
    }
    if (!group) {
      setTyping(peerId, peerId, peerName(peerId), active)
      return
    }
    // печатают в группе: показываем в переписке группы, если мы в ней состоим
    const stored = settings.getGroup(group.id)
    if (stored) setTyping(group.id, peerId, memberName(stored, peerId), active)
  })
  chat.on('read', (peerId: string, ids: string[], groupId?: string, everyone?: boolean) => {
    if (everyone) {
      markEveryoneRead(peerId, ids)
      return
    }
    const chatId = groupId ?? peerId
    const group = groupId ? settings.getGroup(groupId) : undefined
    if (groupId && !group) return
    for (const id of ids) {
      const item = store.get(chatId, id)
      if (!group && !item) {
        // клиент до 1.3 прочитал сообщение общего чата: у него это личное «Всем в сети»
        const origin = legacyEveryonePackets.get(id)
        if (origin) markEveryoneRead(peerId, [origin])
        continue
      }
      if (item?.kind !== 'text' || item.direction !== 'out') continue
      if (!group) {
        if (item.status !== 'read') store.upsert({ ...item, status: 'read', error: undefined })
        continue
      }
      // в группе две галочки ставим, когда прочитали все остальные участники
      const readBy = [...new Set([...(item.readBy ?? []), peerId])]
      const others = group.members.filter((m) => m.id !== settings.get().id)
      const all = others.length > 0 && others.every((m) => readBy.includes(m.id))
      store.upsert({ ...item, readBy, status: all ? 'read' : item.status, error: all ? undefined : item.error })
    }
  })
  chat.on('everyone-have', (peerId: string, ids: string[], reply: boolean) => {
    sendMissingEveryone(peerId, ids)
    // Отвечаем своим списком: пока коллега сверялся с нами, у нас могло появиться новое
    // (так бывает, когда он заметил нас раньше, чем мы его). На ответ ответа нет.
    if (!reply && supportsEveryone(discovery?.getPeer(peerId))) syncEveryone(peerId, true)
  })
  chat.on('file-got', (peerId: string, fileId: string) => files.noteDownloaded(fileId, peerId))
  files.on('everyone-file-ready', (card: FileItem) => deliverEveryoneFile(card))
  files.on('everyone-offer', (peerId: string, offer: IncomingOffer) => onEveryoneFileOffer(peerId, offer))
  files.on('incoming-offer', (item: FileItem) => {
    persistNow(item.peerId)
    onIncoming(item.peerId, tr('notify.filePrefix', { name: item.name }))
    maybeAutoAccept(item)
  })
}

/** Сообщение в группу: кладём его в переписку группы, а не в личную */
function onGroupMessage(peerId: string, msg: IncomingMessage): void {
  const info = msg.group
  if (!info) return
  handleGroupInfo(peerId, info)
  const group = settings.getGroup(info.id)
  if (!group) return
  // повтор из очереди отправителя — сообщение уже есть
  if (store.get(group.id, msg.id)) return
  const author = memberName(group, peerId)
  setTyping(group.id, peerId, author, false)
  store.upsert({
    kind: 'text',
    id: msg.id,
    peerId: group.id,
    direction: 'in',
    text: msg.text,
    timestamp: Date.now(),
    status: 'received',
    replyTo: msg.replyTo,
    authorId: peerId,
    authorName: author
  } satisfies TextItem)
  persistNow(group.id)
  queueReadReceipt(peerId, msg.origin ?? msg.id, group.id, isViewing(group.id))
  onIncoming(group.id, tr('notify.groupPrefix', { name: author, text: msg.text }))
}

let peersTimer: NodeJS.Timeout | null = null
function schedulePeers(): void {
  if (peersTimer) return
  peersTimer = setTimeout(() => {
    peersTimer = null
    send(IPC.evPeers, buildPeers())
  }, 50)
}

function buildPeers(): PeerView[] {
  const pinned = settings.get().pinnedPeers
  const pinnedIds = new Set(pinned.map((p) => p.id))
  const result = new Map<string, PeerView>()
  const now = Date.now()
  for (const p of discovery?.getPeers() ?? []) {
    result.set(p.id, {
      id: p.id,
      name: p.name,
      platform: p.platform,
      online: true,
      pinned: pinnedIds.has(p.id),
      status: p.status,
      ip: p.ip,
      tcpPort: p.tcpPort,
      lastSeenAt: now,
      ...peerSince(p),
      version: p.version
    })
  }
  // Ушедшие из сети остаются в списке (серыми), если с ними есть переписка или они закреплены
  const offline = (id: string, name: string, platform: string, online: boolean): PeerView => ({
    id,
    name,
    platform,
    online,
    pinned: pinnedIds.has(id),
    status: 'online',
    ip: null,
    tcpPort: null,
    lastSeenAt: online ? now : peers.lastSeenAt(id),
    onlineSince: null,
    statusSince: null,
    version: peers.get(id)?.version ?? null
  })
  for (const k of store.knownPeers()) {
    // группы и общий чат тоже «известные собеседники» (так хранится их история), но в списке людей их нет
    if (isGroupId(k.id) || k.id === EVERYONE_ID || result.has(k.id)) continue
    const linked = chat.hasLink(k.id)
    if (linked || store.hasConversation(k.id) || pinnedIds.has(k.id)) {
      result.set(k.id, offline(k.id, k.name || peers.get(k.id)?.name || '', k.platform, linked))
    }
  }
  for (const p of pinned) {
    if (!result.has(p.id)) result.set(p.id, offline(p.id, p.name, 'unknown', false))
  }
  // убранные в архив чаты в списке не показываем: они в своём разделе
  for (const chatEntry of settings.archived()) result.delete(chatEntry.id)
  return [...result.values()].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)
  )
}

/**
 * «в сети с 7:49» и «отошёл с 12:26» для шапки чата. Клиент 1.3 сообщает это сам —
 * это верно, даже если наш компьютер в тот момент спал. Для старых клиентов — то,
 * что мы видели сами, иначе не знаем.
 */
function peerSince(p: PeerInfo): { onlineSince: number | null; statusSince: number | null } {
  const seen = observedStatus.get(p.id)
  return {
    onlineSince: p.onlineSince ?? observedOnline.get(p.id) ?? null,
    statusSince: p.statusSince ?? (seen && seen.status === p.status ? seen.since : null)
  }
}

/** Сводка «Коллеги и версии»: все, кого видели, — с версией, системой и статусом */
function listColleagues(): ColleagueView[] {
  const online = new Map((discovery?.getPeers() ?? []).map((p) => [p.id, p]))
  const result = new Map<string, ColleagueView>()
  for (const record of peers.all()) {
    const live = online.get(record.id)
    result.set(record.id, {
      id: record.id,
      name: live?.name || record.name,
      platform: live?.platform ?? record.platform,
      online: !!live,
      status: live?.status ?? 'online',
      version: live ? live.version : record.version,
      lastSeenAt: live ? live.lastSeen : record.lastSeenAt || null
    })
  }
  for (const live of online.values()) {
    if (result.has(live.id)) continue
    result.set(live.id, {
      id: live.id,
      name: live.name,
      platform: live.platform,
      online: true,
      status: live.status,
      version: live.version,
      lastSeenAt: live.lastSeen
    })
  }
  return [...result.values()].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name))
}

function selfInfo(): SelfInfo {
  const { status, auto } = statusState()
  return { id: settings.get().id, name: settings.get().name, platform: process.platform, status, statusAuto: auto }
}

function networkStatus(): NetworkStatus {
  return {
    udpPort: config.udpPort,
    tcpPort,
    udpListening: discovery?.listening ?? false,
    addresses: getLocalIPv4(),
    error: startupError ?? discovery?.lastError ?? null
  }
}

let lastAddresses = ''
let lastNetwork = ''
function pushNetwork(force = false): void {
  const status = networkStatus()
  const addresses = status.addresses.map((a) => `${a.iface}=${a.address}`).join(', ')
  if (lastAddresses && addresses !== lastAddresses) {
    log.info(`local addresses changed: ${addresses || 'none'}`)
    // пропала/вернулась своя сеть — «уходы» и «возвращения» всех собеседников не озвучиваем
    quietUntil = Math.max(quietUntil, Date.now() + config.peerTimeoutMs + 5000)
    discovery?.announce()
  }
  lastAddresses = addresses
  // появилась сеть, которой давно не было (ноутбук принесли в офис) — для коллег мы «пришли»
  if (networkArrival.update(physicalSubnets(status.addresses)) && !suspended) {
    onlineSince = Date.now()
    log.info('network appeared — online since now')
  }
  const json = JSON.stringify(status)
  if (!force && json === lastNetwork) return
  lastNetwork = json
  send(IPC.evNetwork, status)
}

function playSound(kind: SoundKind, tone: MessageTone = settings.get().notifications.messageTone): void {
  send(IPC.evSound, { kind, tone })
}

/** Мелодия сообщения: своя у личных чатов, групп и общего чата */
function toneFor(chatId: string): MessageTone {
  const n = settings.get().notifications
  return chatId === EVERYONE_ID ? n.everyoneTone : isGroupId(chatId) ? n.groupTone : n.messageTone
}

/**
 * Компьютер проснулся: событие resume, либо после suspend пользователь уже что-то нажал,
 * либо процесс давно работает без остановок (macOS иногда присылает «сон» без «пробуждения»).
 */
function wokeUp(reason: string): void {
  log.info(`woke up (${reason})`)
  suspended = false
  onlineSince = Date.now()
  quietUntil = Date.now() + config.peerTimeoutMs + 5000
  discovery?.handleResume()
  refreshAutoAway()
}

/** Раз в 5 секунд: не проснулись ли мы без события resume */
function watchSleep(): void {
  const now = Date.now()
  // интервал пятисекундный: большой разрыв — процесс стоял, компьютер спал
  if (now - tickAt > 15000) runningSince = now
  tickAt = now
  if (!suspended) return
  let idleSeconds = Number.POSITIVE_INFINITY
  try {
    idleSeconds = powerMonitor.getSystemIdleTime()
  } catch {
    // не поддерживается — остаётся проверка по времени
  }
  const lastInputAt = now - idleSeconds * 1000
  if (lastInputAt > suspendedAt + 3000) wokeUp('user activity after suspend without resume')
  else if (now - runningSince >= 5 * 60 * 1000) wokeUp('running for 5 minutes after suspend without resume')
}

/** Строки «в сети / вышел» пишем только там, где переписка уже есть, и не в архиве */
function presenceLinesAllowed(peerId: string): boolean {
  return settings.get().presenceEvents && store.hasConversation(peerId) && !settings.isArchived(peerId)
}

/** Решает, звучит ли «появился / вышел» и пишется ли строка в переписку */
function presenceChanged(peer: PeerInfo, online: boolean, reason = ''): void {
  const now = Date.now()
  // Следили ли мы в этот момент: не «тихое окно» после пробуждения и смены своей сети,
  // а для прихода — и не первые секунды после запуска (тогда мы просто нашли тех, кто и так был).
  const watching = now >= quietUntil
  const startup = online && now - discoveryStartedAt < config.broadcastIntervalMs + 2000
  if (online) {
    const pending = pendingOffline.get(peer.id)
    if (pending) {
      clearTimeout(pending.timer)
      pendingOffline.delete(peer.id)
    }
    // Вернулся после обрыва без «bye». Быстро — это был сбой связи, строк нет. Долго (мы сами
    // спали, и проверка откладывалась) — смотрим на время его прихода: вошёл заново после
    // обрыва — значит, уходил на самом деле; в сети с тех пор — связь пропадала у нас.
    const rejoined = !!pending && isRealReturn(pending.at, now, peer.onlineSince)
    if (pending && !rejoined) {
      if (pending.onlineSince !== undefined) observedOnline.set(peer.id, pending.onlineSince)
      if (pending.status) observedStatus.set(peer.id, pending.status)
      log.info(`"${peer.name}" is back after ${Math.round((now - pending.at) / 1000)}s — a glitch, no presence lines`)
    } else {
      if (pending) recordPresenceOffline(peer.id, pending.at)
      const observed = watching && !startup ? now : null
      if (observed !== null) observedOnline.set(peer.id, observed)
      observedStatus.set(peer.id, { status: peer.status, since: observed })
      if (presenceLinesAllowed(peer.id)) {
        const at = arrivalLineTime(store.lastPresenceEvent(peer.id), peer.onlineSince, observed)
        if (at !== null) addChatEvent(peer.id, 'peer-online', undefined, undefined, at)
      }
    }
  } else {
    const before = { onlineSince: observedOnline.get(peer.id), status: observedStatus.get(peer.id) }
    observedOnline.delete(peer.id)
    observedStatus.delete(peer.id)
    if (!watching) {
      log.debug(`presence event for "${peer.name}" suppressed (sleep/network change)`)
      return
    }
    if (reason === 'said bye') {
      // закрыл Hallway, выключил или усыпил компьютер — это точно уход, и время точное
      peers.seen(peer, now)
      recordPresenceOffline(peer.id, now)
    } else {
      // пропала связь: время — последний пакет; строку напишем, если он не вернётся
      const at = Math.min(peer.lastSeen, now)
      peers.seen(peer, at)
      schedulePendingOffline(peer, at, before)
    }
  }
  if (!watching || startup) return
  if (settings.get().notifications.presenceSound && effectiveStatus() !== 'dnd') {
    playSound(online ? 'online' : 'offline')
  }
}

function schedulePendingOffline(
  peer: PeerInfo,
  at: number,
  before: { onlineSince: number | undefined; status: ObservedStatus | undefined }
): void {
  const previous = pendingOffline.get(peer.id)
  if (previous) clearTimeout(previous.timer)
  const check = (): void => {
    const entry = pendingOffline.get(peer.id)
    if (!entry) return
    // мы сами спали или меняли сеть — ждём, пока таблица собеседников обновится
    if (Date.now() < quietUntil) {
      entry.timer = setTimeout(check, 5000)
      return
    }
    pendingOffline.delete(peer.id)
    if (discovery?.getPeer(peer.id)) return
    recordPresenceOffline(peer.id, at)
  }
  pendingOffline.set(peer.id, { at, timer: setTimeout(check, PRESENCE_FLAP_MS), ...before })
}

/** Серая строка «вышел · 18:40» в личной переписке */
function recordPresenceOffline(peerId: string, at: number): void {
  if (!presenceLinesAllowed(peerId)) return
  const last = store.lastPresenceEvent(peerId)
  if (last?.event === 'peer-offline' && Math.abs(last.timestamp - at) < DUPLICATE_EVENT_MS) return
  addChatEvent(peerId, 'peer-offline', undefined, undefined, at)
}

/** Название переписки: имя коллеги или название группы */
function chatTitle(chatId: string): string {
  if (chatId === EVERYONE_ID) return tr('everyone.title')
  const group = isGroupId(chatId) ? settings.getGroup(chatId) : undefined
  return group ? groupName(group) : peerName(chatId)
}

function peerName(peerId: string): string {
  return (
    discovery?.getPeer(peerId)?.name ||
    store.knownPeers().find((p) => p.id === peerId)?.name ||
    settings.get().pinnedPeers.find((p) => p.id === peerId)?.name ||
    tr('common.peer')
  )
}

function onIncoming(peerId: string, preview: string): void {
  const win = mainWindow
  const focused = !!win && !win.isDestroyed() && win.isVisible() && win.isFocused()
  const viewing = focused && activeChatId === peerId
  if (!viewing) store.incrementUnread(peerId)

  const { notifications: prefs } = settings.get()
  const dnd = effectiveStatus() === 'dnd'
  const tone = toneFor(peerId)
  if (!viewing && prefs.messageSound && !dnd && tone !== 'none') playSound('message', tone)
  if (focused || dnd) return

  if (process.platform === 'win32') win?.flashFrame(true)
  if (!prefs.system || !Notification.isSupported()) return
  const notification = new Notification({
    title: chatTitle(peerId),
    body: preview.length > 180 ? preview.slice(0, 180) + '…' : preview,
    // звук уведомления системы не нужен — есть свой
    silent: true
  })
  // держим ссылку, иначе GC может собрать объект и клик по уведомлению не сработает
  notifications.add(notification)
  if (notifications.size > 20) notifications.delete(notifications.values().next().value!)
  notification.on('click', () => {
    notifications.delete(notification)
    activeChatId = peerId
    showWindow()
    send(IPC.evOpenChat, peerId)
  })
  notification.on('close', () => notifications.delete(notification))
  notification.show()
}

// ─── внешний вид ────────────────────────────────────────────────────────────────

function applyNativeTheme(): void {
  const theme = settings.get().appearance.theme
  // заголовок окна macOS, системные диалоги и меню следуют выбранной теме
  nativeTheme.themeSource = theme === 'system' ? 'system' : DARK_THEMES.includes(theme) ? 'dark' : 'light'
}

function windowChrome(): { bg: string; symbol: string } {
  const theme = settings.get().appearance.theme
  if (theme === 'system') return nativeTheme.shouldUseDarkColors ? THEME_CHROME.dark : THEME_CHROME.light
  return THEME_CHROME[theme]
}

/** Фон окна и цвет кнопок окна Windows под текущую тему */
function applyWindowChrome(): void {
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  const chrome = windowChrome()
  win.setBackgroundColor(chrome.bg)
  if (process.platform === 'win32') {
    try {
      win.setTitleBarOverlay({ color: chrome.bg, symbolColor: chrome.symbol, height: WINDOWS_TITLEBAR_HEIGHT })
    } catch (err) {
      log.warn('setTitleBarOverlay failed:', (err as Error).message)
    }
  }
}

function applyZoom(): void {
  const win = mainWindow
  if (win && !win.isDestroyed()) win.webContents.setZoomFactor(settings.get().appearance.uiScale / 100)
}

function changeScale(step: 1 | -1 | 0): void {
  const current = settings.get().appearance.uiScale
  const next =
    step === 0 ? UI_SCALE.default : Math.min(UI_SCALE.max, Math.max(UI_SCALE.min, current + step * UI_SCALE.step))
  if (next !== current) {
    settings.update({ appearance: { uiScale: next } })
    send(IPC.evSettings, settings.view())
  }
  applyZoom()
}

// ─── автозапуск и трей ──────────────────────────────────────────────────────────

function applyLoginItem(enabled: boolean): void {
  // в dev-режиме в автозагрузку попал бы голый Electron
  if (!app.isPackaged) return
  try {
    if (process.platform === 'win32') app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] })
    else app.setLoginItemSettings({ openAtLogin: enabled })
    log.info(`open at login: ${enabled}`)
  } catch (err) {
    log.warn('setLoginItemSettings failed:', (err as Error).message)
  }
}

/**
 * Пользователь мог выключить автозапуск в настройках системы — показываем реальное состояние.
 * Первый запуск (в том числе первый после обновления со старой версии, где автозапуск был
 * выключен по умолчанию) включает автозапуск один раз; дальше решает только пользователь.
 */
function syncLoginItem(): void {
  if (!app.isPackaged) return
  try {
    const actual =
      process.platform === 'win32'
        ? app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin
        : app.getLoginItemSettings().openAtLogin
    if (!settings.get().loginItemInitialized) {
      settings.update({ loginItemInitialized: true, openAtLogin: true })
      if (!actual) applyLoginItem(true)
      return
    }
    if (actual !== settings.get().openAtLogin) settings.update({ openAtLogin: actual })
  } catch {
    // не критично
  }
}

function computeStartHidden(): boolean {
  if (process.argv.includes('--hidden')) return true
  if (process.platform === 'darwin') {
    try {
      return app.getLoginItemSettings().wasOpenedAtLogin
    } catch {
      return false
    }
  }
  return false
}

/** Можно ли держать окно скрытым: на macOS есть Dock, на Windows — значок в трее */
function canRunHidden(): boolean {
  return process.platform === 'darwin' || (process.platform === 'win32' && !!tray?.enabled)
}

function updateTray(): void {
  if (process.platform !== 'win32' || !tray) return
  if (settings.get().runInBackground) tray.enable()
  else tray.disable()
}

function cleanupPastedFiles(): void {
  const dir = path.join(app.getPath('userData'), 'pasted')
  try {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (Date.now() - fs.statSync(full).mtimeMs > PASTED_FILES_TTL_MS) fs.rmSync(full, { recursive: true, force: true })
    }
  } catch {
    // папки ещё нет
  }
}

// ─── IPC ────────────────────────────────────────────────────────────────────────

const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 64

function isTrusted(sender: WebContents): boolean {
  return !!mainWindow && !mainWindow.isDestroyed() && sender === mainWindow.webContents
}

function cleanMessageText(text: string): string {
  const clean = text.replace(/\r\n?/g, '\n').trim()
  if (clean.length > MAX_TEXT_LENGTH) throw new Error(tr('chat.tooLong', { n: MAX_TEXT_LENGTH }))
  return clean
}

function registerIpc(): void {
  const handle = (channel: string, fn: (...args: unknown[]) => unknown) =>
    ipcMain.handle(channel, (event, ...args) => {
      if (!isTrusted(event.sender)) throw new Error('untrusted sender')
      return fn(...args)
    })
  const on = (channel: string, fn: (...args: unknown[]) => void) =>
    ipcMain.on(channel, (event, ...args) => {
      if (isTrusted(event.sender)) fn(...args)
    })

  handle(
    IPC.getSnapshot,
    (): Snapshot => ({
      rev,
      self: selfInfo(),
      settings: settings.view(),
      network: networkStatus(),
      peers: buildPeers(),
      groups: groupsSnapshot(),
      archive: archiveSnapshot(),
      conversations: store.conversationsSnapshot(),
      unread: store.unreadSnapshot(),
      activeChatId,
      capabilities: { openAtLogin: app.isPackaged, tray: process.platform === 'win32' },
      appInfo: {
        version: app.getVersion(),
        electron: process.versions.electron,
        platform: process.platform,
        arch: process.arch
      },
      paths: { logDir: path.join(app.getPath('userData'), 'logs'), configFile },
      whatsNew: whatsNewPending
    })
  )
  on(IPC.dismissWhatsNew, () => {
    whatsNewPending = false
    if (settings.get().lastSeenVersion !== app.getVersion()) settings.update({ lastSeenVersion: app.getVersion() })
  })
  handle(IPC.listColleagues, () => listColleagues())
  handle(IPC.openLogs, async () => {
    await shell.openPath(path.join(app.getPath('userData'), 'logs'))
  })
  handle(IPC.copyText, (text) => {
    if (typeof text === 'string' && text.length <= 2000) clipboard.writeText(text)
  })

  handle(IPC.setName, (name) => {
    const clean = cleanName(name)
    if (!clean) throw new Error(tr('setup.nameEmpty'))
    settings.update({ name: clean })
    log.info(`display name set to "${clean}"`)
    send(IPC.evSelf, selfInfo())
    send(IPC.evSettings, settings.view())
    if (discovery) discovery.announce()
    else startDiscovery()
    pushNetwork()
  })
  handle(IPC.chooseDownloadDir, async () => {
    if (!mainWindow) return
    const result = await dialog.showOpenDialog(mainWindow, {
      title: tr('settings.downloadDirTitle'),
      defaultPath: settings.get().downloadDir,
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return
    settings.update({ downloadDir: result.filePaths[0] })
    send(IPC.evSettings, settings.view())
  })
  handle(IPC.addManualHost, (host): ActionResult => {
    if (typeof host !== 'string') return { ok: false, error: tr('error.badAddress') }
    const { code, ...result } = settings.addManualHost(host)
    if (code) result.error = tr(code === 'bad-ip' ? 'error.badIp' : 'error.tooManyHosts')
    if (result.ok) {
      log.info(`manual host added: ${host.trim()}`)
      send(IPC.evSettings, settings.view())
      discovery?.announce()
    }
    return result
  })
  handle(IPC.removeManualHost, (host) => {
    if (typeof host !== 'string') return
    settings.removeManualHost(host)
    send(IPC.evSettings, settings.view())
  })
  handle(IPC.updateSettings, (patch) => {
    if (!patch || typeof patch !== 'object') return
    const p = patch as SettingsPatch
    const before = settings.get()
    const after = settings.update({
      language: p.language,
      presenceEvents: p.presenceEvents,
      collapsed: p.collapsed,
      appearance: p.appearance,
      notifications: p.notifications,
      sendKey: p.sendKey,
      historyRetention: p.historyRetention,
      autoAwayMinutes: p.autoAwayMinutes,
      runInBackground: p.runInBackground,
      openAtLogin: p.openAtLogin,
      readReceipts: p.readReceipts,
      autoAccept: p.autoAccept
    })
    if (after.appearance.theme !== before.appearance.theme) {
      applyNativeTheme()
      applyWindowChrome()
    }
    if (after.appearance.uiScale !== before.appearance.uiScale) applyZoom()
    if (after.historyRetention !== before.historyRetention) onRetentionChanged()
    if (after.autoAwayMinutes !== before.autoAwayMinutes) refreshAutoAway()
    if (after.runInBackground !== before.runInBackground) updateTray()
    if (after.openAtLogin !== before.openAtLogin) applyLoginItem(after.openAtLogin)
    if (after.language !== before.language) applyLanguage()
    if (!after.readReceipts) pendingReceipts.clear()
    send(IPC.evSettings, settings.view())
  })
  handle(IPC.setStatus, (status) => {
    if (PRESENCE_STATUSES.includes(status as PresenceStatus)) setManualStatus(status as PresenceStatus)
  })
  handle(IPC.clearHistory, (peerId) => confirmClearHistory(isId(peerId) ? peerId : null))
  handle(IPC.setPinned, (peerId, pinned) => {
    if (isId(peerId) && !isGroupId(peerId) && typeof pinned === 'boolean') setPinned(peerId, pinned)
  })
  handle(IPC.createGroup, (name, memberIds) => createGroup(name, memberIds))
  handle(IPC.renameGroup, (groupId, name): ActionResult => {
    if (!isId(groupId) || !isGroupId(groupId)) return { ok: false, error: tr('group.notFound') }
    return renameGroup(groupId, name)
  })
  handle(IPC.leaveGroup, (groupId) =>
    isId(groupId) && isGroupId(groupId) ? confirmLeaveGroup(groupId) : Promise.resolve(false)
  )
  handle(IPC.showGroupMenu, (groupId) => {
    if (!isId(groupId) || !mainWindow) return
    const group = settings.getGroup(groupId)
    if (!group) return
    const owner = group.ownerId === settings.get().id
    Menu.buildFromTemplate([
      { label: tr('group.memberCount', { n: group.members.length }), enabled: false },
      { label: tr('group.members'), click: () => void showMembersMenu(groupId) },
      { label: tr('group.addMembers'), click: () => send(IPC.evAddMembers, groupId) },
      { type: 'separator' },
      { label: tr('group.rename'), click: () => send(IPC.evRenameGroup, groupId) },
      { label: tr('menu.findInChat'), accelerator: 'CmdOrCtrl+F', click: () => send(IPC.evOpenSearch, groupId) },
      {
        label: tr('group.clearHistory'),
        enabled: store.hasConversation(groupId),
        click: () => void confirmClearHistory(groupId)
      },
      { type: 'separator' },
      { label: tr('group.leave'), click: () => void confirmLeaveGroup(groupId) },
      {
        label: tr('group.delete'),
        enabled: owner,
        toolTip: owner ? undefined : tr('group.deleteOwnerOnly'),
        click: () => void confirmDeleteGroup(groupId)
      }
    ]).popup({ window: mainWindow })
  })
  handle(IPC.showMembers, (groupId) => {
    if (isId(groupId)) void showMembersMenu(groupId)
  })
  handle(IPC.deleteGroup, (groupId) =>
    isId(groupId) && isGroupId(groupId) ? confirmDeleteGroup(groupId) : Promise.resolve(false)
  )
  handle(IPC.addGroupMembers, (groupId, memberIds): ActionResult => {
    if (!isId(groupId) || !isGroupId(groupId)) return { ok: false, error: tr('group.notFound') }
    return addGroupMembers(groupId, memberIds)
  })
  handle(IPC.removeGroupMember, (groupId, memberId) =>
    isId(groupId) && isGroupId(groupId) && isId(memberId)
      ? confirmRemoveMember(groupId, memberId)
      : Promise.resolve(false)
  )
  handle(IPC.archiveChat, (chatId) => {
    if (!isId(chatId)) return
    if (isGroupId(chatId)) {
      // группу «убрать из списка» нельзя: из неё выходят или её удаляют
      void confirmLeaveGroup(chatId)
      return
    }
    archiveChat(chatId, 'hidden', peerName(chatId))
    sendConversations()
  })
  handle(IPC.unarchiveChat, (chatId) => {
    if (isId(chatId) && !isGroupId(chatId)) {
      unarchiveChat(chatId)
      sendConversations()
    }
  })
  handle(IPC.deleteArchived, (chatId) => (isId(chatId) ? confirmDeleteArchived(chatId) : Promise.resolve(false)))
  handle(IPC.showChatMenu, (peerId) => {
    if (!isId(peerId) || !mainWindow) return
    if (peerId === EVERYONE_ID) {
      Menu.buildFromTemplate([
        { label: tr('menu.findInChat'), accelerator: 'CmdOrCtrl+F', click: () => send(IPC.evOpenSearch, peerId) },
        { type: 'separator' },
        {
          label: tr('everyone.clear'),
          enabled: store.hasConversation(peerId),
          click: () => void confirmClearHistory(peerId)
        }
      ]).popup({ window: mainWindow })
      return
    }
    const pinned = isPinned(peerId)
    Menu.buildFromTemplate([
      { label: tr('menu.findInChat'), accelerator: 'CmdOrCtrl+F', click: () => send(IPC.evOpenSearch, peerId) },
      { label: pinned ? tr('menu.unpin') : tr('menu.pin'), click: () => setPinned(peerId, !pinned) },
      {
        label: tr('archive.hideChat'),
        click: () => {
          archiveChat(peerId, 'hidden', peerName(peerId))
          sendConversations()
        }
      },
      { type: 'separator' },
      {
        label: tr('menu.clearChat'),
        enabled: store.hasConversation(peerId),
        click: () => void confirmClearHistory(peerId)
      }
    ]).popup({ window: mainWindow })
  })

  handle(IPC.sendText, (peerId, text, replyTo) => {
    if (!isId(peerId) || typeof text !== 'string') return
    const clean = cleanMessageText(text)
    if (clean) startOutgoing(peerId, clean, parseReplyRef(replyTo))
  })
  on(IPC.sendTyping, (peerId, active) => {
    if (!isId(peerId) || typeof active !== 'boolean') return
    if (peerId === EVERYONE_ID) {
      // всем, кто понимает общий чат; соединения ради «печатает…» не открываем
      for (const peer of discovery?.getPeers() ?? []) {
        if (supportsEveryone(peer)) chat.sendIfLinked(peer.id, { type: 'typing', active, everyone: true })
      }
      return
    }
    const group = isGroupId(peerId) ? settings.getGroup(peerId) : undefined
    if (isGroupId(peerId) && !group) return
    // в группе пакет уходит каждому участнику, но не чаще раза в 3 секунды (это решает интерфейс)
    const packet = group
      ? { type: 'typing', active, group: { id: group.id, name: group.name, members: group.members, rev: group.rev, owner: group.ownerId } }
      : { type: 'typing', active }
    const targets = group ? group.members.filter((m) => m.id !== settings.get().id).map((m) => m.id) : [peerId]
    for (const target of targets) {
      // «печатает» может открыть соединение (всё равно понадобится для сообщения), «перестал» — нет
      if (active) void chat.sendBestEffort(target, packet)
      else chat.sendIfLinked(target, packet)
    }
  })
  handle(IPC.retryText, (peerId, itemId) => {
    if (!isId(peerId) || !isId(itemId)) return
    const item = store.get(peerId, itemId)
    if (item?.kind !== 'text' || item.direction !== 'out' || item.status !== 'failed') return
    // снова в очередь; в группе — всем участникам (id пакетов постоянные, дублей не будет)
    const group = isGroupId(peerId) ? settings.getGroup(peerId) : undefined
    const selfId = settings.get().id
    const next: TextItem = {
      ...item,
      status: 'sending',
      error: undefined,
      queued: undefined,
      ...(group ? { pendingTo: group.members.filter((m) => m.id !== selfId).map((m) => m.id) } : {})
    }
    store.upsert(next)
    persistNow(peerId)
    void deliverQueued(next)
  })
  handle(IPC.cancelSend, (chatId, itemId) => {
    if (isId(chatId) && isId(itemId)) cancelSend(chatId, itemId)
  })
  on(IPC.markRead, (peerId) => {
    if (!isId(peerId)) return
    store.clearUnread(peerId)
    flushReadReceipts(peerId)
  })
  on(IPC.setActiveChat, (peerId) => {
    activeChatId = isId(peerId) ? peerId : null
    if (activeChatId && mainWindow?.isFocused()) {
      store.clearUnread(activeChatId)
      flushReadReceipts(activeChatId)
    }
  })

  handle(IPC.pickFiles, async (peerId) => {
    if (!isId(peerId) || !mainWindow) return
    if (isGroupId(peerId) && !settings.getGroup(peerId)) return
    const result = await dialog.showOpenDialog(mainWindow, {
      title: tr('file.sendTo', { name: chatTitle(peerId) }),
      properties: ['openFile', 'multiSelections']
    })
    if (!result.canceled && result.filePaths.length) offerFiles(peerId, result.filePaths)
  })
  handle(IPC.sendFiles, (peerId, paths) => {
    if (!isId(peerId) || !Array.isArray(paths)) return
    const list = paths.filter((p): p is string => typeof p === 'string' && path.isAbsolute(p)).slice(0, 100)
    if (list.length) offerFiles(peerId, list)
  })
  handle(IPC.sendFileData, async (peerId, name, data): Promise<ActionResult> => {
    if (!isId(peerId) || typeof name !== 'string') return { ok: false, error: tr('file.badData') }
    const bytes = data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : null
    if (!bytes) return { ok: false, error: tr('file.badData') }
    if (bytes.byteLength > MAX_PASTE_BYTES) {
      return { ok: false, error: tr('file.pasteTooBig') }
    }
    // отдельная папка на каждую вставку: у получателя будет чистое имя файла
    const dir = path.join(app.getPath('userData'), 'pasted', randomUUID())
    const file = path.join(dir, sanitizeFileName(name))
    try {
      await fs.promises.mkdir(dir, { recursive: true })
      await fs.promises.writeFile(file, bytes)
    } catch (err) {
      return { ok: false, error: tr('file.saveFailed', { error: (err as Error).message }) }
    }
    offerFiles(peerId, [file])
    return { ok: true }
  })
  handle(IPC.acceptFile, (fileId) => {
    if (!isId(fileId)) return
    const shared = store.get(EVERYONE_ID, fileId)
    if (shared?.kind === 'file') {
      files.downloadEveryone(fileId, () => everyoneSources(shared)).catch((err: Error) => log.error('download failed:', err))
      return
    }
    files.accept(fileId).catch((err: Error) => log.error('accept failed:', err))
  })
  handle(IPC.declineFile, (fileId) => {
    if (isId(fileId)) files.decline(fileId)
  })
  handle(IPC.cancelFile, (fileId) => {
    if (isId(fileId)) files.cancel(fileId)
  })
  handle(IPC.retryFile, (fileId) => {
    if (isId(fileId)) void files.retryGroupParts(fileId)
  })
  handle(IPC.openFile, async (fileId) => {
    const target = isId(fileId) ? files.localPath(fileId) : null
    if (!target) return
    const error = await shell.openPath(target)
    if (error) log.warn(`open "${target}" failed: ${error}`)
  })
  handle(IPC.showFile, (fileId) => {
    const target = isId(fileId) ? files.localPath(fileId) : null
    if (target) shell.showItemInFolder(target)
  })
}

/** Исходящее сообщение: личное или в группу (у группового есть автор — вы) */
function startOutgoing(peerId: string, text: string, replyTo?: TextItem['replyTo']): void {
  if (peerId === EVERYONE_ID) {
    startEveryone(text, replyTo)
    return
  }
  const group = isGroupId(peerId) ? settings.getGroup(peerId) : undefined
  if (isGroupId(peerId) && !group) return
  const selfId = settings.get().id
  const item: TextItem = {
    kind: 'text',
    id: randomUUID(),
    peerId,
    direction: 'out',
    text,
    timestamp: Date.now(),
    status: 'sending',
    replyTo,
    ...(group
      ? { authorId: selfId, authorName: selfName(), pendingTo: group.members.filter((m) => m.id !== selfId).map((m) => m.id) }
      : {})
  }
  store.upsert(item)
  // в очереди с первой секунды: даже если приложение сразу закроют, сообщение не пропадёт
  persistNow(peerId)
  void deliverQueued(item)
}

function offerFiles(chatId: string, paths: string[]): void {
  if (chatId === EVERYONE_ID) {
    // всем уходит карточка, а скачивает каждый сам — у автора или у того, кто уже скачал
    log.info(`sharing ${paths.length} file(s) in the everyone chat`)
    files.offerFilesToEveryone(paths, selfName()).catch((err: Error) => log.error('everyone share failed:', err))
    return
  }
  const group = isGroupId(chatId) ? settings.getGroup(chatId) : undefined
  if (group) {
    log.info(`offering ${paths.length} file(s) to group "${group.name}" (${group.members.length - 1} members)`)
    files
      .offerFilesToGroup(
        { id: group.id, name: group.name, members: group.members, rev: group.rev, ownerId: group.ownerId },
        paths
      )
      .catch((err: Error) => log.error('group offer failed:', err))
    return
  }
  if (isGroupId(chatId)) return
  log.info(`offering ${paths.length} file(s) to "${peerName(chatId)}"`)
  files.offerFiles(chatId, paths).catch((err: Error) => log.error('offer failed:', err))
}

// ─── очередь отправки ───────────────────────────────────────────────────────────
// Сообщение остаётся в очереди, пока получатель не подтвердит его (а подтверждает он,
// только записав на диск). Повторы — когда коллега появился, установилась связь и раз
// в OUTBOX_RETRY_MS; очередь хранится с историей и переживает перезапуск. У сообщения
// постоянный id (в группе — постоянный id пакета для каждого участника), поэтому повтор
// уже полученного получатель узнаёт и не показывает второй раз.

/** сейчас в работе: одно и то же сообщение не отправляем параллельно */
const outboxBusy = new Set<string>()

/** До коллеги можно достучаться: найден в сети или уже есть соединение */
function reachable(peerId: string): boolean {
  return !!discovery?.getPeer(peerId) || chat.hasLink(peerId)
}

function needsDelivery(item: TextItem): boolean {
  if (item.direction !== 'out' || item.peerId === EVERYONE_ID) return false
  // в группе «отправляется» без списка — запись из старой истории: ждём всех участников
  if (isGroupId(item.peerId)) return item.status !== 'failed' && (item.status === 'sending' || (item.pendingTo?.length ?? 0) > 0)
  return item.status === 'sending'
}

/** Разослать всё, что ждёт: коллеге peerId (появился в сети) или всем, кто сейчас доступен */
function kickOutbox(peerId?: string): void {
  for (const chatId of store.peerIds()) {
    if (chatId === EVERYONE_ID) continue
    const group = isGroupId(chatId) ? settings.getGroup(chatId) : undefined
    if (isGroupId(chatId) ? !group : peerId !== undefined && chatId !== peerId) continue
    if (group && peerId && !group.members.some((m) => m.id === peerId)) continue
    for (const item of store.items(chatId)) {
      if (item.kind === 'text' && needsDelivery(item)) void deliverQueued(item)
    }
  }
  files.kickOffers(peerId, reachable)
}

/** Ещё нужно отправлять (не отменили, не доставили) — проверяется перед каждой попыткой */
function stillQueued(item: TextItem): boolean {
  const current = store.get(item.peerId, item.id)
  return current?.kind === 'text' && needsDelivery(current)
}

async function deliverQueued(item: TextItem): Promise<void> {
  const key = `${item.peerId}|${item.id}`
  if (outboxBusy.has(key)) return
  outboxBusy.add(key)
  try {
    if (isGroupId(item.peerId)) await deliverGroupText(item)
    else await deliverText(item)
  } finally {
    outboxBusy.delete(key)
  }
}

function patchText(item: TextItem, changes: Partial<TextItem>): void {
  const current = store.get(item.peerId, item.id)
  if (current?.kind !== 'text') return
  // «прочитано» могло прийти раньше, чем закончилась отправка, — не откатываем его на «доставлено»
  if (changes.status === 'sent' && current.status === 'read') changes = { ...changes, status: 'read' }
  store.upsert({ ...current, ...changes })
}

async function deliverText(item: TextItem): Promise<void> {
  if (!stillQueued(item)) return
  if (!reachable(item.peerId)) {
    // коллега не в сети — ждём; уйдёт, как только он появится
    const current = store.get(item.peerId, item.id)
    if (current?.kind === 'text' && !current.queued) patchText(item, { queued: true })
    return
  }
  try {
    await chat.sendReliable(
      item.peerId,
      {
        type: 'message',
        id: item.id,
        from: settings.get().id,
        text: item.text,
        timestamp: item.timestamp,
        reply: item.replyTo,
        broadcast: item.broadcast
      },
      () => stillQueued(item)
    )
    patchText(item, { status: 'sent', queued: undefined, error: undefined })
  } catch (err) {
    if (!stillQueued(item)) return
    const current = store.get(item.peerId, item.id)
    // в лог — один раз, при переходе в очередь; дальше повторы идут молча
    if (current?.kind === 'text' && !current.queued) {
      log.warn(`message ${item.id.slice(0, 8)} to "${peerName(item.peerId)}" queued: ${(err as Error).message}`)
    }
    patchText(item, { queued: true, error: undefined })
  }
}

/** Постоянный id пакета для участника: повтор из очереди получатель узнаёт как тот же */
function groupPacketId(itemId: string, memberId: string): string {
  return createHash('sha256').update(`${itemId}|${memberId}`).digest('hex').slice(0, 32)
}

/**
 * Сообщение в группу уходит каждому участнику отдельно. Кому не дошло (не в сети, сбой) —
 * остаются в pendingTo и получат его позже из очереди. Хоть кому-то дошло — «доставлено».
 */
async function deliverGroupText(item: TextItem): Promise<void> {
  const group = settings.getGroup(item.peerId)
  if (!group) return
  if (!stillQueued(item)) return
  const selfId = settings.get().id
  const current = store.get(item.peerId, item.id) as TextItem
  const everybody = group.members.filter((m) => m.id !== selfId).map((m) => m.id)
  if (!everybody.length) {
    patchText(current, { status: 'failed', pendingTo: undefined, queued: undefined, error: tr('group.noMembers') })
    return
  }
  const waiting = (entry: TextItem) => entry.pendingTo ?? (entry.status === 'sending' ? everybody : [])
  const pending = waiting(current).filter((id) => id !== selfId && group.members.some((m) => m.id === id))
  const targets = pending.filter((id) => reachable(id))
  const meta = { id: group.id, name: group.name, members: group.members, rev: group.rev, owner: group.ownerId }
  const results = await Promise.allSettled(
    targets.map((memberId) =>
      chat.sendReliable(
        memberId,
        {
          type: 'message',
          id: groupPacketId(item.id, memberId),
          // отметка «прочитано» вернётся с этим id — он же id карточки у нас
          origin: item.id,
          from: selfId,
          text: item.text,
          timestamp: item.timestamp,
          reply: item.replyTo,
          group: meta
        },
        () => stillQueued(item)
      )
    )
  )
  const delivered = new Set(targets.filter((_, index) => results[index].status === 'fulfilled'))
  const latest = store.get(item.peerId, item.id)
  if (latest?.kind !== 'text') return
  // пока шла отправка, участников могли убрать из группы — оставляем только тех, кто в ней
  const pendingTo = waiting(latest).filter((id) => !delivered.has(id) && group.members.some((m) => m.id === id))
  const others = everybody.length
  const someDelivered = pendingTo.length < others
  if (delivered.size || pendingTo.length !== waiting(latest).length) {
    log.info(`group message to "${group.name}": delivered to ${delivered.size}, waiting for ${pendingTo.length}`)
  }
  patchText(latest, {
    pendingTo: pendingTo.length ? pendingTo : undefined,
    status: someDelivered ? (latest.status === 'read' ? 'read' : 'sent') : 'sending',
    queued: pendingTo.length ? true : undefined,
    error: undefined
  })
}

/** «Отменить отправку»: убрать из очереди то, что ещё не доставлено */
function cancelSend(chatId: string, itemId: string): void {
  const item = store.get(chatId, itemId)
  if (item?.kind !== 'text' || !needsDelivery(item)) return
  if (isGroupId(chatId)) {
    const group = settings.getGroup(chatId)
    const others = (group?.members ?? []).filter((m) => m.id !== settings.get().id).length
    const nobody = (item.pendingTo?.length ?? 0) >= others
    store.upsert({
      ...item,
      pendingTo: undefined,
      queued: undefined,
      status: nobody ? 'failed' : item.status,
      error: nobody ? tr('outbox.canceled') : undefined
    })
  } else {
    store.upsert({ ...item, status: 'failed', queued: undefined, error: tr('outbox.canceled') })
  }
  log.info(`sending of ${itemId.slice(0, 8)} canceled by user`)
  persistNow(chatId)
}

// ─── общий чат ──────────────────────────────────────────────────────────────────
// Сервера нет: сообщение уходит каждому, кто в сети, а кто был не в сети — получает его,
// когда появится, от любого коллеги, у которого оно есть (сверка списком id за 3 дня).
// Id сообщения один у всех, поэтому повторы отсекаются, а отметки «прочитано» и цитаты
// понятны каждому. Клиентам до 1.3 сообщение уходит по-старому — личным «Всем в сети».

function supportsEveryone(peer: PeerInfo | undefined): boolean {
  return !!peer && compareVersions(peer.version, EVERYONE_MIN_VERSION) >= 0
}

/**
 * С какого момента сообщения общего чата досылаются: 3 дня, но не раньше очистки истории
 * и не дальше срока хранения (иначе удалённое по сроку приходило бы снова и снова)
 */
function everyoneWindowStart(): number {
  const now = Date.now()
  const retention = settings.get().historyRetention
  const kept = retention === 'none' ? null : retentionMs(retention)
  return Math.max(now - EVERYONE_SYNC_MS, settings.get().everyoneClearedAt, kept === null ? 0 : now - kept)
}

/** Что досылаем: сообщения и карточки файлов (у своего файла — когда посчитана сумма) */
function everyoneRecent(): Array<TextItem | FileItem> {
  const since = everyoneWindowStart()
  return store
    .items(EVERYONE_ID)
    .filter(
      (item): item is TextItem | FileItem =>
        item.timestamp >= since && (item.kind === 'text' || (item.kind === 'file' && !!item.sha256))
    )
}

function everyoneFilePacket(item: FileItem, packetId: string) {
  const selfId = settings.get().id
  return {
    type: 'file-offer',
    id: packetId,
    from: selfId,
    name: item.name,
    size: item.size,
    timestamp: item.timestamp,
    thumb: item.thumbnail,
    sha256: item.sha256,
    everyone: {
      id: item.id,
      author: item.authorId ?? selfId,
      name: item.authorName ?? selfName(),
      age: Math.max(0, Date.now() - item.timestamp)
    }
  }
}

function everyonePacket(item: TextItem, packetId: string) {
  const selfId = settings.get().id
  return {
    type: 'message',
    id: packetId,
    from: selfId,
    text: item.text,
    timestamp: item.timestamp,
    reply: item.replyTo,
    // клиент до 1.3 поля everyone не знает и покажет сообщение как «Всем в сети» в личном чате
    broadcast: true,
    everyone: {
      id: item.id,
      author: item.authorId ?? selfId,
      name: item.authorName ?? selfName(),
      age: Math.max(0, Date.now() - item.timestamp)
    }
  }
}

/** Статус своего сообщения: «прочитано», когда прочитали все, кому оно доставлено */
function everyoneStatus(readBy: string[], deliveredTo: string[]): TextItem['status'] {
  return deliveredTo.length > 0 && deliveredTo.every((id) => readBy.includes(id)) ? 'read' : 'sent'
}

function noteEveryoneDelivery(itemId: string, peerIds: string[], readerIds: string[] = []): void {
  const current = store.get(EVERYONE_ID, itemId)
  if (current?.kind !== 'text' || current.direction !== 'out') return
  const deliveredTo = [...new Set([...(current.deliveredTo ?? []), ...peerIds, ...readerIds])]
  const readBy = [...new Set([...(current.readBy ?? []), ...readerIds])]
  const status = everyoneStatus(readBy, deliveredTo)
  if (
    status === current.status &&
    deliveredTo.length === (current.deliveredTo ?? []).length &&
    readBy.length === (current.readBy ?? []).length
  ) {
    return
  }
  store.upsert({ ...current, deliveredTo, readBy, status, error: undefined })
}

/** Отправить одно сообщение (или карточку файла) общего чата одному коллеге, с подтверждением */
async function sendEveryone(item: TextItem | FileItem, peer: PeerInfo): Promise<void> {
  const packetId = randomUUID()
  if (item.kind === 'file') {
    // клиенту до 1.3 файл уходит обычным предложением, и только вживую (см. deliverEveryoneFile)
    if (supportsEveryone(peer)) await chat.sendReliable(peer.id, everyoneFilePacket(item, packetId))
    return
  }
  if (!supportsEveryone(peer)) {
    legacyEveryonePackets.set(packetId, item.id)
    if (legacyEveryonePackets.size > 5000) legacyEveryonePackets.delete(legacyEveryonePackets.keys().next().value!)
  }
  await chat.sendReliable(peer.id, everyonePacket(item, packetId))
}

function startEveryone(text: string, replyTo?: TextItem['replyTo']): void {
  const item: TextItem = {
    kind: 'text',
    id: randomUUID(),
    peerId: EVERYONE_ID,
    direction: 'out',
    text,
    timestamp: Date.now(),
    status: 'sending',
    replyTo,
    authorId: settings.get().id,
    authorName: selfName(),
    deliveredTo: [],
    readBy: []
  }
  store.upsert(item)
  void deliverEveryone(item)
}

/** Всем, кто сейчас в сети. Кому не дошло — дойдёт при следующей сверке. */
async function deliverEveryone(item: TextItem): Promise<void> {
  const targets = discovery?.getPeers() ?? []
  const results = await Promise.allSettled(targets.map((peer) => sendEveryone(item, peer)))
  const delivered = targets.filter((_, index) => results[index].status === 'fulfilled').map((p) => p.id)
  const failed = targets.length - delivered.length
  log.info(`everyone chat message: delivered to ${delivered.length}/${targets.length}${failed ? ' (the rest will get it on resync)' : ''}`)
  const current = store.get(EVERYONE_ID, item.id)
  if (current?.kind !== 'text') return
  const deliveredTo = [...new Set([...(current.deliveredTo ?? []), ...delivered])]
  store.upsert({ ...current, deliveredTo, status: everyoneStatus(current.readBy ?? [], deliveredTo) })
}

/** Сообщение общего чата пришло: от автора сразу или досланное кем-то позже */
function onEveryoneMessage(peerId: string, msg: IncomingMessage): void {
  const meta = msg.everyone
  if (!meta) return
  // досылать могут сразу несколько коллег — кладём один раз
  if (store.get(EVERYONE_ID, meta.id)) return
  const timestamp = Date.now() - meta.age
  if (timestamp < everyoneWindowStart()) return
  const selfId = settings.get().id
  const own = meta.author === selfId
  const authorName = own ? selfName() : meta.authorName || peerName(meta.author)
  store.upsert({
    kind: 'text',
    id: meta.id,
    peerId: EVERYONE_ID,
    direction: own ? 'out' : 'in',
    text: msg.text,
    timestamp,
    // своё сообщение вернулось досылкой (история была потеряна) — оно точно было доставлено
    status: own ? 'sent' : 'received',
    replyTo: msg.replyTo,
    authorId: meta.author,
    authorName
  } satisfies TextItem)
  if (own) return
  setTyping(EVERYONE_ID, meta.author, authorName, false)
  queueReadReceipt(meta.author, meta.id, EVERYONE_ID, isViewing(EVERYONE_ID))
  // звук и уведомление — только когда пишут сейчас; досланное пропущенное просто копится в счётчике
  const live = peerId === meta.author && meta.age < EVERYONE_LIVE_MS
  if (live) onIncoming(EVERYONE_ID, tr('notify.groupPrefix', { name: authorName, text: msg.text }))
  else if (!isViewing(EVERYONE_ID)) store.incrementUnread(EVERYONE_ID)
}

/** Свой файл готов: карточку — всем в сети, клиентам до 1.3 — обычное предложение файла */
function deliverEveryoneFile(card: FileItem): void {
  for (const peer of discovery?.getPeers() ?? []) {
    if (supportsEveryone(peer)) {
      sendEveryone(card, peer).catch((err: Error) =>
        log.warn(`everyone file card to "${peer.name}" failed (resync will retry): ${err.message}`)
      )
    } else {
      files.offerLegacyCopy(card, peer.id).catch((err: Error) => log.warn(`legacy file offer failed: ${err.message}`))
    }
  }
}

/** Карточка файла общего чата пришла: от автора сразу или досланная кем-то позже */
function onEveryoneFileOffer(peerId: string, offer: IncomingOffer): void {
  const meta = offer.everyone
  // без суммы автора файл не проверить, а скачать его можно и у постороннего — не принимаем
  if (!meta || !offer.sha256) return
  if (store.get(EVERYONE_ID, meta.id)) return
  const timestamp = Date.now() - meta.age
  if (timestamp < everyoneWindowStart()) return
  const own = meta.author === settings.get().id
  const authorName = own ? selfName() : meta.authorName || peerName(meta.author)
  store.upsert({
    kind: 'file',
    id: meta.id,
    peerId: EVERYONE_ID,
    direction: own ? 'out' : 'in',
    name: sanitizeFileName(offer.name),
    size: offer.size,
    transferred: 0,
    speed: 0,
    // своя карточка вернулась досылкой (история была потеряна) — самого файла у нас нет
    status: own ? 'failed' : 'pending',
    error: own ? tr('everyone.fileNoSource') : undefined,
    timestamp,
    thumbnail: offer.thumbnail,
    sha256: offer.sha256,
    authorId: meta.author,
    authorName
  } satisfies FileItem)
  if (own) return
  const live = peerId === meta.author && meta.age < EVERYONE_LIVE_MS
  const preview = tr('notify.groupPrefix', { name: authorName, text: tr('sidebar.filePreview', { name: offer.name }) })
  if (live) onIncoming(EVERYONE_ID, preview)
  else if (!isViewing(EVERYONE_ID)) store.incrementUnread(EVERYONE_ID)
}

/**
 * У кого скачивать файл общего чата: сначала автор, потом остальные. Кроме найденных в сети
 * с версией 1.3+ — и те, с кем уже есть соединение, но кого UDP ещё не нашёл (так бывает
 * первые секунды после запуска): не поймёт запрос — ответит «нет такого файла».
 */
function everyoneSources(item: FileItem): string[] {
  const ids = new Set<string>()
  for (const peer of discovery?.getPeers() ?? []) if (supportsEveryone(peer)) ids.add(peer.id)
  for (const id of chat.linkedPeerIds()) {
    const known = discovery?.getPeer(id)
    if (!known || supportsEveryone(known)) ids.add(id)
  }
  ids.delete(settings.get().id)
  const author = item.authorId && ids.has(item.authorId) ? [item.authorId] : []
  return [...author, ...[...ids].filter((id) => id !== item.authorId)]
}

function markEveryoneRead(peerId: string, ids: string[]): void {
  for (const id of ids) noteEveryoneDelivery(id, [], [peerId])
}

/** «Вот что у меня есть» — в ответ коллега пришлёт недостающее (и свой список, если это не ответ) */
function syncEveryone(peerId: string, reply = false): void {
  const ids = everyoneRecent()
    .map((item) => item.id)
    .slice(-MAX_EVERYONE_IDS)
  void chat.sendBestEffort(peerId, reply ? { type: 'everyone-have', ids, reply: true } : { type: 'everyone-have', ids })
}

/** Коллега прислал, что у него есть, — досылаем то, чего у него нет */
function sendMissingEveryone(peerId: string, ids: string[]): void {
  const peer = discovery?.getPeer(peerId)
  if (!peer || !supportsEveryone(peer)) return
  const have = new Set(ids)
  const missing = everyoneRecent().filter((item) => !have.has(item.id))
  if (!missing.length) return
  log.info(`everyone chat: sending ${missing.length} missed item(s) to "${peer.name}"`)
  for (const item of missing) {
    sendEveryone(item, peer).then(
      () => {
        if (item.kind === 'text' && item.direction === 'out') noteEveryoneDelivery(item.id, [peer.id])
      },
      (err: Error) => log.warn(`everyone chat: resend to "${peer.name}" failed: ${err.message}`)
    )
  }
}

// ─── окно и жизненный цикл ──────────────────────────────────────────────────────

/** В dev у Electron стандартная иконка; в собранном приложении иконку встраивает electron-builder */
function devIconPath(): string | undefined {
  if (app.isPackaged) return undefined
  const file = path.join(__dirname, '../../build/icon.png')
  return fs.existsSync(file) ? file : undefined
}

/** Ссылка из сообщения открывается в браузере пользователя; в приложении переходов нет */
function openLink(url: string): void {
  log.info(`opening link in the default browser: ${url.slice(0, 200)}`)
  shell.openExternal(url).catch((err: Error) => log.warn(`openExternal failed: ${err.message}`))
}

/** Контекстное меню: в Electron его нет по умолчанию, без него не скопировать текст мышью */
function showContextMenu(win: BrowserWindow, params: Electron.ContextMenuParams): void {
  const template: MenuItemConstructorOptions[] = []
  if (params.misspelledWord) {
    for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
      template.push({ label: suggestion, click: () => win.webContents.replaceMisspelling(suggestion) })
    }
    if (!params.dictionarySuggestions.length) template.push({ label: tr('menu.noSuggestions'), enabled: false })
    template.push(
      {
        label: tr('menu.addToDictionary'),
        click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      },
      { type: 'separator' }
    )
  }
  if (params.linkURL && /^https?:\/\//i.test(params.linkURL)) {
    template.push(
      { label: tr('menu.openLink'), click: () => openLink(params.linkURL) },
      { label: tr('menu.copyLink'), click: () => clipboard.writeText(params.linkURL) },
      { type: 'separator' }
    )
  }
  if (params.isEditable) {
    const flags = params.editFlags
    template.push(
      { role: 'undo', label: tr('common.undo'), enabled: flags.canUndo },
      { role: 'redo', label: tr('common.redo'), enabled: flags.canRedo },
      { type: 'separator' },
      { role: 'cut', label: tr('common.cut'), enabled: flags.canCut },
      { role: 'copy', label: tr('common.copy'), enabled: flags.canCopy },
      { role: 'paste', label: tr('common.paste'), enabled: flags.canPaste },
      { role: 'selectAll', label: tr('common.selectAll') }
    )
  } else if (params.selectionText.trim()) {
    template.push({ role: 'copy', label: tr('common.copy') })
  }
  while (template.at(-1)?.type === 'separator') template.pop()
  if (template.length) Menu.buildFromTemplate(template).popup({ window: win })
}

/**
 * Windows: при скрытом заголовке окна строки меню нет, поэтому горячие клавиши обрабатываем сами.
 * preventDefault отменяет и событие страницы, и одноимённый пункт меню — действие не выполнится дважды.
 * Проверяем физическую клавишу (code): при русской раскладке Ctrl+F приходит как «а».
 */
function handleWindowsShortcut(event: Electron.Event, input: Electron.Input): void {
  if (input.type !== 'keyDown' || !input.control || input.alt || input.meta) return
  switch (input.code) {
    case 'KeyF':
      send(IPC.evOpenSearch, activeChatId)
      break
    case 'Equal':
    case 'NumpadAdd':
      changeScale(1)
      break
    case 'Minus':
    case 'NumpadSubtract':
      changeScale(-1)
      break
    case 'Digit0':
    case 'Numpad0':
      changeScale(0)
      break
    case 'Comma':
      openSettings()
      break
    default:
      return
  }
  event.preventDefault()
}

function createWindow(): void {
  const chrome = windowChrome()
  const win = new BrowserWindow({
    icon: process.platform === 'darwin' ? undefined : devIconPath(),
    width: 1040,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'Hallway',
    backgroundColor: chrome.bg,
    autoHideMenuBar: true,
    // заголовок окна в цвет темы: на macOS кнопки окна встроены в боковую панель,
    // на Windows системные кнопки рисуются поверх интерфейса в цветах темы
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 20 } } : {}),
    ...(process.platform === 'win32'
      ? {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: { color: chrome.bg, symbolColor: chrome.symbol, height: WINDOWS_TITLEBAR_HEIGHT }
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      // звуки присутствия играют без клика пользователя
      autoplayPolicy: 'no-user-gesture-required'
    }
  })
  mainWindow = win

  const hidden = startHidden && canRunHidden()
  startHidden = false
  win.once('ready-to-show', () => {
    if (hidden) log.info('started at login: window stays hidden')
    else win.show()
  })
  win.on('focus', () => {
    if (process.platform === 'win32') win.flashFrame(false)
    if (activeChatId) {
      store.clearUnread(activeChatId)
      flushReadReceipts(activeChatId)
    }
  })
  win.on('close', (event) => {
    if (quitting) return
    // macOS: крестик прячет окно, приложение остаётся в Dock.
    // Windows: при включённой «работе в фоне» — сворачиваем в трей.
    // Интерфейс при этом живёт: приходят сообщения, играют звуки, коллеги видят вас в сети.
    if (process.platform === 'darwin' || (process.platform === 'win32' && tray?.enabled)) {
      event.preventDefault()
      win.hide()
      if (process.platform === 'win32' && !settings.get().trayHintShown) {
        settings.update({ trayHintShown: true })
        tray?.balloon(tr('tray.hintTitle'), tr('tray.hintBody'))
      }
    }
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  // Windows: выключение компьютера или выход из системы — успеть сказать соседям «bye»
  win.on('session-end', () => {
    void discovery?.sayBye()
  })

  // Масштаб: применяем после каждой загрузки; Ctrl+колесо мыши меняет настройку
  win.webContents.on('did-finish-load', applyZoom)
  win.webContents.on('zoom-changed', (_event, direction) => changeScale(direction === 'in' ? 1 : -1))
  win.webContents.on('context-menu', (_event, params) => showContextMenu(win, params))
  if (process.platform === 'win32') win.webContents.on('before-input-event', handleWindowsShortcut)

  // Никаких переходов и новых окон внутри приложения; http(s)-ссылки — во внешний браузер
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) openLink(url)
    else log.warn(`blocked non-http link: ${url.slice(0, 120)}`)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

function showWindow(): void {
  if (!started) return
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    mainWindow?.once('ready-to-show', () => mainWindow?.show())
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

app.on('window-all-closed', () => {
  // macOS: приложение остаётся в Dock и продолжает принимать сообщения
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (started) showWindow()
})

app.on('before-quit', (event) => {
  if (quitting || !started) return
  quitting = true
  event.preventDefault()
  shutdown().finally(() => app.quit())
})

async function shutdown(): Promise<void> {
  log.info('shutting down')
  try {
    files.shutdown()
  } catch (err) {
    log.error('files shutdown:', err)
  }
  history.flush()
  peers.flush()
  tray?.disable()
  // «bye» соседям, но не дольше секунды
  await Promise.race([discovery?.stop(), new Promise((r) => setTimeout(r, 1000))])
  chat.stop()
  logger.close()
}
