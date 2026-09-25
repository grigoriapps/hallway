import type { PresenceStatus } from './types'
import { LOCALE_TAGS, type Locale, type TranslateFn } from './i18n'

/** «1.1.0» → «1.1»: нулевой патч в номере версии смотрится лишним */
export function displayVersion(version: string): string {
  return version.replace(/^(\d+\.\d+)\.0$/, '$1')
}

export function formatBytes(t: TranslateFn, bytes: number): string {
  if (bytes < 1024) return `${bytes} ${t('size.b')}`
  const units = [t('size.kb'), t('size.mb'), t('size.gb'), t('size.tb')]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}

export function formatSpeed(t: TranslateFn, bytesPerSecond: number): string {
  return t('size.perSecond', { value: formatBytes(t, Math.max(0, Math.round(bytesPerSecond))) })
}

export function formatTime(locale: Locale, timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(LOCALE_TAGS[locale], { hour: '2-digit', minute: '2-digit' })
}

export function isSameDay(a: number, b: number): boolean {
  const x = new Date(a)
  const y = new Date(b)
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
}

export function formatDay(t: TranslateFn, locale: Locale, timestamp: number): string {
  const now = Date.now()
  if (isSameDay(timestamp, now)) return t('date.today')
  if (isSameDay(timestamp, now - 86400000)) return t('date.yesterday')
  const date = new Date(timestamp)
  return date.toLocaleDateString(LOCALE_TAGS[locale], {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
  })
}

/** «был в сети в 18:03», а если это другой день — с датой */
export function lastSeenLabel(t: TranslateFn & { locale: Locale }, at: number): string {
  const time = formatTime(t.locale, at)
  if (isSameDay(at, Date.now())) return t('peer.lastSeen', { time })
  const date = new Date(at).toLocaleDateString(LOCALE_TAGS[t.locale], { day: 'numeric', month: 'short' })
  return t('peer.lastSeenDay', { date, time })
}

/** «в сети с 7:49», «отошёл с 12:26»; если это было не сегодня — с датой */
export function sinceLabel(t: TranslateFn & { locale: Locale }, statusText: string, at: number): string {
  const time = formatTime(t.locale, at)
  if (isSameDay(at, Date.now())) return t('peer.since', { status: statusText, time })
  const date = new Date(at).toLocaleDateString(LOCALE_TAGS[t.locale], { day: 'numeric', month: 'short' })
  return t('peer.sinceDay', { status: statusText, date, time })
}

/**
 * Сравнение версий «1.3.0» и «1.12.1»: <0 — a старее, >0 — новее, 0 — та же.
 * null — клиент до 1.3, который версию не сообщает: он старее любой известной.
 */
export function compareVersions(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return -1
  if (b === null) return 1
  const pa = a.split(/[-+]/)[0].split('.').map(Number)
  const pb = b.split(/[-+]/)[0].split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((p) => Array.from(p)[0] ?? '')
  return letters.join('').toUpperCase() || '?'
}

const PALETTE = ['#5b7cfa', '#e0795b', '#35a57c', '#a574d8', '#d49a2a', '#3a9fd0', '#d8628f', '#64839a']

export function colorFor(id: string): string {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

export function platformLabel(t: TranslateFn, platform: string): string {
  switch (platform) {
    case 'darwin':
      return t('platform.darwin')
    case 'win32':
      return t('platform.win32')
    case 'linux':
      return t('platform.linux')
    default:
      return platform
  }
}

export function statusLabel(t: TranslateFn, status: PresenceStatus): string {
  switch (status) {
    case 'online':
      return t('status.online')
    case 'away':
      return t('status.away')
    case 'dnd':
      return t('status.dnd')
  }
}

/** Шапка чата: «в сети с 7:49», «отошёл с 12:26»; если время неизвестно — просто статус */
export function presenceSubtitle(
  t: TranslateFn & { locale: Locale },
  peer: { status: PresenceStatus; onlineSince: number | null; statusSince: number | null }
): string {
  const text = statusLabel(t, peer.status).toLowerCase()
  const since = peer.status === 'online' ? peer.onlineSince : peer.statusSince
  return since ? sinceLabel(t, text, since) : text
}

export function fileExtension(name: string): string {
  const match = /\.([^.]{1,5})$/.exec(name)
  return match ? match[1].toUpperCase() : 'FILE'
}

/** Ошибка из ipcRenderer.invoke приходит с префиксом "Error invoking remote method…" */
export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[‍️⃣\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}])+$/u
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Сколько смайликов в сообщении, если оно состоит только из 1–3 смайликов (иначе 0) */
export function bigEmojiCount(text: string): number {
  const compact = text.replace(/\s+/g, '')
  if (!compact || compact.length > 48 || !EMOJI_ONLY.test(compact)) return 0
  const count = Array.from(graphemes.segment(compact)).length
  return count <= 3 ? count : 0
}

export function revealLabel(t: TranslateFn, platform: string): string {
  return t(platform === 'darwin' ? 'file.showInFinder' : 'file.showInFolder')
}
