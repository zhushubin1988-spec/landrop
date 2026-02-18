import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import * as dgram from 'dgram'
import * as net from 'net'
import * as fs from 'fs'
import * as os from 'os'
import * as crypto from 'crypto'

let mainWindow: BrowserWindow | null = null
let discoverySocket: dgram.Socket | null = null
let transferServer: net.Server | null = null
const DISCOVERY_PORT = 5200
const TRANSFER_PORT = 5201
let downloadDir: string = join(os.homedir(), 'Downloads', 'LanDrop')
const devices: Map<string, any> = new Map()
const transferHistory: any[] = []
const activeTransfers: Map<string, any> = new Map()

// Protocol message types
const MSG_HELLO = 0x01
const MSG_FILE_INFO = 0x02
const MSG_FILE_DATA = 0x03
const MSG_FILE_END = 0x04
const MSG_COMPLETE = 0x05
const MSG_ERROR = 0x06

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
    mainWindow?.center()
    mainWindow?.show()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function getLocalIP(): string {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name]
    if (!iface) continue
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address
      }
    }
  }
  return '127.0.0.1'
}

function getDeviceId(): string {
  const homeDir = os.homedir()
  const idFile = join(homeDir, '.landrop', 'device-id')
  if (fs.existsSync(idFile)) {
    return fs.readFileSync(idFile, 'utf-8')
  }
  const id = crypto.randomUUID()
  const dir = join(homeDir, '.landrop')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(idFile, id)
  return id
}

// ==================== UDP Discovery Service ====================

function startDiscovery(): void {
  discoverySocket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

  discoverySocket.on('error', (err) => {
    console.log('Discovery socket error:', err)
  })

  discoverySocket.on('message', (msg, rinfo) => {
    try {
      const data = JSON.parse(msg.toString())
      if (data.type === 'announce') {
        const deviceId = data.id
        if (deviceId !== getDeviceId()) {
          const device = {
            id: deviceId,
            name: data.name,
            ip: rinfo.address,
            port: data.port || TRANSFER_PORT,
            online: true,
            type: data.deviceType || 'desktop'
          }
          devices.set(deviceId, device)
          mainWindow?.webContents.send('device-discovered', device)
        }
      } else if (data.type === 'offline') {
        const device = devices.get(data.id)
        if (device) {
          devices.delete(data.id)
          mainWindow?.webContents.send('device-offline', device)
        }
      }
    } catch (e) {
      // Ignore malformed messages
    }
  })

  discoverySocket.on('listening', () => {
    discoverySocket?.setBroadcast(true)
    console.log('Discovery service listening on port', DISCOVERY_PORT)
    broadcastPresence()
    // Refresh devices periodically
    setInterval(broadcastPresence, 30000)
  })

  discoverySocket.bind(DISCOVERY_PORT)
}

function broadcastPresence(): void {
  if (!discoverySocket) return
  const message = JSON.stringify({
    type: 'announce',
    id: getDeviceId(),
    name: os.hostname(),
    port: TRANSFER_PORT,
    deviceType: 'desktop'
  })
  discoverySocket.send(message, DISCOVERY_PORT, '255.255.255.255')
}

function stopDiscovery(): void {
  if (discoverySocket) {
    discoverySocket.close()
    discoverySocket = null
  }
}

// ==================== TCP Transfer Service ====================

function startTransferServer(): void {
  transferServer = net.createServer((socket) => {
    console.log('Incoming transfer connection from', socket.remoteAddress)
    let buffer = Buffer.alloc(0)
    let currentFile: any = null
    let fileWriteStream: fs.WriteStream | null = null

    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data])

      while (buffer.length >= 5) {
        const type = buffer[0]
        const length = buffer.readUInt32BE(1)

        if (buffer.length < 5 + length) break

        const payload = buffer.slice(5, 5 + length)
        buffer = buffer.slice(5 + length)

        switch (type) {
          case MSG_HELLO:
            // Respond with hello
            sendMessage(socket, MSG_HELLO, { version: 1 })
            break

          case MSG_FILE_INFO:
            try {
              const fileInfo = JSON.parse(payload.toString())
              currentFile = fileInfo

              // Create directory if needed
              if (!fs.existsSync(downloadDir)) {
                fs.mkdirSync(downloadDir, { recursive: true })
              }

              const filePath = join(downloadDir, fileInfo.name)
              fileWriteStream = fs.createWriteStream(filePath)
              console.log(`Receiving file: ${fileInfo.name} (${fileInfo.size} bytes)`)
            } catch (err) {
              console.error('Error processing file info:', err)
            }
            break

          case MSG_FILE_DATA:
            if (fileWriteStream && currentFile) {
              fileWriteStream.write(payload)
            }
            break

          case MSG_FILE_END:
            if (fileWriteStream) {
              fileWriteStream.end()
              fileWriteStream = null
              console.log(`File received: ${currentFile?.name}`)
              currentFile = null
            }
            break

          case MSG_COMPLETE:
            console.log('Transfer complete')
            sendMessage(socket, MSG_COMPLETE, { success: true })
            socket.end()
            break

          case MSG_ERROR:
            console.error('Transfer error:', payload.toString())
            socket.end()
            break
        }
      }
    })

    socket.on('close', () => {
      if (fileWriteStream) {
        fileWriteStream.end()
      }
    })

    socket.on('error', (err) => {
      console.error('Transfer socket error:', err)
    })
  })

  transferServer.on('error', (err) => {
    console.error('Transfer server error:', err)
  })

  transferServer.listen(TRANSFER_PORT, () => {
    console.log('Transfer service listening on port', TRANSFER_PORT)
  })
}

function sendMessage(socket: net.Socket, type: number, data: any): void {
  const payload = Buffer.from(JSON.stringify(data))
  const header = Buffer.alloc(5)
  header[0] = type
  header.writeUInt32BE(payload.length, 1)
  socket.write(Buffer.concat([header, payload]))
}

async function sendFilesToDevice(deviceId: string, files: { path: string; name: string; size: number; isDirectory: boolean }[]): Promise<string> {
  const device = devices.get(deviceId)
  if (!device) {
    throw new Error('Device not found')
  }

  const transferId = crypto.randomUUID()
  const totalSize = files.reduce((sum, f) => sum + f.size, 0)

  const transfer = {
    id: transferId,
    deviceId,
    deviceName: device.name,
    files,
    totalSize,
    transferredSize: 0,
    status: 'pending',
    speed: 0,
    startTime: Date.now()
  }

  activeTransfers.set(transferId, transfer)
  mainWindow?.webContents.send('transfer-started', transfer)

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: device.ip, port: device.port }, () => {
      console.log(`Connected to ${device.ip}`)
      transfer.status = 'transferring'
      sendMessage(socket, MSG_HELLO, { version: 1 })
    })

    let fileIndex = 0
    let lastProgressTime = Date.now()
    let lastTransferred = 0
    let helloReceived = false
    let responseBuffer = Buffer.alloc(0)

    socket.on('data', (data) => {
      responseBuffer = Buffer.concat([responseBuffer, data])
      
      // Parse response messages
      while (responseBuffer.length >= 5) {
        const msgType = responseBuffer[0]
        const msgLength = responseBuffer.readUInt32BE(1)
        
        if (responseBuffer.length < 5 + msgLength) break
        
        // Only process if we haven't received hello yet
        if (!helloReceived && msgType === MSG_HELLO) {
          helloReceived = true
          responseBuffer = responseBuffer.slice(5 + msgLength)
          sendNextFile()
        } else if (msgType === MSG_COMPLETE) {
          // Transfer completed successfully
          socket.end()
        } else {
          // Skip other messages
          responseBuffer = responseBuffer.slice(5 + msgLength)
        }
      }
    })

    const sendNextFile = (): void => {
      if (fileIndex >= files.length) {
        transfer.status = 'completed'
        transfer.endTime = Date.now()
        sendMessage(socket, MSG_COMPLETE, { success: true })
        
        // Wait for receiver's response before closing
        // The receiver will close after sending response
        return
      }

      const file = files[fileIndex]
      console.log(`Sending file: ${file.name}`)

      sendMessage(socket, MSG_FILE_INFO, {
        name: file.name,
        size: file.size,
        isDirectory: file.isDirectory
      })

      if (file.isDirectory) {
        fileIndex++
        sendNextFile()
      } else {
        const readStream = fs.createReadStream(file.path, { highWaterMark: 64 * 1024 })

        readStream.on('data', (chunk: Buffer) => {
          const dataChunk = Buffer.alloc(5 + chunk.length)
          dataChunk[0] = MSG_FILE_DATA
          dataChunk.writeUInt32BE(chunk.length, 1)
          chunk.copy(dataChunk, 5)
          socket.write(dataChunk)

          transfer.transferredSize += chunk.length

          const now = Date.now()
          const timeDiff = (now - lastProgressTime) / 1000
          if (timeDiff >= 0.5) {
            transfer.speed = (transfer.transferredSize - lastTransferred) / timeDiff
            lastProgressTime = now
            lastTransferred = transfer.transferredSize

            mainWindow?.webContents.send('transfer-progress', {
              id: transferId,
              transferredSize: transfer.transferredSize,
              speed: transfer.speed,
              progress: (transfer.transferredSize / transfer.totalSize) * 100
            })
          }
        })

        readStream.on('end', () => {
          sendMessage(socket, MSG_FILE_END, {})
          fileIndex++
          sendNextFile()
        })

        readStream.on('error', (err) => {
          console.error('Read error:', err)
          transfer.status = 'failed'
          sendMessage(socket, MSG_ERROR, { error: err.message })
          mainWindow?.webContents.send('transfer-error', { id: transferId, error: err.message })
          socket.end()
          reject(err)
        })
      }
    }

    socket.on('error', (err) => {
      console.error('Connection error:', err)
      transfer.status = 'failed'
      mainWindow?.webContents.send('transfer-error', { id: transferId, error: err.message })
      reject(err)
    })

    socket.on('close', () => {
      if (transfer.status === 'pending') {
        transfer.status = 'failed'
        mainWindow?.webContents.send('transfer-error', { id: transferId, error: 'Connection closed' })
        reject(new Error('Connection closed'))
      } else if (transfer.status === 'completed') {
        // Add to history
        transferHistory.unshift({
          id: transferId,
          deviceName: device.name,
          files: files.map(f => ({ name: f.name, size: f.size })),
          totalSize: transfer.totalSize,
          status: 'completed',
          timestamp: Date.now()
        })
        mainWindow?.webContents.send('transfer-complete', transfer)
        resolve(transferId)
      }
    })
  })
}

// ==================== IPC Handlers ====================

function setupIpcHandlers(): void {
  ipcMain.handle('get-local-device', () => {
    return {
      id: getDeviceId(),
      name: os.hostname(),
      ip: getLocalIP(),
      port: TRANSFER_PORT,
      online: true,
      type: 'desktop'
    }
  })

  ipcMain.handle('get-devices', () => {
    return Array.from(devices.values())
  })

  ipcMain.handle('refresh-devices', () => {
    broadcastPresence()
    return true
  })

  // Device channel handlers (for preload compatibility)
  ipcMain.handle('device:list', () => {
    return Array.from(devices.values())
  })

  ipcMain.handle('device:getId', () => {
    return getDeviceId()
  })

  ipcMain.handle('device:getName', () => {
    return os.hostname()
  })

  ipcMain.handle('device:refresh', () => {
    broadcastPresence()
  })

  ipcMain.handle('send-files', async (_event, deviceId: string, files: { path: string; name: string; size: number; isDirectory: boolean }[]) => {
    return sendFilesToDevice(deviceId, files)
  })

  // Transfer channel handlers (for preload compatibility)
  ipcMain.handle('transfer:send', async (_event, device: any, files: any[]) => {
    try {
      const taskId = await sendFilesToDevice(device.id, files)
      return { success: true, taskId }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('transfer:accept', async () => {
    return { success: true }
  })

  ipcMain.handle('transfer:reject', async () => {
    return { success: true }
  })

  ipcMain.handle('transfer:getDownloadDir', () => {
    return downloadDir
  })

  ipcMain.handle('transfer:setDownloadDir', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false }
    }
    downloadDir = result.filePaths[0]
    console.log('Download directory set to:', downloadDir)
    return { success: true, path: downloadDir }
  })

  ipcMain.handle('select-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile', 'openDirectory', 'multiSelections']
    })
    return result.filePaths
  })

  // Dialog channel handlers (for preload compatibility)
  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled) return []
    return result.filePaths.map(path => ({
      name: path.split('/').pop() || 'Unknown',
      size: 0,
      isDirectory: false,
      path
    }))
  })

  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory']
    })
    if (result.canceled) return []
    return result.filePaths.map(path => ({
      name: path.split('/').pop() || 'Unknown',
      size: 0,
      isDirectory: true,
      path
    }))
  })

  ipcMain.handle('get-transfer-history', () => {
    return transferHistory.slice(0, 50)
  })

  // App handlers
  ipcMain.handle('app:getPath', (_, name: string) => {
    return app.getPath(name as any)
  })

  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
  })
}

// ==================== App Lifecycle ====================

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.landrop.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  startDiscovery()
  startTransferServer()
  setupIpcHandlers()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopDiscovery()
  if (transferServer) {
    transferServer.close()
    transferServer = null
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
