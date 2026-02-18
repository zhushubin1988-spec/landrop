import * as dgram from 'dgram'
import * as os from 'os'
import { EventEmitter } from 'events'
import * as crypto from 'crypto'

const DISCOVERY_MESSAGE = 'LANDROP_DISCOVER'
const PRESENCE_MESSAGE = 'LANDROP_PRESENCE'
const DISCOVERY_INTERVAL = 30000 // 30 seconds
const DEVICE_TIMEOUT = 60000 // 60 seconds

export interface Device {
  id: string
  name: string
  ip: string
  port: number
  online: boolean
  type: 'desktop' | 'mobile' | 'tablet'
  lastSeen: number
}

interface DiscoveryPacket {
  type: string
  id: string
  name: string
  port: number
  deviceType: 'desktop' | 'mobile' | 'tablet'
}

export class DiscoveryService extends EventEmitter {
  private socket: dgram.Socket | null = null
  private port: number
  private devices: Map<string, Device> = new Map()
  private localDevice: Device | null = null
  private broadcastInterval: NodeJS.Timeout | null = null
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(port: number) {
    super()
    this.port = port
    this.localDevice = this.createLocalDevice()
  }

  private createLocalDevice(): Device {
    const hostname = os.hostname()
    const id = crypto.createHash('md5').update(hostname + Date.now()).digest('hex').substring(0, 8)
    return {
      id,
      name: hostname,
      ip: this.getLocalIP(),
      port: 5201, // TCP port for file transfer
      online: true,
      type: 'desktop',
      lastSeen: Date.now()
    }
  }

  private getLocalIP(): string {
    const interfaces = os.networkInterfaces()
    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name]
      if (!iface) continue
      for (const entry of iface) {
        if (entry.family === 'IPv4' && !entry.internal) {
          return entry.address
        }
      }
    }
    return '127.0.0.1'
  }

  start(): void {
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

    this.socket.on('error', (err) => {
      console.error('[Discovery] Socket error:', err)
      this.socket?.close()
    })

    this.socket.on('message', (msg, rinfo) => {
      try {
        const packet: DiscoveryPacket = JSON.parse(msg.toString())
        this.handlePacket(packet, rinfo.address)
      } catch (err) {
        // Ignore invalid packets
      }
    })

    this.socket.on('listening', () => {
      const address = this.socket?.address()
      console.log(`[Discovery] UDP server listening on ${address?.address}:${address?.port}`)
      this.socket?.setBroadcast(true)

      // Send initial presence
      this.broadcastPresence()

      // Setup periodic broadcasts
      this.broadcastInterval = setInterval(() => {
        this.broadcastPresence()
      }, DISCOVERY_INTERVAL)
    })

    this.socket.bind(this.port)

    // Cleanup stale devices
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleDevices()
    }, DEVICE_TIMEOUT / 2)
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
      this.socket.close()
      this.socket = null
    }
  }

  private handlePacket(packet: DiscoveryPacket, sourceIP: string): void {
    if (packet.id === this.localDevice?.id) return // Ignore own messages

    const existingDevice = this.devices.get(packet.id)
    const isNewDevice = !existingDevice

    const device: Device = {
      id: packet.id,
      name: packet.name,
      ip: sourceIP,
      port: packet.port,
      online: true,
      type: packet.deviceType,
      lastSeen: Date.now()
    }

    this.devices.set(packet.id, device)

    if (isNewDevice) {
      console.log(`[Discovery] Device discovered: ${device.name} (${device.ip})`)
      this.emit('device-discovered', device)
    }
  }

  private broadcastPresence(): void {
    if (!this.socket || !this.localDevice) return

    const packet: DiscoveryPacket = {
      type: PRESENCE_MESSAGE,
      id: this.localDevice.id,
      name: this.localDevice.name,
      port: this.localDevice.port,
      deviceType: this.localDevice.type
    }

    const message = Buffer.from(JSON.stringify(packet))
    const broadcastAddress = this.getBroadcastAddress()

    this.socket.send(message, 0, message.length, this.port, broadcastAddress, (err) => {
      if (err) {
        console.error('[Discovery] Broadcast error:', err)
      }
    })
  }

  private getBroadcastAddress(): string {
    const interfaces = os.networkInterfaces()
    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name]
      if (!iface) continue
      for (const entry of iface) {
        if (entry.family === 'IPv4' && !entry.internal && entry.netmask) {
          const ip = entry.address.split('.').map(Number)
          const netmask = entry.netmask.split('.').map(Number)
          const broadcast = ip.map((octet, i) => octet | (~netmask[i] & 255))
          return broadcast.join('.')
        }
      }
    }
    return '255.255.255.255'
  }

  private cleanupStaleDevices(): void {
    const now = Date.now()
    for (const [id, device] of this.devices) {
      if (now - device.lastSeen > DEVICE_TIMEOUT) {
        device.online = false
        this.devices.delete(id)
        console.log(`[Discovery] Device offline: ${device.name}`)
        this.emit('device-offline', device)
      }
    }
  }

  getLocalDevice(): Device | null {
    return this.localDevice
  }

  getDevices(): Device[] {
    return Array.from(this.devices.values())
  }
}
