import { Menu, Tray, nativeImage, type MenuItemConstructorOptions } from 'electron'
import trayIconPath from '../build/icon.ico?asset'
import { PRESENCE_STATUSES, type PresenceStatus } from '../src/types'
import type { TranslateFn } from '../src/i18n'

const STATUS_KEYS = { online: 'status.online', away: 'status.away', dnd: 'status.dnd' } as const

export function statusLabel(t: TranslateFn, status: PresenceStatus): string {
  return t(STATUS_KEYS[status])
}

export interface StatusState {
  status: PresenceStatus
  /** «Отошёл» выставлен автоматически */
  auto: boolean
}

/** Пункты выбора статуса — для меню трея, Dock (macOS) и всплывающего меню в окне */
export function statusMenuItems(
  t: TranslateFn,
  state: StatusState,
  onStatus: (status: PresenceStatus) => void
): MenuItemConstructorOptions[] {
  return PRESENCE_STATUSES.map((status) => ({
    type: 'radio',
    label: status === 'away' && state.auto ? t('status.awayAuto') : statusLabel(t, status),
    checked: state.status === status,
    click: () => onStatus(status)
  }))
}

interface TrayCallbacks {
  t: TranslateFn
  onShow(): void
  onQuit(): void
  onStatus(status: PresenceStatus): void
  getStatus(): StatusState
}

/** Значок в трее Windows: приложение продолжает работать, когда окно закрыто */
export class TrayController {
  private tray: Tray | null = null

  constructor(private readonly callbacks: TrayCallbacks) {}

  get enabled(): boolean {
    return this.tray !== null
  }

  enable(): void {
    if (this.tray) return
    this.tray = new Tray(nativeImage.createFromPath(trayIconPath))
    this.tray.on('click', () => this.callbacks.onShow())
    this.tray.on('double-click', () => this.callbacks.onShow())
    this.refresh()
  }

  disable(): void {
    this.tray?.destroy()
    this.tray = null
  }

  refresh(): void {
    if (!this.tray) return
    const t = this.callbacks.t
    const state = this.callbacks.getStatus()
    this.tray.setToolTip(t('tray.tooltip', { status: statusLabel(t, state.status) }))
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: t('tray.open'), click: () => this.callbacks.onShow() },
        { type: 'separator' },
        ...statusMenuItems(t, state, (status) => this.callbacks.onStatus(status)),
        { type: 'separator' },
        { label: t('tray.quit'), click: () => this.callbacks.onQuit() }
      ])
    )
  }

  balloon(title: string, content: string): void {
    this.tray?.displayBalloon({ title, content, iconType: 'info' })
  }
}
