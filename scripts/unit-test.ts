// Модульные тесты без Electron и сети: настройки, история на диске, ссылки и поиск.
// Запуск: npm run test:unit
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SettingsStore, defaultSettings, normalizeSettings } from '../electron/settings'
import { ConversationStore } from '../electron/store'
import { HistoryPersistence, parseRecord, reviveItem } from '../electron/history'
import {
  LOCALES,
  LOCALE_LABELS,
  MESSAGE_KEYS,
  createTranslator,
  localeFromSystem,
  spellcheckLanguages,
  translate
} from '../src/i18n'
import { createLogger } from '../electron/logger'
import { isValidGroupId, parseEveryoneMeta, parseGroupInfo, parseReplyRef, parseSha256, parseThumbnail } from '../electron/protocol'
import { findLinks, findOccurrences } from '../src/text-utils'
import { compareVersions, displayVersion, formatTime, presenceSubtitle } from '../src/format'
import { PeerRegistry } from '../electron/peer-registry'
import { shouldShowWhatsNew, whatsNewFor } from '../src/whats-new'
import {
  ARRIVAL_MATCH_MS,
  NetworkArrival,
  PRESENCE_FLAP_MS,
  arrivalLineTime,
  isRealReturn,
  isVirtualInterface,
  physicalSubnets
} from '../electron/presence'
import { isGroupId, type ChatItem, type FileItem, type TextItem } from '../src/types'

let passed = 0
let failed = 0

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn()
    passed++
    console.log(`  ✔ ${name}`)
  } catch (err) {
    failed++
    console.log(`  ✘ ${name}\n      ${(err as Error).message}`)
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function eq(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hallway-unit-'))
const log = createLogger({ verbose: false }).scope('test')
const PEER = 'peer-1111-2222'
const ru = createTranslator('ru')

const text = (id: string, timestamp: number, extra: Partial<TextItem> = {}): TextItem => ({
  kind: 'text',
  id,
  peerId: PEER,
  direction: 'in',
  text: `сообщение ${id}`,
  timestamp,
  status: 'received',
  ...extra
})

const file = (id: string, timestamp: number, extra: Partial<FileItem> = {}): FileItem => ({
  kind: 'file',
  id,
  peerId: PEER,
  direction: 'in',
  name: `${id}.txt`,
  size: 10,
  transferred: 0,
  speed: 0,
  status: 'done',
  timestamp,
  ...extra
})

async function main() {
  console.log('settings')
  await test('умолчания для пустого файла', () => {
    const s = normalizeSettings({}, defaultSettings('/tmp/dl'))
    eq(
      s.appearance,
      { theme: 'system', font: 'system', uiScale: 100, messageFontSize: 14, chatBackground: 'none', compact: false },
      'appearance'
    )
    eq([s.historyRetention, s.sendKey, s.autoAwayMinutes], ['30d', 'enter', 10], 'defaults')
    assert(s.id.length >= 8, 'id must be generated')
  })
  await test('некорректные значения заменяются, масштаб округляется до шага и ограничивается', () => {
    const s = normalizeSettings(
      {
        appearance: { theme: 'neon', uiScale: 137, messageFontSize: 99, chatBackground: 'dots' },
        sendKey: 'space',
        autoAwayMinutes: 7,
        manualHosts: ['10.0.0.1', 'bad', '10.0.0.1']
      },
      defaultSettings('/tmp/dl')
    )
    eq(
      [s.appearance.theme, s.appearance.uiScale, s.appearance.messageFontSize, s.appearance.chatBackground],
      ['system', 140, 20, 'dots'],
      'appearance'
    )
    eq([s.sendKey, s.autoAwayMinutes, s.manualHosts], ['enter', 10, ['10.0.0.1']], 'other')
  })
  await test('старый ключ presenceSounds переносится в notifications.presenceSound', () => {
    eq(normalizeSettings({ presenceSounds: false }, defaultSettings('/d')).notifications.presenceSound, false, 'value')
  })
  await test('update: частичное изменение, мусор не портит текущие значения, всё переживает перезапуск', () => {
    const settingsFile = path.join(tmp, 'settings.json')
    const store = new SettingsStore(settingsFile, { downloadDir: '/tmp/dl' })
    store.update({ name: 'Алиса', appearance: { theme: 'midnight' } })
    store.update({ appearance: { compact: true, theme: 'bogus' as never }, notifications: { messageSound: false } })
    const reloaded = new SettingsStore(settingsFile, { downloadDir: '/tmp/dl' })
    const s = reloaded.get()
    eq(
      [s.name, s.appearance.theme, s.appearance.compact, s.notifications.messageSound, s.notifications.system],
      ['Алиса', 'midnight', true, false, true],
      'after reload'
    )
    eq(s.id, store.get().id, 'id is stable')
    assert(!('id' in reloaded.view()), 'view() must not expose id')
  })

  await test('звук сообщения: неизвестный вариант заменяется на «Колокольчик»', () => {
    eq(
      normalizeSettings({ notifications: { messageTone: 'siren' } }, defaultSettings('/d')).notifications.messageTone,
      'chime',
      'unknown tone'
    )
    eq(
      normalizeSettings({ notifications: { messageTone: 'birds' } }, defaultSettings('/d')).notifications.messageTone,
      'birds',
      'valid tone'
    )
  })

  await test('автоприём и закреплённые коллеги: некорректное отбрасывается', () => {
    const s = normalizeSettings(
      {
        autoAccept: { mode: 'everyone', maxSizeMb: 7 },
        pinnedPeers: [{ id: 'ok-1', name: '  Боб  ' }, { id: 'ok-1', name: 'дубль' }, { id: '../x', name: 'X' }, 'junk']
      },
      defaultSettings('/d')
    )
    eq(s.autoAccept, { mode: 'off', maxSizeMb: 200 }, 'invalid autoAccept')
    eq(s.pinnedPeers, [{ id: 'ok-1', name: 'Боб' }], 'pinned')
    eq(
      normalizeSettings({ autoAccept: { mode: 'pinned', maxSizeMb: 0 } }, defaultSettings('/d')).autoAccept,
      { mode: 'pinned', maxSizeMb: 0 },
      'valid autoAccept'
    )
  })

  await test('автозапуск включён по умолчанию, но выбор пользователя не переписывается', () => {
    eq(defaultSettings('/d').openAtLogin, true, 'default')
    eq(defaultSettings('/d').loginItemInitialized, false, 'migration flag')
    // настройки из 0.2.2: автозапуск выключен, флага ещё нет — main включит его один раз
    const old = normalizeSettings({ openAtLogin: false }, defaultSettings('/d'))
    eq([old.openAtLogin, old.loginItemInitialized], [false, false], 'old settings kept as is')
    const after = normalizeSettings({ openAtLogin: false, loginItemInitialized: true }, defaultSettings('/d'))
    eq([after.openAtLogin, after.loginItemInitialized], [false, true], 'user choice respected')
  })

  await test('язык интерфейса: только известный, иначе русский', () => {
    eq(defaultSettings('/d').language, 'ru', 'default')
    eq(normalizeSettings({ language: 'ro' }, defaultSettings('/d')).language, 'ro', 'valid')
    eq(normalizeSettings({ language: 'klingon' }, defaultSettings('/d')).language, 'ru', 'unknown')
    eq(normalizeSettings({ language: 42 }, defaultSettings('/d')).language, 'ru', 'junk')
    eq(normalizeSettings({ language: 'de' }, defaultSettings('/d')).language, 'de', 'German')
    eq(normalizeSettings({ language: 'es' }, defaultSettings('/d')).language, 'es', 'Spanish')
  })

  await test('язык первого запуска: из системы, только для новой установки', () => {
    eq(localeFromSystem(['de-AT', 'en-US']), 'de', 'de-AT')
    eq(localeFromSystem(['es-419']), 'es', 'es-419')
    eq(localeFromSystem(['fr-FR', 'es_MX', 'ru']), 'es', 'первый из известных')
    eq(localeFromSystem(['EN-gb']), 'en', 'регистр')
    eq(localeFromSystem(['fr-FR', 'it']), 'ru', 'неизвестные — русский')
    eq(localeFromSystem([]), 'ru', 'пусто — русский')
    const fresh = path.join(tmp, 'settings-first-run.json')
    eq(new SettingsStore(fresh, { downloadDir: '/d', language: 'de' }).get().language, 'de', 'новая установка')
    // перезапуск с другим языком системы: выбранный при установке язык остаётся
    eq(new SettingsStore(fresh, { downloadDir: '/d', language: 'es' }).get().language, 'de', 'после перезапуска')
    // уже установленная старая версия: файл есть, языка в нём нет — остаётся русский, как было
    const old = path.join(tmp, 'settings-old.json')
    fs.writeFileSync(old, JSON.stringify({ name: 'Боб' }))
    eq(new SettingsStore(old, { downloadDir: '/d', language: 'en' }).get().language, 'ru', 'старый файл без языка')
  })

  console.log('\nпереводы')
  await test('пять языков, у каждого своё название', () => {
    eq([...LOCALES], ['ru', 'en', 'de', 'es', 'ro'], 'порядок')
    eq(new Set(LOCALES.map((l) => LOCALE_LABELS[l])).size, LOCALES.length, 'названия')
  })
  await test('ни одного пустого перевода, подстановки и пробелы по краям — как в русском', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
    const edges = (s: string) => `${/^\s/.test(s)}${/\s$/.test(s)}`
    const problems: string[] = []
    for (const key of MESSAGE_KEYS) {
      const base = translate('ru', key)
      for (const locale of LOCALES) {
        const value = translate(locale, key)
        if (!value.trim()) problems.push(`${locale} ${key}: пусто`)
        if (vars(value) !== vars(base)) problems.push(`${locale} ${key}: подстановки ${vars(value)} ≠ ${vars(base)}`)
        if (edges(value) !== edges(base)) problems.push(`${locale} ${key}: пробелы по краям`)
      }
    }
    assert(MESSAGE_KEYS.length > 500, `ключей подозрительно мало: ${MESSAGE_KEYS.length}`)
    eq(problems, [], 'переводы')
  })
  await test('каждый язык действительно переведён, а не скопирован с английского', () => {
    for (const locale of ['de', 'es'] as const) {
      const same = MESSAGE_KEYS.filter((key) => {
        const value = translate(locale, key)
        return value === translate('en', key) && /[a-z]{4,}/i.test(value.replace(/\{\w+\}|Hallway|macOS|Windows|Linux/g, ''))
      })
      // совпадают только короткие слова: имена шрифтов, «Online», «Status», «Version» — но не фразы
      assert(same.length < 30, `${locale}: слишком много строк как в английском: ${same.join(', ')}`)
      const phrases = same.filter((key) => translate('en', key).length > 20)
      eq(phrases, [], `${locale}: фразы как в английском`)
    }
  })
  await test('немецкий и испанский: множественное число и подстановки', () => {
    const de = createTranslator('de')
    const es = createTranslator('es')
    eq([1, 2, 5, 21, 0].map((n) => de.plural('members', n)), ['1 Mitglied', '2 Mitglieder', '5 Mitglieder', '21 Mitglieder', '0 Mitglieder'], 'de')
    eq([1, 2, 11].map((n) => es.plural('minutes', n)), ['1 minuto', '2 minutos', '11 minutos'], 'es')
    eq(de('group.leaveTitle', { name: 'Vertrieb' }), 'Gruppe „Vertrieb“ verlassen?', 'de params')
    eq(es('group.leaveTitle', { name: 'Ventas' }), '¿Salir del grupo «Ventas»?', 'es params')
    eq(es('sidebar.you'), 'Tú: ', 'es trailing space')
  })
  await test('время в 24-часовом формате на всех языках', () => {
    const at = new Date(2026, 8, 24, 14, 5).getTime()
    for (const locale of LOCALES) eq(formatTime(locale, at), '14:05', locale)
  })
  await test('словари орфографии: точное имя, иначе любой вариант того же языка', () => {
    eq(spellcheckLanguages('de', ['de-DE', 'en-US', 'ru']), ['de-DE', 'ru', 'en-US'], 'точные')
    eq(spellcheckLanguages('es', ['es', 'es-419', 'en-GB', 'ru-RU']), ['es', 'ru-RU', 'en-GB'], 'варианты')
    eq(spellcheckLanguages('ru', ['ru', 'en-US', 'de-DE']), ['ru', 'en-US'], 'русский как раньше')
    eq(spellcheckLanguages('ro', ['ro', 'ru', 'en-US']), ['ro', 'ru', 'en-US'], 'румынский как раньше')
    eq(spellcheckLanguages('de', []), [], 'словарей нет')
    eq(spellcheckLanguages('en', ['en-US', 'en-GB', 'ru']), ['en-US', 'ru'], 'без дублей')
  })

  console.log('\nгруппы')
  await test('группы в настройках: мусор отбрасывается, состав переживает перезапуск', () => {
    const settingsFile = path.join(tmp, 'groups.json')
    const store = new SettingsStore(settingsFile, { downloadDir: '/tmp/dl' })
    const group = {
      id: 'g-1111-2222',
      name: '  Отдел продаж  ',
      members: [
        { id: 'me', name: 'Я' },
        { id: 'peer-1', name: 'Боб' },
        { id: 'peer-1', name: 'дубль' }
      ],
      createdAt: 1000,
      rev: 1,
      ownerId: 'me'
    }
    assert(store.upsertGroup(group), 'group stored')
    const reloaded = new SettingsStore(settingsFile, { downloadDir: '/tmp/dl' })
    const saved = reloaded.getGroup('g-1111-2222')
    assert(saved, 'group survives restart')
    eq([saved.name, saved.members.length, saved.createdAt, saved.rev], ['Отдел продаж', 2, 1000, 1], 'stored group')
    // без участников, с плохим id и не-объекты — не группы
    const junk = normalizeSettings(
      { groups: [{ id: 'g-ok', name: 'X', members: [] }, { id: 'no-prefix', members: [{ id: 'a' }] }, 42] },
      defaultSettings('/d')
    )
    eq(junk.groups, [], 'junk groups dropped')
    eq(reloaded.removeGroup('g-1111-2222'), true, 'removed')
    eq(reloaded.getGroup('g-1111-2222'), undefined, 'gone')
  })

  await test('состав группы из сети: проверяются id, имена и лимит участников', () => {
    const info = parseGroupInfo({
      id: 'g-abc',
      name: ' Группа   А',
      members: [
        { id: 'a', name: 'Алиса' },
        { id: 'a', name: 'дубль' },
        { id: '../evil', name: 'Зло' },
        { id: 'b', name: '' }
      ]
    })
    assert(info, 'parsed')
    eq(info.name, 'Группа А', 'name cleaned')
    // пустое имя остаётся пустым: подпись «Собеседник» подставит интерфейс на своём языке
    eq(info.members, [{ id: 'a', name: 'Алиса' }, { id: 'b', name: '' }], 'members')
    eq(parseGroupInfo({ id: 'not-a-group', members: [{ id: 'a' }] }), undefined, 'bad id')
    eq(parseGroupInfo({ id: 'g-x', members: [] }), undefined, 'no members')
    eq(parseGroupInfo(null), undefined, 'null')
    eq([isValidGroupId('g-1'), isValidGroupId('peer'), isGroupId('g-2')], [true, false, true], 'id checks')
  })

  await test('ревизия и владелец группы: старые группы получают владельцем первого участника', () => {
    const s = normalizeSettings(
      {
        groups: [
          {
            id: 'g-old',
            name: 'Из 1.1',
            members: [{ id: 'first' }, { id: 'second' }]
          },
          {
            id: 'g-new',
            name: 'Свежая',
            members: [{ id: 'a' }, { id: 'b' }],
            rev: 7,
            ownerId: 'b'
          },
          {
            id: 'g-bad-owner',
            name: 'Владелец не в составе',
            members: [{ id: 'a' }],
            rev: 2,
            ownerId: 'кто-то'
          }
        ]
      },
      defaultSettings('/d')
    )
    eq(
      s.groups.map((g) => [g.id, g.rev, g.ownerId]),
      [
        ['g-old', 1, 'first'],
        ['g-new', 7, 'b'],
        ['g-bad-owner', 2, 'a']
      ],
      'rev и владелец'
    )
  })

  await test('состав из сети: ревизия и владелец проверяются', () => {
    const info = parseGroupInfo({
      id: 'g-rev',
      name: 'Склад',
      rev: 5,
      owner: 'b',
      members: [{ id: 'a', name: 'Алиса' }, { id: 'b', name: 'Борис' }]
    })
    assert(info, 'parsed')
    eq([info.rev, info.ownerId], [5, 'b'], 'rev и владелец')
    // владелец не из состава и мусор в rev заменяются безопасными значениями
    const fallback = parseGroupInfo({ id: 'g-rev', members: [{ id: 'a' }, { id: 'b' }], rev: 'много', owner: 'чужой' })
    eq([fallback?.rev, fallback?.ownerId], [1, 'a'], 'подстановка')
  })

  await test('покинутые группы: старый анонс не возвращает, осознанное добавление возвращает', () => {
    const store = new SettingsStore(path.join(tmp, 'left.json'), { downloadDir: '/d' })
    const group = {
      id: 'g-left',
      name: 'Склад',
      members: [{ id: 'me', name: 'Я' }, { id: 'peer', name: 'Пётр' }],
      createdAt: 1,
      rev: 4,
      ownerId: 'me'
    }
    store.upsertGroup(group)
    store.removeGroup('g-left')
    eq(store.getGroup('g-left'), undefined, 'группы нет')
    eq(store.leftGroupRev('g-left'), 4, 'ревизия выхода запомнена')
    store.forgetLeftGroup('g-left')
    eq(store.leftGroupRev('g-left'), null, 'после осознанного добавления забываем')
  })

  await test('архив: запись, восстановление, мусор отбрасывается', () => {
    const store = new SettingsStore(path.join(tmp, 'archive.json'), { downloadDir: '/d' })
    store.addArchived({ id: 'g-1', kind: 'group', name: 'Склад', members: 3, reason: 'deleted', at: 5 })
    store.addArchived({ id: 'peer-1', kind: 'peer', name: 'Пётр', members: 0, reason: 'hidden', at: 6 })
    eq(store.isArchived('g-1'), true, 'группа в архиве')
    eq(store.archived().length, 2, 'две записи')
    eq(store.removeArchived('peer-1'), true, 'вернули из архива')
    eq(store.isArchived('peer-1'), false, 'записи нет')
    const junk = normalizeSettings(
      { archivedChats: [{ id: '../evil', kind: 'group' }, { id: 'ok', kind: 'странно', reason: 'мусор' }, 7] },
      defaultSettings('/d')
    )
    eq(junk.archivedChats.map((c) => [c.id, c.kind, c.reason]), [['ok', 'peer', 'hidden']], 'мусор отброшен')
  })

  await test('служебные строки: неизвестные события отбрасываются, имена чистятся', () => {
    const record = parseRecord({
      version: 1,
      peer: { id: PEER, name: 'X' },
      items: [
        { kind: 'event', id: 'e1', peerId: PEER, timestamp: 1, event: 'peer-online' },
        { kind: 'event', id: 'e2', peerId: PEER, timestamp: 2, event: 'group-member-added', actorName: ' Алиса ', targetName: 'Вера' },
        { kind: 'event', id: 'e3', peerId: PEER, timestamp: 3, event: 'полная-чушь' }
      ]
    })
    assert(record, 'record')
    eq(record.items.map((i) => i.id), ['e1', 'e2'], 'только известные события')
    const second = record.items[1]
    assert(second.kind === 'event', 'kind')
    eq([second.actorName, second.targetName], ['Алиса', 'Вера'], 'имена')
  })

  await test('рассылка файла в группу: части проверяются, прерванные помечаются', () => {
    const record = parseRecord({
      version: 1,
      peer: { id: 'g-file', name: 'Склад', platform: 'group' },
      items: [
        {
          kind: 'file',
          id: 'card',
          peerId: 'g-file',
          direction: 'out',
          name: 'отчёт.pdf',
          size: 100,
          transferred: 50,
          speed: 0,
          status: 'transferring',
          timestamp: 10,
          authorId: 'me',
          parts: [
            { peerId: 'a', name: 'Алиса', status: 'done', transferred: 100 },
            { peerId: 'b', name: 'Борис', status: 'transferring', transferred: 20 },
            { peerId: '../evil', name: 'Зло', status: 'done', transferred: 0 },
            { peerId: 'c', name: 'Вера', status: 'непонятно', transferred: 0 }
          ]
        }
      ]
    })
    assert(record, 'record')
    const card = record.items[0]
    assert(card.kind === 'file', 'kind')
    eq(card.parts?.map((p) => p.peerId), ['a', 'b'], 'только корректные части')
    // после перезапуска незаконченные части помечаются прерванными,
    // а карточка остаётся «передан», потому что хотя бы одному участнику файл дошёл
    const revived = reviveItem(ru, card)
    assert(revived.kind === 'file', 'kind')
    eq(revived.parts?.map((p) => p.status), ['done', 'failed'], 'части')
    eq([revived.status, revived.speed], ['done', 0], 'карточка')
    // если не дошёл никому — карточка помечается ошибкой
    const nobody = reviveItem(ru, { ...card, parts: [{ peerId: 'a', name: 'А', status: 'transferring', transferred: 1 }] })
    assert(nobody.kind === 'file', 'kind')
    eq(nobody.status, 'failed', 'никому не дошло')
  })

  console.log('\nhistory')
  await test('сохранение и загрузка: сообщения, файлы, пути, непрочитанные, имя собеседника', () => {
    const dir = path.join(tmp, 'h1')
    const a = new ConversationStore()
    const persistence = new HistoryPersistence(dir, log, 10)
    a.on('changed', (peerId: string) => persistence.schedule(peerId, () => a.record(peerId)))
    a.rememberPeer({ id: PEER, name: 'Борис', platform: 'win32' })
    a.upsert(text('t1', 1000))
    a.upsert(file('f1', 2000))
    a.setFilePath(PEER, 'f1', path.join(tmp, 'f1.txt'))
    a.incrementUnread(PEER)
    persistence.flush()

    const b = new ConversationStore()
    b.load(new HistoryPersistence(dir, log).loadAll())
    eq(b.conversationsSnapshot()[PEER]?.map((i) => i.id), ['t1', 'f1'], 'items')
    eq(b.getFilePath('f1'), path.join(tmp, 'f1.txt'), 'file path')
    eq(b.unreadSnapshot()[PEER], 1, 'unread')
    eq(b.knownPeers()[0]?.name, 'Борис', 'peer name')
  })
  await test('после перезапуска: очередь отправки продолжается, прерванные передачи помечаются', () => {
    // status есть у сообщений и файлов, но не у служебных строк — отсюда приведение типа
    const status = (item: ChatItem) => (item.kind === 'event' ? undefined : item.status)
    // недоставленное сообщение не «не доставлено», а снова в очереди — уйдёт само
    const queuedText = reviveItem(ru, text('t', 1, { direction: 'out', status: 'sending' })) as TextItem
    eq([queuedText.status, queuedText.queued], ['sending', true], 'sending text stays queued')
    const queuedGroup = reviveItem(ru, text('g', 1, { peerId: 'g-1', direction: 'out', status: 'sent', pendingTo: ['p-1'] })) as TextItem
    eq(queuedGroup.pendingTo, ['p-1'], 'group recipients still waiting')
    // личное предложение файла, не дошедшее до получателя, — тоже в очереди
    const queuedOffer = reviveItem(ru, file('o', 1, { direction: 'out', status: 'offering' })) as FileItem
    eq([queuedOffer.status, queuedOffer.queued], ['offering', true], 'personal offer stays queued')
    eq(status(reviveItem(ru, file('e', 1, { peerId: 'everyone', direction: 'out', status: 'offering' }))), 'failed', 'everyone file interrupted while hashing')
    eq(status(reviveItem(ru, file('f', 1, { status: 'transferring', speed: 5 }))), 'failed', 'transferring file')
    eq(status(reviveItem(ru, file('f', 1, { status: 'pending' }))), 'pending', 'pending offer')
  })
  await test('срок хранения: старое удаляется, незавершённая передача остаётся', () => {
    const s = new ConversationStore()
    s.upsert(text('old', 100))
    s.upsert(file('old-active', 100, { status: 'pending' }))
    s.upsert(text('new', 5000))
    eq(s.pruneOlderThan(1000), [PEER], 'affected peers')
    eq(s.conversationsSnapshot()[PEER]?.map((i) => i.id), ['old-active', 'new'], 'left')
  })
  await test('очистка чата: сбрасывает непрочитанные и удаляет файл истории', () => {
    const dir = path.join(tmp, 'h2')
    const s = new ConversationStore()
    const persistence = new HistoryPersistence(dir, log, 10)
    s.on('changed', (peerId: string) => persistence.schedule(peerId, () => s.record(peerId)))
    s.upsert(text('t1', 1))
    s.incrementUnread(PEER)
    persistence.flush()
    assert(fs.existsSync(path.join(dir, `${PEER}.json`)), 'history file must be written')
    assert(s.clearConversation(PEER), 'must report cleared')
    persistence.flush()
    eq(s.unreadSnapshot()[PEER], 0, 'unread')
    assert(!fs.existsSync(path.join(dir, `${PEER}.json`)), 'history file must be removed')
  })
  await test('«Не сохранять»: deleteAll удаляет файлы и отменяет отложенную запись', () => {
    const dir = path.join(tmp, 'h3')
    const s = new ConversationStore()
    const persistence = new HistoryPersistence(dir, log, 10)
    s.upsert(text('t1', 1))
    persistence.schedule(PEER, () => s.record(PEER))
    persistence.flush()
    persistence.schedule(PEER, () => s.record(PEER))
    persistence.deleteAll()
    persistence.flush()
    eq(fs.readdirSync(dir), [], 'dir content')
  })
  await test('повреждённые и чужие данные в файлах истории отбрасываются', () => {
    const dir = path.join(tmp, 'h4')
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 'broken.json'), '{ not json')
    fs.writeFileSync(path.join(dir, 'wrong-version.json'), JSON.stringify({ version: 2, peer: { id: PEER }, items: [] }))
    fs.writeFileSync(
      path.join(dir, `${PEER}.json`),
      JSON.stringify({
        version: 1,
        peer: { id: PEER, name: 'X' },
        unread: -5,
        items: [text('ok', 1), { ...text('alien', 2), peerId: 'someone-else' }, { kind: 'text', id: 'no-status' }],
        filePaths: { ok: 'relative/path' }
      })
    )
    const records = new HistoryPersistence(dir, log).loadAll()
    eq(records.length, 1, 'records')
    eq(records[0].items.map((i) => i.id), ['ok'], 'items')
    eq([records[0].unread, records[0].filePaths], [0, {}], 'unread and paths')
    eq(parseRecord({ version: 1, peer: { id: '../../etc' }, items: [] }), null, 'unsafe peer id')
  })

  await test('история: миниатюры, цитаты и «прочитано» проверяются при загрузке', () => {
    const good = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
    const record = parseRecord({
      version: 1,
      peer: { id: PEER, name: 'X' },
      items: [
        text('r1', 1, {
          direction: 'out',
          status: 'read',
          replyTo: { id: 'q', text: 'цитата', authorId: PEER },
          broadcast: true
        }),
        text('r2', 2, { replyTo: { id: 'q' } as never, broadcast: 'yes' as never }),
        file('img1', 3, { thumbnail: good }),
        file('img2', 4, { thumbnail: 'data:image/svg+xml;base64,PHN2Zz4=' })
      ]
    })
    const [r1, r2, img1, img2] = record!.items as [TextItem, TextItem, FileItem, FileItem]
    eq([r1.status, r1.replyTo?.text, r1.broadcast], ['read', 'цитата', true], 'r1')
    eq([r2.replyTo, r2.broadcast], [undefined, undefined], 'r2')
    eq([img1.thumbnail === good, img2.thumbnail], [true, undefined], 'thumbnails')
  })

  await test('история: автор группового сообщения проверяется при загрузке', () => {
    const record = parseRecord({
      version: 1,
      peer: { id: 'g-7777-8888', name: 'Отдел', platform: 'group' },
      items: [
        { ...text('m1', 1), peerId: 'g-7777-8888', authorId: 'peer-1', authorName: '  Боб  ' },
        { ...text('m2', 2), peerId: 'g-7777-8888', authorId: '../evil', authorName: 'Зло' },
        { ...text('m3', 3), peerId: 'g-7777-8888', authorName: 'Без id' }
      ]
    })
    assert(record, 'record parsed')
    const [m1, m2, m3] = record.items as TextItem[]
    eq([m1.authorId, m1.authorName], ['peer-1', 'Боб'], 'm1')
    eq([m2.authorId, m2.authorName], [undefined, undefined], 'm2')
    eq([m3.authorId, m3.authorName], [undefined, undefined], 'author name without id is dropped')
    eq(record.peer.platform, 'group', 'group conversation is stored like a peer one')
  })

  await test('история из 0.2.2 читается новой версией без потерь', () => {
    const dir = path.join(tmp, 'h-upgrade')
    fs.mkdirSync(dir)
    // ровно та структура, которую писала 0.2.2: без authorId, authorName и sticker
    fs.writeFileSync(
      path.join(dir, `${PEER}.json`),
      JSON.stringify({
        version: 1,
        peer: { id: PEER, name: 'Мария', platform: 'win32' },
        unread: 2,
        items: [
          { kind: 'text', id: 'old-1', peerId: PEER, direction: 'in', text: 'привет', timestamp: 111, status: 'received' },
          {
            kind: 'text',
            id: 'old-2',
            peerId: PEER,
            direction: 'out',
            text: 'до связи',
            timestamp: 222,
            status: 'read',
            replyTo: { id: 'old-1', text: 'привет', authorId: PEER }
          },
          {
            kind: 'file',
            id: 'old-3',
            peerId: PEER,
            direction: 'in',
            name: 'отчёт.pdf',
            size: 100,
            transferred: 100,
            speed: 0,
            status: 'done',
            timestamp: 333
          }
        ],
        filePaths: { 'old-3': '/tmp/отчёт.pdf' }
      })
    )
    const records = new HistoryPersistence(dir, log).loadAll()
    eq(records.length, 1, 'record loaded')
    const store = new ConversationStore()
    store.load(records)
    const items = store.conversationsSnapshot()[PEER]
    eq(items.map((i) => i.id), ['old-1', 'old-2', 'old-3'], 'all items survive the upgrade')
    eq((items[1] as TextItem).replyTo?.text, 'привет', 'quote survives')
    eq(store.unreadSnapshot()[PEER], 2, 'unread survives')
    eq(store.getFilePath('old-3'), '/tmp/отчёт.pdf', 'file path survives')
    eq(store.knownPeers()[0].name, 'Мария', 'peer name survives')
  })

  console.log('\nprotocol')
  await test('миниатюра: только base64 JPEG/PNG разумного размера', () => {
    eq(parseThumbnail('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=', 'png')
    eq(parseThumbnail('data:image/svg+xml;base64,PHN2Zz4='), undefined, 'svg')
    eq(parseThumbnail('javascript:alert(1)'), undefined, 'javascript')
    eq(parseThumbnail('data:image/jpeg;base64,' + 'A'.repeat(300_000)), undefined, 'too big')
  })
  await test('цитата: текст обрезается до 300 символов, без id не принимается', () => {
    eq(parseReplyRef({ id: 'a', authorId: 'b', text: 'x'.repeat(500) })?.text.length, 300, 'trim')
    eq(parseReplyRef({ authorId: 'b', text: 'x' }), undefined, 'no id')
  })

  console.log('\ntext')
  await test('ссылки: пунктуация в конце, www, скобки', () => {
    const links = findLinks('См. https://example.com/a?b=1. И (www.site.ru/path) и http://x.io/wiki_(test)!')
    eq(
      links.map((l) => l.href),
      ['https://example.com/a?b=1', 'https://www.site.ru/path', 'http://x.io/wiki_(test)'],
      'hrefs'
    )
  })
  await test('версия: нулевой патч не показывается', () => {
    eq(displayVersion('1.1.0'), '1.1', 'патч 0 убирается')
    eq(displayVersion('1.1.2'), '1.1.2', 'ненулевой патч остаётся')
    eq(displayVersion('1.10.0'), '1.10', 'двузначный минор')
    eq(displayVersion('0.2.2'), '0.2.2', 'старый номер не меняется')
    eq(displayVersion(''), '', 'пусто')
  })
  await test('поиск: без учёта регистра, ё = е, все вхождения', () => {
    eq(
      findOccurrences('Ёлка и ЕЛКА, ёлка', 'елка'),
      [
        [0, 4],
        [7, 11],
        [13, 17]
      ],
      'occurrences'
    )
    eq(findOccurrences('abc', ''), [], 'empty query')
  })

  // ─── 1.3: входы и выходы, версии, галочки ────────────────────────────────────
  await test('строка «в сети»: время из анонса коллеги, один раз на приход', () => {
    const at = 1_000_000_000_000
    const online = (timestamp: number) => ({ event: 'peer-online' as const, timestamp })
    const offline = (timestamp: number) => ({ event: 'peer-offline' as const, timestamp })
    // коллега 1.3 пришёл в 7:49, а мы проснулись позже — пишем его время, не наше
    eq(arrivalLineTime(null, at, null), at, 'пустая переписка, наблюдение не велось')
    eq(arrivalLineTime(offline(at - 3600_000), at, at + 600_000), at, 'после вчерашнего «вышел»')
    // та же строка уже есть (время из анонса дрожит на секунды) — второй раз не пишем
    eq(arrivalLineTime(online(at), at + 3000, null), null, 'тот же приход после нашего перезапуска')
    eq(arrivalLineTime(online(at + 60_000), at, at + 120_000), null, 'наблюдали сами на минуту позже')
    // пропустили его уход (мы спали), а он пришёл заново — новая строка
    eq(arrivalLineTime(online(at - 5 * 3600_000), at, null), at, 'новый приход после пропущенного ухода')
    // уход записан ПОСЛЕ его «прихода»: связь между нами пропадала, он не перезапускался
    eq(arrivalLineTime(offline(at + 3600_000), at, at + 3900_000), at + 3900_000, 'вернулся, когда увидели')
    eq(arrivalLineTime(offline(at + 3600_000), at, null), null, 'не следили — время неизвестно')
    // клиент до 1.3: только то, что видели сами
    eq(arrivalLineTime(offline(at), null, at + 600_000), at + 600_000, 'старый клиент, видели сами')
    eq(arrivalLineTime(offline(at), null, null), null, 'старый клиент, не следили (наш сон/запуск)')
    eq(arrivalLineTime(online(at), null, at + ARRIVAL_MATCH_MS - 1000), null, 'повтор в пределах окна')
    // перезапуск через минуту после прошлого прихода — это новый приход, не дрожание
    eq(arrivalLineTime(online(at), at + 60_000, null), at + 60_000, 'перезапуск через минуту')
    assert(ARRIVAL_MATCH_MS <= 30_000, 'окно склейки — только на дрожание времени')
    assert(PRESENCE_FLAP_MS === 2 * 60 * 1000, 'короткий обрыв — до 2 минут')
  })
  await test('вернулся после обрыва: сбой связи или уходил на самом деле', () => {
    const drop = 2_000_000_000_000
    eq(isRealReturn(drop, drop + 30_000, drop + 20_000), false, 'через 30 секунд — всегда сбой связи')
    eq(isRealReturn(drop, drop + 3600_000, drop - 3600_000), false, 'в сети с до обрыва — пропадала связь у нас')
    eq(isRealReturn(drop, drop + 3600_000, drop + 1800_000), true, 'вошёл заново через полчаса — уходил')
    eq(isRealReturn(drop, drop + 3600_000, null), false, 'клиент до 1.3 — не знаем, строк не пишем')
  })
  await test('своя сеть: виртуальные адаптеры и короткие пропадания не считаются приходом', () => {
    for (const name of ['bridge100', 'vmnet8', 'utun3', 'ipsec0', 'ppp0', 'vEthernet (Default Switch)', 'VirtualBox Host-Only Network', 'VMware Network Adapter VMnet1', 'awdl0']) {
      assert(isVirtualInterface(name), `${name} — виртуальный`)
    }
    for (const name of ['en0', 'en7', 'Ethernet', 'Wi-Fi', 'Беспроводная сеть', 'eth0', 'wlan0']) {
      assert(!isVirtualInterface(name), `${name} — настоящий`)
    }
    eq(
      physicalSubnets([
        { iface: 'en0', address: '192.168.1.20', broadcast: '192.168.1.255' },
        { iface: 'bridge100', address: '10.211.55.2', broadcast: '10.211.55.255' },
        { iface: 'ipsec0', address: '10.8.0.5', broadcast: null }
      ]),
      ['192.168.1.255'],
      'подсети без виртуальных'
    )
    const arrival = new NetworkArrival(120_000)
    const t0 = 5_000_000
    eq(arrival.update(['192.168.8.255'], t0), false, 'первый замер при запуске — не приход')
    eq(arrival.update(['192.168.8.255'], t0 + 5000), false, 'та же сеть')
    eq(arrival.update([], t0 + 10_000), false, 'Wi-Fi пропал')
    eq(arrival.update(['192.168.8.255'], t0 + 60_000), false, 'вернулся через минуту — не приход')
    eq(arrival.update(['192.168.8.255', '192.168.1.255'], t0 + 65_000), true, 'новая сеть (офис) — приход')
    eq(arrival.update([], t0 + 70_000), false, 'ушли из офиса')
    eq(arrival.update(['192.168.1.255'], t0 + 3600_000), true, 'вернулись через час — приход')
  })
  await test('служебная строка «задним числом» встаёт на своё место по времени', () => {
    const store = new ConversationStore()
    const emitted: string[] = []
    store.on('item', (item: ChatItem) => emitted.push(item.id))
    store.upsert(text('m1', 1000))
    store.upsert(text('m2', 3000))
    store.upsert({ kind: 'event', id: 'e1', peerId: PEER, timestamp: 2000, event: 'peer-online' })
    eq(store.conversationsSnapshot()[PEER].map((i) => i.id), ['m1', 'e1', 'm2'], 'порядок')
    store.upsert({ kind: 'event', id: 'e2', peerId: PEER, timestamp: 5000, event: 'peer-offline' })
    eq(store.conversationsSnapshot()[PEER].map((i) => i.id), ['m1', 'e1', 'm2', 'e2'], 'свежая строка — в конце')
    eq(store.lastPresenceEvent(PEER), { event: 'peer-offline', timestamp: 5000 }, 'последняя строка присутствия')
    // обновление существующего сообщения порядок не трогает
    store.upsert(text('m1', 1000, { text: 'правка' }))
    eq(store.conversationsSnapshot()[PEER].map((i) => i.id), ['m1', 'e1', 'm2', 'e2'], 'после обновления')
    eq(store.lastPresenceEvent('nobody'), null, 'нет переписки')
    eq(emitted.length, 5, 'события item')
  })
  await test('реестр коллег хранит версию и не теряет её из-за TCP-приветствия', () => {
    const file = path.join(tmp, 'known-peers.json')
    const registry = new PeerRegistry(file, log)
    registry.seen({ id: 'yura-1', name: 'Yura', platform: 'win32', version: '1.3.0' }, 1000)
    registry.seen({ id: 'yura-1', name: 'Yura' }, 2000) // приветствие по TCP версии не знает
    eq(registry.get('yura-1')?.version, '1.3.0', 'версия сохранилась')
    registry.seen({ id: 'yura-1', name: 'Yura', version: null }, 1500) // откатился на 1.2
    eq(registry.get('yura-1')?.version, null, 'клиент до 1.3')
    eq(registry.lastSeenAt('yura-1'), 2000, 'время «был в сети» не уезжает назад')
    registry.seen({ id: 'petr-1', name: 'Petr', platform: 'win32', version: '1.2.9' })
    registry.flush()
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Array<Record<string, unknown>>
    raw.push({ id: 'bad-1', name: 'X', version: '<script>' })
    fs.writeFileSync(file, JSON.stringify(raw))
    const reloaded = new PeerRegistry(file, log)
    eq(reloaded.get('petr-1')?.version, '1.2.9', 'версия после перезапуска')
    eq(reloaded.get('bad-1')?.version, null, 'мусор вместо версии отброшен')
  })
  await test('версии: сравнение и «до 1.3»', () => {
    assert(compareVersions('1.2.0', '1.3.0') < 0, '1.2 < 1.3')
    assert(compareVersions('1.10.0', '1.9.3') > 0, '1.10 > 1.9')
    eq(compareVersions('1.3.0', '1.3.0'), 0, 'равны')
    eq(compareVersions('1.3.0-beta.1', '1.3.0'), 0, 'предрелиз той же версии')
    assert(compareVersions(null, '1.3.0') < 0, 'не сообщает версию — старее')
    assert(compareVersions('1.3.0', null) > 0, 'наоборот')
  })
  await test('шапка чата: «в сети с 7:49», «отошёл с 12:26», без времени — просто статус', () => {
    const today = new Date()
    today.setHours(7, 49, 0, 0)
    const lunch = new Date()
    lunch.setHours(12, 26, 0, 0)
    eq(presenceSubtitle(ru, { status: 'online', onlineSince: today.getTime(), statusSince: lunch.getTime() }), 'в сети с 07:49', 'в сети')
    eq(presenceSubtitle(ru, { status: 'away', onlineSince: today.getTime(), statusSince: lunch.getTime() }), 'отошёл с 12:26', 'отошёл')
    eq(presenceSubtitle(ru, { status: 'dnd', onlineSince: null, statusSince: null }), 'не беспокоить', 'время неизвестно')
    const yesterday = today.getTime() - 86400_000
    const label = presenceSubtitle(ru, { status: 'online', onlineSince: yesterday, statusSince: null })
    assert(/^в сети с \d+ .+, 07:49$/.test(label), `вчера — с датой: ${label}`)
    const en = createTranslator('en')
    eq(presenceSubtitle(en, { status: 'away', onlineSince: null, statusSince: lunch.getTime() }).startsWith('away since'), true, 'английский')
  })

  // ─── общий чат и мелодии ─────────────────────────────────────────────────────
  await test('общий чат: метка сообщения проверяется как недоверенные данные', () => {
    eq(parseEveryoneMeta({ id: 'm-1', author: 'p-2', name: ' Вера\t ', age: 5000 }), { id: 'm-1', author: 'p-2', authorName: 'Вера', age: 5000 }, 'valid')
    eq(parseEveryoneMeta({ id: '../x', author: 'p-2', age: 1 }), undefined, 'bad id')
    eq(parseEveryoneMeta({ id: 'm-1', author: 'p-2', age: -5 }), undefined, 'negative age')
    eq(parseEveryoneMeta({ id: 'm-1', author: 'p-2', age: 10 * 24 * 3600_000 }), undefined, 'older than the sync window')
    eq(parseEveryoneMeta({ id: 'm-1', age: 1 }), undefined, 'no author')
    eq(parseEveryoneMeta('m-1'), undefined, 'not an object')
  })
  await test('досланное старое сообщение встаёт на своё место в переписке', () => {
    const store = new ConversationStore()
    const chat = 'everyone'
    store.upsert({ ...text('a', 1000), peerId: chat })
    store.upsert({ ...text('c', 3000), peerId: chat })
    store.upsert({ ...text('b', 2000), peerId: chat, authorId: 'p-9', authorName: 'Вера' })
    eq(store.items(chat).map((i) => i.id), ['a', 'b', 'c'], 'order by time')
  })
  await test('мелодии: своя у личных, групп и общего чата, «без звука» допустимо', () => {
    const d = defaultSettings(os.tmpdir())
    eq([d.notifications.messageTone, d.notifications.groupTone, d.notifications.everyoneTone], ['chime', 'drop', 'marimba'], 'defaults')
    const n = normalizeSettings({ notifications: { messageTone: 'harp', groupTone: 'none', everyoneTone: 'trumpet' } }, d)
    eq([n.notifications.messageTone, n.notifications.groupTone, n.notifications.everyoneTone], ['harp', 'none', 'marimba'], 'normalized')
    eq(normalizeSettings({ everyoneClearedAt: 'x' }, d).everyoneClearedAt, 0, 'cleared watermark default')
    eq(normalizeSettings({ everyoneClearedAt: 12345 }, d).everyoneClearedAt, 12345, 'cleared watermark kept')
  })

  await test('файлы общего чата: сумма и «кто скачал» проверяются, недокачанное — «скачать ещё раз»', () => {
    const sum = 'ab'.repeat(32)
    eq(parseSha256(sum), sum, 'valid sha256')
    eq(parseSha256(sum.toUpperCase()), undefined, 'uppercase rejected')
    eq(parseSha256('ab'.repeat(31)), undefined, 'short rejected')
    const record = parseRecord({
      version: 1,
      peer: { id: 'everyone', name: '', platform: 'unknown' },
      unread: 0,
      items: [
        file('f-1', 1000, { peerId: 'everyone', status: 'pending', sha256: sum, authorId: 'p-1' }),
        file('f-2', 2000, { peerId: 'everyone', status: 'transferring', sha256: 'bad', authorId: 'p-1' }),
        file('f-3', 3000, { peerId: 'everyone', direction: 'out', status: 'done', sha256: sum, downloadedBy: ['p-1', 7, 'p-2'] as never })
      ],
      filePaths: {}
    })
    assert(record, 'record parsed')
    const [pending, interrupted, own] = record.items.map((item) => reviveItem(ru, item)) as FileItem[]
    eq([pending.status, pending.sha256], ['pending', sum], 'pending card kept with its sum')
    eq([interrupted.status, interrupted.sha256], ['failed', undefined], 'interrupted download failed, bad sum dropped')
    eq(own.downloadedBy, ['p-1', 'p-2'], 'downloadedBy sanitized')
  })

  await test('«Что нового»: только после обновления и один раз на версию', () => {
    const show = (seen: string, current: string, usedBefore: boolean) => shouldShowWhatsNew({ seen, current, usedBefore })
    eq(whatsNewFor('1.3.0')?.length, 5, 'пять пунктов в 1.3')
    eq(whatsNewFor('1.3.7')?.length, 5, 'мелкий выпуск — те же пункты')
    eq(whatsNewFor('1.4.0'), undefined, 'для 1.4 пунктов пока нет')
    eq(show('', '1.3.0', true), true, 'обновление с 1.2 (версия не записана, но есть следы работы)')
    eq(show('', '1.3.0', false), false, 'новая установка')
    eq(show('1.3.0', '1.3.0', true), false, 'уже показали')
    eq(show('1.3.0', '1.3.1', true), false, 'мелкий выпуск той же версии не показывает снова')
    eq(show('1.2.0', '1.3.0', true), true, 'записанная старая версия')
    eq(show('1.4.0', '1.3.0', true), false, 'откат на старую версию — не показываем')
    eq(show('', '1.4.0', true), false, 'нечего показать')
    const d = defaultSettings(os.tmpdir())
    eq(normalizeSettings({ lastSeenVersion: '1.3.0' }, d).lastSeenVersion, '1.3.0', 'версия сохраняется')
    eq(normalizeSettings({ lastSeenVersion: '<b>' }, d).lastSeenVersion, '', 'мусор отбрасывается')
  })

  fs.rmSync(tmp, { recursive: true, force: true })
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
