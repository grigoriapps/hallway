// Генерация иконок приложения из векторного макета.
// Запуск: npm run icons — рендер идёт в Chromium внутри Electron, внешние утилиты не нужны.
//   build/icon.svg          — исходник (раскладка macOS)
//   build/icon.png          — 1024×1024 для macOS (electron-builder соберёт из него .icns)
//   build/icon.ico          — 16…256 px для Windows: exe, установщик, панель задач
//   src/assets/app-icon.png — логотип внутри интерфейса
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
app.setPath('userData', path.join(os.tmpdir(), 'hallway-icon-render'))

/**
 * Макет нарисован в квадрате 824×824 (сетка иконок macOS: 824 px внутри холста 1024 px).
 * inset — отступ квадрата от края холста, shadow — внешняя тень (только для macOS).
 */
function iconSvg({ size, inset, shadow }) {
  const scale = (1024 - inset * 2) / 824
  // До 24 px два пузыря и три точки превращаются в кашу: рисуем один крупный пузырь,
  // а точки оставляем только там, где они не сливаются в полоску
  const small = size <= 24
  const bubbles = small
    ? `<g fill="#FFFFFF">
      <rect x="120" y="170" width="584" height="420" rx="190"/>
      <path d="M230 520 C 230 620, 190 690, 118 724 C 260 724, 360 680, 420 600 Z"/>
    </g>${
      size >= 20
        ? `
    <g fill="#4B5FF0">
      <circle cx="252" cy="380" r="58"/>
      <circle cx="412" cy="380" r="58"/>
      <circle cx="572" cy="380" r="58"/>
    </g>`
        : ''
    }`
    : `<!-- дальний пузырь: собеседник -->
    <g fill="#FFFFFF" opacity="0.5">
      <rect x="292" y="136" width="400" height="300" rx="140"/>
      <path d="M600 370 C 610 440, 640 480, 690 504 C 600 510, 530 480, 490 420 Z"/>
    </g>

    <!-- ближний пузырь с «печатает…» -->
    <g fill="url(#front)" filter="url(#lift)">
      <rect x="132" y="300" width="460" height="330" rx="150"/>
      <path d="M200 560 C 200 640, 170 690, 128 712 C 220 712, 292 680, 330 620 Z"/>
    </g>
    <g fill="url(#dot)">
      <circle cx="250" cy="465" r="36"/>
      <circle cx="362" cy="465" r="36"/>
      <circle cx="474" cy="465" r="36"/>
    </g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#63A0FF"/>
      <stop offset="0.5" stop-color="#4C6BF5"/>
      <stop offset="1" stop-color="#6B43E6"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.24"/>
      <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="front" gradientUnits="userSpaceOnUse" x1="0" y1="300" x2="0" y2="712">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#E6ECFF"/>
    </linearGradient>
    <linearGradient id="dot" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5A8BFF"/>
      <stop offset="1" stop-color="#5B48EA"/>
    </linearGradient>
    <filter id="outer" x="-20%" y="-20%" width="140%" height="145%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#0B1440" flood-opacity="0.30"/>
    </filter>
    <filter id="lift" x="-30%" y="-30%" width="160%" height="175%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#1A1C78" flood-opacity="0.38"/>
    </filter>
  </defs>
  <g transform="translate(${inset} ${inset}) scale(${scale})">
    <rect width="824" height="824" rx="185" fill="url(#bg)"${shadow ? ' filter="url(#outer)"' : ''}/>
    <rect width="824" height="824" rx="185" fill="url(#shine)"/>
    ${bubbles}
  </g>
</svg>`
}

/** Выполняется в странице: SVG → canvas нужного размера → PNG (с прозрачностью) */
function rasterize(svg, size) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, size, size)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('SVG failed to load'))
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
}

/** ICO с PNG внутри (поддерживается с Windows Vista) */
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const directory = Buffer.alloc(16 * images.length)
  let offset = header.length + directory.length
  images.forEach(({ size, png }, i) => {
    const o = i * 16
    directory.writeUInt8(size >= 256 ? 0 : size, o)
    directory.writeUInt8(size >= 256 ? 0 : size, o + 1)
    directory.writeUInt8(0, o + 2)
    directory.writeUInt8(0, o + 3)
    directory.writeUInt16LE(1, o + 4)
    directory.writeUInt16LE(32, o + 6)
    directory.writeUInt32LE(png.length, o + 8)
    directory.writeUInt32LE(offset, o + 12)
    offset += png.length
  })
  return Buffer.concat([header, directory, ...images.map((i) => i.png)])
}

app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({ show: false, width: 64, height: 64 })
    await win.loadURL('data:text/html,<!doctype html><title>icons</title>')
    const render = async (options) => {
      const svg = iconSvg(options)
      const dataUrl = await win.webContents.executeJavaScript(
        `(${rasterize.toString()})(${JSON.stringify(svg)}, ${options.size})`
      )
      return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')
    }
    const write = (relative, data) => {
      const file = path.join(ROOT, relative)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, data)
      console.log(`wrote ${relative} (${data.length} bytes)`)
    }

    write('build/icon.svg', iconSvg({ size: 1024, inset: 100, shadow: true }) + '\n')
    write('build/icon.png', await render({ size: 1024, inset: 100, shadow: true }))

    // Windows: квадрат почти во весь холст, без внешней тени — иначе в панели задач иконка мелкая
    const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
    const images = []
    for (const size of icoSizes) {
      images.push({ size, png: await render({ size, inset: size <= 32 ? 0 : 16, shadow: false }) })
    }
    write('build/icon.ico', buildIco(images))

    write('src/assets/app-icon.png', await render({ size: 256, inset: 0, shadow: false }))
    app.quit()
  })
  .catch((err) => {
    console.error(err)
    app.exit(1)
  })
