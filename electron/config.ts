import fs from 'node:fs'
import path from 'node:path'

// Сетевые параметры. Значения по умолчанию можно переопределить:
//   1) файлом config.json в папке данных приложения (создаётся при первом запуске);
//   2) переменными окружения HALLWAY_UDP_PORT, HALLWAY_TCP_PORT, HALLWAY_VERBOSE=1.
// ВАЖНО: udpPort должен совпадать у всех клиентов в сети, иначе они не увидят друг друга.
// tcpPort — только базовый: если он занят, берётся следующий свободный, и реальный
// порт анонсируется в presence-пакете.

export interface AppConfig {
  udpPort: number
  tcpPort: number
  tcpPortAttempts: number
  broadcastIntervalMs: number
  peerTimeoutMs: number
  verboseLogs: boolean
}

export const DEFAULT_CONFIG = {
  udpPort: 41234,
  tcpPort: 41235,
  tcpPortAttempts: 20,
  broadcastIntervalMs: 3000,
  peerTimeoutMs: 10000
} as const

export const PROTOCOL_VERSION = 1
export const APP_TAG = 'hallway'

type FileConfig = Partial<Record<keyof AppConfig, unknown>>

function port(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : fallback
}

function range(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? Math.round(value)
    : fallback
}

export function loadConfig(
  dir: string,
  verboseByDefault: boolean
): { config: AppConfig; file: string; warning: string | null } {
  const file = path.join(dir, 'config.json')
  let raw: FileConfig = {}
  let warning: string | null = null

  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8')) as FileConfig
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      try {
        fs.mkdirSync(dir, { recursive: true })
        const template = { ...DEFAULT_CONFIG, verboseLogs: 'auto' }
        fs.writeFileSync(file, JSON.stringify(template, null, 2) + '\n')
      } catch {
        // не критично — работаем на значениях по умолчанию
      }
    } else {
      warning = `config.json is invalid, defaults are used: ${(err as Error).message}`
    }
  }

  const envVerbose = process.env.HALLWAY_VERBOSE
  const verbose =
    envVerbose !== undefined
      ? envVerbose === '1' || envVerbose === 'true'
      : typeof raw.verboseLogs === 'boolean'
        ? raw.verboseLogs
        : verboseByDefault

  const config: AppConfig = {
    udpPort: port(process.env.HALLWAY_UDP_PORT, port(raw.udpPort, DEFAULT_CONFIG.udpPort)),
    tcpPort: port(process.env.HALLWAY_TCP_PORT, port(raw.tcpPort, DEFAULT_CONFIG.tcpPort)),
    tcpPortAttempts: range(raw.tcpPortAttempts, 1, 200, DEFAULT_CONFIG.tcpPortAttempts),
    broadcastIntervalMs: range(raw.broadcastIntervalMs, 500, 60000, DEFAULT_CONFIG.broadcastIntervalMs),
    peerTimeoutMs: range(raw.peerTimeoutMs, 2000, 300000, DEFAULT_CONFIG.peerTimeoutMs),
    verboseLogs: verbose
  }

  // Таймаут должен покрывать хотя бы 3 пропущенных анонса, иначе пиры будут «мигать».
  if (config.peerTimeoutMs < config.broadcastIntervalMs * 3) {
    config.peerTimeoutMs = config.broadcastIntervalMs * 3 + 1000
  }
  if (config.udpPort === config.tcpPort) {
    warning = 'udpPort and tcpPort are equal; tcpPort will be probed starting from udpPort+1'
    config.tcpPort = config.udpPort + 1
  }

  return { config, file, warning }
}
