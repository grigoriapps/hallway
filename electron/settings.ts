import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  AUTO_ACCEPT_MODES,
  AUTO_ACCEPT_SIZES_MB,
  AUTO_AWAY_MINUTES,
  CHAT_BACKGROUNDS,
  FONTS,
  HISTORY_RETENTIONS,
  MAX_GROUPS,
  MAX_GROUP_MEMBERS,
  MESSAGE_FONT_SIZE,
  MESSAGE_TONES,
  SEND_KEYS,
  THEMES,
  UI_SCALE,
  type ActionResult,
  type GroupMember,
  type PinnedPeer,
  type SettingsPatch,
  type SettingsView
} from '../src/types'
import { DEFAULT_LOCALE, LOCALES, type Locale } from '../src/i18n'
import { asInt, cleanName, isValidGroupId } from './protocol'
import { isValidIPv4 } from './net-utils'

/** Группа так и хранится у каждого участника: сервера нет, состав знает каждый сам */
export interface StoredGroup {
  id: string
  name: string
  /** все участники, включая себя */
  members: GroupMember[]
  createdAt: number
  /** номер ревизии состава: любое изменение его увеличивает, больший номер побеждает */
  rev: number
  /** создатель: только он может удалить группу у всех */
  ownerId: string
}

/** Переписка, убранная из списка: удалённая группа или свёрнутый личный чат */
export interface ArchivedChat {
  id: string
  kind: 'peer' | 'group'
  /** имя на момент архивации: группы уже может не быть */
  name: string
  members: number
  reason: 'left' | 'deleted' | 'hidden'
  at: number
}

/** Покинутая или удалённая группа: анонсы с rev не больше этого игнорируются */
export interface LeftGroup {
  id: string
  rev: number
}

export interface StoredSettings extends SettingsView {
  /** постоянный идентификатор клиента (генерируется один раз) */
  id: string
  /** подсказка «Hallway работает в трее» уже показывалась */
  trayHintShown: boolean
  groups: StoredGroup[]
  archivedChats: ArchivedChat[]
  /** группы, из которых вышли: чтобы старый анонс не «воскресил» их */
  leftGroups: LeftGroup[]
  /** автозапуск уже настраивался; без этого флага он включается один раз по умолчанию */
  loginItemInitialized: boolean
  /**
   * когда очищалась история общего чата: более старые сообщения коллеги больше не досылают
   * (иначе очищенное вернулось бы при следующей встрече)
   */
  everyoneClearedAt: number
  /** о новинках какой версии уже рассказали (окно «Что нового»); '' — до 1.3 не записывали */
  lastSeenVersion: string
}

export type SettingsUpdate = SettingsPatch & {
  name?: string
  downloadDir?: string
  manualHosts?: string[]
  pinnedPeers?: PinnedPeer[]
  trayHintShown?: boolean
  groups?: StoredGroup[]
  archivedChats?: ArchivedChat[]
  leftGroups?: LeftGroup[]
  loginItemInitialized?: boolean
  everyoneClearedAt?: number
  lastSeenVersion?: string
}

const MAX_MANUAL_HOSTS = 32
const MAX_PINNED_PEERS = 100

function parseGroups(value: unknown, fallback: StoredGroup[]): StoredGroup[] {
  if (!Array.isArray(value)) return fallback
  const seen = new Set<string>()
  const result: StoredGroup[] = []
  for (const entry of value) {
    const raw = asObject(entry)
    if (!isValidGroupId(raw.id) || seen.has(raw.id)) continue
    const members: GroupMember[] = []
    const memberIds = new Set<string>()
    if (Array.isArray(raw.members)) {
      for (const item of raw.members) {
        const member = asObject(item)
        if (typeof member.id !== 'string' || !/^[\w-]{1,64}$/.test(member.id) || memberIds.has(member.id)) continue
        memberIds.add(member.id)
        members.push({ id: member.id, name: cleanName(member.name) })
        if (members.length >= MAX_GROUP_MEMBERS) break
      }
    }
    if (!members.length) continue
    seen.add(raw.id)
    const rev = typeof raw.rev === 'number' && Number.isInteger(raw.rev) && raw.rev > 0 ? raw.rev : 1
    const owner = typeof raw.ownerId === 'string' ? raw.ownerId : ''
    result.push({
      id: raw.id,
      name: cleanName(raw.name),
      members,
      createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
      rev,
      // группы из 1.1 без владельца: им становится первый участник — так группа и создавалась
      ownerId: members.some((m) => m.id === owner) ? owner : members[0].id
    })
    if (result.length >= MAX_GROUPS) break
  }
  return result
}



const MAX_ARCHIVED = 200

function parseArchived(value: unknown, fallback: ArchivedChat[]): ArchivedChat[] {
  if (!Array.isArray(value)) return fallback
  const seen = new Set<string>()
  const result: ArchivedChat[] = []
  for (const entry of value) {
    const raw = asObject(entry)
    if (typeof raw.id !== 'string' || !/^[\w-]{1,64}$/.test(raw.id) || seen.has(raw.id)) continue
    seen.add(raw.id)
    result.push({
      id: raw.id,
      kind: raw.kind === 'group' ? 'group' : 'peer',
      name: cleanName(raw.name),
      members: typeof raw.members === 'number' && raw.members > 0 ? Math.min(raw.members, MAX_GROUP_MEMBERS) : 0,
      reason: raw.reason === 'left' || raw.reason === 'deleted' ? raw.reason : 'hidden',
      at: typeof raw.at === 'number' && Number.isFinite(raw.at) ? raw.at : Date.now()
    })
    if (result.length >= MAX_ARCHIVED) break
  }
  return result
}

function parseLeftGroups(value: unknown, fallback: LeftGroup[]): LeftGroup[] {
  if (!Array.isArray(value)) return fallback
  const seen = new Set<string>()
  const result: LeftGroup[] = []
  for (const entry of value) {
    const raw = asObject(entry)
    if (!isValidGroupId(raw.id) || seen.has(raw.id)) continue
    seen.add(raw.id)
    result.push({ id: raw.id, rev: typeof raw.rev === 'number' && raw.rev > 0 ? Math.floor(raw.rev) : 1 })
    if (result.length >= MAX_ARCHIVED) break
  }
  return result
}

function parsePinned(value: unknown, fallback: PinnedPeer[]): PinnedPeer[] {
  if (!Array.isArray(value)) return fallback
  const seen = new Set<string>()
  const result: PinnedPeer[] = []
  for (const entry of value) {
    const raw = asObject(entry)
    if (typeof raw.id !== 'string' || !/^[\w-]{1,64}$/.test(raw.id) || seen.has(raw.id)) continue
    seen.add(raw.id)
    result.push({ id: raw.id, name: cleanName(raw.name) })
  }
  return result.slice(0, MAX_PINNED_PEERS)
}

type Raw = Record<string, unknown>

const asObject = (value: unknown): Raw =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {}

function oneOf<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

const asBool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)

function inRange(value: unknown, min: number, max: number, step: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const stepped = Math.round((value - min) / step) * step + min
  return Math.min(max, Math.max(min, stepped))
}

function withoutUndefined(value: Raw): Raw {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined))
}

export function defaultSettings(downloadDir: string): StoredSettings {
  return {
    id: randomUUID(),
    name: '',
    downloadDir,
    manualHosts: [],
    language: DEFAULT_LOCALE,
    appearance: {
      theme: 'system',
      font: 'system',
      uiScale: UI_SCALE.default,
      messageFontSize: MESSAGE_FONT_SIZE.default,
      chatBackground: 'none',
      compact: false
    },
    // у общего чата своя мелодия: по звуку понятно, откуда сообщение
    notifications: {
      system: true,
      messageSound: true,
      messageTone: 'chime',
      groupTone: 'drop',
      everyoneTone: 'marimba',
      presenceSound: true
    },
    sendKey: 'enter',
    historyRetention: '30d',
    autoAwayMinutes: 10,
    runInBackground: true,
    // включён по умолчанию: мессенджер полезен, только если запущен у всех
    openAtLogin: true,
    readReceipts: true,
    autoAccept: { mode: 'off', maxSizeMb: 200 },
    pinnedPeers: [],
    presenceEvents: true,
    collapsed: { groups: false, online: false, offline: false, archive: true },
    trayHintShown: false,
    groups: [],
    archivedChats: [],
    leftGroups: [],
    loginItemInitialized: false,
    everyoneClearedAt: 0,
    lastSeenVersion: ''
  }
}

/**
 * Проверяет каждое поле; некорректное значение заменяется значением из base.
 * Используется и при чтении файла (base — умолчания), и при изменении из интерфейса (base — текущие).
 */
export function normalizeSettings(input: unknown, base: StoredSettings): StoredSettings {
  const raw = asObject(input)
  const appearance = asObject(raw.appearance)
  const notifications = asObject(raw.notifications)
  const autoAccept = asObject(raw.autoAccept)
  const collapsed = asObject(raw.collapsed)
  const a = base.appearance
  const n = base.notifications

  return {
    id: typeof raw.id === 'string' && /^[\w-]{8,64}$/.test(raw.id) ? raw.id : base.id,
    name: typeof raw.name === 'string' ? cleanName(raw.name) : base.name,
    downloadDir:
      typeof raw.downloadDir === 'string' && path.isAbsolute(raw.downloadDir) ? raw.downloadDir : base.downloadDir,
    manualHosts: Array.isArray(raw.manualHosts)
      ? [...new Set(raw.manualHosts.filter((h): h is string => typeof h === 'string' && isValidIPv4(h)))].slice(
          0,
          MAX_MANUAL_HOSTS
        )
      : base.manualHosts,
    language: oneOf<Locale>(raw.language, LOCALES, base.language),
    appearance: {
      theme: oneOf(appearance.theme, THEMES, a.theme),
      font: oneOf(appearance.font, FONTS, a.font),
      uiScale: inRange(appearance.uiScale, UI_SCALE.min, UI_SCALE.max, UI_SCALE.step, a.uiScale),
      messageFontSize: inRange(
        appearance.messageFontSize,
        MESSAGE_FONT_SIZE.min,
        MESSAGE_FONT_SIZE.max,
        1,
        a.messageFontSize
      ),
      chatBackground: oneOf(appearance.chatBackground, CHAT_BACKGROUNDS, a.chatBackground),
      compact: asBool(appearance.compact, a.compact)
    },
    notifications: {
      system: asBool(notifications.system, n.system),
      messageSound: asBool(notifications.messageSound, n.messageSound),
      messageTone: oneOf(notifications.messageTone, MESSAGE_TONES, n.messageTone),
      groupTone: oneOf(notifications.groupTone, MESSAGE_TONES, n.groupTone),
      everyoneTone: oneOf(notifications.everyoneTone, MESSAGE_TONES, n.everyoneTone),
      // presenceSounds — ключ из первой версии настроек
      presenceSound: asBool(notifications.presenceSound, asBool(raw.presenceSounds, n.presenceSound))
    },
    sendKey: oneOf(raw.sendKey, SEND_KEYS, base.sendKey),
    historyRetention: oneOf(raw.historyRetention, HISTORY_RETENTIONS, base.historyRetention),
    autoAwayMinutes: oneOf<number>(raw.autoAwayMinutes, AUTO_AWAY_MINUTES, base.autoAwayMinutes),
    runInBackground: asBool(raw.runInBackground, base.runInBackground),
    openAtLogin: asBool(raw.openAtLogin, base.openAtLogin),
    readReceipts: asBool(raw.readReceipts, base.readReceipts),
    autoAccept: {
      mode: oneOf(autoAccept.mode, AUTO_ACCEPT_MODES, base.autoAccept.mode),
      maxSizeMb: oneOf<number>(autoAccept.maxSizeMb, AUTO_ACCEPT_SIZES_MB, base.autoAccept.maxSizeMb)
    },
    pinnedPeers: parsePinned(raw.pinnedPeers, base.pinnedPeers),
    presenceEvents: asBool(raw.presenceEvents, base.presenceEvents),
    collapsed: {
      groups: asBool(collapsed.groups, base.collapsed.groups),
      online: asBool(collapsed.online, base.collapsed.online),
      offline: asBool(collapsed.offline, base.collapsed.offline),
      archive: asBool(collapsed.archive, base.collapsed.archive)
    },
    trayHintShown: asBool(raw.trayHintShown, base.trayHintShown),
    groups: parseGroups(raw.groups, base.groups),
    archivedChats: parseArchived(raw.archivedChats, base.archivedChats),
    leftGroups: parseLeftGroups(raw.leftGroups, base.leftGroups),
    loginItemInitialized: asBool(raw.loginItemInitialized, base.loginItemInitialized),
    everyoneClearedAt: asInt(raw.everyoneClearedAt, 0, Number.MAX_SAFE_INTEGER) ?? base.everyoneClearedAt,
    lastSeenVersion:
      typeof raw.lastSeenVersion === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,6}([-+][\w.]{1,20})?$/.test(raw.lastSeenVersion)
        ? raw.lastSeenVersion
        : base.lastSeenVersion
  }
}

/** settings.json в папке данных приложения. Запись атомарная (tmp + rename). */
export class SettingsStore {
  private data: StoredSettings

  /** defaults.language — язык первого запуска: берётся, только если файла настроек ещё нет */
  constructor(
    private readonly file: string,
    defaults: { downloadDir: string; language?: Locale }
  ) {
    let raw: unknown = {}
    const firstRun = !fs.existsSync(file)
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      // первый запуск или повреждённый файл
    }
    const base = defaultSettings(defaults.downloadDir)
    if (firstRun && defaults.language) base.language = defaults.language
    this.data = normalizeSettings(raw, base)
    this.save()
  }

  get(): Readonly<StoredSettings> {
    return this.data
  }

  /** То, что видит интерфейс: без id и служебных флагов */
  view(): SettingsView {
    const d = this.data
    return {
      name: d.name,
      downloadDir: d.downloadDir,
      manualHosts: [...d.manualHosts],
      language: d.language,
      appearance: { ...d.appearance },
      notifications: { ...d.notifications },
      sendKey: d.sendKey,
      historyRetention: d.historyRetention,
      autoAwayMinutes: d.autoAwayMinutes,
      runInBackground: d.runInBackground,
      openAtLogin: d.openAtLogin,
      readReceipts: d.readReceipts,
      autoAccept: { ...d.autoAccept },
      pinnedPeers: d.pinnedPeers.map((p) => ({ ...p })),
      presenceEvents: d.presenceEvents,
      collapsed: { ...d.collapsed }
    }
  }

  /** Частичное изменение; некорректные значения игнорируются (остаются прежние). */
  groups(): readonly StoredGroup[] {
    return this.data.groups
  }

  getGroup(id: string): StoredGroup | undefined {
    return this.data.groups.find((g) => g.id === id)
  }

  /** Создать или обновить группу (состав приходит и от участников по сети) */
  upsertGroup(group: StoredGroup): StoredGroup | null {
    const existing = this.data.groups.find((g) => g.id === group.id)
    if (!existing && this.data.groups.length >= MAX_GROUPS) return null
    const next = existing
      ? this.data.groups.map((g) => (g.id === group.id ? { ...group, createdAt: g.createdAt } : g))
      : [...this.data.groups, group]
    this.update({ groups: next })
    return this.getGroup(group.id) ?? null
  }

  removeGroup(id: string): boolean {
    const group = this.getGroup(id)
    if (!group) return false
    // помним ревизию: анонс с тем же или меньшим номером группу не вернёт
    const leftGroups = [{ id, rev: group.rev }, ...this.data.leftGroups.filter((g) => g.id !== id)]
    this.update({ groups: this.data.groups.filter((g) => g.id !== id), leftGroups })
    return true
  }

  /** Ревизия, на которой группу покинули; null — не покидали */
  leftGroupRev(id: string): number | null {
    return this.data.leftGroups.find((g) => g.id === id)?.rev ?? null
  }

  /** Убрать из списка покинутых: участника вернули в группу осознанно */
  forgetLeftGroup(id: string): void {
    if (this.data.leftGroups.some((g) => g.id === id)) {
      this.update({ leftGroups: this.data.leftGroups.filter((g) => g.id !== id) })
    }
  }

  archived(): readonly ArchivedChat[] {
    return this.data.archivedChats
  }

  isArchived(id: string): boolean {
    return this.data.archivedChats.some((c) => c.id === id)
  }

  addArchived(chat: ArchivedChat): void {
    const rest = this.data.archivedChats.filter((c) => c.id !== chat.id)
    this.update({ archivedChats: [chat, ...rest].slice(0, MAX_ARCHIVED) })
  }

  removeArchived(id: string): boolean {
    if (!this.isArchived(id)) return false
    this.update({ archivedChats: this.data.archivedChats.filter((c) => c.id !== id) })
    return true
  }

  update(patch: SettingsUpdate): Readonly<StoredSettings> {
    const current = this.data
    const { appearance, notifications, autoAccept, collapsed, ...rest } = patch
    const merged = {
      ...current,
      ...withoutUndefined(rest as Raw),
      appearance: { ...current.appearance, ...withoutUndefined(asObject(appearance)) },
      notifications: { ...current.notifications, ...withoutUndefined(asObject(notifications)) },
      autoAccept: { ...current.autoAccept, ...withoutUndefined(asObject(autoAccept)) },
      collapsed: { ...current.collapsed, ...withoutUndefined(asObject(collapsed)) }
    }
    this.data = normalizeSettings(merged, current)
    this.save()
    return this.data
  }

  /** Ошибку возвращаем кодом: текст подставит main на языке интерфейса */
  addManualHost(host: string): ActionResult & { code?: 'bad-ip' | 'too-many' } {
    const value = host.trim()
    if (!isValidIPv4(value)) return { ok: false, code: 'bad-ip' }
    if (this.data.manualHosts.includes(value)) return { ok: true }
    if (this.data.manualHosts.length >= MAX_MANUAL_HOSTS) return { ok: false, code: 'too-many' }
    this.update({ manualHosts: [...this.data.manualHosts, value] })
    return { ok: true }
  }

  removeManualHost(host: string): void {
    this.update({ manualHosts: this.data.manualHosts.filter((h) => h !== host) })
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      const tmp = `${this.file}.${process.pid}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2) + '\n')
      fs.renameSync(tmp, this.file)
    } catch (err) {
      console.error('[settings] failed to save settings:', (err as Error).message)
    }
  }
}
