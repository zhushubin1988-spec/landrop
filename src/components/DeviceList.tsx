import { Device } from '../App'

interface DeviceListProps {
  devices: Device[]
  selectedDevice: Device | null
  onSelectDevice: (device: Device | null) => void
  onRefresh: () => void
}

function DeviceList({ devices, selectedDevice, onSelectDevice, onRefresh }: DeviceListProps): JSX.Element {
  const getDeviceIcon = (type: Device['type']): string => {
    switch (type) {
      case 'mobile':
        return '📱'
      case 'tablet':
        return '📱'
      case 'desktop':
        return '💻'
      default:
        return '💻'
    }
  }

  return (
    <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="section-header">
        <span className="section-title">设备列表</span>
        <button
          className="btn btn-secondary"
          onClick={onRefresh}
          title="刷新设备"
          style={{ width: '36px', height: '36px', padding: 0 }}
        >
          🔄
        </button>
      </div>
      <div className="device-list">
        {devices.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📡</div>
            <div className="empty-state-title">未发现设备</div>
            <div className="empty-state-text">正在搜索局域网内的设备...</div>
          </div>
        ) : (
          devices.map((device) => (
            <div
              key={device.id}
              className={`device-card ${selectedDevice?.id === device.id ? 'selected' : ''}`}
              onClick={() => onSelectDevice(device)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onSelectDevice(device)
                }
              }}
            >
              <div className="device-icon">{getDeviceIcon(device.type)}</div>
              <div className="device-info">
                <div className="device-name">{device.name}</div>
                <div className="device-ip">{device.ip}</div>
              </div>
              <div className={`status-dot ${device.online ? 'online' : 'offline'}`} title={device.online ? '在线' : '离线'} />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default DeviceList
