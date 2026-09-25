import type { AppearanceSettings, ChatBackgroundId, FontId, HistoryRetention, ThemeId } from './types'
import type { MessageKey, TranslateFn } from './i18n'

const SYSTEM_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, Roboto, 'Helvetica Neue', Arial, sans-serif"

export interface ThemeColors {
  bg: string
  sidebar: string
  accent: string
  bubble: string
}

/** Подписи и цвета для превью в настройках; сами темы — CSS-переменные в styles.css */
export const THEME_INFO: Record<ThemeId, { colors: ThemeColors }> = {
  system: { colors: { bg: '#ffffff', sidebar: '#f6f7f9', accent: '#3b6cf6', bubble: '#f0f2f5' } },
  light: { colors: { bg: '#ffffff', sidebar: '#f6f7f9', accent: '#3b6cf6', bubble: '#f0f2f5' } },
  dark: { colors: { bg: '#16171b', sidebar: '#1c1d22', accent: '#5a84ff', bubble: '#25272d' } },
  graphite: { colors: { bg: '#1c1c1e', sidebar: '#232325', accent: '#f0883e', bubble: '#2c2c2f' } },
  midnight: { colors: { bg: '#0f1626', sidebar: '#131c30', accent: '#38bdf8', bubble: '#1a2540' } },
  mint: { colors: { bg: '#fbfefc', sidebar: '#eef7f2', accent: '#1f9d63', bubble: '#e4f1e9' } },
  lavender: { colors: { bg: '#fdfcff', sidebar: '#f4f1fb', accent: '#7c5cf0', bubble: '#ece7f8' } },
  sand: { colors: { bg: '#fffdf9', sidebar: '#f7f1e7', accent: '#c26a3d', bubble: '#efe6d7' } }
}

/** Шрифты встроены в приложение (кроме системного) — на Mac и Windows выглядят одинаково */
export const FONT_INFO: Record<FontId, { css: string }> = {
  system: { css: SYSTEM_FONT },
  inter: { css: `'Inter Variable', ${SYSTEM_FONT}` },
  nunito: { css: `'Nunito Variable', ${SYSTEM_FONT}` },
  'pt-serif': { css: "'PT Serif', Georgia, 'Times New Roman', serif" },
  'jetbrains-mono': { css: "'JetBrains Mono Variable', ui-monospace, Consolas, monospace" }
}

/** Подписи берутся из переводов: ключ собирается из id */
export const themeLabel = (t: TranslateFn, id: ThemeId): string => t(`theme.${id}` as MessageKey)
export const fontLabel = (t: TranslateFn, id: FontId): string => t(`font.${id}` as MessageKey)
export const backgroundLabel = (t: TranslateFn, id: ChatBackgroundId): string => t(`background.${id}` as MessageKey)
export const retentionLabel = (t: TranslateFn, id: HistoryRetention): string => t(`settings.retention.${id}` as MessageKey)
/** «сообщения старше …» */
export const retentionAge = (t: TranslateFn, id: Exclude<HistoryRetention, 'none' | 'forever'>): string =>
  t(`settings.age.${id}` as MessageKey)

export function applyAppearance(appearance: AppearanceSettings): void {
  const root = document.documentElement
  root.dataset.theme = appearance.theme
  root.dataset.density = appearance.compact ? 'compact' : 'normal'
  root.style.setProperty('--font-ui', FONT_INFO[appearance.font].css)
  root.style.setProperty('--message-font-size', `${appearance.messageFontSize}px`)
}
