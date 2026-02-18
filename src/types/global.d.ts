export interface Device {
  id: string
  name: string
  ip: string
  port: number
  online: boolean
  type: 'desktop' | 'mobile' | 'tablet'
}

export interface FileInfo {
  path: string
  name: string
  size: number
  isDirectory: boolean
}

export interface Transfer {
  id: string
  deviceId: string
  deviceName: string
  files: FileInfo[]
  totalSize: number
  transferredSize: number
  status: 'pending' | 'transferring' | 'completed' | 'failed' | 'cancelled'
  speed: number
  startTime: number
  endTime?: number
}

export interface TransferProgress {
  id: string
  transferredSize: number
  speed: number
  progress: number
}

export interface TransferHistory {
  id: string
  deviceName: string
  files: { name: string; size: number }[]
  totalSize: number
  status: 'completed' | 'failed'
  timestamp: number
}

export interface Api {
  getLocalDevice: () => Promise<Device | null>
  getDevices: () => Promise<Device[]>
  refreshDevices: () => Promise<boolean>
  sendFiles: (deviceId: string, files: FileInfo[]) => Promise<string>
  selectFiles: () => Promise<string[]>
  getTransferHistory: () => Promise<TransferHistory[]>
  onDeviceDiscovered: (callback: (device: Device) => void) => () => void
  onDeviceOffline: (callback: (device: Device) => void) => () => void
  onTransferStarted: (callback: (transfer: Transfer) => void) => () => void
  onTransferProgress: (callback: (progress: TransferProgress) => void) => () => void
  onTransferComplete: (callback: (transfer: Transfer) => void) => () => void
  onTransferError: (callback: (error: { id: string; error: string }) => void) => () => void
}

declare global {
  interface Window {
    api: Api
  }
}
