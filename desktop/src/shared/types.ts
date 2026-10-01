/** 跨进程共享的数据类型（主进程 / preload / 渲染层三端共用） */

export interface ItemRecord {
  id: string
  type: string
  data: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AppInfo {
  name: string
  version: string
  platform: string
  dbPath: string
}