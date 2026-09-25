import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// CSP добавляется только в production-сборку: в dev Vite/React Refresh
// используют inline-скрипты, которые строгая политика заблокировала бы.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

function productionCsp(): Plugin {
  return {
    name: 'hallway-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
      )
    }
  }
}

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: { input: { main: resolve('electron/main.ts') } }
    }
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: { input: { preload: resolve('electron/preload.ts') } }
    }
  },
  renderer: {
    root: '.',
    server: { watch: { ignored: ['**/out/**', '**/release/**'] } },
    build: {
      outDir: 'out/renderer',
      minify: true,
      rollupOptions: { input: resolve('index.html') }
    },
    plugins: [react(), productionCsp()]
  }
})
