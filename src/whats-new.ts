// «Что нового»: короткий рассказ о новинках версии для пользователей, без технических
// подробностей. Окно показывается один раз — при первом запуске после обновления на версию,
// для которой здесь есть пункты. Мелкие выпуски (1.3.1 после 1.3.0) окно не вызывают:
// ключ — «мажор.минор».

import type { MessageKey } from './i18n'

export type WhatsNewIcon = 'megaphone' | 'paperclip' | 'send' | 'checks' | 'bell'

export interface WhatsNewItem {
  icon: WhatsNewIcon
  title: MessageKey
  text: MessageKey
}

const WHATS_NEW: Record<string, readonly WhatsNewItem[]> = {
  '1.3': [
    { icon: 'megaphone', title: 'whatsNew.1_3.everyone.title', text: 'whatsNew.1_3.everyone.text' },
    { icon: 'paperclip', title: 'whatsNew.1_3.files.title', text: 'whatsNew.1_3.files.text' },
    { icon: 'send', title: 'whatsNew.1_3.delivery.title', text: 'whatsNew.1_3.delivery.text' },
    { icon: 'checks', title: 'whatsNew.1_3.read.title', text: 'whatsNew.1_3.read.text' },
    { icon: 'bell', title: 'whatsNew.1_3.tones.title', text: 'whatsNew.1_3.tones.text' }
  ]
}

/** «1.3.0» → «1.3» */
function majorMinor(version: string): string {
  const [major = '', minor = ''] = version.split('.')
  return `${major}.${minor}`
}

export function whatsNewFor(version: string): readonly WhatsNewItem[] | undefined {
  return WHATS_NEW[majorMinor(version)]
}

/**
 * Показывать ли окно при этом запуске.
 * seen — версия, о которой уже рассказали ('' — не записана: до 1.3 её не запоминали);
 * usedBefore — есть следы прежней работы (имя и история или список коллег): без записанной
 * версии это обновление со старой версии, а не новая установка.
 */
export function shouldShowWhatsNew(opts: { seen: string; current: string; usedBefore: boolean }): boolean {
  if (!whatsNewFor(opts.current)) return false
  if (!opts.seen) return opts.usedBefore
  return majorMinor(opts.seen) !== majorMinor(opts.current) && isOlder(opts.seen, opts.current)
}

function isOlder(a: string, b: string): boolean {
  const pa = a.split(/[-+]/)[0].split('.').map(Number)
  const pb = b.split(/[-+]/)[0].split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff < 0
  }
  return false
}
