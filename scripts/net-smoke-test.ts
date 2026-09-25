// Сетевой smoke-тест без Electron: два клиента в одном процессе общаются через реальные
// UDP/TCP-сокеты этой машины. Запуск: npm run test:net   (HALLWAY_VERBOSE=1 — подробные логи)
import dgram from 'node:dgram'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { Discovery } from '../electron/discovery'
import { ChatService, type IncomingMessage } from '../electron/chat-server'
import type { GroupInfo } from '../electron/protocol'
import { createTranslator } from '../src/i18n'
import { FileTransfers, sanitizeFileName } from '../electron/file-transfer'
import { ConversationStore } from '../electron/store'
import { createLogger } from '../electron/logger'
import { LineReader } from '../electron/protocol'
import { getBroadcastTargets } from '../electron/net-utils'
import type { FileItem, PresenceStatus } from '../src/types'

const UDP_PORT = 47000 + Math.floor(Math.random() * 1000)
const logger = createLogger({ verbose: process.env.HALLWAY_VERBOSE === '1' })
const ru = createTranslator('ru')

interface TestNode {
  name: string
  id: string
  dir: string
  store: ConversationStore
  chat: ChatService
  discovery: Discovery
  files: FileTransfers
  messages: IncomingMessage[]
  groups: GroupInfo[]
  groupLeaves: string[]
  groupDeletes: string[]
  typings: Array<{ peer: string; active: boolean; group?: string; everyone?: boolean }>
  reads: Array<{ peer: string; ids: string[]; group?: string; everyone?: boolean }>
  haves: Array<{ peer: string; ids: string[]; reply: boolean }>
  autoAccept: boolean
  /** что клиент сообщает в анонсе (поля 1.3) */
  presence: { onlineSince: number; statusSince: number; paused: boolean }
  setStatus(status: PresenceStatus): void
  stop(): Promise<void>
}

async function createNode(name: string, tcpPort: number): Promise<TestNode> {
  const id = crypto.randomUUID()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `hallway-${name}-`))
  const store = new ConversationStore()
  let discovery: Discovery | null = null
  let status: PresenceStatus = 'online'
  const presence = { onlineSince: Date.now(), statusSince: Date.now(), paused: false }
  const chat = new ChatService({
    t: ru,
    selfId: id,
    getSelfName: () => name,
    platform: process.platform,
    tcpPort,
    tcpPortAttempts: 20,
    directory: {
      getPeer: (peerId) => discovery?.getPeer(peerId),
      sendConnectRequest: (peerId) => discovery?.sendConnectRequest(peerId)
    },
    log: logger.scope(`${name}:tcp`)
  })
  const port = await chat.start()
  discovery = new Discovery({
    t: ru,
    selfId: id,
    getSelfName: () => name,
    platform: process.platform,
    udpPort: UDP_PORT,
    tcpPort: port,
    intervalMs: 1000,
    timeoutMs: 3500,
    getManualHosts: () => [],
    getStatus: () => status,
    version: '1.3.0',
    getOnlineSince: () => presence.onlineSince,
    getStatusSince: () => presence.statusSince,
    isPaused: () => presence.paused,
    log: logger.scope(`${name}:udp`)
  })
  discovery.on('connect-request', (peerId: string, ip: string, p: number) => chat.handleConnectRequest(peerId, ip, p))
  discovery.on('peer-offline', (peer: { id: string }) => chat.dropPeer(peer.id, 'offline'))
  const files = new FileTransfers({
    t: ru,
    selfId: id,
    chat,
    store,
    getDownloadDir: () => path.join(dir, 'downloads'),
    log: logger.scope(`${name}:files`)
  })
  const node: TestNode = {
    name,
    id,
    dir,
    store,
    chat,
    discovery,
    files,
    messages: [],
    groups: [],
    groupLeaves: [],
    groupDeletes: [],
    typings: [],
    reads: [],
    haves: [],
    autoAccept: true,
    presence,
    setStatus(next) {
      status = next
      discovery!.announce()
    },
    async stop() {
      files.shutdown()
      await discovery!.stop()
      chat.stop()
    }
  }
  chat.on('message', (_peerId: string, msg: IncomingMessage) => node.messages.push(msg))
  chat.on('group-info', (_peerId: string, group: GroupInfo) => node.groups.push(group))
  chat.on('group-leave', (_peerId: string, groupId: string) => node.groupLeaves.push(groupId))
  chat.on('group-delete', (_peerId: string, groupId: string) => node.groupDeletes.push(groupId))
  chat.on('typing', (peerId: string, active: boolean, group?: GroupInfo, everyone?: boolean) =>
    node.typings.push({ peer: peerId, active, group: group?.id, everyone })
  )
  chat.on('read', (peerId: string, ids: string[], groupId?: string, everyone?: boolean) =>
    node.reads.push({ peer: peerId, ids, group: groupId, everyone })
  )
  chat.on('everyone-have', (peerId: string, ids: string[], reply: boolean) => node.haves.push({ peer: peerId, ids, reply }))
  files.on('incoming-offer', (item: FileItem) => {
    if (node.autoAccept) void files.accept(item.id)
  })
  discovery.start()
  return node
}

// ─── мини-фреймворк ─────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const started = Date.now()
  try {
    await fn()
    passed++
    console.log(`  ✔ ${name} (${Date.now() - started} ms)`)
  } catch (err) {
    failed++
    console.log(`  ✘ ${name}\n      ${(err as Error).stack?.split('\n').slice(0, 3).join('\n      ')}`)
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

function waitFor<T>(what: string, check: () => T | undefined | null | false, timeoutMs = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      const value = check()
      if (value) return resolve(value)
      if (Date.now() - started > timeoutMs) return reject(new Error(`timeout: ${what}`))
      setTimeout(tick, 20)
    }
    tick()
  })
}

function fileItems(node: TestNode, peerId: string): FileItem[] {
  return (node.store.conversationsSnapshot()[peerId] ?? []).filter((i): i is FileItem => i.kind === 'file')
}

function waitFileStatus(node: TestNode, peerId: string, id: string, statuses: string[], timeoutMs = 20000) {
  return waitFor(
    `${node.name}: file ${id.slice(0, 8)} -> ${statuses.join('|')}`,
    () => fileItems(node, peerId).find((i) => i.id === id && statuses.includes(i.status)),
    timeoutMs
  )
}

async function makeFile(dir: string, name: string, bytes: number): Promise<string> {
  const file = path.join(dir, name)
  fs.mkdirSync(dir, { recursive: true })
  const handle = fs.openSync(file, 'w')
  const chunk = 1024 * 1024
  for (let written = 0; written < bytes; written += chunk) {
    fs.writeSync(handle, crypto.randomBytes(Math.min(chunk, bytes - written)))
  }
  fs.closeSync(handle)
  return file
}

async function sha256(file: string): Promise<string> {
  const hash = crypto.createHash('sha256')
  await pipeline(fs.createReadStream(file), hash)
  return hash.digest('hex')
}

async function sendText(from: TestNode, to: TestNode, text: string, id: string = crypto.randomUUID()) {
  await from.chat.sendReliable(to.id, { type: 'message', id, from: from.id, text, timestamp: Date.now() })
  return id
}

/** Отправить файл и дождаться появления карточки у получателя */
async function offer(from: TestNode, to: TestNode, filePath: string): Promise<string> {
  const before = new Set(fileItems(from, to.id).map((i) => i.id))
  const offering = from.files.offerFiles(to.id, [filePath])
  const item = await waitFor('outgoing item created', () => fileItems(from, to.id).find((i) => !before.has(i.id)))
  await offering
  return item.id
}

// ─── тесты ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Hallway network smoke test (UDP port ${UDP_PORT})\n`)

  console.log('unit')
  await test('LineReader: UTF-8 символ, разорванный между чанками', async () => {
    const reader = new LineReader()
    const data = Buffer.from('{"text":"привет 👋"}\n{"n":2}\n')
    const lines = [...reader.push(data.subarray(0, 12)), ...reader.push(data.subarray(12, 30)), ...reader.push(data.subarray(30))]
    assert(lines.length === 2 && JSON.parse(lines[0]).text === 'привет 👋', `got ${JSON.stringify(lines)}`)
  })
  await test('sanitizeFileName', async () => {
    const cases: Array<[string, string]> = [
      ['../../etc/passwd', 'passwd'],
      ['..\\..\\Windows\\system.ini', 'system.ini'],
      ['CON.txt', '_CON.txt'],
      ['a<b>c:d"e|f?g*.txt', 'a_b_c_d_e_f_g_.txt'],
      ['  .hidden. ', 'hidden'],
      ['', 'file'],
      ['отчёт 2026.pdf', 'отчёт 2026.pdf']
    ]
    for (const [input, expected] of cases) {
      const actual = sanitizeFileName(input)
      assert(actual === expected, `${JSON.stringify(input)} -> ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
    }
    assert(Buffer.byteLength(sanitizeFileName('я'.repeat(300) + '.txt')) <= 200, 'long name not truncated')
  })

  const a = await createNode('Alice', 51235)
  const b = await createNode('Bob', 51235) // тот же базовый порт: должен взять следующий свободный
  console.log(`\nnodes: Alice tcp ${a.chat.port}, Bob tcp ${b.chat.port}`)

  console.log('\ndiscovery')
  await test('TCP-порт: занятый базовый порт → следующий свободный', async () => {
    assert(a.chat.port !== b.chat.port, 'ports must differ')
  })
  await test('оба клиента видят друг друга', async () => {
    const peerB = await waitFor('Alice sees Bob', () => a.discovery.getPeer(b.id), 5000)
    const peerA = await waitFor('Bob sees Alice', () => b.discovery.getPeer(a.id), 5000)
    assert(peerB.tcpPort === b.chat.port && peerA.tcpPort === a.chat.port, 'announced tcp ports mismatch')
    assert(peerB.name === 'Bob' && peerA.name === 'Alice', 'names mismatch')
  })

  await test('статус «Не беспокоить» виден собеседнику, возврат «В сети» — тоже', async () => {
    a.setStatus('dnd')
    await waitFor('Bob sees Alice dnd', () => b.discovery.getPeer(a.id)?.status === 'dnd', 3000)
    a.setStatus('online')
    await waitFor('Bob sees Alice online', () => b.discovery.getPeer(a.id)?.status === 'online', 3000)
  })

  await test('версия, «в сети с» и «статус с» приходят в анонсе (длительностями)', async () => {
    const peer = await waitFor('Bob sees Alice version', () => b.discovery.getPeer(a.id)?.version === '1.3.0' && b.discovery.getPeer(a.id))
    assert(peer.onlineSince !== null && peer.statusSince !== null, 'since fields must be known')
    const twoHoursAgo = Date.now() - 2 * 3600_000
    a.presence.onlineSince = twoHoursAgo
    a.presence.statusSince = Date.now() - 10 * 60_000
    a.discovery.announce()
    const updated = await waitFor('Bob sees Alice online for 2h', () => {
      const p = b.discovery.getPeer(a.id)
      return p && p.onlineSince !== null && Math.abs(p.onlineSince - twoHoursAgo) < 3000 && p
    }, 4000)
    assert(Math.abs((updated.statusSince ?? 0) - (Date.now() - 10 * 60_000)) < 3000, `statusSince off: ${updated.statusSince}`)
    a.presence.onlineSince = Date.now()
    a.presence.statusSince = Date.now()
  })

  await test('клиент до 1.3 и порченые поля: версия и время неизвестны', async () => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    await new Promise<void>((resolve) => socket.bind(0, resolve))
    socket.setBroadcast(true)
    const oldId = crypto.randomUUID()
    const badId = crypto.randomUUID()
    const packets = [
      { type: 'presence', app: 'hallway', v: 1, id: oldId, name: 'Старый', tcpPort: 1, platform: 'win32', session: 's1' },
      { type: 'presence', app: 'hallway', v: 1, id: badId, name: 'Порченый', tcpPort: 1, platform: 'win32', session: 's2', ver: '<b>1</b>', up: -5, st: 'x' }
    ]
    const send = () => {
      for (const packet of packets) {
        for (const host of getBroadcastTargets()) socket.send(Buffer.from(JSON.stringify(packet)), UDP_PORT, host, () => undefined)
      }
    }
    send()
    const timer = setInterval(send, 500)
    try {
      const old = await waitFor('Bob sees the old client', () => b.discovery.getPeer(oldId), 4000)
      const bad = await waitFor('Bob sees the broken client', () => b.discovery.getPeer(badId), 4000)
      eq(old.version, null, 'old version')
      eq(old.onlineSince, null, 'old onlineSince')
      eq(bad.version, null, 'broken version')
      eq(bad.onlineSince, null, 'broken up')
      eq(bad.statusSince, null, 'broken st')
    } finally {
      clearInterval(timer)
      socket.close()
    }
  })

  console.log('\nchat')
  await test('сообщение A→B и B→A (кириллица, эмодзи, переносы строк)', async () => {
    const text = 'Привет, Боб! 👋\nВторая строка'
    const id1 = await sendText(a, b, text)
    await waitFor('Bob got message', () => b.messages.find((m) => m.id === id1 && m.text === text))
    const id2 = await sendText(b, a, 'И тебе привет 🙂')
    await waitFor('Alice got reply', () => a.messages.find((m) => m.id === id2))
  })
  await test('длинное сообщение (20 000 символов, много TCP-чанков)', async () => {
    const text = 'Ж'.repeat(20000)
    const id = await sendText(a, b, text)
    await waitFor('Bob got long message', () => b.messages.find((m) => m.id === id && m.text === text))
  })
  await test('порядок сохраняется при 50 параллельных отправках', async () => {
    const ids = await Promise.all(Array.from({ length: 50 }, (_, i) => sendText(a, b, `#${i}`)))
    await waitFor('all 50 received', () => ids.every((id) => b.messages.some((m) => m.id === id)))
    const order = b.messages.filter((m) => ids.includes(m.id)).map((m) => m.text)
    assert(order.join(',') === ids.map((_, i) => `#${i}`).join(','), `wrong order: ${order.join(',')}`)
  })
  await test('ack только после сохранения: сбой у получателя — повтор, и сообщение доходит', async () => {
    let failOnce = true
    const flaky = () => {
      if (failOnce) {
        failOnce = false
        throw new Error('simulated disk error')
      }
    }
    b.chat.prependListener('message', flaky)
    try {
      const id = crypto.randomUUID()
      const started = Date.now()
      await a.chat.sendReliable(b.id, { type: 'message', id, from: a.id, text: 'после сбоя', timestamp: Date.now() })
      assert(!failOnce, 'the first processing must have failed')
      assert(b.messages.some((m) => m.id === id), 'delivered on the retry')
      assert(Date.now() - started >= 5000, 'no ack for the failed processing')
    } finally {
      b.chat.off('message', flaky)
    }
  })

  await test('отменённое в очереди не отправляется', async () => {
    let wanted = true
    const id = crypto.randomUUID()
    const sending = a.chat.sendReliable(b.id, { type: 'message', id, from: a.id, text: 'не надо', timestamp: Date.now() }, () => wanted)
    wanted = false
    const result = await sending.then(() => 'sent', (err: Error) => err.message)
    // отмена успевает, только пока пакет ждёт очереди; здесь очередь пустая — ушёл сразу или отменён
    assert(result === 'sent' || result === 'Отправка отменена', `result: ${result}`)
    const queuedId = crypto.randomUUID()
    let wanted2 = true
    // первым в очереди — медленный пакет, за ним — тот, что отменим
    const slow = a.chat.sendReliable(b.id, { type: 'message', id: crypto.randomUUID(), from: a.id, text: 'x'.repeat(10000), timestamp: Date.now() })
    const later = a.chat.sendReliable(b.id, { type: 'message', id: queuedId, from: a.id, text: 'отменить', timestamp: Date.now() }, () => wanted2)
    wanted2 = false
    await slow
    const r2 = await later.then(() => 'sent', (err: Error) => err.message)
    eq(r2, 'Отправка отменена', 'canceled while waiting in the queue')
    await new Promise((r) => setTimeout(r, 300))
    assert(!b.messages.some((m) => m.id === queuedId), 'canceled message must not arrive')
  })

  await test('повтор с тем же id не дублирует сообщение', async () => {
    const id = crypto.randomUUID()
    await sendText(a, b, 'dup', id)
    await sendText(a, b, 'dup', id)
    await new Promise((r) => setTimeout(r, 100))
    assert(b.messages.filter((m) => m.id === id).length === 1, 'duplicate delivered')
  })
  await test('ответ с цитатой и «сообщение всем» доходят до собеседника', async () => {
    const id = crypto.randomUUID()
    await a.chat.sendReliable(b.id, {
      type: 'message',
      id,
      from: a.id,
      text: 'ответ',
      timestamp: Date.now(),
      reply: { id: 'orig-1', text: 'исходное', authorId: b.id },
      broadcast: true
    })
    const msg = await waitFor('Bob got reply', () => b.messages.find((m) => m.id === id))
    assert(
      msg.replyTo?.id === 'orig-1' && msg.replyTo.authorId === b.id && msg.broadcast === true,
      `got ${JSON.stringify(msg)}`
    )
  })
  await test('«печатает…» и «прочитано» доходят', async () => {
    const typing: boolean[] = []
    const reads: string[][] = []
    const onTyping = (peerId: string, active: boolean) => {
      if (peerId === a.id) typing.push(active)
    }
    const onRead = (peerId: string, ids: string[]) => {
      if (peerId === b.id) reads.push(ids)
    }
    b.chat.on('typing', onTyping)
    a.chat.on('read', onRead)
    try {
      await a.chat.sendBestEffort(b.id, { type: 'typing', active: true })
      await b.chat.sendBestEffort(a.id, { type: 'read', ids: ['m-1', 'm-2'] })
      await waitFor('typing received', () => typing.includes(true))
      await waitFor('read received', () => reads.some((ids) => ids.join() === 'm-1,m-2'))
    } finally {
      b.chat.off('typing', onTyping)
      a.chat.off('read', onRead)
    }
  })
  await test('разрыв соединения → переподключение при следующей отправке', async () => {
    a.chat.dropPeer(b.id, 'test')
    b.chat.dropPeer(a.id, 'test')
    await waitFor('links closed', () => !a.chat.hasLink(b.id) && !b.chat.hasLink(a.id))
    const id = await sendText(a, b, 'after reconnect')
    await waitFor('delivered after reconnect', () => b.messages.find((m) => m.id === id))
  })
  await test('обратное подключение: к Bob нельзя подключиться напрямую', async () => {
    a.chat.dropPeer(b.id, 'test')
    b.chat.dropPeer(a.id, 'test')
    await waitFor('links closed', () => !a.chat.hasLink(b.id) && !b.chat.hasLink(a.id))
    // Имитируем брандмауэр Bob: исходящие TCP от Alice к Bob не проходят.
    const chatA = a.chat as unknown as { connectTo: (...args: unknown[]) => Promise<unknown> }
    const original = chatA.connectTo
    chatA.connectTo = async () => {
      throw new Error('simulated firewall')
    }
    // Оба клиента на одной машине слушают один UDP-порт, поэтому адресный UDP-пакет может
    // попасть не тому сокету — доставляем connect-request напрямую (UDP-часть проверена выше).
    const discoveryA = a.discovery as unknown as { sendConnectRequest: (id: string) => void }
    const originalRequest = discoveryA.sendConnectRequest
    discoveryA.sendConnectRequest = () => b.chat.handleConnectRequest(a.id, '127.0.0.1', a.chat.port!)
    try {
      const id = await sendText(a, b, 'via reverse link')
      await waitFor('delivered via reverse link', () => b.messages.find((m) => m.id === id))
    } finally {
      chatA.connectTo = original
      discoveryA.sendConnectRequest = originalRequest
    }
  })

  console.log('\nfiles')
  const srcDir = path.join(a.dir, 'src')
  await test('файл 32 МБ A→B, контрольная сумма совпадает', async () => {
    const file = await makeFile(srcDir, 'video.bin', 32 * 1024 * 1024)
    const id = await offer(a, b, file)
    await waitFileStatus(b, a.id, id, ['done'])
    await waitFileStatus(a, b.id, id, ['done'])
    const saved = b.files.localPath(id)
    assert(saved && path.basename(saved) === 'video.bin', `saved as ${saved}`)
    assert((await sha256(saved)) === (await sha256(file)), 'sha256 mismatch')
    const leftovers = fs.readdirSync(path.dirname(saved)).filter((f) => f.endsWith('.hallway-part'))
    assert(leftovers.length === 0, 'part file left behind')
  })
  await test('одинаковое имя второй раз → "video (1).bin"', async () => {
    const id = await offer(a, b, path.join(srcDir, 'video.bin'))
    await waitFileStatus(b, a.id, id, ['done'])
    assert(path.basename(b.files.localPath(id)!) === 'video (1).bin', `got ${b.files.localPath(id)}`)
  })
  await test('пустой файл (0 байт) и имя на кириллице', async () => {
    const file = await makeFile(srcDir, 'пустой файл.txt', 0)
    const id = await offer(a, b, file)
    await waitFileStatus(b, a.id, id, ['done'])
    await waitFileStatus(a, b.id, id, ['done'])
    assert(fs.statSync(b.files.localPath(id)!).size === 0, 'size must be 0')
  })
  await test('файл B→A (обратное направление)', async () => {
    const file = await makeFile(path.join(b.dir, 'src'), 'photo.jpg', 3 * 1024 * 1024 + 17)
    const id = await offer(b, a, file)
    await waitFileStatus(a, b.id, id, ['done'])
    assert((await sha256(a.files.localPath(id)!)) === (await sha256(file)), 'sha256 mismatch')
  })
  await test('получатель отклоняет', async () => {
    b.autoAccept = false
    const id = await offer(a, b, path.join(srcDir, 'video.bin'))
    await waitFileStatus(b, a.id, id, ['pending'])
    b.files.decline(id)
    await waitFileStatus(a, b.id, id, ['declined'])
    b.autoAccept = true
  })
  await test('отправитель отменяет до принятия → принять уже нельзя', async () => {
    b.autoAccept = false
    const id = await offer(a, b, path.join(srcDir, 'video.bin'))
    await waitFileStatus(b, a.id, id, ['pending'])
    a.files.cancel(id)
    await waitFileStatus(b, a.id, id, ['canceled'])
    b.autoAccept = true
  })
  await test('получатель отменяет во время передачи (файл 400 МБ)', async () => {
    b.autoAccept = false
    const file = await makeFile(srcDir, 'big.bin', 400 * 1024 * 1024)
    const id = await offer(a, b, file)
    await waitFileStatus(b, a.id, id, ['pending'])
    void b.files.accept(id)
    await waitFor('transfer started', () => fileItems(b, a.id).find((i) => i.id === id && i.transferred > 0))
    b.files.cancel(id)
    await waitFileStatus(b, a.id, id, ['canceled'])
    await waitFileStatus(a, b.id, id, ['canceled'])
    await new Promise((r) => setTimeout(r, 300))
    const dl = path.join(b.dir, 'downloads')
    const leftovers = fs.readdirSync(dl).filter((f) => f.endsWith('.hallway-part') || f === 'big.bin')
    assert(leftovers.length === 0, `leftovers: ${leftovers.join(', ')}`)
    fs.rmSync(file)
    b.autoAccept = true
  })
  await test('запасной путь push: получатель не может подключиться к отправителю', async () => {
    const file = await makeFile(srcDir, 'push.bin', 5 * 1024 * 1024)
    const chatB = b.chat as unknown as { connectRaw: (peerId: string) => Promise<unknown> }
    const original = chatB.connectRaw
    chatB.connectRaw = async () => {
      throw new Error('simulated firewall')
    }
    try {
      const id = await offer(a, b, file)
      await waitFileStatus(b, a.id, id, ['done'])
      await waitFileStatus(a, b.id, id, ['done'])
      assert((await sha256(b.files.localPath(id)!)) === (await sha256(file)), 'sha256 mismatch')
    } finally {
      chatB.connectRaw = original
    }
  })
  await test('миниатюра картинки приходит вместе с предложением файла', async () => {
    const thumb = 'data:image/png;base64,iVBORw0KGgo='
    const filesA = a.files as unknown as { opts: { makeThumbnail?: (p: string) => Promise<string | undefined> } }
    filesA.opts.makeThumbnail = async () => thumb
    b.autoAccept = false
    try {
      const file = await makeFile(srcDir, 'картинка.png', 1024)
      const id = await offer(a, b, file)
      const item = await waitFileStatus(b, a.id, id, ['pending'])
      assert(item.thumbnail === thumb, `thumbnail: ${item.thumbnail}`)
      b.files.decline(id)
    } finally {
      filesA.opts.makeThumbnail = undefined
      b.autoAccept = true
    }
  })
  await test('папка вместо файла → понятная ошибка', async () => {
    await a.files.offerFiles(b.id, [srcDir])
    const item = fileItems(a, b.id).at(-1)
    assert(item?.status === 'failed' && item.error?.includes('Папки'), `got ${item?.status} ${item?.error}`)
  })

  await test('после сна компьютера собеседники не пропадают из списка', async () => {
    // имитируем сон: последний пакет от Bob был минуту назад
    const peers = (a.discovery as unknown as { peers: Map<string, { lastSeen: number; addresses: Map<string, number> }> }).peers
    const record = peers.get(b.id)!
    record.lastSeen = Date.now() - 60000
    for (const ip of record.addresses.keys()) record.addresses.set(ip, Date.now() - 60000)
    a.discovery.handleResume()
    await new Promise((r) => setTimeout(r, 1300)) // sweep выполняется раз в секунду
    assert(a.discovery.getPeer(b.id), 'Bob was removed after resume')
  })

  await test('сон без события «проснулся»: таблица обновляется, коллеги не «уходят»', async () => {
    const internals = a.discovery as unknown as {
      peers: Map<string, { lastSeen: number; addresses: Map<string, number> }>
      lastSweepAt: number
    }
    let resumed = 0
    const onResumed = () => resumed++
    a.discovery.on('resumed', onResumed)
    const offline: string[] = []
    const onOffline = (peer: { id: string }) => offline.push(peer.id)
    a.discovery.on('peer-offline', onOffline)
    try {
      // процесс «стоял» 20 секунд: секундный sweep не отрабатывал
      internals.lastSweepAt = Date.now() - 20_000
      const record = internals.peers.get(b.id)!
      record.lastSeen = Date.now() - 20_000
      for (const ip of record.addresses.keys()) record.addresses.set(ip, Date.now() - 20_000)
      await waitFor('resumed event', () => resumed > 0, 3000)
      await new Promise((r) => setTimeout(r, 1300))
      assert(a.discovery.getPeer(b.id), 'Bob must stay after a freeze')
      eq(offline, [], 'no peer-offline after a freeze')
    } finally {
      a.discovery.off('resumed', onResumed)
      a.discovery.off('peer-offline', onOffline)
    }
  })

  await test('долгая остановка процесса (больше минуты) — таблица собирается заново', async () => {
    const internals = a.discovery as unknown as { lastSweepAt: number }
    const events: string[] = []
    const onResumed = () => events.push('resumed')
    const onOffline = (peer: { id: string }, reason: string) => peer.id === b.id && events.push(`offline:${reason}`)
    const onOnline = (peer: { id: string }) => peer.id === b.id && events.push('online')
    a.discovery.on('resumed', onResumed)
    a.discovery.on('peer-offline', onOffline)
    a.discovery.on('peer-online', onOnline)
    try {
      internals.lastSweepAt = Date.now() - 70_000
      await waitFor('Bob is back as a new peer', () => events.includes('online'), 5000)
      assert(events[0] === 'resumed', `resumed must come first: ${events.join(', ')}`)
      assert(events.some((e) => e.startsWith('offline:frozen for')), `offline reason: ${events.join(', ')}`)
    } finally {
      a.discovery.off('resumed', onResumed)
      a.discovery.off('peer-offline', onOffline)
      a.discovery.off('peer-online', onOnline)
    }
  })

  await test('сон: таблица сбрасывается, после пробуждения коллеги появляются заново', async () => {
    const reasons: string[] = []
    const onOffline = (peer: { id: string }, reason: string) => peer.id === b.id && reasons.push(reason)
    let online = 0
    const onOnline = (peer: { id: string }) => peer.id === b.id && online++
    a.discovery.on('peer-offline', onOffline)
    a.discovery.on('peer-online', onOnline)
    try {
      a.presence.paused = true
      a.discovery.resetPeers('system sleep')
      eq(reasons, ['system sleep'], 'offline reason')
      assert(!a.discovery.getPeer(b.id), 'table must be empty while asleep')
      await new Promise((r) => setTimeout(r, 2500))
      assert(!a.discovery.getPeer(b.id), 'asleep Alice must ignore announces')
      a.presence.paused = false
      a.discovery.handleResume()
      await waitFor('Bob reappears', () => online > 0 && a.discovery.getPeer(b.id), 5000)
    } finally {
      a.presence.paused = false
      a.discovery.off('peer-offline', onOffline)
      a.discovery.off('peer-online', onOnline)
    }
  })

  await test('пауза (сон): анонсов нет, таймауты не считаются, после пробуждения — снова в сети', async () => {
    const aOffline: string[] = []
    const onOffline = (peer: { id: string }) => aOffline.push(peer.id)
    a.discovery.on('peer-offline', onOffline)
    try {
      a.presence.paused = true
      // Bob перестаёт получать анонсы Alice и через таймаут убирает её
      await waitFor('Bob drops sleeping Alice', () => !b.discovery.getPeer(a.id), 8000)
      // а спящая Alice таймауты не считает — Bob у неё в таблице остаётся
      assert(a.discovery.getPeer(b.id), 'sleeping Alice must not expire Bob')
      eq(aOffline, [], 'no peer-offline while asleep')
      a.presence.paused = false
      a.discovery.handleResume()
      await waitFor('Bob sees Alice again', () => b.discovery.getPeer(a.id), 5000)
      await new Promise((r) => setTimeout(r, 1500))
      assert(a.discovery.getPeer(b.id), 'Alice still sees Bob after wake')
    } finally {
      a.presence.paused = false
      a.discovery.off('peer-offline', onOffline)
    }
  })

  console.log('\nгруппы')
  await test('состав группы доходит до участника и разбирается', async () => {
    const group = {
      id: 'g-test-1',
      name: 'Отдел продаж',
      members: [
        { id: a.id, name: a.name },
        { id: b.id, name: b.name }
      ]
    }
    assert(await a.chat.sendBestEffort(b.id, { type: 'group', group }), 'group packet sent')
    const received = await waitFor('Bob got the group', () => b.groups.find((g) => g.id === 'g-test-1'))
    assert(received.name === 'Отдел продаж', `name: ${received.name}`)
    assert(received.members.length === 2, `members: ${received.members.length}`)
    assert(
      received.members.some((m) => m.id === b.id) && received.members.some((m) => m.id === a.id),
      'both members must be present'
    )
  })

  await test('сообщение в группу приходит с составом и цитатой', async () => {
    const id = crypto.randomUUID()
    await a.chat.sendReliable(b.id, {
      type: 'message',
      id,
      from: a.id,
      text: 'Всем привет 👋',
      timestamp: Date.now(),
      reply: { id: 'prev', text: 'предыдущее', authorId: a.id },
      group: {
        id: 'g-test-1',
        name: 'Отдел продаж',
        members: [
          { id: a.id, name: a.name },
          { id: b.id, name: b.name }
        ]
      }
    })
    const msg = await waitFor('group message', () => b.messages.find((m) => m.id === id))
    assert(msg.group?.id === 'g-test-1', `group: ${JSON.stringify(msg.group)}`)
    assert(msg.replyTo?.text === 'предыдущее', 'quote must survive')
  })

  await test('порченые данные группы отбрасываются, соединение живёт', async () => {
    const before = b.groups.length
    await a.chat.sendBestEffort(b.id, { type: 'group', group: { id: 'not-a-group', members: [{ id: b.id }] } })
    await a.chat.sendBestEffort(b.id, { type: 'group', group: { id: 'g-empty', members: [] } })
    await a.chat.sendBestEffort(b.id, { type: 'group-leave', groupId: 'сломанный' })
    // и сразу обычное сообщение: если бы соединение оборвалось, оно не дошло бы
    const id = await sendText(a, b, 'проверка связи')
    await waitFor('normal message still arrives', () => b.messages.find((m) => m.id === id))
    assert(b.groups.length === before, `bad groups must be ignored (${b.groups.length} vs ${before})`)
    assert(b.groupLeaves.length === 0, 'bad group-leave must be ignored')
  })

  await test('ревизия и владелец состава доезжают', async () => {
    const group = {
      id: 'g-test-rev',
      name: 'Склад',
      rev: 9,
      owner: b.id,
      members: [
        { id: a.id, name: a.name },
        { id: b.id, name: b.name }
      ]
    }
    assert(await a.chat.sendBestEffort(b.id, { type: 'group', group }), 'sent')
    const received = await waitFor('Bob got rev', () => b.groups.find((g) => g.id === 'g-test-rev'))
    assert(received.rev === 9, `rev: ${received.rev}`)
    assert(received.ownerId === b.id, `owner: ${received.ownerId}`)
  })

  console.log('\nобщий чат')
  await test('сообщение общего чата: id, автор и «давность» доезжают, клиенту до 1.3 — как «Всем в сети»', async () => {
    const packetId = crypto.randomUUID()
    await a.chat.sendReliable(b.id, {
      type: 'message',
      id: packetId,
      from: a.id,
      text: 'Обед привезли',
      timestamp: Date.now(),
      broadcast: true,
      everyone: { id: 'all-msg-1', author: 'author-7', name: '  Вера\n', age: 90_000 }
    })
    const msg = await waitFor('Bob got everyone message', () => b.messages.find((m) => m.id === packetId))
    eq(msg.everyone, { id: 'all-msg-1', author: 'author-7', authorName: 'Вера', age: 90_000 }, 'everyone meta')
    assert(msg.broadcast === true, 'broadcast flag kept for pre-1.3 clients')
    // порченая метка: сообщение доходит как обычное «Всем в сети», без общего чата
    const badId = crypto.randomUUID()
    await a.chat.sendReliable(b.id, {
      type: 'message',
      id: badId,
      text: 'x',
      broadcast: true,
      everyone: { id: '../../etc', author: 'a', age: -1 }
    })
    const bad = await waitFor('Bob got broken everyone message', () => b.messages.find((m) => m.id === badId))
    eq(bad.everyone, undefined, 'broken meta dropped')
  })

  await test('сверка общего чата, «печатает…» и «прочитано» с пометкой общего чата', async () => {
    assert(await a.chat.sendBestEffort(b.id, { type: 'everyone-have', ids: ['m1', 'm2', 5, 'x'.repeat(80)] }), 'have sent')
    const have = await waitFor('Bob got have-list', () => b.haves.find((h) => h.peer === a.id))
    eq(have.ids, ['m1', 'm2'], 'only valid ids')
    eq(have.reply, false, 'a request, not a reply')
    assert(await a.chat.sendBestEffort(b.id, { type: 'everyone-have', ids: [], reply: true }), 'reply sent')
    await waitFor('Bob got a reply-list', () => b.haves.find((h) => h.peer === a.id && h.reply))
    assert(await a.chat.sendBestEffort(b.id, { type: 'typing', active: true, everyone: true }), 'typing sent')
    await waitFor('Bob got everyone typing', () => b.typings.find((x) => x.everyone && x.active && x.peer === a.id))
    assert(await b.chat.sendBestEffort(a.id, { type: 'read', ids: ['all-msg-1'], everyone: true }), 'read sent')
    await waitFor('Alice got everyone read', () => a.reads.find((x) => x.everyone && x.ids.includes('all-msg-1')))
  })

  console.log('\nфайлы в общем чате')
  const everyoneDir = path.join(a.dir, 'everyone-src')
  /** свой файл в общий чат: ждём, пока посчитается сумма */
  const shareEveryone = async (node: TestNode, file: string): Promise<FileItem> => {
    const ready = new Promise<FileItem>((resolve) => node.files.once('everyone-file-ready', resolve))
    await node.files.offerFilesToEveryone([file], node.name)
    return ready
  }
  /** карточка у коллеги — так её кладёт main, когда приходит file-offer общего чата */
  const giveCard = (node: TestNode, card: FileItem) =>
    node.store.upsert({ ...card, direction: 'in', status: 'pending', transferred: 0, speed: 0, downloadedBy: undefined })
  const everyoneCard = (node: TestNode, id: string) => {
    const item = node.store.get('everyone', id)
    return item?.kind === 'file' ? item : undefined
  }
  const waitCard = (node: TestNode, id: string, statuses: string[], timeoutMs = 20000) =>
    waitFor(`${node.name}: everyone file -> ${statuses.join('|')}`, () => {
      const card = everyoneCard(node, id)
      return card && statuses.includes(card.status) && card
    }, timeoutMs)

  await test('файл в общий чат: сумма автора, скачивание у автора, «скачали» у автора', async () => {
    const file = await makeFile(everyoneDir, 'menu.pdf', 3 * 1024 * 1024)
    const card = await shareEveryone(a, file)
    eq(card.sha256, await sha256(file), 'sha256 of the author')
    eq(everyoneCard(a, card.id)?.status, 'done', 'author card ready')
    giveCard(b, card)
    await b.files.downloadEveryone(card.id, () => [a.id])
    await waitCard(b, card.id, ['done'])
    eq(await sha256(b.files.localPath(card.id)!), card.sha256, 'downloaded content')
    await waitFor('Alice sees Bob downloaded', () => everyoneCard(a, card.id)?.downloadedBy?.includes(b.id))
  })

  let carol: TestNode | null = null
  try {
    carol = await createNode('Carol', 51235)
    const c = carol
    await waitFor('Carol sees Alice and Bob', () => c.discovery.getPeer(a.id) && c.discovery.getPeer(b.id), 8000)

    await test('автора нет в списке источников — файл берётся у коллеги, который уже скачал', async () => {
      const file = await makeFile(everyoneDir, 'plan.xlsx', 2 * 1024 * 1024)
      const card = await shareEveryone(a, file)
      giveCard(b, card)
      await b.files.downloadEveryone(card.id, () => [a.id])
      await waitCard(b, card.id, ['done'])
      giveCard(c, card)
      await c.files.downloadEveryone(card.id, () => [b.id])
      await waitCard(c, card.id, ['done'])
      eq(await sha256(c.files.localPath(card.id)!), card.sha256, 'content from Bob')
    })

    await test('подменённый у коллеги файл отбрасывается, и берётся у следующего', async () => {
      const file = await makeFile(everyoneDir, 'report.docx', 1024 * 1024)
      const card = await shareEveryone(a, file)
      giveCard(b, card)
      await b.files.downloadEveryone(card.id, () => [a.id])
      await waitCard(b, card.id, ['done'])
      // портим копию Бориса тем же размером и возвращаем прежнее время изменения —
      // сам он подмены не заметит и отдаст испорченное
      const bobCopy = b.files.localPath(card.id)!
      const st = fs.statSync(bobCopy)
      fs.writeFileSync(bobCopy, crypto.randomBytes(st.size))
      fs.utimesSync(bobCopy, st.atime, st.mtime)
      giveCard(c, card)
      await c.files.downloadEveryone(card.id, () => [b.id, a.id])
      await waitCard(c, card.id, ['done'])
      eq(await sha256(c.files.localPath(card.id)!), card.sha256, 'the correct copy came from Alice')
    })

    await test('файла нет ни у кого из источников — понятная ошибка, можно скачать ещё раз', async () => {
      const fake: FileItem = {
        kind: 'file',
        id: crypto.randomUUID(),
        peerId: 'everyone',
        direction: 'in',
        name: 'lost.zip',
        size: 10,
        transferred: 0,
        speed: 0,
        status: 'pending',
        timestamp: Date.now(),
        sha256: 'a'.repeat(64),
        authorId: a.id
      }
      giveCard(c, fake)
      await c.files.downloadEveryone(fake.id, () => [a.id, b.id])
      const failed = await waitCard(c, fake.id, ['failed'])
      eq(failed.error, 'Сейчас файл не у кого взять — автор не в сети', 'error text')
    })

    await test('запасной путь: к источнику не подключиться — он подключается сам', async () => {
      const file = await makeFile(everyoneDir, 'photo.png', 1024 * 1024)
      const card = await shareEveryone(a, file)
      giveCard(c, card)
      const chatC = c.chat as unknown as { connectRaw: (peerId: string) => Promise<unknown> }
      const original = chatC.connectRaw
      chatC.connectRaw = async () => {
        throw new Error('simulated firewall')
      }
      try {
        await c.files.downloadEveryone(card.id, () => [a.id])
        await waitCard(c, card.id, ['done'])
        eq(await sha256(c.files.localPath(card.id)!), card.sha256, 'content via push')
      } finally {
        chatC.connectRaw = original
      }
    })

    await test('клиенту до 1.3 — обычное предложение файла, автор видит, что он скачал', async () => {
      const file = await makeFile(everyoneDir, 'old-client.bin', 512 * 1024)
      const card = await shareEveryone(a, file)
      await a.files.offerLegacyCopy(card, c.id)
      // у Кэрол включён автоприём: предложение принято и скачано как личное
      await waitFor('legacy copy received', () =>
        fileItems(c, a.id).find((i) => i.name === 'old-client.bin' && i.status === 'done')
      )
      await waitFor('Alice sees the legacy download', () => everyoneCard(a, card.id)?.downloadedBy?.includes(c.id))
      // в общем чате у Алисы копии не появилось — только одна карточка
      eq(a.store.items('everyone').filter((i) => i.kind === 'file' && i.name === 'old-client.bin').length, 1, 'one card')
    })
  } finally {
    await carol?.stop()
  }

  await test('«печатает…» и «прочитано» несут id группы', async () => {
    const group = {
      id: 'g-test-1',
      name: 'Отдел продаж',
      rev: 2,
      owner: a.id,
      members: [
        { id: a.id, name: a.name },
        { id: b.id, name: b.name }
      ]
    }
    assert(await a.chat.sendBestEffort(b.id, { type: 'typing', active: true, group }), 'typing sent')
    const typing = await waitFor('Bob got group typing', () => b.typings.find((x) => x.group === 'g-test-1'))
    assert(typing.active && typing.peer === a.id, `typing: ${JSON.stringify(typing)}`)

    assert(
      await b.chat.sendBestEffort(a.id, { type: 'read', ids: ['msg-1', 'msg-2'], groupId: 'g-test-1' }),
      'read sent'
    )
    const read = await waitFor('Alice got group read', () => a.reads.find((x) => x.group === 'g-test-1'))
    assert(read.ids.length === 2 && read.peer === b.id, `read: ${JSON.stringify(read)}`)
    // личное «прочитано» по-прежнему без группы
    assert(await b.chat.sendBestEffort(a.id, { type: 'read', ids: ['msg-3'] }), 'personal read sent')
    await waitFor('personal read', () => a.reads.find((x) => !x.group && x.ids.includes('msg-3')))
  })

  await test('предложение файла в группу приходит с составом', async () => {
    const id = crypto.randomUUID()
    const offers: string[] = []
    b.files.on('incoming-offer', (item: FileItem) => offers.push(item.peerId))
    b.autoAccept = false
    await a.chat.sendReliable(b.id, {
      type: 'file-offer',
      id,
      from: a.id,
      name: 'смета.pdf',
      size: 10,
      timestamp: Date.now(),
      group: {
        id: 'g-test-1',
        name: 'Отдел продаж',
        rev: 2,
        owner: a.id,
        members: [
          { id: a.id, name: a.name },
          { id: b.id, name: b.name }
        ]
      }
    })
    // карточка появляется в переписке группы, а не в личной
    await waitFor('offer in group conversation', () => offers.includes('g-test-1'))
    const item = fileItems(b, 'g-test-1').find((i) => i.id === id)
    assert(item, 'item in group conversation')
    assert(item.authorId === a.id, `author: ${item.authorId}`)
    b.files.decline(id)
    b.autoAccept = true
  })

  await test('удаление группы у всех доходит до участника', async () => {
    assert(await a.chat.sendBestEffort(b.id, { type: 'group-delete', groupId: 'g-test-1' }), 'delete sent')
    await waitFor('Bob got group-delete', () => b.groupDeletes.includes('g-test-1'))
  })

  await test('выход из группы доходит до остальных', async () => {
    assert(await a.chat.sendBestEffort(b.id, { type: 'group-leave', groupId: 'g-test-1' }), 'leave sent')
    await waitFor('Bob got group-leave', () => b.groupLeaves.includes('g-test-1'))
  })

  console.log('\nshutdown')
  await test('bye: Bob закрылся → Alice убирает его из списка сразу', async () => {
    const started = Date.now()
    await b.stop()
    await waitFor('Bob removed', () => !a.discovery.getPeer(b.id), 2000)
    assert(Date.now() - started < 1500, 'took too long')
  })
  await test('отправка офлайн-пользователю завершается ошибкой, а не зависает', async () => {
    let error: Error | null = null
    await sendText(a, b, 'anyone?').catch((e: Error) => (error = e))
    assert(error, 'expected an error')
  })

  await a.stop()
  for (const node of [a, b]) fs.rmSync(node.dir, { recursive: true, force: true })

  console.log(`\n${passed} passed, ${failed} failed`)
  logger.close()
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
