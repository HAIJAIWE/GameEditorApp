/// <reference types="vite/client" />

import type { MbApi } from '../../shared/service/api'

declare global {
  interface Window {
    mbApi: MbApi
  }
}

export {}