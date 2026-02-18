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

## 使用说明

1. 确保发送方和接收方连接到同一 WiFi 网络
2. 启动 LanDrop 应用程序
3. 应用会自动发现局域网内的其他 LanDrop 设备
4. 选择目标设备，点击发送按钮
5. 选择要传输的文件
6. 等待传输完成

## 技术栈

- Electron
- React
- TypeScript
- Vite

## 许可证

MIT License
