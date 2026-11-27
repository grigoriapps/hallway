import { app, BrowserWindow, ipcMain, screen, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { POPUP_ARG, POPUP_IPC, type ActionResult, type PopupState } from '../src/types'
import type { ScopedLogger } from './logger'

// Окошко нового сообщения: маленькое окно в правом верхнем углу поверх всех окон, в том числе
// полноэкранных программ. Появляется без фокуса — набираемый в другой программе текст не
// уйдёт в Hallway. Само не исчезает: висит, пока его не закроют или сообщения не прочитают.
// Окно одно на всё время работы: закрытие его прячет, следующий показ — мгновенный.

export const POPUP_WIDTH = 380
/** отступ от края рабочей области экрана */
const MARGIN = 12
/** пока содержимое не измерено — высота наугад */
const INITIAL_HEIGHT = 220
const MIN_HEIGHT = 120
/** не дождались размера от страницы — показываем как есть */
const SHOW_FALLBACK_MS = 600

export interface PopupHandlers {
  reply(chatId: string, text: string): ActionResult
  open(chatId: string): void
  openApp(): void
  markRead(chatId: string): void
  /** пользователь закрыл окошко (крестик, Esc, ⌘W) */
  closed(): void
  /** окошко получило фокус — человек с ним работает */
  focused(): void
}

export interface PopupOptions {
  preload: string
  /** адрес страницы в dev или путь к popup.html в сборке */
  devUrl?: string
  file: string
  backgroundColor: () => string
  title: () => string
  /** масштаб интерфейса из настроек: 1 = 100 % */
  zoom: () => number
  handlers: PopupHandlers
  log: ScopedLogger
}

export class PopupWindow {
  private win: BrowserWindow | null = null
  private loaded = false
  private state: PopupState | null = null
  /** окошко должно быть на экране; покажем, когда страница сообщит свою высоту */
  private wanted = false
  private height = INITIAL_HEIGHT
  private fallback: NodeJS.Timeout | null = null
  /** правый верхний угол, к которому прижато окошко, пока оно на экране */
  private anchor: { right: number; top: number; maxHeight: number } | null = null

  constructor(private readonly options: PopupOptions) {
    const trusted = (event: IpcMainEvent | IpcMainInvokeEvent) =>
      !!this.win && !this.win.isDestroyed() && event.sender === this.win.webContents
    const chatIdOk = (value: unknown): value is string =>
      typeof value === 'string' && value.length > 0 && value.length <= 64 && !!this.hasCard(value)

    ipcMain.on(POPUP_IPC.ready, (event) => {
      if (!trusted(event)) return
      this.loaded = true
      this.push()
      if (this.wanted) this.armFallback()
    })
    ipcMain.handle(POPUP_IPC.reply, (event, chatId: unknown, text: unknown): ActionResult => {
      if (!trusted(event)) throw new Error('untrusted sender')
      if (!chatIdOk(chatId) || typeof text !== 'string') return { ok: false }
      return options.handlers.reply(chatId, text)
    })
    ipcMain.on(POPUP_IPC.open, (event, chatId: unknown) => {
      if (trusted(event) && chatIdOk(chatId)) options.handlers.open(chatId)
    })
    ipcMain.on(POPUP_IPC.openApp, (event) => {
      if (trusted(event)) options.handlers.openApp()
    })
    ipcMain.on(POPUP_IPC.markRead, (event, chatId: unknown) => {
      if (trusted(event) && chatIdOk(chatId)) options.handlers.markRead(chatId)
    })
    ipcMain.on(POPUP_IPC.close, (event) => {
      if (!trusted(event)) return
      this.hide()
      options.handlers.closed()
    })
    ipcMain.on(POPUP_IPC.wantKeyboard, (event) => {
      const win = this.win
      if (!trusted(event) || !win || !win.isVisible() || win.isFocused()) return
      // Окошко не забирает фокус само, но человек щёлкнул в него: обычно macOS сразу отдаёт
      // клавиатуру панели. Если нет (так бывает, пока активна другая программа), берём её явно —
      // по щелчку самого человека это уместно.
      options.log.info('popup: taking keyboard focus after a click')
      app.focus({ steal: true })
      win.focus()
    })
    ipcMain.on(POPUP_IPC.resize, (event, height: unknown) => {
      if (!trusted(event) || typeof height !== 'number' || !Number.isFinite(height)) return
      // страница меряет в CSS-пикселях, окно — в точках экрана: при масштабе 150 % их больше
      this.height = Math.max(MIN_HEIGHT, Math.ceil(height * this.options.zoom()))
      this.applyBounds()
      if (this.wanted && this.win && !this.win.isVisible()) this.reveal()
    })
  }

  isVisible(): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.isVisible()
  }

  /** на экране или вот-вот появится */
  isShown(): boolean {
    return this.wanted || this.isVisible()
  }

  isFocused(): boolean {
    return this.isVisible() && !!this.win?.isFocused()
  }

  hasCard(chatId: string): boolean {
    return !!this.state?.cards.some((card) => card.chatId === chatId)
  }

  /** Показать (или обновить уже показанное) окошко с этими карточками */
  show(state: PopupState): void {
    this.state = state
    const win = this.ensureWindow()
    if (this.isVisible()) {
      this.push()
      // уже на экране — поднять над окнами, которые могли его перекрыть
      win.moveTop()
      return
    }
    this.wanted = true
    this.anchor = null
    this.push()
    // страница ещё грузится (первый показ) — запасной таймер включится, когда она будет готова
    if (this.loaded) this.armFallback()
  }

  /** Не дождались высоты от загруженной страницы — показываем как есть, но не пустое окно */
  private armFallback(): void {
    if (this.fallback) clearTimeout(this.fallback)
    this.fallback = setTimeout(() => {
      if (this.wanted && this.loaded && !this.isVisible()) this.reveal()
    }, SHOW_FALLBACK_MS)
  }

  /** Обновить содержимое, если окошко на экране (или вот-вот появится) */
  update(state: PopupState): void {
    this.state = state
    if (this.wanted || this.isVisible()) this.push()
  }

  /** Напоминание, а окошко уже на экране: поднять его и встряхнуть */
  attention(): void {
    if (!this.isVisible() || !this.win) return
    this.win.moveTop()
    this.win.webContents.send(POPUP_IPC.attention)
  }

  hide(): void {
    this.wanted = false
    if (this.fallback) clearTimeout(this.fallback)
    this.fallback = null
    if (this.isVisible()) this.win?.hide()
  }

  /** Сменилась тема — цвет фона окна до отрисовки страницы */
  refreshChrome(): void {
    if (this.win && !this.win.isDestroyed()) this.win.setBackgroundColor(this.options.backgroundColor())
  }

  destroy(): void {
    this.hide()
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
    this.win = null
  }

  private push(): void {
    if (!this.loaded || !this.state || !this.win || this.win.isDestroyed()) return
    this.win.setTitle(this.options.title())
    this.win.webContents.setZoomFactor(this.options.zoom())
    this.win.webContents.send(POPUP_IPC.state, this.state)
  }

  private reveal(): void {
    const win = this.win
    if (!win || win.isDestroyed()) return
    if (this.fallback) clearTimeout(this.fallback)
    this.fallback = null
    this.wanted = false
    this.anchor = null
    this.applyBounds()
    // без фокуса: текст, который человек набирает в другой программе, не должен уйти сюда
    win.showInactive()
    win.moveTop()
    this.options.log.info(`popup shown (${this.state?.cards.length ?? 0} chat(s))`)
  }

  /** Прижать к правому верхнему углу экрана, на котором сейчас курсор; высота — по содержимому */
  private applyBounds(): void {
    const win = this.win
    if (!win || win.isDestroyed()) return
    if (!this.anchor) {
      const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
      this.anchor = {
        right: area.x + area.width - MARGIN,
        top: area.y + MARGIN,
        maxHeight: Math.max(MIN_HEIGHT, area.height - MARGIN * 2)
      }
    }
    const width = Math.round(POPUP_WIDTH * this.options.zoom())
    const height = Math.min(this.height, this.anchor.maxHeight)
    win.setBounds({ x: this.anchor.right - width, y: this.anchor.top, width, height })
  }

  private ensureWindow(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win
    this.loaded = false
    const isMac = process.platform === 'darwin'
    const win = new BrowserWindow({
      width: POPUP_WIDTH,
      height: INITIAL_HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: true,
      title: this.options.title(),
      backgroundColor: this.options.backgroundColor(),
      // macOS: панель не делает Hallway активной программой (главное окно не выскакивает
      // поверх), видна на всех рабочих столах и поверх полноэкранных программ
      ...(isMac ? { type: 'panel' } : {}),
      webPreferences: {
        preload: this.options.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: true,
        // спрятанное окошко должно сразу отрисовать новое состояние и сообщить свою высоту
        backgroundThrottling: false,
        additionalArguments: [POPUP_ARG]
      }
    })
    win.setAlwaysOnTop(true, isMac ? 'floating' : 'pop-up-menu')
    if (isMac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
    // демонстрация экрана: чужие сообщения не должны попасть в общий доступ
    win.setContentProtection(true)
    win.on('close', (event) => {
      // ⌘W и т. п.: окошко прячется, само окно живёт до выхода из программы
      if (this.win !== win) return
      event.preventDefault()
      this.hide()
      this.options.handlers.closed()
    })
    win.on('focus', () => this.options.handlers.focused())
    win.on('closed', () => {
      if (this.win === win) {
        this.win = null
        this.loaded = false
      }
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event, url) => {
      if (url !== win.webContents.getURL()) event.preventDefault()
    })
    this.win = win
    if (this.options.devUrl) void win.loadURL(this.options.devUrl)
    else void win.loadFile(this.options.file)
    return win
  }
}

/** preload общий с главным окном: по флагу POPUP_ARG он отдаёт окошку только его мост */
export function popupPreloadPath(dir: string): string {
  return path.join(dir, '../preload/preload.js')
}
