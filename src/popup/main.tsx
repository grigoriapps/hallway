import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// те же встроенные шрифты, что и в окне Hallway: выбранный в настройках шрифт — и здесь
import '@fontsource-variable/inter/index.css'
import '@fontsource-variable/nunito/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import '@fontsource/pt-serif/400.css'
import '@fontsource/pt-serif/700.css'
import { Popup } from './Popup'
import './popup.css'

document.documentElement.dataset.platform = window.popupApi.platform

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>
)
