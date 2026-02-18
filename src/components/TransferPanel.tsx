import { Device, TransferItem } from '../App'

interface TransferPanelProps {
  selectedDevice: Device | null
  files: TransferItem[]
  isTransferring: boolean
  progress: number
  speed: number
  onSend: () => void
  onCancel: () => void
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function TransferPanel({
  selectedDevice,
  files,
  isTransferring,
  progress,
  speed,
  onSend,
  onCancel
}: TransferPanelProps): JSX.Element {
  const totalSize = files.reduce((acc, file) => acc + file.size, 0)
  const canSend = selectedDevice && files.length > 0 && !isTransferring

  return (
    <div className="card" style={{ marginTop: '16px' }}>
      <div className="section-header">
        <span className="section-title">传输</span>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
          目标设备
        </div>
        <div
          style={{
            padding: '12px',
            background: 'rgba(0, 0, 0, 0.03)',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500
          }}
        >
          {selectedDevice ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{selectedDevice.name}</span>
              <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                ({selectedDevice.ip})
              </span>
            </div>
          ) : (
            <span style={{ color: 'var(--color-text-secondary)' }}>请选择目标设备</span>
          )}
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
          待传输文件
        </div>
        <div
          style={{
            padding: '12px',
            background: 'rgba(0, 0, 0, 0.03)',
            borderRadius: '8px',
            fontSize: '14px'
          }}
        >
          {files.length > 0 ? (
            <div>
              <div>{files.length} 个文件</div>
              {totalSize > 0 && (
                <div style={{ color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                  总大小: {formatSize(totalSize)}
                </div>
              )}
            </div>
          ) : (
            <span style={{ color: 'var(--color-text-secondary)' }}>请选择要传输的文件</span>
          )}
        </div>
      </div>

      {isTransferring && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
            <span>传输进度</span>
            <span>{Math.min(Math.round(progress), 100)}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
          <div className="transfer-status" style={{ marginTop: '8px' }}>
            <span>速度: {formatSize(speed)}/s</span>
            <span>{formatSize((totalSize * progress) / 100)} / {formatSize(totalSize)}</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px' }}>
        {isTransferring ? (
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onCancel}>
            取消传输
          </button>
        ) : (
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={onSend}
            disabled={!canSend}
          >
            {selectedDevice ? `发送到 ${selectedDevice.name}` : '选择设备后发送'}
          </button>
        )}
      </div>
    </div>
  )
}

export default TransferPanel
