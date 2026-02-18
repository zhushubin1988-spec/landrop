import { useState, useCallback, DragEvent } from 'react'
import { TransferItem } from '../App'

interface FileSelectorProps {
  files: TransferItem[]
  onSelectFiles: () => void
  onSelectFolder: () => void
  onRemoveFile: (id: string) => void
  onDropFiles: (files: TransferItem[]) => void
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function getFileIcon(name: string, type: TransferItem['type']): string {
  if (type === 'folder') return '📁'
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const iconMap: Record<string, string> = {
    pdf: '📕',
    doc: '📘',
    docx: '📘',
    xls: '📗',
    xlsx: '📗',
    ppt: '📙',
    pptx: '📙',
    txt: '📄',
    md: '📝',
    jpg: '🖼️',
    jpeg: '🖼️',
    png: '🖼️',
    gif: '🖼️',
    svg: '🖼️',
    mp3: '🎵',
    wav: '🎵',
    mp4: '🎬',
    mov: '🎬',
    avi: '🎬',
    zip: '🗜️',
    rar: '🗜️',
    '7z': '🗜️',
    js: '📜',
    ts: '📜',
    py: '📜',
    java: '📜',
    go: '📜',
    rs: '📜'
  }
  return iconMap[ext] || '📄'
}

function FileSelector({ files, onSelectFiles, onSelectFolder, onRemoveFile, onDropFiles }: FileSelectorProps): JSX.Element {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const droppedFiles = Array.from(e.dataTransfer.files).map((file) => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: file.name,
        path: (file as any).path || file.name,
        size: file.size,
        type: (file as any).type === '' ? 'folder' : ('file' as const)
      }))

      onDropFiles(droppedFiles)
    },
    [onDropFiles]
  )

  return (
    <div className="card file-selector">
      <div className="section-header">
        <span className="section-title">选择文件</span>
        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          {files.length} 个文件
        </span>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
        <button
          className="btn btn-primary"
          onClick={onSelectFiles}
          style={{ flex: 1 }}
        >
          选择文件
        </button>
        <button
          className="btn btn-secondary"
          onClick={onSelectFolder}
          style={{ flex: 1 }}
        >
          选择文件夹
        </button>
      </div>

      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="drop-zone-icon">📂</div>
        <div className="drop-zone-text">
          拖拽文件到这里
        </div>
      </div>

      {files.length > 0 && (
        <div className="file-list">
          {files.map((file) => (
            <div key={file.id} className="file-item">
              <div className="file-icon">{getFileIcon(file.name, file.type)}</div>
              <div className="file-info">
                <div className="file-name">{file.name}</div>
                <div className="file-size">{file.type === 'folder' ? '文件夹' : formatSize(file.size)}</div>
              </div>
              <button
                className="file-remove"
                onClick={() => onRemoveFile(file.id)}
                title="移除"
                style={{ opacity: 1 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default FileSelector
