import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { DiscoveryService, Device, FileInfo } from './discovery'
import { TransferService, TransferTask, TransferProgress } from './transfer'

export function setupIPC(
  discoveryService: DiscoveryService,
  transferService: TransferService,
  mainWindow: BrowserWindow | null
): void {
  discoveryService.setMainWindow(mainWindow)
  transferService.setMainWindow(mainWindow)
  transferService.start()

  // Device handlers
  ipcMain.handle('device:list', () => {
    return discoveryService.getDevices()
  })

  ipcMain.handle('device:getId', () => {
    return discoveryService.getDeviceId()
  })

  ipcMain.handle('device:getName', () => {
    return discoveryService.getDeviceName()
  })

  ipcMain.handle('device:refresh', () => {
    discoveryService.refreshDevices()
  })

  // File selection handlers
  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections']
    })

    if (result.canceled) {
      return []
    }

    const files: FileInfo[] = []
    for (const filePath of result.filePaths) {
      const stat = await fs.promises.stat(filePath)
      files.push({
        name: path.basename(filePath),
        size: stat.size,
        isDirectory: stat.isDirectory(),
        path: filePath
      })
    }

    return files
  })

  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })

    if (result.canceled) {
      return []
    }

    const folderPath = result.filePaths[0]
    const files: FileInfo[] = []

    const scanDir = async (dirPath: string, basePath: string): Promise<void> => {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        const relativePath = path.relative(basePath, fullPath)

        if (entry.isDirectory()) {
          files.push({
            name: entry.name,
            size: 0,
            isDirectory: true,
            path: fullPath,
            relativePath
          })
          await scanDir(fullPath, basePath)
        } else {
          const stat = await fs.promises.stat(fullPath)
          files.push({
            name: entry.name,
            size: stat.size,
            isDirectory: false,
            path: fullPath,
            relativePath
          })
        }
      }
    }

    await scanDir(folderPath, folderPath)

    return files
  })

  // Transfer handlers
  ipcMain.handle('transfer:send', async (_, device: Device, files: FileInfo[]) => {
    try {
      const taskId = await transferService.sendFiles(device, files)
      return { success: true, taskId }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('transfer:accept', async (_, taskId: string) => {
    // Accept is handled automatically in the current implementation
    return { success: true }
  })

  ipcMain.handle('transfer:reject', async (_, taskId: string) => {
    // Reject is handled automatically in the current implementation
    return { success: true }
  })

  ipcMain.handle('transfer:getDownloadDir', () => {
    return transferService.getDownloadDir()
  })

  ipcMain.handle('transfer:setDownloadDir', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false }
    }

    const dir = result.filePaths[0]
    transferService.setDownloadDir(dir)
    return { success: true, path: dir }
  })

  // Transfer event handlers
  transferService.onProgress((progress: TransferProgress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('transfer:progress', progress)
    }
  })

  transferService.onComplete((task: TransferTask) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('transfer:complete', task)
    }
  })

  transferService.onRequest((task: TransferTask) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('transfer:request', task)
    }
  })

  transferService.onError((taskId: string, error: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('transfer:error', { taskId, error })
    }
  })

  // App handlers
  ipcMain.handle('app:getPath', (_, name: string) => {
    return app.getPath(name as any)
  })

  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
  })
}
