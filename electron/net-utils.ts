import os from 'node:os'
import type { LocalAddressInfo } from '../src/types'

export function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0)
}

export function intToIp(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

export function isValidIPv4(value: string): boolean {
  const parts = value.split('.')
  return (
    parts.length === 4 &&
    parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255 && (p === '0' || !p.startsWith('0')))
  )
}

/** "::ffff:192.168.1.5" → "192.168.1.5" */
export function normalizeIp(address: string | undefined): string {
  if (!address) return '?'
  return address.startsWith('::ffff:') ? address.slice(7) : address
}

function prefixLength(netmask: string): number {
  return ipToInt(netmask).toString(2).replace(/0/g, '').length
}

/**
 * Все IPv4-адреса машины (кроме loopback) с directed broadcast для каждой подсети.
 * Читается заново при каждом анонсе — адреса меняются при переподключении Wi-Fi/VPN.
 */
export function getLocalIPv4(): LocalAddressInfo[] {
  const result: LocalAddressInfo[] = []
  for (const [iface, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list ?? []) {
      // В старых Node family бывал числом 4
      const family = String(a.family)
      if ((family !== 'IPv4' && family !== '4') || a.internal) continue
      if (!isValidIPv4(a.address)) continue
      let broadcast: string | null = null
      if (a.netmask && isValidIPv4(a.netmask)) {
        const prefix = prefixLength(a.netmask)
        // /31 и /32 (типично для VPN point-to-point) — broadcast отсутствует
        if (prefix > 0 && prefix < 31) {
          const mask = ipToInt(a.netmask)
          broadcast = intToIp(((ipToInt(a.address) & mask) | (~mask >>> 0)) >>> 0)
        }
      }
      result.push({ iface, address: a.address, broadcast })
    }
  }
  return result
}

/**
 * Куда слать presence. Только 255.255.255.255 недостаточно: macOS и Windows отправляют
 * limited broadcast лишь через один (основной) интерфейс, и при наличии VirtualBox/Hyper-V/VPN
 * пакет уходит «не туда». Поэтому шлём ещё и на broadcast каждой подсети.
 */
export function getBroadcastTargets(): string[] {
  const targets = new Set<string>(['255.255.255.255'])
  for (const a of getLocalIPv4()) {
    if (a.broadcast) targets.add(a.broadcast)
  }
  return [...targets]
}
