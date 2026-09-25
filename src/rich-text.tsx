import { Fragment, type ReactNode } from 'react'
import { findLinks } from './text-utils'

export interface Highlight {
  start: number
  end: number
  current: boolean
}

/** Текст с кликабельными ссылками и подсветкой найденного */
export function RichText({
  text,
  highlights = [],
  linkify = true
}: {
  text: string
  highlights?: Highlight[]
  linkify?: boolean
}) {
  const links = linkify ? findLinks(text) : []
  if (!links.length && !highlights.length) return <>{text}</>

  const cuts = new Set<number>([0, text.length])
  for (const range of [...links, ...highlights]) {
    cuts.add(range.start)
    cuts.add(range.end)
  }
  const points = [...cuts].sort((a, b) => a - b)

  const segment = (start: number, end: number, key: string) => {
    const highlight = highlights.find((h) => start >= h.start && end <= h.end)
    const value = text.slice(start, end)
    return highlight ? (
      <mark key={key} className={highlight.current ? 'current' : undefined}>
        {value}
      </mark>
    ) : (
      <Fragment key={key}>{value}</Fragment>
    )
  }

  const nodes: ReactNode[] = []
  for (let i = 0; i < points.length - 1; ) {
    const start = points[i]
    const link = links.find((l) => start >= l.start && start < l.end)
    if (!link) {
      nodes.push(segment(start, points[i + 1], `s${i}`))
      i++
      continue
    }
    const children: ReactNode[] = []
    while (i < points.length - 1 && points[i + 1] <= link.end) {
      children.push(segment(points[i], points[i + 1], `s${i}`))
      i++
    }
    nodes.push(
      <a
        key={`l${link.start}`}
        href={link.href}
        onClick={(event) => {
          event.preventDefault()
          // main откроет ссылку во внешнем браузере
          window.open(link.href, '_blank')
        }}
      >
        {children}
      </a>
    )
  }
  return <>{nodes}</>
}
