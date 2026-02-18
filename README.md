# LanDrop - 局域网文件传输工具

LanDrop 是一款简洁高效的局域网文件传输工具，支持在同一 WiFi 网络下的设备之间快速传输文件。

## 功能特性

- **局域网设备发现**：自动发现同网络中的其他 LanDrop 设备
- **跨平台传输**：支持 Windows、macOS、Linux 系统
- **高速传输**：基于局域网带宽，传输速度快
- **无需安装**：接收方无需安装软件，网页即可接收文件（待开发）
- **简洁界面**：直观的用户界面，操作简单

## 环境要求

- Node.js 18+
- npm 9+

## 安装

```bash
# 克隆项目
git clone https://github.com/zhushubin1988-spec/landrop.git
cd landrop

# 安装依赖
npm install
```

## 开发

```bash
# 启动开发模式
npm run dev
```

## 构建

```bash
# 构建 macOS 版本
npm run build:mac

# 构建 Windows 版本
npm run build:win

# 构建 Linux 版本
npm run build:linux
```

## 使用说明（Windows）

### 方式一：下载预编译版本

1. 从 Release 页面下载 Windows 安装包（.exe 或 .msi）
2. 双击运行安装包，按照提示完成安装
3. 安装完成后，在桌面或开始菜单找到 LanDrop 图标并启动

### 方式二：自行构建

```bash
# 安装依赖
npm install

# 构建 Windows 版本
npm run build:win
```

构建完成后，在 `release` 目录下找到安装包。

### 使用步骤

1. **确保网络连接**：发送方和接收方必须连接到同一 WiFi 网络
2. **启动应用**：双击 LanDrop 图标启动程序
3. **发现设备**：应用会自动搜索局域网内的其他 LanDrop 设备
4. **选择设备**：在设备列表中选择要发送到的目标设备
5. **选择文件**：点击"发送文件"按钮，选择要传输的文件
6. **等待传输**：文件传输完成后，接收方会收到通知

### 注意事项

- Windows 防火墙可能会阻止局域网发现，请允许 LanDrop 通过防火墙
- 确保两台设备在同一个局域网内（同一 WiFi 或有线网络）
- 传输速度取决于局域网带宽

## 技术栈

- Electron
- React
- TypeScript
- Vite

## 许可证

MIT License
