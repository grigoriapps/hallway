import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react'
import { createTranslator, DEFAULT_LOCALE, type Translator } from './i18n'
import type {
  AppInfo,
  ArchivedView,
  Capabilities,
  ChatItem,
  ConversationsReset,
  GroupView,
  NetworkStatus,
  PeerView,
  SelfInfo,
  SettingsView,
  Snapshot
} from './types'

// Состояние renderer — зеркало состояния main-процесса: снимок при загрузке + события.
// Каждое событие несёт номер ревизии; всё, что старше снимка, отбрасывается,
// поэтому гонка «событие пришло раньше снимка» не откатывает состояние назад.

export interface AppState {
  ready: boolean
  self: SelfInfo
  settings: SettingsView
  network: NetworkStatus | null
  peers: PeerView[]
  groups: GroupView[]
  archive: ArchivedView[]
  conversations: Record<string, ChatItem[]>
  unread: Record<string, number>
  activePeerId: string | null
  capabilities: Capabilities
  appInfo: AppInfo
  paths: Snapshot['paths']
  /** увеличивается при ⌘/Ctrl+F — открытый чат показывает поиск */
  searchNonce: number
  /** увеличивается при ⌘/Ctrl+, — открываются настройки */
  settingsNonce: number
  /** кто сейчас набирает сообщение: переписка → имена (в личном чате одно или ни одного) */
  typing: Record<string, string[]>
  /** окно «Что нового» открыто */
  whatsNewOpen: boolean
}

export type Action =
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'peers'; peers: PeerView[] }
  | { type: 'groups'; groups: GroupView[] }
  | { type: 'archive'; archive: ArchivedView[] }
  | { type: 'item'; item: ChatItem }
  | { type: 'unread'; peerId: string; count: number }
  | { type: 'network'; network: NetworkStatus }
  | { type: 'self'; self: SelfInfo }
  | { type: 'settings'; settings: SettingsView }
  | { type: 'conversations'; reset: ConversationsReset }
  | { type: 'select'; peerId: string | null }
  | { type: 'whatsNew'; open: boolean }
  | { type: 'openSearch' }
  | { type: 'openSettings' }
  | { type: 'typing'; chatId: string; names: string[] }

const initialState: AppState = {
  ready: false,
  self: { id: '', name: '', platform: '', status: 'online', statusAuto: false },
  settings: {
    name: '',
    downloadDir: '',
    manualHosts: [],
    language: DEFAULT_LOCALE,
    appearance: {
      theme: 'system',
      font: 'system',
      uiScale: 100,
      messageFontSize: 14,
      chatBackground: 'none',
      compact: false
    },
    notifications: {
      system: true,
      messageSound: true,
      messageTone: 'chime',
      groupTone: 'drop',
      everyoneTone: 'marimba',
      presenceSound: true
    },
    sendKey: 'enter',
    historyRetention: '30d',
    autoAwayMinutes: 10,
    runInBackground: true,
    openAtLogin: false,
    readReceipts: true,
    autoAccept: { mode: 'off', maxSizeMb: 200 },
    pinnedPeers: [],
    presenceEvents: true,
    collapsed: { groups: false, online: false, offline: false, archive: true }
  },
  network: null,
  peers: [],
  groups: [],
  archive: [],
  conversations: {},
  unread: {},
  activePeerId: null,
  capabilities: { openAtLogin: false, tray: false },
  appInfo: { version: '', electron: '', platform: '', arch: '' },
  paths: { logDir: '', configFile: '' },
  searchNonce: 0,
  settingsNonce: 0,
  typing: {},
  whatsNewOpen: false
}

function upsertItem(conversations: Record<string, ChatItem[]>, item: ChatItem): Record<string, ChatItem[]> {
  const list = conversations[item.peerId] ?? []
  let index = -1
  // обновляются почти всегда последние элементы (прогресс передачи, статус доставки)
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].id === item.id) {
      index = i
      break
    }
  }
  let next: ChatItem[]
  if (index === -1) {
    // элемент «задним числом» (служебная строка, досланное в общем чате) — на своё место
    // по времени, как в main (store.ts)
    const last = list[list.length - 1]
    const later = last && last.timestamp > item.timestamp ? list.findIndex((other) => other.timestamp > item.timestamp) : -1
    next = later === -1 ? [...list, item] : [...list.slice(0, later), item, ...list.slice(later)]
  } else {
    next = list.slice()
    next[index] = item
  }
  return { ...conversations, [item.peerId]: next }
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'snapshot': {
      const s = action.snapshot
      return {
        ...state,
        ready: true,
        self: s.self,
        settings: s.settings,
        network: s.network,
        peers: s.peers,
        groups: s.groups,
        archive: s.archive,
        conversations: s.conversations,
        unread: s.unread,
        activePeerId: s.activeChatId ?? state.activePeerId,
        capabilities: s.capabilities,
        appInfo: s.appInfo,
        paths: s.paths,
        // открыто вручную из «О программе» — повторный снимок окно не закрывает
        whatsNewOpen: state.whatsNewOpen || s.whatsNew
      }
    }
    case 'peers':
      return { ...state, peers: action.peers }
    case 'groups':
      return { ...state, groups: action.groups }
    case 'archive':
      return { ...state, archive: action.archive }
    case 'item':
      return { ...state, conversations: upsertItem(state.conversations, action.item) }
    case 'unread':
      return { ...state, unread: { ...state.unread, [action.peerId]: action.count } }
    case 'network':
      return { ...state, network: action.network }
    case 'self':
      return { ...state, self: action.self }
    case 'settings':
      return { ...state, settings: action.settings }
    case 'conversations':
      return { ...state, conversations: action.reset.conversations, unread: action.reset.unread }
    case 'select':
      return { ...state, activePeerId: action.peerId }
    case 'whatsNew':
      return { ...state, whatsNewOpen: action.open }
    case 'openSearch':
      return { ...state, searchNonce: state.searchNonce + 1 }
    case 'openSettings':
      return { ...state, settingsNonce: state.settingsNonce + 1 }
    case 'typing':
      return { ...state, typing: { ...state.typing, [action.chatId]: action.names } }
  }
}

const AppContext = createContext<{ state: AppState; dispatch: Dispatch<Action> } | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    const api = window.api
    let snapshotRev: number | null = null
    const buffered: Array<{ rev: number; action: Action }> = []
    const handle = (rev: number, action: Action) => {
      if (snapshotRev === null) buffered.push({ rev, action })
      else if (rev > snapshotRev) dispatch(action)
    }

    const unsubscribe = [
      api.onPeers((peers, rev) => handle(rev, { type: 'peers', peers })),
      api.onGroups((groups, rev) => handle(rev, { type: 'groups', groups })),
      api.onArchive((archive, rev) => handle(rev, { type: 'archive', archive })),
      api.onItem((item, rev) => handle(rev, { type: 'item', item })),
      api.onUnread(({ peerId, count }, rev) => handle(rev, { type: 'unread', peerId, count })),
      api.onNetwork((network, rev) => handle(rev, { type: 'network', network })),
      api.onSelf((self, rev) => handle(rev, { type: 'self', self })),
      api.onSettings((settings, rev) => handle(rev, { type: 'settings', settings })),
      api.onConversations((reset, rev) => handle(rev, { type: 'conversations', reset })),
      // команды, а не состояние — выполняются сразу
      api.onOpenChat((peerId) => dispatch({ type: 'select', peerId })),
      api.onOpenSearch(() => dispatch({ type: 'openSearch' })),
      api.onOpenSettings(() => dispatch({ type: 'openSettings' })),
      api.onTyping(({ chatId, names }) => dispatch({ type: 'typing', chatId, names }))
    ]

    let cancelled = false
    api
      .getSnapshot()
      .then((snapshot) => {
        if (cancelled) return
        snapshotRev = snapshot.rev
        dispatch({ type: 'snapshot', snapshot })
        for (const entry of buffered) if (entry.rev > snapshot.rev) dispatch(entry.action)
        buffered.length = 0
      })
      .catch((err) => console.error('getSnapshot failed', err))

    return () => {
      cancelled = true
      unsubscribe.forEach((off) => off())
    }
  }, [])

  const value = useMemo(() => ({ state, dispatch }), [state])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppStateProvider')
  return ctx
}

/** Переводчик для текущего языка интерфейса: t('ключ'), t.plural('members', n) */
export function useT(): Translator {
  const { state } = useApp()
  return useMemo(() => createTranslator(state.settings.language), [state.settings.language])
}
