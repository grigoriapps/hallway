// Что показать в окошке нового сообщения. Чистые функции без Electron — их проверяют тесты.

import type { ChatItem, FileItem, PopupCard, PopupMessage, TextItem } from './types'

/** Сколько переписок помещается в окошко; остальные — строкой «и ещё N» */
export const POPUP_MAX_CARDS = 4
/** Сколько последних сообщений показывать в карточке */
export const POPUP_MAX_MESSAGES = 3
/** Длинное сообщение в окошке обрезается: целиком оно в самой переписке */
export const POPUP_MAX_TEXT = 400

export interface PopupChatInput {
  chatId: string
  kind: PopupCard['kind']
  title: string
  items: readonly ChatItem[]
  /** сколько непрочитанных в переписке */
  unread: number
}

function clip(text: string): string {
  const clean = text.trim()
  return clean.length > POPUP_MAX_TEXT ? clean.slice(0, POPUP_MAX_TEXT).trimEnd() + '…' : clean
}

/**
 * Карточка переписки: последние непрочитанные входящие. Непрочитанные — это последние
 * `unread` входящих сообщений и файлов (счётчик растёт только от них). null — показывать
 * нечего (например, историю успели очистить).
 */
export function popupCard(chat: PopupChatInput): PopupCard | null {
  if (chat.unread <= 0) return null
  const incoming = chat.items.filter(
    (item): item is TextItem | FileItem => (item.kind === 'text' || item.kind === 'file') && item.direction === 'in'
  )
  const unread = incoming.slice(-chat.unread)
  if (!unread.length) return null
  const shown = unread.slice(-POPUP_MAX_MESSAGES)
  const messages: PopupMessage[] = shown.map((item) => ({
    id: item.id,
    text: item.kind === 'text' ? clip(item.text) : item.name,
    file: item.kind === 'file',
    author: chat.kind === 'peer' ? undefined : item.authorName,
    timestamp: item.timestamp
  }))
  return {
    chatId: chat.chatId,
    kind: chat.kind,
    title: chat.title,
    messages,
    more: unread.length - shown.length
  }
}

/** Карточки по порядку переданных переписок (новые сверху), не больше POPUP_MAX_CARDS */
export function popupCards(chats: readonly PopupChatInput[]): { cards: PopupCard[]; moreChats: number } {
  const all = chats.map(popupCard).filter((card): card is PopupCard => card !== null)
  return { cards: all.slice(0, POPUP_MAX_CARDS), moreChats: Math.max(0, all.length - POPUP_MAX_CARDS) }
}
