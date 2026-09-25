import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IPC, type LanApi, type Listener, type RevEnvelope } from '../src/types'

// Мост main ↔ renderer. Renderer работает с contextIsolation + sandbox и не имеет доступа
// к Node: всё, что ему можно, — это методы ниже.

function subscribe<T>(channel: string) {
  return (callback: Listener<T>) => {
    const handler = (_event: IpcRendererEvent, envelope: RevEnvelope<T>) => callback(envelope.data, envelope.rev)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  }
}

const api: LanApi = {
  platform: process.platform,
  getSnapshot: () => ipcRenderer.invoke(IPC.getSnapshot),
  listColleagues: () => ipcRenderer.invoke(IPC.listColleagues),
  openLogs: () => ipcRenderer.invoke(IPC.openLogs),
  copyText: (text) => ipcRenderer.invoke(IPC.copyText, text),

  setName: (name) => ipcRenderer.invoke(IPC.setName, name),
  chooseDownloadDir: () => ipcRenderer.invoke(IPC.chooseDownloadDir),
  addManualHost: (host) => ipcRenderer.invoke(IPC.addManualHost, host),
  removeManualHost: (host) => ipcRenderer.invoke(IPC.removeManualHost, host),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.updateSettings, patch),
  setStatus: (status) => ipcRenderer.invoke(IPC.setStatus, status),
  clearHistory: (peerId) => ipcRenderer.invoke(IPC.clearHistory, peerId),
  showChatMenu: (peerId) => ipcRenderer.invoke(IPC.showChatMenu, peerId),
  setPinned: (peerId, pinned) => ipcRenderer.invoke(IPC.setPinned, peerId, pinned),

  createGroup: (name, memberIds) => ipcRenderer.invoke(IPC.createGroup, name, memberIds),
  renameGroup: (groupId, name) => ipcRenderer.invoke(IPC.renameGroup, groupId, name),
  leaveGroup: (groupId) => ipcRenderer.invoke(IPC.leaveGroup, groupId),
  deleteGroup: (groupId) => ipcRenderer.invoke(IPC.deleteGroup, groupId),
  addGroupMembers: (groupId, memberIds) => ipcRenderer.invoke(IPC.addGroupMembers, groupId, memberIds),
  removeGroupMember: (groupId, memberId) => ipcRenderer.invoke(IPC.removeGroupMember, groupId, memberId),
  showGroupMenu: (groupId) => ipcRenderer.invoke(IPC.showGroupMenu, groupId),
  showMembers: (groupId) => ipcRenderer.invoke(IPC.showMembers, groupId),

  archiveChat: (chatId) => ipcRenderer.invoke(IPC.archiveChat, chatId),
  unarchiveChat: (chatId) => ipcRenderer.invoke(IPC.unarchiveChat, chatId),
  deleteArchived: (chatId) => ipcRenderer.invoke(IPC.deleteArchived, chatId),

  sendText: (peerId, text, replyTo) => ipcRenderer.invoke(IPC.sendText, peerId, text, replyTo),
  sendTyping: (peerId, active) => ipcRenderer.send(IPC.sendTyping, peerId, active),
  retryText: (peerId, itemId) => ipcRenderer.invoke(IPC.retryText, peerId, itemId),
  cancelSend: (chatId, itemId) => ipcRenderer.invoke(IPC.cancelSend, chatId, itemId),
  dismissWhatsNew: () => ipcRenderer.send(IPC.dismissWhatsNew),
  markRead: (peerId) => ipcRenderer.send(IPC.markRead, peerId),
  setActiveChat: (peerId) => ipcRenderer.send(IPC.setActiveChat, peerId),

  pickAndSendFiles: (peerId) => ipcRenderer.invoke(IPC.pickFiles, peerId),
  sendFilePaths: (peerId, paths) => ipcRenderer.invoke(IPC.sendFiles, peerId, paths),
  sendFileData: (peerId, name, data) => ipcRenderer.invoke(IPC.sendFileData, peerId, name, data),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  acceptFile: (fileId) => ipcRenderer.invoke(IPC.acceptFile, fileId),
  declineFile: (fileId) => ipcRenderer.invoke(IPC.declineFile, fileId),
  cancelFile: (fileId) => ipcRenderer.invoke(IPC.cancelFile, fileId),
  retryFile: (fileId) => ipcRenderer.invoke(IPC.retryFile, fileId),
  openFile: (fileId) => ipcRenderer.invoke(IPC.openFile, fileId),
  showFileInFolder: (fileId) => ipcRenderer.invoke(IPC.showFile, fileId),

  onPeers: subscribe(IPC.evPeers),
  onGroups: subscribe(IPC.evGroups),
  onArchive: subscribe(IPC.evArchive),
  onItem: subscribe(IPC.evItem),
  onUnread: subscribe(IPC.evUnread),
  onNetwork: subscribe(IPC.evNetwork),
  onSelf: subscribe(IPC.evSelf),
  onSettings: subscribe(IPC.evSettings),
  onOpenChat: subscribe(IPC.evOpenChat),
  onSound: subscribe(IPC.evSound),
  onConversations: subscribe(IPC.evConversations),
  onOpenSearch: subscribe(IPC.evOpenSearch),
  onOpenSettings: subscribe(IPC.evOpenSettings),
  onRenameGroup: subscribe(IPC.evRenameGroup),
  onAddMembers: subscribe(IPC.evAddMembers),
  onTyping: subscribe(IPC.evTyping)
}

contextBridge.exposeInMainWorld('api', api)
