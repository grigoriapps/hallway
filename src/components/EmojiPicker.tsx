import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { DEFAULT_RECENT, EMOJI_CATEGORIES } from '../emoji-data'
import { useT } from '../state'
import { IconClock } from './Icons'

const RECENT_KEY = 'hallway.recentEmoji'
const RECENT_LIMIT = 32

function loadRecent(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? 'null')
    if (Array.isArray(value) && value.length && value.every((e) => typeof e === 'string')) {
      return value.slice(0, RECENT_LIMIT)
    }
  } catch {
    // повреждённое значение — начинаем с популярных
  }
  return DEFAULT_RECENT
}

function saveRecent(emoji: string): void {
  try {
    const next = [emoji, ...loadRecent().filter((e) => e !== emoji)].slice(0, RECENT_LIMIT)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // localStorage недоступен — не критично
  }
}

interface Props {
  /** кнопка, открывающая панель: клик по ней не должен считаться «кликом снаружи» */
  anchorRef: RefObject<HTMLElement | null>
  onSelect: (emoji: string) => void
  onClose: () => void
}

export function EmojiPicker({ anchorRef, onSelect, onClose }: Props) {
  const t = useT()
  // «Часто используемые» фиксируем на момент открытия: если пересортировывать их на лету,
  // повторный клик в то же место вставит уже другой смайлик
  const [recent] = useState(loadRecent)
  const sections = useMemo(
    () => [
      { id: 'recent', title: t('emoji.recent'), icon: '', emojis: recent },
      ...EMOJI_CATEGORIES.map((c) => ({ id: c.id, title: t(c.titleKey), icon: c.icon, emojis: c.emojis }))
    ],
    [recent, t]
  )
  const [active, setActive] = useState('recent')
  const rootRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const sectionEls = useRef(new Map<string, HTMLElement>())
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [anchorRef])

  const onScroll = () => {
    const body = bodyRef.current
    if (!body) return
    let current = sections[0].id
    for (const section of sections) {
      const el = sectionEls.current.get(section.id)
      if (el && el.offsetTop <= body.scrollTop + 8) current = section.id
    }
    setActive(current)
  }

  const jumpTo = (id: string) => {
    const body = bodyRef.current
    const el = sectionEls.current.get(id)
    if (body && el) body.scrollTop = el.offsetTop
    setActive(id)
  }

  const pick = (emoji: string) => {
    saveRecent(emoji)
    onSelect(emoji)
  }

  return (
    <div
      className="emoji-picker"
      ref={rootRef}
      role="dialog"
      aria-label={t('chat.emoji')}
      // не забираем фокус у поля ввода: курсор и выделение в нём сохраняются
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="emoji-tabs">
        {sections.map((section) => (
          <button
            key={section.id}
            className={`emoji-tab${active === section.id ? ' active' : ''}`}
            title={section.title}
            aria-label={section.title}
            onClick={() => jumpTo(section.id)}
          >
            {section.id === 'recent' ? <IconClock size={17} /> : section.icon}
          </button>
        ))}
      </div>
      <div className="emoji-body" ref={bodyRef} onScroll={onScroll}>
        {sections.map((section) => (
          <section
            key={section.id}
            ref={(el) => {
              if (el) sectionEls.current.set(section.id, el)
              else sectionEls.current.delete(section.id)
            }}
          >
            <div className="emoji-section-title">{section.title}</div>
            <div className="emoji-grid">
              {section.emojis.map((emoji) => (
                <button key={emoji} className="emoji-cell" aria-label={emoji} onClick={() => pick(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
