import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Types
interface Device {
  id: string
  name: string
  ip: string
  port: number
  online: boolean
  type: 'desktop' | 'mobile' | 'tablet'
  platform?: string
}

interface FileInfo {
  name: string
  size: number
  isDirectory: boolean
  path: string
  relativePath?: string
}

interface TransferTask {
  id: string
  deviceId: string
  deviceName: string
  files: FileInfo[]
  totalSize: number
  transferredSize: number
  status: string
  direction: string
  startTime: number
  speed: number
}

interface TransferProgress {
  taskId: string
  transferred: number
  total: number
  speed: number
}

// Custom APIs for renderer
const api = {
  // Device
  device: {
    list: (): Promise<Device[]> => ipcRenderer.invoke('device:list'),
    getId: (): Promise<string> => ipcRenderer.invoke('device:getId'),
    getName: (): Promise<string> => ipcRenderer.invoke('device:getName'),
    refresh: (): Promise<void> => ipcRenderer.invoke('device:refresh'),
    onUpdate: (callback: (devices: Device[]) => void): void => {
      ipcRenderer.on('device:update', (_, devices) => callback(devices))
    }
  },

  // Dialog
  dialog: {
    openFile: (): Promise<FileInfo[]> => ipcRenderer.invoke('dialog:openFile'),
    openFolder: (): Promise<FileInfo[]> => ipcRenderer.invoke('dialog:openFolder')
  },

  // Transfer
  transfer: {
    send: (device: Device, files: FileInfo[]): Promise<{ success: boolean; taskId?: string; error?: string }> =>
      ipcRenderer.invoke('transfer:send', device, files),
    accept: (taskId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('transfer:accept', taskId),
    reject: (taskId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('transfer:reject', taskId),
    getDownloadDir: (): Promise<string> => ipcRenderer.invoke('transfer:getDownloadDir'),
    onProgress: (callback: (progress: TransferProgress) => void): void => {
      ipcRenderer.on('transfer:progress', (_, progress) => callback(progress))
    },
    onComplete: (callback: (task: TransferTask) => void): void => {
      ipcRenderer.on('transfer:complete', (_, task) => callback(task))
    },
    onRequest: (callback: (task: TransferTask) => void): void => {
      ipcRenderer.on('transfer:request', (_, task) => callback(task))
    },
    onError: (callback: (data: { taskId: string; error: string }) => void): void => {
      ipcRenderer.on('transfer:error', (_, data) => callback(data))
    }
  },

  // App
  app: {
    getPath: (name: string): Promise<string> => ipcRenderer.invoke('app:getPath', name),
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion')
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
