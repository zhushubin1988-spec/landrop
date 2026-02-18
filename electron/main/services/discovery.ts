import * as dgram from 'dgram'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { EventEmitter } from 'events'
import { BrowserWindow, app } from 'electron'
import os from 'os'

export interface Device {
  id: string
  name: string
  ip: string
  port: number
  online: boolean
  type: 'desktop' | 'mobile' | 'tablet'
  platform?: string
}

export interface FileInfo {
  name: string
  size: number
  isDirectory: boolean
  path: string
  relativePath?: string
}

const TRANSFER_PORT = 5201

interface AnnounceMessage {
  type: 'announce'
  deviceId: string
  deviceName: string
  platform: string
  port: number
  timestamp: number
}

const BROADCAST_INTERVAL = 3000
const DEVICE_TIMEOUT = 10000

export class DiscoveryService extends EventEmitter {
  private socket: dgram.Socket | null = null
  private devices: Map<string, Device> = new Map()
  private deviceId: string
  private deviceName: string
  private broadcastInterval: NodeJS.Timeout | null = null
  private cleanupInterval: NodeJS.Timeout | null = null
  private port: number
  private localDevice: Device | null = null
  private mainWindow: BrowserWindow | null = null
  private lastSeen: Map<string, number> = new Map()

  constructor(port: number = 5200) {
    super()
    this.port = port
    this.deviceId = this.generateDeviceId()
    this.deviceName = os.hostname() || 'LanDrop Device'
  }

  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window
  }

  private generateDeviceId(): string {
    const configPath = path.join(app.getPath('userData'), 'device-id')
    try {
      if (fs.existsSync(configPath)) {
        return fs.readFileSync(configPath, 'utf-8')
      }
    } catch {
      // Ignore
    }
    const id = crypto.randomUUID()
    try {
      fs.mkdirSync(path.dirname(configPath), { recursive: true })
      fs.writeFileSync(configPath, id)
    } catch {
      // Ignore
    }
    return id
  }

  start(): void {
    this.createSocket()
    this.startBroadcast()
    this.startCleanup()

    this.localDevice = {
      id: this.deviceId,
      name: this.deviceName,
      ip: this.getLocalIP(),
      port: this.port,
      online: true,
      type: 'desktop'
    }
  }

  stop(): void {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval)
      this.broadcastInterval = null
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    if (this.socket) {
      try {
        this.socket.close()
      } catch {
        // Ignore
      }
      this.socket = null
    }
  }

  private getLocalIP(): string {
    const interfaces = os.networkInterfaces()
    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name]
      if (!iface) continue
      for (const info of iface) {
        if (info.family === 'IPv4' && !info.internal) {
          return info.address
        }
      }
    }
    return '127.0.0.1'
  }

  private createSocket(): void {
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

    this.socket.on('error', (err) => {
      console.error('UDP socket error:', err)
      this.socket?.close()
    })

    this.socket.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString()) as AnnounceMessage
        if (data.type === 'announce' && data.deviceId !== this.deviceId) {
          this.handleAnnounce(data, rinfo.address)
        }
      } catch {
        // Ignore invalid messages
      }
    })

    this.socket.on('listening', () => {
      const address = this.socket?.address()
      console.log(`Discovery service listening on ${address?.address}:${address?.port}`)
      this.socket?.setBroadcast(true)
    })

    this.socket.bind(this.port)
  }

  private startBroadcast(): void {
    const broadcast = (): void => {
      if (!this.socket) return

      const message: AnnounceMessage = {
        type: 'announce',
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        platform: process.platform,
        port: TRANSFER_PORT,
        timestamp: Date.now()
      }

      const buffer = Buffer.from(JSON.stringify(message))
      const broadcastAddress = '255.255.255.255'

      this.socket.send(buffer, 0, buffer.length, this.port, broadcastAddress, (err) => {
        if (err) {
          console.error('Broadcast error:', err)
        }
      })
    }

    broadcast()
    this.broadcastInterval = setInterval(broadcast, BROADCAST_INTERVAL)
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now()
      const devicesToRemove: Device[] = []

      this.devices.forEach((device, id) => {
        const lastSeenTime = this.lastSeen.get(id) || 0
        if (now - lastSeenTime > DEVICE_TIMEOUT) {
          device.online = false
          devicesToRemove.push(device)
        }
      })

      devicesToRemove.forEach(device => {
        this.emit('device-offline', device)
      })

      // Notify window of device changes
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const deviceList = Array.from(this.devices.values()).filter(d => d.online)
        this.mainWindow.webContents.send('device:update', deviceList)
      }
    }, 1000)
  }

  private handleAnnounce(data: AnnounceMessage, ip: string): void {
    const isNew = !this.devices.has(data.deviceId)

    const device: Device = {
      id: data.deviceId,
      name: data.deviceName,
      ip,
      port: TRANSFER_PORT,
      online: true,
      type: this.getDeviceType(data.platform),
      platform: data.platform
    }

    this.lastSeen.set(data.deviceId, Date.now())
    this.devices.set(data.deviceId, device)

    if (isNew) {
      this.emit('device-discovered', device)
    }

    // Notify renderer
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('device:update', this.getDevices())
    }
  }

  private getDeviceType(platform: string): 'desktop' | 'mobile' | 'tablet' {
    if (platform === 'darwin' || platform === 'win32' || platform === 'linux') {
      return 'desktop'
    }
    return 'mobile'
  }

  getDevices(): Device[] {
    return Array.from(this.devices.values()).filter(d => d.online)
  }

  getLocalDevice(): Device | null {
    return this.localDevice
  }

  getDeviceId(): string {
    return this.deviceId
  }

  getDeviceName(): string {
    return this.deviceName
  }

  refreshDevices(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('device:update', this.getDevices())
    }
  }

  broadcastPresence(): void {
    if (this.socket) {
      const message: AnnounceMessage = {
        type: 'announce',
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        platform: process.platform,
        port: TRANSFER_PORT,
        timestamp: Date.now()
      }

      const buffer = Buffer.from(JSON.stringify(message))
      this.socket.send(buffer, 0, buffer.length, this.port, '255.255.255.255')
    }
  }
}
