import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createTranslator, type Translator } from '../i18n'
import { applyAppearance } from '../appearance'
import { colorFor, formatTime, initials } from '../format'
import { IconClose, IconPaperclip, IconSend, IconUsers } from '../components/Icons'
import type { PopupCard, PopupState } from '../types'

// Окошко нового сообщения: карточки непрочитанных переписок с быстрым ответом.
// Всё состояние — в главном процессе; здесь только черновики ответов и порядок карточек.

const api = window.popupApi

/**
 * Порядок карточек не прыгает: новые переписки — сверху, уже показанные остаются на местах.
 * Иначе новое сообщение в другой переписке переставило бы карточку, в которой человек
 * пишет ответ, и поле ввода потеряло бы фокус.
 */
function stableOrder(previous: readonly string[], cards: readonly PopupCard[]): PopupCard[] {
  const byId = new Map(cards.map((card) => [card.chatId, card]))
  const fresh = cards.filter((card) => !previous.includes(card.chatId))
  const kept = previous.map((id) => byId.get(id)).filter((card): card is PopupCard => !!card)
  return [...fresh, ...kept]
}

export function Popup() {
  const [state, setState] = useState<PopupState | null>(null)
  const [order, setOrder] = useState<string[]>([])
  const [shake, setShake] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const offState = api.onState((next) => {
      setState(next)
      setOrder((previous) => stableOrder(previous, next.cards).map((card) => card.chatId))
    })
    const offAttention = api.onAttention(() => {
      setShake(false)
      requestAnimationFrame(() => setShake(true))
    })
    // окошко спрятали — в следующий раз порядок снова «новые сверху»
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') setOrder([])
    }
    document.addEventListener('visibilitychange', onVisibility)
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') api.close()
    }
    window.addEventListener('keydown', onKey)
    api.ready()
    return () => {
      offState()
      offAttention()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    if (state) applyAppearance(state.appearance)
  }, [state])

  // Окно подстраивается под высоту содержимого. Высоту сообщаем после каждого обновления,
  // даже если она не изменилась: по этому сообщению спрятанное окошко и показывается.
  useLayoutEffect(() => {
    const root = rootRef.current
    if (root && state) api.resize(root.getBoundingClientRect().height)
  }, [state])
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    // текст в поле ответа вырос на строку, загрузился шрифт — высота меняется без нового состояния
    const observer = new ResizeObserver(() => api.resize(root.getBoundingClientRect().height))
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  const t = useMemo(() => createTranslator(state?.locale ?? 'ru'), [state?.locale])
  useEffect(() => {
    document.documentElement.lang = t.locale
    document.title = t('popup.windowTitle')
  }, [t])

  if (!state) return <div ref={rootRef} />
  const cards = stableOrder(order, state.cards)

  return (
    <div ref={rootRef} className={`popup${shake ? ' shake' : ''}`} onAnimationEnd={() => setShake(false)}>
      <header className="popup-header">
        <span className="popup-brand">Hallway</span>
        <button className="popup-close" title={t('common.close')} aria-label={t('common.close')} onClick={() => api.close()}>
          <IconClose size={14} />
        </button>
      </header>
      <div className="popup-cards">
        {cards.map((card) => (
          <Card key={card.chatId} card={card} state={state} t={t} />
        ))}
      </div>
      {state.moreChats > 0 && (
        <footer className="popup-footer">
          <span>{t('popup.moreChats', { n: state.moreChats })}</span>
          <button className="popup-link" onClick={() => api.openApp()}>
            {t('popup.openApp')}
          </button>
        </footer>
      )}
    </div>
  )
}

function CardAvatar({ card }: { card: PopupCard }) {
  if (card.kind === 'peer') {
    return (
      <span className="popup-avatar" style={{ background: colorFor(card.chatId) }} aria-hidden="true">
        {initials(card.title)}
      </span>
    )
  }
  return (
    <span className={`popup-avatar popup-avatar-group${card.kind === 'everyone' ? ' everyone' : ''}`} aria-hidden="true">
      <IconUsers size={16} />
    </span>
  )
}

function Card({ card, state, t }: { card: PopupCard; state: PopupState; t: Translator }) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const last = card.messages[card.messages.length - 1]

  // поле растёт вместе с текстом, до четырёх строк
  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 96)}px`
  }, [draft])

  const send = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setError('')
    try {
      const result = await api.reply(card.chatId, text)
      if (result.ok) setDraft('')
      else if (result.error) setError(result.error)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    const mod = event.metaKey || event.ctrlKey
    const wantsSend = state.sendKey === 'enter' ? !event.shiftKey && !mod : mod
    if (!wantsSend) return
    event.preventDefault()
    void send()
  }

  // щёлкнули в поле ответа, а клавиатура не пришла — попросить её (см. wantKeyboard в main);
  // только из поля: крестик и кнопки клавиатура не нужна
  const askKeyboard = () => {
    setTimeout(() => {
      if (!document.hasFocus()) api.wantKeyboard()
    }, 80)
  }

  const modKey = api.platform === 'darwin' ? '⌘' : 'Ctrl'
  const sendHint = state.sendKey === 'enter' ? t('popup.sendHintEnter') : t('popup.sendHintMod', { key: modKey })

  return (
    <section className="popup-card" aria-label={card.title}>
      <div className="popup-card-head">
        <CardAvatar card={card} />
        <span className="popup-title">{card.title}</span>
        {last && <span className="popup-time">{formatTime(state.locale, last.timestamp)}</span>}
      </div>
      {card.more > 0 && <div className="popup-more">{t('popup.moreMessages', { n: card.more })}</div>}
      <ul className="popup-messages">
        {card.messages.map((message) => (
          <li key={message.id} className="popup-message">
            {message.author && <span className="popup-author">{message.author}: </span>}
            {message.file && (
              <span className="popup-file-icon">
                <IconPaperclip size={12} />
              </span>
            )}
            {message.text}
          </li>
        ))}
      </ul>
      <div className="popup-reply">
        <textarea
          ref={inputRef}
          className="popup-input"
          rows={1}
          value={draft}
          placeholder={card.kind === 'everyone' ? t('popup.replyEveryonePlaceholder') : t('popup.replyPlaceholder')}
          title={sendHint}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onMouseDown={askKeyboard}
          spellCheck
        />
        <button
          className="popup-send"
          title={t('common.send')}
          aria-label={t('common.send')}
          disabled={!draft.trim() || sending}
          onClick={() => void send()}
        >
          <IconSend size={15} />
        </button>
      </div>
      {error && <div className="popup-error">{error}</div>}
      <div className="popup-actions">
        <button className="popup-btn primary" onClick={() => api.open(card.chatId)}>
          {t('popup.open')}
        </button>
        <button className="popup-btn" title={t('popup.markReadHint')} onClick={() => api.markRead(card.chatId)}>
          {t('popup.markRead')}
        </button>
      </div>
    </section>
  )
}
