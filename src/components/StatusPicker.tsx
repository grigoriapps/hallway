import { useEffect, useRef, useState } from 'react'
import { PRESENCE_STATUSES, type PresenceStatus } from '../types'
import { statusLabel } from '../format'
import { useApp, useT } from '../state'
import { IconCheck, IconChevronDown } from './Icons'

const HINT_KEYS = { online: 'status.hint.online', away: 'status.hint.away', dnd: 'status.hint.dnd' } as const

/** Кнопка статуса под своим именем в шапке + выпадающее меню */
export function StatusPicker() {
  const { state } = useApp()
  const t = useT()
  const { self, network, settings } = state
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (status: PresenceStatus) => {
    setOpen(false)
    void window.api.setStatus(status)
  }

  const address = network?.addresses[0]?.address

  return (
    <div className="status-picker" ref={rootRef}>
      <button
        className={`status-chip${open ? ' open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('status.pick')}
      >
        <span className={`status-dot status-${self.status}`} />
        <span>
          {statusLabel(t, self.status)}
          {self.statusAuto ? t('status.auto') : ''}
        </span>
        <IconChevronDown size={14} />
      </button>

      {open && (
        <div className="status-menu" role="menu" aria-label={t('status.menuLabel')}>
          {PRESENCE_STATUSES.map((status) => {
            const active = self.status === status
            return (
              <button
                key={status}
                role="menuitemradio"
                aria-checked={active}
                className={`status-option${active ? ' active' : ''}`}
                onClick={() => choose(status)}
              >
                <span className={`status-dot status-${status}`} />
                <span className="status-option-text">
                  <span className="status-option-label">{statusLabel(t, status)}</span>
                  <span className="status-option-hint">{t(HINT_KEYS[status])}</span>
                </span>
                {active && <IconCheck size={16} />}
              </button>
            )
          })}
          <div className="status-menu-footer">
            {self.statusAuto && <div>{t('status.autoExplain')}</div>}
            <div>
              {settings.autoAwayMinutes > 0
                ? t('status.autoAfter', { n: settings.autoAwayMinutes })
                : t('status.autoOff')}
            </div>
            {address && (
              <div>
                {t('status.yourAddress', { address })}
                {network?.tcpPort ? ` · TCP ${network.tcpPort}` : ''}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
