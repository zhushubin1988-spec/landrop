import { contextBridge, ipcRenderer } from 'electron'

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

const api = {
  // Device discovery
  getLocalDevice: (): Promise<Device | null> => ipcRenderer.invoke('get-local-device'),
  getDevices: (): Promise<Device[]> => ipcRenderer.invoke('get-devices'),
  refreshDevices: (): Promise<boolean> => ipcRenderer.invoke('refresh-devices'),

  // File transfer
  sendFiles: (deviceId: string, files: FileInfo[]): Promise<string> =>
    ipcRenderer.invoke('send-files', deviceId, files),
  getDownloadDir: (): Promise<string> => ipcRenderer.invoke('transfer:getDownloadDir'),
  setDownloadDir: (): Promise<{ success: boolean; path?: string }> =>
    ipcRenderer.invoke('transfer:setDownloadDir'),

  // File selection
  selectFiles: (): Promise<string[]> => ipcRenderer.invoke('select-files'),

  // Dialog
  dialog: {
    openFile: (): Promise<FileInfo[]> => ipcRenderer.invoke('dialog:openFile'),
    openFolder: (): Promise<FileInfo[]> => ipcRenderer.invoke('dialog:openFolder')
  },

  // Transfer history
  getTransferHistory: (): Promise<TransferHistory[]> => ipcRenderer.invoke('get-transfer-history'),

  // Event listeners
  onDeviceDiscovered: (callback: (device: Device) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, device: Device) => callback(device)
    ipcRenderer.on('device-discovered', listener)
    return () => ipcRenderer.removeListener('device-discovered', listener)
  },

  onDeviceOffline: (callback: (device: Device) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, device: Device) => callback(device)
    ipcRenderer.on('device-offline', listener)
    return () => ipcRenderer.removeListener('device-offline', listener)
  },

  onTransferStarted: (callback: (transfer: Transfer) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, transfer: Transfer) => callback(transfer)
    ipcRenderer.on('transfer-started', listener)
    return () => ipcRenderer.removeListener('transfer-started', listener)
  },

  onTransferProgress: (callback: (progress: TransferProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: TransferProgress) => callback(progress)
    ipcRenderer.on('transfer-progress', listener)
    return () => ipcRenderer.removeListener('transfer-progress', listener)
  },

  onTransferComplete: (callback: (transfer: Transfer) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, transfer: Transfer) => callback(transfer)
    ipcRenderer.on('transfer-complete', listener)
    return () => ipcRenderer.removeListener('transfer-complete', listener)
  },

  onTransferError: (callback: (error: { id: string; error: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, error: { id: string; error: string }) => callback(error)
    ipcRenderer.on('transfer-error', listener)
    return () => ipcRenderer.removeListener('transfer-error', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
