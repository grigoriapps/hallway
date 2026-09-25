import { useEffect, type ReactNode } from 'react'
import { useApp, useT } from '../state'
import { displayVersion } from '../format'
import { whatsNewFor, type WhatsNewIcon } from '../whats-new'
import appIcon from '../assets/app-icon.png'
import { IconBell, IconChecks, IconClose, IconMegaphone, IconPaperclip, IconSend } from './Icons'

const ICONS: Record<WhatsNewIcon, ReactNode> = {
  megaphone: <IconMegaphone size={17} />,
  paperclip: <IconPaperclip size={17} />,
  send: <IconSend size={16} />,
  checks: <IconChecks size={17} />,
  bell: <IconBell size={17} />
}

/** «Что нового в Hallway 1.3»: один раз после обновления, потом — из «О программе» */
export function WhatsNewDialog() {
  const { state, dispatch } = useApp()
  const t = useT()
  const version = state.appInfo.version
  const items = whatsNewFor(version) ?? []

  const close = () => {
    dispatch({ type: 'whatsNew', open: false })
    window.api.dismissWhatsNew()
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Enter и Esc закрывают окно — фокус на кнопку не ставим, чтобы не было рамки фокуса
      if (event.key === 'Escape' || event.key === 'Enter') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!items.length) return null

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        className="modal whats-new-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('whatsNew.title', { version: displayVersion(version) })}
      >
        <button className="icon-button whats-new-close" onClick={close} aria-label={t('common.close')}>
          <IconClose />
        </button>
        <div className="whats-new-head">
          <img src={appIcon} alt="" width={44} height={44} />
          <div>
            <h2>{t('whatsNew.title', { version: displayVersion(version) })}</h2>
            <p>{t('whatsNew.subtitle')}</p>
          </div>
        </div>
        <ul className="whats-new-list">
          {items.map((item) => (
            <li key={item.title}>
              <span className="whats-new-icon">{ICONS[item.icon]}</span>
              <div>
                <div className="whats-new-title">{t(item.title)}</div>
                <div className="whats-new-text">{t(item.text)}</div>
              </div>
            </li>
          ))}
        </ul>
        <div className="whats-new-footer">
          <span className="hint no-margin">{t('whatsNew.again')}</span>
          <button className="btn primary" onClick={close}>
            {t('whatsNew.ok')}
          </button>
        </div>
      </div>
    </div>
  )
}
