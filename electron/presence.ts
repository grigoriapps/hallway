import type { LocalAddressInfo } from '../src/types'

// Решения о строках «в сети · 9:15» / «вышел · 18:40» — отдельно от main, чтобы их можно
// было проверить модульными тестами без Electron.

/**
 * Пропал без «bye» и вернулся быстрее — это сбой связи, а не уход: строк не пишем.
 * «Вышел» из-за такого обрыва появляется не сразу, а спустя это время — со временем обрыва.
 */
export const PRESENCE_FLAP_MS = 2 * 60 * 1000

/**
 * Две строки «в сети» ближе этого — один и тот же приход: время из анонса дрожит на секунду-две
 * (округление до секунд, задержка сети). Шире делать нельзя — склеится настоящий перезапуск.
 */
export const ARRIVAL_MATCH_MS = 30 * 1000

export interface PresenceMark {
  event: 'peer-online' | 'peer-offline'
  timestamp: number
}

/**
 * Время для строки «в сети» или null — строку не писать.
 *
 * last — последняя такая строка в переписке;
 * reported — когда коллега пришёл по его собственным словам (поле up в анонсе, клиенты 1.3+);
 * observed — когда мы сами увидели приход, если в этот момент следили (не спали, не только
 *   что запустились); иначе null.
 *
 * Сказанное коллегой надёжнее: оно верно, даже если наш компьютер в тот момент спал.
 * Но если после его «прихода» мы уже записали ему уход, значит, он не перезапускался,
 * а пропадала связь между нами, — тогда вернулся он тогда, когда мы это увидели.
 */
export function arrivalLineTime(
  last: PresenceMark | null,
  reported: number | null,
  observed: number | null
): number | null {
  const trustReported = reported !== null && (!last || last.event === 'peer-online' || reported > last.timestamp)
  const at = trustReported ? reported : observed
  if (at === null) return null
  // та же строка уже есть (или есть более поздняя) — второй раз не пишем
  if (last?.event === 'peer-online' && at <= last.timestamp + ARRIVAL_MATCH_MS) return null
  return at
}

/**
 * Коллега вернулся после обрыва без «bye». false — это был сбой связи, строк не пишем.
 * true — уходил на самом деле: обрыв длился дольше PRESENCE_FLAP_MS (проверка откладывалась,
 * пока мы сами спали) и по его же словам он вошёл в сеть заново уже после обрыва.
 * Если он в сети с тех пор — пропадала связь у нас, а не он.
 */
export function isRealReturn(dropAt: number, now: number, reportedSince: number | null): boolean {
  return now - dropAt > PRESENCE_FLAP_MS && reportedSince !== null && reportedSince > dropAt + ARRIVAL_MATCH_MS
}

// ─── своя сеть ──────────────────────────────────────────────────────────────────
// «Мы в сети с …» сбрасывается, когда появилась сеть: ноутбук принесли в офис.
// Виртуальные адаптеры (Parallels, VirtualBox, Hyper-V) и VPN не в счёт: они появляются
// и пропадают сами по себе и ни о каком «пришёл в офис» не говорят.

const VIRTUAL_IFACE_RE =
  /^(?:bridge|vmnet|vboxnet|vnic|docker|br-|veth|virbr|utun|ipsec|ppp|tun|tap|awdl|llw|gif|stf|anpi|ap\d|zt|tailscale|wg)|virtual|vmware|vbox|hyper-v|vethernet|loopback|vpn|wsl|tap-|wintun|zerotier/i

export function isVirtualInterface(iface: string): boolean {
  return VIRTUAL_IFACE_RE.test(iface)
}

/** Подсети настоящих сетевых адаптеров (по broadcast-адресу) */
export function physicalSubnets(addresses: readonly LocalAddressInfo[]): string[] {
  const set = new Set<string>()
  for (const a of addresses) {
    if (a.broadcast && !isVirtualInterface(a.iface)) set.add(a.broadcast)
  }
  return [...set]
}

/**
 * Следит за своими подсетями. true — появилась сеть, которой не было дольше gapMs
 * (или не было никогда): значит, мы только что «пришли». Короткое пропадание Wi-Fi
 * приходом не считается — как и у коллег, у нас нет строк про сбои связи.
 */
export class NetworkArrival {
  private readonly seenAt = new Map<string, number>()
  private initialized = false

  constructor(private readonly gapMs = PRESENCE_FLAP_MS) {}

  update(subnets: readonly string[], now = Date.now()): boolean {
    let arrived = false
    for (const subnet of subnets) {
      const last = this.seenAt.get(subnet)
      if (this.initialized && (last === undefined || now - last > this.gapMs)) arrived = true
      this.seenAt.set(subnet, now)
    }
    this.initialized = true
    return arrived
  }
}
