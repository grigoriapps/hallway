import { useEffect, useMemo, useState } from 'react'
import { useApp, useT } from '../state'
import { errorMessage } from '../format'
import { MAX_GROUP_MEMBERS, type PeerView } from '../types'
import { Avatar } from './Avatar'
import { IconCheck, IconClose, IconSearch, IconUsers } from './Icons'

const normalize = (value: string) => value.toLowerCase().replace(/ё/g, 'е')

/** Переименование группы: новое название разъезжается по участникам вместе с анонсом состава */
export function RenameGroupDialog({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const { state } = useApp()
  const t = useT()
  const group = state.groups.find((g) => g.id === groupId)
  const [name, setName] = useState(group?.name ?? '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!group) return null

  const save = async () => {
    const value = name.trim()
    if (!value || value === group.name) {
      onClose()
      return
    }
    try {
      const result = await window.api.renameGroup(groupId, value)
      if (result.ok) onClose()
      else setError(result.error ?? t('group.renameFailed'))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal group-modal" role="dialog" aria-modal="true" aria-label={t('group.renameTitle')}>
        <div className="modal-header">
          <h2>
            <IconUsers size={18} /> {t('group.renameTitle')}
          </h2>
          <button className="icon-button" onClick={onClose} aria-label={t('common.close')}>
            <IconClose />
          </button>
        </div>
        <div className="section">
          <input
            className="input"
            autoFocus
            maxLength={40}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
            }}
          />
          {error && <div className="form-error">{error}</div>}
          <p className="hint">{t('group.renameHint')}</p>
          <div className="modal-actions">
            <button className="btn" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="btn primary" disabled={!name.trim()} onClick={() => void save()}>
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Добавление участников в существующую группу */
export function AddMembersDialog({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const { state } = useApp()
  const t = useT()
  const group = state.groups.find((g) => g.id === groupId)
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const query = normalize(filter.trim())
  const candidates = useMemo(() => {
    const known = new Set(group?.members.map((m) => m.id) ?? [])
    const list = state.peers.filter((p) => !known.has(p.id) && (!query || normalize(p.name).includes(query)))
    return [...list].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name))
  }, [state.peers, group, query])

  if (!group) return null

  const add = async () => {
    if (!selected.length || busy) return
    setBusy(true)
    try {
      const result = await window.api.addGroupMembers(groupId, selected)
      if (result.ok) onClose()
      else {
        setError(result.error ?? t('group.addFailed'))
        setBusy(false)
      }
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal group-modal" role="dialog" aria-modal="true" aria-label={t('group.addMembers')}>
        <div className="modal-header">
          <h2>
            <IconUsers size={18} /> {t('group.addTitle', { name: group.name })}
          </h2>
          <button className="icon-button" onClick={onClose} aria-label={t('common.close')}>
            <IconClose />
          </button>
        </div>
        <div className="section">
          <label className="peer-search group-search">
            <IconSearch size={14} />
            <input
              placeholder={t('group.searchPeers')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setFilter('')
              }}
            />
          </label>

          <MemberPicker
            candidates={candidates}
            selected={selected}
            emptyText={t('group.addNobody')}
            onToggle={(id) => {
              setError(null)
              setSelected((current) =>
                current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
              )
            }}
          />

          {error && <div className="form-error">{error}</div>}
          <p className="hint">{t('group.addHint')}</p>

          <div className="modal-actions">
            <button className="btn" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="btn primary" disabled={!selected.length || busy} onClick={() => void add()}>
              {t('common.add')}
              {selected.length ? ` (${selected.length})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Список коллег с галочками — общий для создания группы и добавления участников */
function MemberPicker({
  candidates,
  selected,
  emptyText,
  onToggle
}: {
  candidates: PeerView[]
  selected: string[]
  emptyText: string
  onToggle: (id: string) => void
}) {
  const t = useT()
  return (
    <div className="member-list">
      {candidates.length === 0 ? (
        <p className="hint no-margin">{emptyText}</p>
      ) : (
        candidates.map((peer) => {
          const checked = selected.includes(peer.id)
          return (
            <button
              key={peer.id}
              className={`member-row${checked ? ' selected' : ''}`}
              onClick={() => onToggle(peer.id)}
              aria-pressed={checked}
            >
              <Avatar name={peer.name} id={peer.id} size={30} online={peer.online} status={peer.status} />
              <span className="member-name">{peer.name || t('common.peer')}</span>
              {!peer.online && <span className="member-note">{t('common.notInNetwork')}</span>}
              <span className={`member-check${checked ? ' on' : ''}`}>{checked && <IconCheck size={13} />}</span>
            </button>
          )
        })
      )}
    </div>
  )
}

/** Создание группы: название и отметки на коллегах. Сервера нет — состав хранится у участников. */
export function GroupDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (groupId: string) => void }) {
  const { state } = useApp()
  const t = useT()
  const [name, setName] = useState('')
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const query = normalize(filter.trim())
  const candidates = useMemo(() => {
    const list = query ? state.peers.filter((p) => normalize(p.name).includes(query)) : state.peers
    return [...list].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name))
  }, [state.peers, query])

  const toggle = (id: string) => {
    setError(null)
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length >= MAX_GROUP_MEMBERS - 1
          ? current
          : [...current, id]
    )
  }

  const create = async () => {
    if (!selected.length || busy) return
    setBusy(true)
    try {
      const result = await window.api.createGroup(name.trim() || t('group.untitled'), selected)
      if (result.ok && result.id) onCreated(result.id)
      else {
        setError(result.error ?? t('group.createFailed'))
        setBusy(false)
      }
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const offlineSelected = selected.filter((id) => !state.peers.find((p) => p.id === id)?.online).length

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal group-modal" role="dialog" aria-modal="true" aria-label={t('group.newTitle')}>
        <div className="modal-header">
          <h2>
            <IconUsers size={18} /> {t('group.newTitle')}
          </h2>
          <button className="icon-button" onClick={onClose} aria-label={t('common.close')}>
            <IconClose />
          </button>
        </div>
        <div className="section">
          <input
            className="input"
            autoFocus
            maxLength={40}
            placeholder={t('group.namePlaceholder')}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && selected.length) void create()
            }}
          />

          <label className="peer-search group-search">
            <IconSearch size={14} />
            <input
              placeholder={t('group.searchPeers')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setFilter('')
              }}
            />
          </label>

          <MemberPicker
            candidates={candidates}
            selected={selected}
            emptyText={t('group.noPeers')}
            onToggle={toggle}
          />

          {error && <div className="form-error">{error}</div>}
          <p className="hint">
            {t('group.hint')}
            {offlineSelected > 0 && t('group.offlineHint')}
          </p>

          <div className="modal-actions">
            <button className="btn" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button className="btn primary" disabled={!selected.length || busy} onClick={() => void create()}>
              {t('common.create')}
              {selected.length ? ` (${selected.length})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
