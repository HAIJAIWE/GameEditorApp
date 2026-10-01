/// <reference types="vite/client" />

import type { MbApi } from '../../shared/api'

declare global {
  interface Window {
    mbApi: MbApi
  }
}

export {}