/**
 * Заголовок окна в цвет темы.
 * Windows: полоса над интерфейсом — за неё окно перетаскивают, справа поверх неё рисуются
 *          системные кнопки (их цвет задаёт main). Слева продолжает боковую панель, справа — чат.
 * macOS: кнопки окна встроены в боковую панель; отдельная полоса нужна только экранам без неё
 *        (первый запуск, загрузка), чтобы окно можно было перетащить.
 */
export function TitleBar({ withSidebar }: { withSidebar: boolean }) {
  const platform = window.api.platform
  if (platform === 'win32') {
    return (
      <div className="titlebar" aria-hidden="true">
        {withSidebar && <div className="titlebar-side" />}
        <div className="titlebar-main" />
      </div>
    )
  }
  if (platform === 'darwin' && !withSidebar) return <div className="drag-strip" aria-hidden="true" />
  return null
}
