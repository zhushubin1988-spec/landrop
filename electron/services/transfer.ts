import * as net from 'net'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { EventEmitter } from 'events'

const PROTOCOL_VERSION = 1
const CHUNK_SIZE = 64 * 1024 // 64KB chunks

interface TransferFile {
  path: string
  name: string
  size: number
  isDirectory: boolean
}

interface Transfer {
  id: string
  deviceId: string
  deviceName: string
  files: TransferFile[]
  totalSize: number
  transferredSize: number
  status: 'pending' | 'transferring' | 'completed' | 'failed' | 'cancelled'
  speed: number
  startTime: number
  endTime?: number
}

interface TransferProgress {
  id: string
  transferredSize: number
  speed: number
  progress: number
}

interface TransferHistory {
  id: string
  deviceName: string
  files: { name: string; size: number }[]
  totalSize: number
  status: 'completed' | 'failed'
  timestamp: number
}

// Protocol message types
const MSG_HELLO = 0x01
const MSG_FILE_INFO = 0x02
const MSG_FILE_DATA = 0x03
const MSG_FILE_END = 0x04
const MSG_COMPLETE = 0x05
const MSG_ERROR = 0x06

export class TransferService extends EventEmitter {
  private server: net.Server | null = null
  private port: number
  private transfers: Map<string, Transfer> = new Map()
  private transferHistory: TransferHistory[] = []
  private activeConnections: Map<string, net.Socket> = new Map()

  constructor(port: number) {
    super()
    this.port = port
  }

  start(): void {
    this.server = net.createServer((socket) => {
      this.handleIncomingConnection(socket)
    })

    this.server.on('error', (err) => {
      console.error('[Transfer] Server error:', err)
    })

    this.server.listen(this.port, () => {
      console.log(`[Transfer] TCP server listening on port ${this.port}`)
    })
  }

  stop(): void {
    // Cancel all active transfers
    for (const [id, transfer] of this.transfers) {
      if (transfer.status === 'transferring') {
        transfer.status = 'cancelled'
        this.emit('transfer-error', { id, error: 'Transfer cancelled' })
      }
    }

    // Close all connections
    for (const socket of this.activeConnections.values()) {
      socket.destroy()
    }
    this.activeConnections.clear()

    if (this.server) {
      this.server.close()
      this.server = null
    }
  }

  private handleIncomingConnection(socket: net.Socket): void {
    console.log('[Transfer] Incoming connection from', socket.remoteAddress)

    let buffer = Buffer.alloc(0)
    let currentFile: TransferFile | null = null
    let fileWriteStream: fs.WriteStream | null = null
    let bytesReceived = 0

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
            // Send hello back
            this.sendMessage(socket, MSG_HELLO, { version: PROTOCOL_VERSION })
            break

          case MSG_FILE_INFO:
            try {
              const fileInfo = JSON.parse(payload.toString())
              currentFile = fileInfo
              bytesReceived = 0

              // Create directory if needed
              const dir = path.dirname(fileInfo.name)
              if (dir && dir !== '.') {
                fs.mkdirSync(dir, { recursive: true })
              }

              // Create write stream
              fileWriteStream = fs.createWriteStream(fileInfo.name)
              console.log(`[Transfer] Receiving file: ${fileInfo.name} (${fileInfo.size} bytes)`)
            } catch (err) {
              console.error('[Transfer] Error processing file info:', err)
            }
            break

          case MSG_FILE_DATA:
            if (fileWriteStream && currentFile) {
              fileWriteStream.write(payload)
              bytesReceived += payload.length

              // Could emit progress here for incoming transfers
            }
            break

          case MSG_FILE_END:
            if (fileWriteStream) {
              fileWriteStream.end()
              fileWriteStream = null
              console.log(`[Transfer] File received: ${currentFile?.name}`)
              currentFile = null
            }
            break

          case MSG_COMPLETE:
            console.log('[Transfer] Transfer complete')
            this.sendMessage(socket, MSG_COMPLETE, { success: true })
            socket.end()
            break

          case MSG_ERROR:
            const errorMsg = payload.toString()
            console.error('[Transfer] Transfer error:', errorMsg)
            socket.end()
            break
        }
      }
    })

    socket.on('close', () => {
      if (fileWriteStream) {
        fileWriteStream.end()
      }
      console.log('[Transfer] Connection closed')
    })

    socket.on('error', (err) => {
      console.error('[Transfer] Socket error:', err)
    })
  }

  private sendMessage(socket: net.Socket, type: number, data: unknown): void {
    const payload = Buffer.from(JSON.stringify(data))
    const header = Buffer.alloc(5)
    header[0] = type
    header.writeUInt32BE(payload.length, 1)
    socket.write(Buffer.concat([header, payload]))
  }

  async sendFiles(
    targetIP: string,
    files: TransferFile[]
  ): Promise<string> {
    const transferId = crypto.randomUUID()
    const totalSize = files.reduce((sum, f) => sum + f.size, 0)

    const transfer: Transfer = {
      id: transferId,
      deviceId: '',
      deviceName: targetIP,
      files,
      totalSize,
      transferredSize: 0,
      status: 'pending',
      speed: 0,
      startTime: Date.now()
    }

    this.transfers.set(transferId, transfer)
    this.emit('transfer-started', transfer)

    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: targetIP, port: 5201 }, () => {
        console.log(`[Transfer] Connected to ${targetIP}`)
        transfer.status = 'transferring'
        this.sendMessage(socket, MSG_HELLO, { version: PROTOCOL_VERSION })
      })

      this.activeConnections.set(transferId, socket)

      let fileIndex = 0
      let lastProgressTime = Date.now()
      let lastTransferred = 0

      const sendNextFile = (): void => {
        if (fileIndex >= files.length) {
          // All files sent
          transfer.status = 'completed'
          transfer.endTime = Date.now()
          this.sendMessage(socket, MSG_COMPLETE, { success: true })

          // Add to history
          this.transferHistory.unshift({
            id: transferId,
            deviceName: targetIP,
            files: files.map(f => ({ name: f.name, size: f.size })),
            totalSize: transfer.totalSize,
            status: 'completed',
            timestamp: Date.now()
          })

          this.emit('transfer-complete', transfer)
          this.activeConnections.delete(transferId)
          socket.end()
          resolve(transferId)
          return
        }

        const file = files[fileIndex]
        console.log(`[Transfer] Sending file: ${file.name}`)

        // Send file info
        this.sendMessage(socket, MSG_FILE_INFO, {
          name: file.name,
          size: file.size,
          isDirectory: file.isDirectory
        })

        if (file.isDirectory) {
          // Directories are handled as empty markers - actual content would need recursive handling
          fileIndex++
          sendNextFile()
        } else {
          // Send file data
          const readStream = fs.createReadStream(file.path, { highWaterMark: CHUNK_SIZE })

          readStream.on('data', (chunk: Buffer) => {
            const dataChunk = Buffer.alloc(5 + chunk.length)
            dataChunk[0] = MSG_FILE_DATA
            dataChunk.writeUInt32BE(chunk.length, 1)
            chunk.copy(dataChunk, 5)
            socket.write(dataChunk)

            transfer.transferredSize += chunk.length

            // Calculate speed
            const now = Date.now()
            const timeDiff = (now - lastProgressTime) / 1000
            if (timeDiff >= 0.5) {
              transfer.speed = (transfer.transferredSize - lastTransferred) / timeDiff
              lastProgressTime = now
              lastTransferred = transfer.transferredSize

              const progress: TransferProgress = {
                id: transferId,
                transferredSize: transfer.transferredSize,
                speed: transfer.speed,
                progress: (transfer.transferredSize / transfer.totalSize) * 100
              }
              this.emit('transfer-progress', progress)
            }
          })

          readStream.on('end', () => {
            this.sendMessage(socket, MSG_FILE_END, {})
            fileIndex++
            sendNextFile()
          })

          readStream.on('error', (err) => {
            console.error('[Transfer] Read error:', err)
            transfer.status = 'failed'
            this.sendMessage(socket, MSG_ERROR, { error: err.message })
            this.emit('transfer-error', { id: transferId, error: err.message })
            this.activeConnections.delete(transferId)
            socket.end()
            reject(err)
          })
        }
      }

      // Wait for hello response before starting
      let helloReceived = false
      socket.on('data', (data) => {
        if (!helloReceived && data[0] === MSG_HELLO) {
          helloReceived = true
          sendNextFile()
        }
      })

      socket.on('error', (err) => {
        console.error('[Transfer] Connection error:', err)
        transfer.status = 'failed'
        this.emit('transfer-error', { id: transferId, error: err.message })
        this.activeConnections.delete(transferId)
        reject(err)
      })

      socket.on('close', () => {
        if (transfer.status === 'pending') {
          transfer.status = 'failed'
          this.emit('transfer-error', { id: transferId, error: 'Connection closed' })
          reject(new Error('Connection closed'))
        }
      })
    })
  }

  getTransferHistory(): TransferHistory[] {
    return this.transferHistory.slice(0, 50)
  }

  cancelTransfer(transferId: string): boolean {
    const transfer = this.transfers.get(transferId)
    if (!transfer || transfer.status !== 'transferring') return false

    const socket = this.activeConnections.get(transferId)
    if (socket) {
      socket.destroy()
      this.activeConnections.delete(transferId)
    }

    transfer.status = 'cancelled'
    transfer.endTime = Date.now()
    this.emit('transfer-error', { id: transferId, error: 'Transfer cancelled by user' })
    return true
  }
}
