import { useState, type ReactNode } from 'react'
import { EVERYONE_ID, type ArchivedView, type ChatItem, type GroupView, type NetworkStatus, type PeerView, type SectionId } from '../types'
import { useApp, useT } from '../state'
import type { Translator } from '../i18n'
import { formatTime, lastSeenLabel, platformLabel, statusLabel } from '../format'
import { Avatar } from './Avatar'
import {
  IconChevronDown,
  IconChevronUp,
  IconClose,
  IconGear,
  IconMegaphone,
  IconPin,
  IconPlus,
  IconSearch,
  IconUsers
} from './Icons'
import { StatusPicker } from './StatusPicker'
import appIcon from '../assets/app-icon.png'

const MOD_KEY = window.api.platform === 'darwin' ? '⌘' : 'Ctrl'

const normalize = (value: string) => value.toLowerCase().replace(/ё/g, 'е')

export function UserList({
  onOpenSettings,
  onBroadcast,
  onCreateGroup
}: {
  onOpenSettings: () => void
  onBroadcast: () => void
  onCreateGroup: () => void
}) {
  const { state, dispatch } = useApp()
  const t = useT()
  const [filter, setFilter] = useState('')
  const compact = state.settings.appearance.compact
  const { self, settings } = state

  const query = normalize(filter.trim())
  const matches = (name: string) => !query || normalize(name).includes(query)
  const groups = state.groups.filter((g) => matches(g.name))
  const online = state.peers.filter((p) => p.online && matches(p.name))
  const offline = state.peers.filter((p) => !p.online && matches(p.name))
  const archive = state.archive.filter((a) => matches(a.name))
  const showEveryone = matches(t('everyone.title'))
  const nothingFound =
    query && !showEveryone && !groups.length && !online.length && !offline.length && !archive.length

  const select = (id: string) => dispatch({ type: 'select', peerId: id })
  const toggle = (section: SectionId) =>
    void window.api.updateSettings({ collapsed: { [section]: !settings.collapsed[section] } })

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <div className="brand">
          <img className="brand-mark" src={appIcon} alt="" width={compact ? 24 : 28} height={compact ? 24 : 28} />
          <div className="brand-title">Hallway</div>
          <button
            className="icon-button settings-button"
            onClick={onOpenSettings}
            title={`${t('sidebar.settings')} (${MOD_KEY}+,)`}
            aria-label={t('sidebar.settings')}
          >
            <IconGear size={18} />
          </button>
        </div>

        <div className="profile-card">
          <Avatar name={self.name} id={self.id} size={compact ? 34 : 40} online status={self.status} />
          <div className="profile-body">
            <div className="profile-name" title={self.name}>
              {self.name || t('common.noName')}
            </div>
            <StatusPicker />
          </div>
        </div>

        <label className="peer-search">
          <IconSearch size={14} />
          <input
            placeholder={t('sidebar.searchPlaceholder')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setFilter('')
            }}
          />
          {filter && (
            <button className="peer-search-clear" onClick={() => setFilter('')} aria-label={t('sidebar.clearSearch')}>
              <IconClose size={12} />
            </button>
          )}
        </label>

        <div className="peer-tools">
          <button className="tool-button" onClick={onBroadcast} title={t('sidebar.broadcastHint')}>
            <IconMegaphone size={15} /> {t('sidebar.broadcast')}
          </button>
          <button
            className="tool-button"
            onClick={onCreateGroup}
            disabled={state.peers.length === 0}
            title={t('sidebar.groupHint')}
          >
            <IconUsers size={15} /> {t('sidebar.group')}
          </button>
        </div>
      </header>

      <NetworkBanner network={state.network} />

      <div className="peer-list">
        {showEveryone && (
          <EveryoneRow
            compact={compact}
            typing={(state.typing[EVERYONE_ID] ?? []).length > 0}
            active={state.activePeerId === EVERYONE_ID}
            unread={state.unread[EVERYONE_ID] ?? 0}
            last={lastMessage(state.conversations[EVERYONE_ID])}
            onSelect={() => select(EVERYONE_ID)}
          />
        )}
        {groups.length > 0 && (
          <Section
            id="groups"
            title={t('sidebar.groups')}
            count={groups.length}
            collapsed={settings.collapsed.groups}
            onToggle={toggle}
            action={
              <button
                className="section-action"
                onClick={(e) => {
                  e.stopPropagation()
                  onCreateGroup()
                }}
                title={t('sidebar.createGroup')}
                aria-label={t('sidebar.createGroup')}
              >
                <IconPlus size={13} />
              </button>
            }
          >
            {groups.map((group) => (
              <GroupRow
                key={group.id}
                group={group}
                compact={compact}
                typing={(state.typing[group.id] ?? []).length > 0}
                active={group.id === state.activePeerId}
                unread={state.unread[group.id] ?? 0}
                last={lastMessage(state.conversations[group.id])}
                onSelect={() => select(group.id)}
              />
            ))}
          </Section>
        )}

        <Section
          id="online"
          title={t('sidebar.online')}
          count={online.length}
          collapsed={settings.collapsed.online}
          onToggle={toggle}
          aside={online.length === 0 && !query ? t('sidebar.searching') : undefined}
        >
          {online.map((peer) => (
            <PeerRow
              key={peer.id}
              peer={peer}
              compact={compact}
              typing={(state.typing[peer.id] ?? []).length > 0}
              active={peer.id === state.activePeerId}
              unread={state.unread[peer.id] ?? 0}
              last={lastMessage(state.conversations[peer.id])}
              onSelect={() => select(peer.id)}
            />
          ))}
        </Section>

        {offline.length > 0 && (
          <Section
            id="offline"
            title={t('sidebar.offline')}
            count={offline.length}
            collapsed={settings.collapsed.offline}
            onToggle={toggle}
          >
            {offline.map((peer) => (
              <PeerRow
                key={peer.id}
                peer={peer}
                compact={compact}
                typing={false}
                active={peer.id === state.activePeerId}
                unread={state.unread[peer.id] ?? 0}
                last={lastMessage(state.conversations[peer.id])}
                onSelect={() => select(peer.id)}
              />
            ))}
          </Section>
        )}

        {archive.length > 0 && (
          <Section
            id="archive"
            title={t('archive.section')}
            count={archive.length}
            collapsed={settings.collapsed.archive}
            onToggle={toggle}
          >
            {archive.map((chat) => (
              <ArchiveRow
                key={chat.id}
                chat={chat}
                compact={compact}
                active={chat.id === state.activePeerId}
                last={lastMessage(state.conversations[chat.id])}
                onSelect={() => select(chat.id)}
              />
            ))}
          </Section>
        )}

        {state.peers.length === 0 && !state.groups.length && (
          <div className="empty-peers">
            <div className="pulse" />
            <p className="empty-title">{t('sidebar.emptyTitle')}</p>
            <p className="empty-hint">{t('sidebar.emptyHint')}</p>
          </div>
        )}
        {nothingFound && <p className="empty-hint peers-not-found">{t('sidebar.notFound')}</p>}
      </div>
    </aside>
  )
}

/** Сворачиваемый раздел списка: заголовок с количеством и содержимое */
function Section({
  id,
  title,
  count,
  collapsed,
  onToggle,
  aside,
  action,
  children
}: {
  id: SectionId
  title: string
  count: number
  collapsed: boolean
  onToggle: (id: SectionId) => void
  aside?: string
  action?: ReactNode
  children: ReactNode
}) {
  const t = useT()
  return (
    <>
      <div
        className="peer-section-title"
        role="button"
        tabIndex={0}
        title={t(collapsed ? 'sidebar.expand' : 'sidebar.collapse')}
        onClick={() => onToggle(id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle(id)
          }
        }}
      >
        <span className="section-caret">{collapsed ? <IconChevronDown size={12} /> : <IconChevronUp size={12} />}</span>
        <span>{title}</span>
        <span className="section-count">{aside ?? count}</span>
        {action}
      </div>
      {!collapsed && children}
    </>
  )
}

/**
 * Последнее сообщение или файл — для превью и времени в списке. Служебные строки
 * («в сети · 9:15») не в счёт: иначе вместо последней фразы было бы пусто, а время
 * менялось бы от каждого входа коллеги.
 */
function lastMessage(items: ChatItem[] | undefined): ChatItem | undefined {
  if (!items) return undefined
  for (let i = items.length - 1; i >= 0; i--) if (items[i].kind !== 'event') return items[i]
  return undefined
}

function itemPreview(t: Translator, last: ChatItem, withAuthor: boolean): string {
  if (last.kind === 'event') return ''
  const prefix =
    last.direction === 'out'
      ? t('sidebar.you')
      : withAuthor && last.authorName
        ? `${last.authorName}: `
        : ''
  return prefix + (last.kind === 'text' ? last.text.replace(/\s+/g, ' ') : t('sidebar.filePreview', { name: last.name }))
}

function GroupRow({
  group,
  compact,
  typing,
  active,
  unread,
  last,
  onSelect
}: {
  group: GroupView
  compact: boolean
  typing: boolean
  active: boolean
  unread: number
  last: ChatItem | undefined
  onSelect: () => void
}) {
  const t = useT()
  const preview = typing
    ? t('sidebar.typing')
    : last && itemPreview(t, last, true)
      ? itemPreview(t, last, true)
      : `${t.plural('members', group.members.length)}${
          group.online > 0 ? `, ${t('sidebar.onlineCount', { n: group.online })}` : ''
        }`

  return (
    <button className={`peer${active ? ' active' : ''}`} onClick={onSelect}>
      <span className="group-avatar" style={{ width: compact ? 32 : 40, height: compact ? 32 : 40 }}>
        <IconUsers size={compact ? 16 : 20} />
      </span>
      <div className="peer-body">
        <div className="peer-line">
          <span className="peer-name">{group.name}</span>
          {last && <span className="peer-time">{formatTime(t.locale, last.timestamp)}</span>}
        </div>
        <div className="peer-line">
          <span className={`peer-preview${typing ? ' typing' : ''}`}>{preview}</span>
          {unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
        </div>
      </div>
    </button>
  )
}

/** «Общий чат» — всегда вверху списка */
function EveryoneRow({
  compact,
  typing,
  active,
  unread,
  last,
  onSelect
}: {
  compact: boolean
  typing: boolean
  active: boolean
  unread: number
  last: ChatItem | undefined
  onSelect: () => void
}) {
  const t = useT()
  const preview = typing
    ? t('sidebar.typing')
    : (last && itemPreview(t, last, true)) || t('everyone.preview')

  return (
    <button className={`peer everyone-row${active ? ' active' : ''}`} onClick={onSelect}>
      <span className="group-avatar everyone-avatar" style={{ width: compact ? 32 : 40, height: compact ? 32 : 40 }}>
        <IconMegaphone size={compact ? 16 : 20} />
      </span>
      <div className="peer-body">
        <div className="peer-line">
          <span className="peer-name">{t('everyone.title')}</span>
          {last && <span className="peer-time">{formatTime(t.locale, last.timestamp)}</span>}
        </div>
        <div className="peer-line">
          <span className={`peer-preview${typing ? ' typing' : ''}`}>{preview}</span>
          {unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
        </div>
      </div>
    </button>
  )
}

function ArchiveRow({
  chat,
  compact,
  active,
  last,
  onSelect
}: {
  chat: ArchivedView
  compact: boolean
  active: boolean
  last: ChatItem | undefined
  onSelect: () => void
}) {
  const t = useT()
  const reason =
    chat.reason === 'left'
      ? t('archive.reasonLeft')
      : chat.reason === 'deleted'
        ? t('archive.reasonDeleted')
        : t('archive.reasonHidden')
  const preview = last && itemPreview(t, last, chat.kind === 'group') ? itemPreview(t, last, chat.kind === 'group') : reason

  return (
    <button className={`peer offline${active ? ' active' : ''}`} onClick={onSelect}>
      {chat.kind === 'group' ? (
        <span className="group-avatar muted" style={{ width: compact ? 32 : 40, height: compact ? 32 : 40 }}>
          <IconUsers size={compact ? 16 : 20} />
        </span>
      ) : (
        <Avatar name={chat.name} id={chat.id} size={compact ? 32 : 40} online={false} />
      )}
      <div className="peer-body">
        <div className="peer-line">
          <span className="peer-name">{chat.name}</span>
          {last && <span className="peer-time">{formatTime(t.locale, last.timestamp)}</span>}
        </div>
        <div className="peer-line">
          <span className="peer-preview">{preview}</span>
        </div>
      </div>
    </button>
  )
}

function PeerRow({
  peer,
  compact,
  typing,
  active,
  unread,
  last,
  onSelect
}: {
  peer: PeerView
  compact: boolean
  typing: boolean
  active: boolean
  unread: number
  last: ChatItem | undefined
  onSelect: () => void
}) {
  const t = useT()
  let preview: string
  const lastPreview = last ? itemPreview(t, last, false) : ''
  if (typing && peer.online) {
    preview = t('sidebar.typing')
  } else if (lastPreview) {
    preview = lastPreview
  } else if (!peer.online) {
    preview = peer.lastSeenAt ? lastSeenLabel(t, peer.lastSeenAt) : t('common.notInNetwork')
  } else if (peer.status !== 'online') {
    preview = statusLabel(t, peer.status).toLowerCase()
  } else {
    preview = platformLabel(t, peer.platform)
  }

  return (
    <button className={`peer${active ? ' active' : ''}${peer.online ? '' : ' offline'}`} onClick={onSelect}>
      <Avatar name={peer.name} id={peer.id} size={compact ? 32 : 40} online={peer.online} status={peer.status} />
      <div className="peer-body">
        <div className="peer-line">
          <span className="peer-name">
            {peer.pinned && (
              <span className="peer-pin" title={t('sidebar.pinned')}>
                <IconPin size={11} />
              </span>
            )}
            {peer.name || t('common.peer')}
          </span>
          {last && <span className="peer-time">{formatTime(t.locale, last.timestamp)}</span>}
        </div>
        <div className="peer-line">
          <span className={`peer-preview${typing && peer.online ? ' typing' : ''}`}>{preview}</span>
          {unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
        </div>
      </div>
    </button>
  )
}

function NetworkBanner({ network }: { network: NetworkStatus | null }) {
  const t = useT()
  if (!network) return null
  if (network.error) return <div className="banner">{network.error}</div>
  if (network.addresses.length === 0) {
    return <div className="banner banner-warning">{t('sidebar.noNetwork')}</div>
  }
  return null
}
