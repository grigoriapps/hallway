import type { LanApi, PopupApi } from './types'

declare global {
  interface Window {
    api: LanApi
    /** только в окошке нового сообщения (popup.html) */
    popupApi: PopupApi
  }
}

export {}
