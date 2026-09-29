// QR-код адреса «Поддержать Hallway» для «Настройки → О программе».
// Запуск: npm run qr — перерисовывает src/assets/donate-qr.svg из адреса в src/donate.ts.
// Программа в интернет не ходит, поэтому QR — готовая картинка в сборке, а библиотека qrcode
// нужна только здесь (devDependency) и в установщик не попадает.
const fs = require('node:fs')
const path = require('node:path')
const QRCode = require('qrcode')

const ROOT = path.join(__dirname, '..')
const SOURCE = path.join(ROOT, 'src/donate.ts')
const TARGET = path.join(ROOT, 'src/assets/donate-qr.svg')

/** Адрес берём из src/donate.ts — он один на программу и на QR */
function donateUrl() {
  const match = fs.readFileSync(SOURCE, 'utf8').match(/export const DONATE_URL = '([^']+)'/)
  if (!match) throw new Error(`DONATE_URL не найден в ${SOURCE}`)
  return match[1]
}

/**
 * Тёмные модули на белом с полем в 4 модуля (quiet zone) — подложка своя, поэтому код
 * читается в любой теме. Уровень коррекции M: для короткого адреса это версия 3, 29×29.
 */
async function renderSvg(url) {
  const svg = await QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 4,
    color: { dark: '#000000', light: '#ffffff' }
  })
  // qrcode сам ставит shape-rendering="crispEdges" — модули не размываются при любом масштабе
  if (!svg.includes('shape-rendering="crispEdges"')) throw new Error('в SVG нет crispEdges')
  return svg.trim() + '\n'
}

module.exports = { donateUrl, renderSvg, TARGET }

if (require.main === module) {
  const url = donateUrl()
  renderSvg(url).then((svg) => {
    fs.writeFileSync(TARGET, svg)
    console.log(`✔ ${path.relative(ROOT, TARGET)} ← ${url} (${svg.length} байт)`)
  })
}
