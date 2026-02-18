import { useState } from 'react'
import { HistoryItem } from '../App'

interface HistoryProps {
  items: HistoryItem[]
  onResend: (item: HistoryItem) => void
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // Less than 1 minute
  if (diff < 60000) {
    return '刚刚'
  }

  // Less than 1 hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000)
    return `${minutes} 分钟前`
  }

  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000)
    return `${hours} 小时前`
  }

  // More than 24 hours
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function formatSize(bytes: number): string {
  if (bytes === 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `(${format((bytes / Math.pow(1024, i)).toFixed(1))} ${units[i]})`
}

function format(str: string): string {
  return str.replace(/\.0(?!\d)/g, '')
}

function History({ items, onResend }: HistoryProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div className="card history-section">
      <div className="history-header">
        <span className="history-title">历史记录</span>
        <button
          className="btn btn-secondary"
          onClick={() => setIsExpanded(!isExpanded)}
          style={{ width: '28px', height: '28px', padding: 0, fontSize: '12px' }}
        >
          {isExpanded ? '▼' : '▲'}
        </button>
      </div>

      {isExpanded && (
        <div className="history-list">
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: '16px', fontSize: '13px' }}>
              暂无传输记录
            </div>
          ) : (
            items.slice(0, 10).map((item) => (
              <div
                key={item.id}
                className="history-item"
                onClick={() => onResend(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onResend(item)
                  }
                }}
              >
                <div className={`history-status ${item.status}`} title={item.status === 'success' ? '成功' : '失败'} />
                <div className="file-info" style={{ flex: 1 }}>
                  <div className="file-name" style={{ fontSize: '12px' }}>
                    {item.fileName}
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                  {item.deviceName}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                  {formatTime(item.timestamp)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default History
