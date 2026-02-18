#!/bin/bash

# LanDrop Windows 构建脚本

set -e

echo "========================================="
echo "  LanDrop Windows 构建脚本"
echo "========================================="

echo "正在安装依赖..."
npm install

echo "正在构建 Windows 版本..."
npm run build:win

echo ""
echo "========================================="
echo "  构建完成！"
echo "========================================="
echo ""
echo "构建产物位置: dist/"
ls -lh dist/

echo ""
echo "下一步："
echo "1. 打开 https://github.com/zhushubin1988-spec/landrop/releases"
echo "2. 编辑 v1.0.0 Release"
echo "3. 上传 dist/ 下的文件（.exe 或 win-unpacked 目录）"
