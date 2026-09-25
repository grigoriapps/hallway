import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp, useT } from './state'
import { UserList } from './components/UserList'
import { ChatWindow, type ChatTarget } from './components/ChatWindow'
import { SetupScreen } from './components/SetupScreen'
import { SettingsModal } from './components/Settings'
import { AddMembersDialog, GroupDialog, RenameGroupDialog } from './components/GroupDialog'
import { TitleBar } from './components/TitleBar'
import { WhatsNewDialog } from './components/WhatsNewDialog'
import { applyAppearance } from './appearance'
import { playSound } from './sounds'
import { lastSeenLabel, platformLabel, presenceSubtitle } from './format'
import { EVERYONE_ID } from './types'

export default function App() {
  const { state, dispatch } = useApp()
  const t = useT()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [renameGroupId, setRenameGroupId] = useState<string | null>(null)
  const [addMembersId, setAddMembersId] = useState<string | null>(null)
  const { appearance } = state.settings
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  const closeGroup = useCallback(() => setGroupOpen(false), [])
  const closeRename = useCallback(() => setRenameGroupId(null), [])
  const closeAddMembers = useCallback(() => setAddMembersId(null), [])

  useEffect(() => window.api.onSound((event) => playSound(event)), [])
  useEffect(() => window.api.onRenameGroup((groupId) => setRenameGroupId(groupId)), [])
  useEffect(() => window.api.onAddMembers((groupId) => setAddMembersId(groupId)), [])

  useEffect(() => {
    applyAppearance(appearance)
  }, [appearance])

  // язык страницы: по нему экранный диктор выбирает произношение
  useEffect(() => {
    document.documentElement.lang = t.locale
  }, [t.locale])

  useEffect(() => {
    if (state.settingsNonce > 0) setSettingsOpen(true)
  }, [state.settingsNonce])

  useEffect(() => {
    if (state.ready) window.api.setActiveChat(state.activePeerId)
  }, [state.ready, state.activePeerId])

  // Открытый чат: коллега, группа, общий чат или архив — дальше окно чата работает с общей моделью
  const target = useMemo<ChatTarget | null>(() => {
    const id = state.activePeerId
    if (!id) return null
    if (id === EVERYONE_ID) {
      const online = state.peers.filter((p) => p.online).length
      return {
        kind: 'everyone',
        id,
        title: t('everyone.title'),
        // писать можно всегда: кто не в сети, получит сообщение, когда появится
        online: true,
        canSendFiles: true,
        subtitle: t('everyone.subtitle', { n: online })
      }
    }
    const peer = state.peers.find((p) => p.id === id)
    if (peer) {
      return {
        kind: 'peer',
        id: peer.id,
        title: peer.name || t('common.peer'),
        online: peer.online,
        canSendFiles: true,
        subtitle: peer.online
          ? `${presenceSubtitle(t, peer)} · ${platformLabel(t, peer.platform)}`
          : peer.lastSeenAt
            ? lastSeenLabel(t, peer.lastSeenAt)
            : t('common.notInNetwork'),
        peer
      }
    }
    const group = state.groups.find((g) => g.id === id)
    if (group) {
      const others = group.members.length - 1
      return {
        kind: 'group',
        id: group.id,
        title: group.name,
        online: group.online > 0,
        canSendFiles: true,
        subtitle: t('group.subtitle', { total: group.members.length, online: group.online, others }),
        group
      }
    }
    const archived = state.archive.find((a) => a.id === id)
    if (archived) {
      const reason =
        archived.reason === 'left'
          ? t('archive.reasonLeft')
          : archived.reason === 'deleted'
            ? t('archive.reasonDeleted')
            : t('archive.reasonHidden')
      return {
        kind: 'archive',
        id: archived.id,
        title: archived.name,
        online: false,
        canSendFiles: false,
        subtitle: `${t('archive.section').toLowerCase()} · ${reason}`,
        archived
      }
    }
    return null
  }, [state.activePeerId, state.peers, state.groups, state.archive, t])

  const main = state.ready && !!state.self.name
  let content
  if (!state.ready) {
    content = (
      <div className="splash">
        <div className="spinner" />
      </div>
    )
  } else if (!state.self.name) {
    content = <SetupScreen />
  } else {
    content = (
      <div className="layout">
        <UserList
          onOpenSettings={() => setSettingsOpen(true)}
          onBroadcast={() => dispatch({ type: 'select', peerId: EVERYONE_ID })}
          onCreateGroup={() => setGroupOpen(true)}
        />
        <ChatWindow target={target} />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <TitleBar withSidebar={main} />
      <div className="app-body">{content}</div>
      {main && settingsOpen && <SettingsModal onClose={closeSettings} />}
      {main && renameGroupId && <RenameGroupDialog groupId={renameGroupId} onClose={closeRename} />}
      {main && addMembersId && <AddMembersDialog groupId={addMembersId} onClose={closeAddMembers} />}
      {main && state.whatsNewOpen && <WhatsNewDialog />}
      {main && groupOpen && (
        <GroupDialog
          onClose={closeGroup}
          onCreated={(groupId) => {
            setGroupOpen(false)
            dispatch({ type: 'select', peerId: groupId })
          }}
        />
      )}
    </div>
  )
}
