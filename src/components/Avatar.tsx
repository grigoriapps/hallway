import type { PresenceStatus } from '../types'
import { colorFor, initials, statusLabel } from '../format'
import { useT } from '../state'

export function Avatar({
  name,
  id,
  size = 40,
  online,
  status = 'online'
}: {
  name: string
  id: string
  size?: number
  online?: boolean
  status?: PresenceStatus
}) {
  const t = useT()
  return (
    <div
      className={`avatar${online === false ? ' avatar-offline' : ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: colorFor(id) }}
      aria-hidden="true"
    >
      {initials(name)}
      {online && <span className={`presence status-${status}`} title={statusLabel(t, status)} />}
    </div>
  )
}
