import * as net from 'net'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { BrowserWindow, app, dialog } from 'electron'
import os from 'os'
import { Device, FileInfo } from './discovery'

const TRANSFER_PORT = 5201
const CHUNK_SIZE = 64 * 1024 // 64KB chunks

export interface TransferTask {
  id: string
  deviceId: string
  deviceName: string
  files: FileInfo[]
  totalSize: number
  transferredSize: number
  status: 'pending' | 'transferring' | 'completed' | 'failed'
  direction: 'send' | 'receive'
  startTime: number
  speed: number
}

export interface TransferProgress {
  taskId: string
  transferred: number
  total: number
  speed: number
}

type ProgressCallback = (progress: TransferProgress) => void
type CompleteCallback = (task: TransferTask) => void
type RequestCallback = (task: TransferTask) => void
type ErrorCallback = (taskId: string, error: string) => void

export class TransferService {
  private server: net.Server | null = null
  private connections: Map<string, net.Socket> = new Map()
  private currentTask: TransferTask | null = null
  private onProgressCallback: ProgressCallback | null = null
  private onCompleteCallback: CompleteCallback | null = null
  private onRequestCallback: RequestCallback | null = null
  private onErrorCallback: ErrorCallback | null = null
  private mainWindow: BrowserWindow | null = null
  private downloadDir: string

  constructor() {
    this.downloadDir = path.join(app.getPath('downloads'), 'LanDrop')
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true })
    }
  }

  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window
  }

  start(): void {
    this.createServer()
  }

  stop(): void {
    if (this.server) {
      try {
        this.server.close()
      } catch {
        // Ignore
      }
      this.server = null
    }

    this.connections.forEach((socket) => {
      try {
        socket.destroy()
      } catch {
        // Ignore
      }
    })
    this.connections.clear()
  }

  private createServer(): void {
    this.server = net.createServer((socket) => {
      this.handleConnection(socket)
    })

    this.server.on('error', (err) => {
      console.error('Transfer server error:', err)
    })

    this.server.listen(TRANSFER_PORT, () => {
      console.log(`Transfer service listening on port ${TRANSFER_PORT}`)
    })
  }

  private handleConnection(socket: net.Socket): void {
    const remoteAddress = socket.remoteAddress || ''
    console.log(`New connection from ${remoteAddress}`)

    let buffer = Buffer.alloc(0)
    let headerParsed = false
    let transferRequest: { files: FileInfo[]; totalSize: number } | null = null
    let currentFileIndex = 0
    let currentFileHandle: fs.promises.FileHandle | null = null
    let fileWrittenBytes = 0
    let totalWrittenBytes = 0
    let taskId = ''

    const cleanup = (): void => {
      if (currentFileHandle) {
        currentFileHandle.close()
        currentFileHandle = null
      }
    }

    socket.on('data', async (data) => {
      buffer = Buffer.concat([buffer, data])

      if (!headerParsed) {
        // Try to parse header (JSON)
        const newlineIndex = buffer.indexOf('\n')
        if (newlineIndex !== -1) {
          try {
            const headerStr = buffer.slice(0, newlineIndex).toString()
            const header = JSON.parse(headerStr)

            if (header.type === 'transfer_request') {
              transferRequest = header
              taskId = crypto.randomUUID()
              buffer = buffer.slice(newlineIndex + 1)

              // Create task
              const task: TransferTask = {
                id: taskId,
                deviceId: 'unknown',
                deviceName: remoteAddress,
                files: transferRequest.files,
                totalSize: transferRequest.totalSize,
                transferredSize: 0,
                status: 'pending',
                direction: 'receive',
                startTime: Date.now(),
                speed: 0
              }

              // Notify about incoming transfer
              if (this.onRequestCallback) {
                this.onRequestCallback(task)
              }

              // Wait for acceptance (synchronously for now)
              // In real implementation, this would wait for user confirmation
              const accepted = true

              const response = {
                type: 'transfer_response',
                accepted,
                message: accepted ? '接受传输' : '拒绝传输'
              }

              socket.write(JSON.stringify(response) + '\n')

              if (!accepted) {
                socket.end()
                cleanup()
                return
              }

              headerParsed = true
              this.currentTask = task

              // Start receiving files
              this.receiveNextFile(socket, transferRequest.files, 0)
            }
          } catch (err) {
            console.error('Failed to parse header:', err)
            socket.end()
          }
        }
      }
    })

    socket.on('error', (err) => {
      console.error('Socket error:', err)
      cleanup()
    })

    socket.on('close', () => {
      cleanup()
      console.log('Connection closed')
    })
  }

  private async receiveNextFile(
    socket: net.Socket,
    files: FileInfo[],
    fileIndex: number
  ): Promise<void> {
    if (fileIndex >= files.length) {
      // All files received
      if (this.currentTask) {
        this.currentTask.status = 'completed'
        this.currentTask.transferredSize = this.currentTask.totalSize
        if (this.onCompleteCallback) {
          this.onCompleteCallback(this.currentTask)
        }
      }
      socket.end()
      return
    }

    const file = files[fileIndex]
    const filePath = path.join(this.downloadDir, file.name)

    try {
      // Create directory if needed
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      const currentFileHandle = await fs.promises.open(filePath, 'w')
      let fileWrittenBytes = 0

      const receiveData = (): void => {
        socket.once('data', async (data) => {
          // Check for end marker
          if (data.length === 4 && data.readUInt32BE(0) === 0) {
            await currentFileHandle.close()
            // Move to next file
            this.receiveNextFile(socket, files, fileIndex + 1)
            return
          }

          // Read chunk size
          if (data.length < 4) {
            receiveData()
            return
          }

          const chunkSize = data.readUInt32BE(0)
          const chunkData = data.slice(4, 4 + chunkSize)

          try {
            await currentFileHandle.write(chunkData)
            fileWrittenBytes += chunkData.length
            totalWrittenBytes += chunkData.length

            // Update progress
            if (this.currentTask && this.onProgressCallback) {
              this.currentTask.transferredSize = totalWrittenBytes
              this.currentTask.status = 'transferring'
              const elapsed = (Date.now() - this.currentTask.startTime) / 1000
              this.currentTask.speed = elapsed > 0 ? totalWrittenBytes / elapsed : 0

              this.onProgressCallback({
                taskId: this.currentTask.id,
                transferred: totalWrittenBytes,
                total: this.currentTask.totalSize,
                speed: this.currentTask.speed
              })
            }

            // Continue receiving
            receiveData()
          } catch (err) {
            console.error('Write error:', err)
            socket.end()
          }
        })
      }

      receiveData()
    } catch (err) {
      console.error('File creation error:', err)
      socket.end()
    }
  }

  async sendFiles(device: Device, files: FileInfo[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket()
      const taskId = crypto.randomUUID()

      let totalSize = files.reduce((sum, f) => sum + f.size, 0)

      const task: TransferTask = {
        id: taskId,
        deviceId: device.id,
        deviceName: device.name,
        files,
        totalSize,
        transferredSize: 0,
        status: 'pending',
        direction: 'send',
        startTime: Date.now(),
        speed: 0
      }

      this.currentTask = task
      let headerSent = false
      let currentFileIndex = 0

      socket.connect(TRANSFER_PORT, device.ip, () => {
        // Send header
        const header = {
          type: 'transfer_request',
          fileCount: files.length,
          totalSize,
          files
        }

        socket.write(JSON.stringify(header) + '\n')
        headerSent = true
      })

      socket.on('data', (data) => {
        try {
          const response = JSON.parse(data.toString().trim())
          if (response.type === 'transfer_response') {
            if (response.accepted) {
              task.status = 'transferring'
              this.sendNextFile(socket, files, 0)
            } else {
              reject(new Error(response.message))
              socket.end()
            }
          }
        } catch {
          // Ignore
        }
      })

      socket.on('error', (err) => {
        task.status = 'failed'
        if (this.onErrorCallback) {
          this.onErrorCallback(taskId, err.message)
        }
        reject(err)
      })

      socket.on('close', () => {
        if (task.status === 'completed') {
          resolve(taskId)
        }
      })

      // Store connection
      this.connections.set(taskId, socket)
    })
  }

  private async sendNextFile(
    socket: net.Socket,
    files: FileInfo[],
    fileIndex: number
  ): Promise<void> {
    if (fileIndex >= files.length) {
      // Send end marker
      const endMarker = Buffer.alloc(4)
      endMarker.writeUInt32BE(0, 0)

      return new Promise((resolve) => {
        socket.write(endMarker, () => {
          // Wait for socket to finish
          socket.once('close', () => {
            if (this.currentTask) {
              this.currentTask.status = 'completed'
              if (this.onCompleteCallback) {
                this.onCompleteCallback(this.currentTask)
              }
            }
            resolve()
          })
        })
      })
    }

    const file = files[fileIndex]

    try {
      const filePath = file.path
      const fileHandle = await fs.promises.open(filePath, 'r')
      const stat = await fileHandle.stat()
      let bytesRead = 0

      const readAndSend = async (): Promise<void> => {
        const chunk = Buffer.alloc(CHUNK_SIZE)
        const { bytesRead: read } = await fileHandle.read(chunk, 0, CHUNK_SIZE, bytesRead)

        if (read === 0) {
          await fileHandle.close()
          // Send next file
          await this.sendNextFile(socket, files, fileIndex + 1)
          return
        }

        // Send chunk
        const chunkHeader = Buffer.alloc(4)
        chunkHeader.writeUInt32BE(read, 0)
        socket.write(Buffer.concat([chunkHeader, chunk.slice(0, read)]))

        bytesRead += read

        // Update progress
        if (this.currentTask) {
          this.currentTask.transferredSize += read
          const elapsed = (Date.now() - this.currentTask.startTime) / 1000
          this.currentTask.speed = elapsed > 0 ? this.currentTask.transferredSize / elapsed : 0

          if (this.onProgressCallback) {
            this.onProgressCallback({
              taskId: this.currentTask.id,
              transferred: this.currentTask.transferredSize,
              total: this.currentTask.totalSize,
              speed: this.currentTask.speed
            })
          }
        }

        // Continue reading
        readAndSend()
      }

      readAndSend()
    } catch (err) {
      console.error('Send file error:', err)
      socket.end()
    }
  }

  onProgress(callback: ProgressCallback): void {
    this.onProgressCallback = callback
  }

  onComplete(callback: CompleteCallback): void {
    this.onCompleteCallback = callback
  }

  onRequest(callback: RequestCallback): void {
    this.onRequestCallback = callback
  }

  onError(callback: ErrorCallback): void {
    this.onErrorCallback = callback
  }

  getDownloadDir(): string {
    return this.downloadDir
  }

  setDownloadDir(dir: string): void {
    if (fs.existsSync(dir)) {
      this.downloadDir = dir
      console.log(`Download directory set to: ${dir}`)
    }
  }
}
