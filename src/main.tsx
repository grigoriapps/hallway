import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Встроенные шрифты (лицензия OFL). Браузер загружает файлы только выбранного шрифта и нужных алфавитов.
import '@fontsource-variable/inter/index.css'
import '@fontsource-variable/nunito/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import '@fontsource/pt-serif/400.css'
import '@fontsource/pt-serif/700.css'
import App from './App'
import { AppStateProvider } from './state'
import './styles.css'

// Платформа нужна стилям: заголовок окна на macOS и Windows устроен по-разному
document.documentElement.dataset.platform = window.api.platform

// Файл, брошенный мимо зоны чата, не должен открываться в окне приложения
window.addEventListener('dragover', (event) => event.preventDefault())
window.addEventListener('drop', (event) => event.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppStateProvider>
      <App />
    </AppStateProvider>
  </StrictMode>
)
