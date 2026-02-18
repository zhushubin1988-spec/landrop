import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { DiscoveryService } from './services/discovery'
import { TransferService } from './services/transfer'
import { setupIPC } from './services/ipc'

let mainWindow: BrowserWindow | null = null
let discoveryService: DiscoveryService | null = null
let transferService: TransferService | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Initialize services
function initServices(): void {
  discoveryService = new DiscoveryService()
  transferService = new TransferService()

  // Setup IPC handlers
  setupIPC(discoveryService, transferService, mainWindow)

  // Start device discovery
  discoveryService.start()
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.landrop.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  initServices()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Stop services
  discoveryService?.stop()
  transferService?.stop()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  discoveryService?.stop()
  transferService?.stop()
})
