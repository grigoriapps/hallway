import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import type { TranslateFn } from '../src/i18n'

export interface MenuActions {
  t: TranslateFn
  openSettings(): void
  find(): void
  /** 1 — увеличить, -1 — уменьшить, 0 — 100% */
  zoom(step: 1 | -1 | 0): void
  quit(): void
}

/**
 * Меню приложения на языке интерфейса. На Windows строка меню скрыта (autoHideMenuBar), но горячие
 * клавиши из меню работают: ⌘/Ctrl+F — поиск, ⌘/Ctrl +/−/0 — масштаб, ⌘/Ctrl+, — настройки.
 * Пересобирается при смене языка (см. applyLanguage в main.ts).
 */
export function buildAppMenu(actions: MenuActions): Menu {
  const mac = process.platform === 'darwin'
  const t = actions.t

  const edit: MenuItemConstructorOptions = {
    label: t('appmenu.edit'),
    submenu: [
      { role: 'undo', label: t('common.undo') },
      { role: 'redo', label: t('common.redo') },
      { type: 'separator' },
      { role: 'cut', label: t('common.cut') },
      { role: 'copy', label: t('common.copy') },
      { role: 'paste', label: t('common.paste') },
      { role: 'selectAll', label: t('common.selectAll') },
      { type: 'separator' },
      { label: t('appmenu.find'), accelerator: 'CmdOrCtrl+F', click: () => actions.find() }
    ]
  }

  const view: MenuItemConstructorOptions = {
    label: t('appmenu.view'),
    submenu: [
      { label: t('appmenu.zoomIn'), accelerator: 'CmdOrCtrl+=', click: () => actions.zoom(1) },
      // тот же пункт для «+» с Shift и на цифровой клавиатуре
      {
        label: t('appmenu.zoomIn'),
        accelerator: 'CmdOrCtrl+Plus',
        visible: false,
        acceleratorWorksWhenHidden: true,
        click: () => actions.zoom(1)
      },
      { label: t('appmenu.zoomOut'), accelerator: 'CmdOrCtrl+-', click: () => actions.zoom(-1) },
      { label: t('appmenu.zoomReset'), accelerator: 'CmdOrCtrl+0', click: () => actions.zoom(0) },
      { type: 'separator' },
      { role: 'togglefullscreen', label: t('appmenu.fullscreen') },
      { role: 'toggleDevTools', label: t('appmenu.devtools') }
    ]
  }

  const template: MenuItemConstructorOptions[] = mac
    ? [
        {
          label: app.name,
          submenu: [
            { role: 'about', label: t('appmenu.about', { app: app.name }) },
            { type: 'separator' },
            { label: t('appmenu.settings'), accelerator: 'Cmd+,', click: () => actions.openSettings() },
            { type: 'separator' },
            { role: 'hide', label: t('appmenu.hide', { app: app.name }) },
            { role: 'hideOthers', label: t('appmenu.hideOthers') },
            { role: 'unhide', label: t('appmenu.unhide') },
            { type: 'separator' },
            { label: t('appmenu.quit', { app: app.name }), accelerator: 'Cmd+Q', click: () => actions.quit() }
          ]
        },
        edit,
        view,
        {
          label: t('appmenu.window'),
          submenu: [
            { role: 'minimize', label: t('appmenu.minimize') },
            { role: 'zoom', label: t('appmenu.windowZoom') },
            { type: 'separator' },
            { role: 'close', label: t('appmenu.closeWindow') }
          ]
        }
      ]
    : [
        {
          label: t('appmenu.file'),
          submenu: [
            { label: t('appmenu.settingsWin'), accelerator: 'Ctrl+,', click: () => actions.openSettings() },
            { type: 'separator' },
            { label: t('appmenu.quitShort'), click: () => actions.quit() }
          ]
        },
        edit,
        view
      ]

  return Menu.buildFromTemplate(template)
}
