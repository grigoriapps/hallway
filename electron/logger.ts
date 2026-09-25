import fs from 'node:fs'
import path from 'node:path'
import { inspect } from 'node:util'

// Логи пишутся в консоль и (в приложении) в файл logs/main.log — в собранной
// Windows-версии консоли нет, а разбирать сетевые проблемы Mac ↔ Windows без логов тяжело.
// Сообщения в логах — на английском: консоль Windows (cp866/cp1251) искажает кириллицу.

export interface ScopedLogger {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
  /** выводится только при verboseLogs */
  debug(...args: unknown[]): void
}

export interface Logger {
  readonly verbose: boolean
  scope(name: string): ScopedLogger
  close(): void
}

const MAX_LOG_BYTES = 5 * 1024 * 1024

function timestamp(): string {
  const d = new Date()
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

function format(args: unknown[]): string {
  return args
    .map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.message : inspect(a, { depth: 4 })))
    .join(' ')
}

export function createLogger(options: { verbose: boolean; file?: string }): Logger {
  let stream: fs.WriteStream | null = null

  if (options.file) {
    try {
      fs.mkdirSync(path.dirname(options.file), { recursive: true })
      const size = fs.existsSync(options.file) ? fs.statSync(options.file).size : 0
      if (size > MAX_LOG_BYTES) fs.renameSync(options.file, options.file + '.old')
      stream = fs.createWriteStream(options.file, { flags: 'a' })
      stream.on('error', () => {
        stream = null
      })
      stream.write(`\n===== ${new Date().toISOString()} session start (pid ${process.pid}) =====\n`)
    } catch {
      stream = null
    }
  }

  const write = (level: 'info' | 'warn' | 'error' | 'debug', scope: string, args: unknown[]) => {
    const line = `[${timestamp()}] [${scope}]${level === 'info' || level === 'debug' ? '' : ' ' + level.toUpperCase() + ':'} ${format(args)}`
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
    stream?.write(line + '\n')
  }

  return {
    verbose: options.verbose,
    scope(name) {
      return {
        info: (...a) => write('info', name, a),
        warn: (...a) => write('warn', name, a),
        error: (...a) => write('error', name, a),
        debug: (...a) => {
          if (options.verbose) write('debug', name, a)
        }
      }
    },
    close() {
      stream?.end()
      stream = null
    }
  }
}
