// Chromium кладёт в сборку переводы своего интерфейса на 55 языков: 48 МБ в папке locales
// на Windows и столько же в *.lproj на macOS. У Hallway пять языков интерфейса, поэтому оставляем
// десяток языков — ими подписаны системные диалоги Chromium (выбор файла, контекстное меню
// проверки орфографии) — а остальные удаляем. en-US обязателен: это язык по умолчанию.
//
// Вызывается electron-builder'ом как afterPack (см. electron-builder.yml).

const fs = require('node:fs')
const path = require('node:path')

/** ru, en, de, es и ro — языки интерфейса Hallway (src/i18n.ts), остальные оставлены на всякий случай */
const KEEP = ['en-US', 'en-GB', 'ru', 'ro', 'uk', 'de', 'es', 'fr', 'it', 'pl', 'tr']

/**
 * Имена папок macOS отличаются от имён .pak: en-US → en, en-GB → en_GB.
 * Плюс у Chromium есть варианты по грамматическому роду (ru_MASCULINE и т. п.) —
 * для оставленных языков их тоже сохраняем, они занимают по 4 КБ.
 */
const MAC_KEEP = new Set(['en', ...KEEP.filter((code) => code !== 'en-US').map((code) => code.replace('-', '_'))])
const WIN_KEEP = new Set(KEEP)

const macKeeps = (dirName) => MAC_KEEP.has(dirName.replace(/_(MASCULINE|FEMININE|NEUTER)$/, ''))

function removeEntries(dir, shouldKeep, suffix) {
  let entries
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return { removed: 0, bytes: 0 }
  }
  let removed = 0
  let bytes = 0
  for (const entry of entries) {
    if (!entry.endsWith(suffix)) continue
    const code = entry.slice(0, -suffix.length)
    if (shouldKeep(code)) continue
    const full = path.join(dir, entry)
    bytes += directorySize(full)
    fs.rmSync(full, { recursive: true, force: true })
    removed++
  }
  return { removed, bytes }
}

function directorySize(target) {
  const stat = fs.statSync(target)
  if (!stat.isDirectory()) return stat.size
  let total = 0
  for (const entry of fs.readdirSync(target)) total += directorySize(path.join(target, entry))
  return total
}

exports.default = async function pruneLocales(context) {
  const { appOutDir, electronPlatformName, packager } = context
  const results = []
  if (electronPlatformName === 'darwin') {
    const app = path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents')
    // сами переводы Chromium лежат внутри фреймворка, в Contents/Resources — только InfoPlist.strings
    results.push(
      removeEntries(
        path.join(app, 'Frameworks', 'Electron Framework.framework', 'Versions', 'A', 'Resources'),
        macKeeps,
        '.lproj'
      ),
      removeEntries(path.join(app, 'Resources'), macKeeps, '.lproj')
    )
  } else {
    results.push(removeEntries(path.join(appOutDir, 'locales'), (code) => WIN_KEEP.has(code), '.pak'))
  }
  const removed = results.reduce((sum, r) => sum + r.removed, 0)
  const mb = (results.reduce((sum, r) => sum + r.bytes, 0) / (1024 * 1024)).toFixed(1)
  if (!removed) throw new Error('prune-locales: не найдено ни одной папки с переводами — проверьте путь')
  console.log(`  • locales pruned  removed=${removed} freed=${mb} MB kept=${KEEP.join(', ')}`)
}
