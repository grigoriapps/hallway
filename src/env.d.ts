import type { LanApi } from './types'

declare global {
  interface Window {
    api: LanApi
  }
}

export {}
