// Разбор текста сообщений без React: ссылки и поиск. Покрыто модульными тестами.

export interface LinkRange {
  start: number
  end: number
  href: string
}

const LINK_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'«»]+/gi

export function findLinks(text: string): LinkRange[] {
  const links: LinkRange[] = []
  for (const match of text.matchAll(LINK_RE)) {
    let url = match[0]
    // пунктуация в конце обычно не часть ссылки: «см. https://site.ru/page.»
    url = url.replace(/[.,!?;:]+$/, '')
    if (url.endsWith(')') && !url.includes('(')) url = url.slice(0, -1)
    if (url.length < 5) continue
    const start = match.index ?? 0
    links.push({ start, end: start + url.length, href: /^www\./i.test(url) ? `https://${url}` : url })
  }
  return links
}

function normalizeForSearch(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е')
}

/** Позиции всех вхождений запроса: без учёта регистра, «ё» = «е» */
export function findOccurrences(text: string, query: string): Array<[number, number]> {
  const needle = normalizeForSearch(query)
  const haystack = normalizeForSearch(text)
  // редкие символы меняют длину при смене регистра — тогда позиции не совпадут, пропускаем
  if (!needle || haystack.length !== text.length) return []
  const result: Array<[number, number]> = []
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) {
    result.push([i, i + needle.length])
  }
  return result
}
