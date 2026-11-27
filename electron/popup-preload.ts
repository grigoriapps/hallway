import { ipcRenderer, type IpcRendererEvent } from 'electron'
import { POPUP_IPC, type PopupApi, type PopupState } from '../src/types'

// Мост окошка нового сообщения: только его действия — ответить, открыть, «прочитано», закрыть.
// Подключается из preload.ts вместо моста главного окна (у окошка свой флаг запуска).

export const popupApi: PopupApi = {
  platform: process.platform,
  onState: (callback) => {
    const handler = (_event: IpcRendererEvent, state: PopupState) => callback(state)
    ipcRenderer.on(POPUP_IPC.state, handler)
    return () => {
      ipcRenderer.removeListener(POPUP_IPC.state, handler)
    }
  },
  onAttention: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(POPUP_IPC.attention, handler)
    return () => {
      ipcRenderer.removeListener(POPUP_IPC.attention, handler)
    }
  },
  ready: () => ipcRenderer.send(POPUP_IPC.ready),
  reply: (chatId, text) => ipcRenderer.invoke(POPUP_IPC.reply, chatId, text),
  open: (chatId) => ipcRenderer.send(POPUP_IPC.open, chatId),
  openApp: () => ipcRenderer.send(POPUP_IPC.openApp),
  markRead: (chatId) => ipcRenderer.send(POPUP_IPC.markRead, chatId),
  close: () => ipcRenderer.send(POPUP_IPC.close),
  resize: (height) => ipcRenderer.send(POPUP_IPC.resize, height),
  wantKeyboard: () => ipcRenderer.send(POPUP_IPC.wantKeyboard)
}
