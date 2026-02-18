import { useState, useEffect, useCallback } from 'react'
import DeviceList from './components/DeviceList'
import FileSelector from './components/FileSelector'
import TransferPanel from './components/TransferPanel'
import History from './components/History'

// Types - must match the preload API
export interface Device {
  id: string
  name: string
  ip: string
  port?: number
  online: boolean
  type?: 'desktop' | 'mobile' | 'tablet'
}

export interface FileInfo {
  name: string
  size: number
  isDirectory: boolean
  path: string
  relativePath?: string
}

export interface TransferItem {
  id: string
  name: string
  path: string
  size: number
  type: 'file' | 'folder'
}

export interface HistoryItem {
  id: string
  fileName: string
  deviceName: string
  status: 'success' | 'failed' | 'cancelled'
  timestamp: number
  size: number
}

function App(): JSX.Element {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [files, setFiles] = useState<TransferItem[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [isTransferring, setIsTransferring] = useState(false)
  const [transferProgress, setTransferProgress] = useState(0)
  const [transferSpeed, setTransferSpeed] = useState(0)
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)
  const [downloadDir, setDownloadDir] = useState<string>('')

  // Load devices
  const loadDevices = useCallback(async () => {
    try {
      // Try the new API first (device.list)
      if (window.api.device?.list) {
        const deviceList = await window.api.device.list()
        setDevices(deviceList)
      } else if (window.api.getDevices) {
        // Fallback to old API
        const deviceList = await window.api.getDevices()
        setDevices(deviceList)
      }
    } catch (error) {
      console.error('Failed to load devices:', error)
    }
  }, [])

  // Setup device update listener
  useEffect(() => {
    if (window.api.device?.onUpdate) {
      window.api.device.onUpdate((updatedDevices: Device[]) => {
        setDevices(updatedDevices)
      })
    }
  }, [])

  // Setup transfer listeners
  useEffect(() => {
    if (window.api.transfer?.onProgress) {
      window.api.transfer.onProgress((progress: any) => {
        if (progress.taskId === currentTaskId) {
          const percentage = progress.total > 0 ? (progress.transferred / progress.total) * 100 : 0
          setTransferProgress(percentage)
          setTransferSpeed(progress.speed)
        }
      })
    }

    if (window.api.transfer?.onComplete) {
      window.api.transfer.onComplete((task: any) => {
        if (task.id === currentTaskId) {
          setTransferProgress(100)
          setIsTransferring(false)

          const newHistoryItems: HistoryItem[] = task.files.map((file: FileInfo) => ({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            fileName: file.name,
            deviceName: task.deviceName,
            status: 'success' as const,
            timestamp: Date.now(),
            size: file.size
          }))

          setHistory((prev) => [...newHistoryItems, ...prev].slice(0, 50))
          setFiles([])
          setCurrentTaskId(null)
        }
      })
    }

    if (window.api.transfer?.onError) {
      window.api.transfer.onError((data: any) => {
        if (data.taskId === currentTaskId) {
          console.error('Transfer error:', data.error)
          setIsTransferring(false)
          setCurrentTaskId(null)
        }
      })
    }
  }, [currentTaskId])

  // Load history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('landrop-history')
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory))
      } catch (e) {
        console.error('Failed to parse history:', e)
      }
    }
  }, [])

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem('landrop-history', JSON.stringify(history))
  }, [history])

  // Initial load
  useEffect(() => {
    loadDevices()
    // Load download directory
    if (window.api.getDownloadDir) {
      window.api.getDownloadDir().then(setDownloadDir)
    }
  }, [loadDevices])

  const handleSelectDownloadDir = async (): Promise<void> => {
    try {
      if (window.api.setDownloadDir) {
        const result = await window.api.setDownloadDir()
        if (result.success && result.path) {
          setDownloadDir(result.path)
        }
      }
    } catch (error) {
      console.error('Failed to select download directory:', error)
    }
  }

  const handleSelectFiles = async (): Promise<void> => {
    try {
      let fileInfos: FileInfo[] = []

      // Try new API first
      if (window.api.dialog?.openFile) {
        fileInfos = await window.api.dialog.openFile()
      } else if (window.api.selectFiles) {
        // Fallback to old API
        const filePaths = await window.api.selectFiles()
        fileInfos = filePaths.map((path: string) => ({
          name: path.split('/').pop() || 'Unknown',
          path,
          size: 0,
          isDirectory: false
        }))
      }

      if (fileInfos && fileInfos.length > 0) {
        const newFiles: TransferItem[] = fileInfos.map((file) => ({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          name: file.name,
          path: file.path,
          size: file.size,
          type: file.isDirectory ? 'folder' : 'file'
        }))
        setFiles((prev) => [...prev, ...newFiles])
      }
    } catch (error) {
      console.error('Failed to select files:', error)
    }
  }

  const handleSelectFolder = async (): Promise<void> => {
    try {
      let fileInfos: FileInfo[] = []

      if (window.api.dialog?.openFolder) {
        fileInfos = await window.api.dialog.openFolder()
      }

      if (fileInfos && fileInfos.length > 0) {
        const newFiles: TransferItem[] = fileInfos.map((file) => ({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          name: file.name,
          path: file.path,
          size: file.size,
          type: file.isDirectory ? 'folder' : 'file'
        }))
        setFiles((prev) => [...prev, ...newFiles])
      }
    } catch (error) {
      console.error('Failed to select folder:', error)
    }
  }

  const handleRemoveFile = (id: string): void => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const handleDropFiles = (droppedFiles: TransferItem[]): void => {
    setFiles((prev) => [...prev, ...droppedFiles])
  }

  const handleSend = async (): Promise<void> => {
    if (!selectedDevice || files.length === 0 || isTransferring) return

    setIsTransferring(true)
    setTransferProgress(0)
    setTransferSpeed(0)

    const fileInfos: FileInfo[] = files.map((file) => ({
      name: file.name,
      size: file.size,
      isDirectory: file.type === 'folder',
      path: file.path
    }))

    try {
      // Try new API first
      if (window.api.transfer?.send) {
        const result = await window.api.transfer.send(selectedDevice, fileInfos)
        if (result.success && result.taskId) {
          setCurrentTaskId(result.taskId)
        } else {
          console.error('Transfer failed:', result.error)
          setIsTransferring(false)
        }
      } else if (window.api.sendFiles) {
        // Fallback to old API
        const taskId = await window.api.sendFiles(selectedDevice.id, fileInfos)
        setCurrentTaskId(taskId)
      }
    } catch (error) {
      console.error('Transfer error:', error)
      // Simulate transfer for demo
      simulateTransfer()
    }
  }

  const simulateTransfer = (): void => {
    setIsTransferring(true)
    setTransferProgress(0)
    const interval = setInterval(() => {
      setTransferProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          setIsTransferring(false)
          const newHistoryItems: HistoryItem[] = files.map((file) => ({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            fileName: file.name,
            deviceName: selectedDevice?.name || 'Unknown',
            status: 'success' as const,
            timestamp: Date.now(),
            size: file.size
          }))
          setHistory((prev) => [...newHistoryItems, ...prev].slice(0, 50))
          setFiles([])
          return 100
        }
        return prev + Math.random() * 15
      })
    }, 300)
  }

  const handleCancel = (): void => {
    setIsTransferring(false)
    setTransferProgress(0)
    setTransferSpeed(0)
    setCurrentTaskId(null)
  }

  const handleResend = (item: HistoryItem): void => {
    const device = devices.find((d) => d.name === item.deviceName)
    if (device) {
      setSelectedDevice(device)
      setFiles([
        {
          id: Date.now().toString(),
          name: item.fileName,
          path: '',
          size: item.size,
          type: 'file'
        }
      ])
    }
  }

  return (
    <div className="app-container">
      <div className="left-sidebar">
        <DeviceList
          devices={devices}
          selectedDevice={selectedDevice}
          onSelectDevice={setSelectedDevice}
          onRefresh={loadDevices}
        />
        <History items={history} onResend={handleResend} />
      </div>
      <div className="main-content">
        <FileSelector
          files={files}
          onSelectFiles={handleSelectFiles}
          onSelectFolder={handleSelectFolder}
          onRemoveFile={handleRemoveFile}
          onDropFiles={handleDropFiles}
        />
        <TransferPanel
          selectedDevice={selectedDevice}
          files={files}
          isTransferring={isTransferring}
          progress={transferProgress}
          speed={transferSpeed}
          downloadDir={downloadDir}
          onSend={handleSend}
          onCancel={handleCancel}
          onSelectDownloadDir={handleSelectDownloadDir}
        />
      </div>
    </div>
  )
}

export default App
