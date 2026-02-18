#!/bin/bash

# LanDrop 自动构建脚本

set -e

echo "========================================="
echo "  LanDrop 自动构建脚本"
echo "========================================="

# 检查参数
if [ "$1" == "mac" ]; then
    PLATFORM="mac"
elif [ "$1" == "win" ]; then
    PLATFORM="win"
elif [ "$1" == "linux" ]; then
    PLATFORM="linux"
else
    echo "用法: ./build.sh [mac|win|linux]"
    echo "示例: ./build.sh mac"
    exit 1
fi

echo "正在构建 $PLATFORM 版本..."

# 安装依赖
echo "[1/3] 安装依赖..."
npm install

# 构建
echo "[2/3] 正在构建..."
if [ "$PLATFORM" == "mac" ]; then
    npm run build:mac
elif [ "$PLATFORM" == "win" ]; then
    npm run build:win
elif [ "$PLATFORM" == "linux" ]; then
    npm run build:linux
fi

# 列出构建产物
echo "[3/3] 构建完成！产物如下："
ls -lh dist/*

echo ""
echo "========================================="
echo "  构建完成！"
echo "========================================="
echo ""
echo "下一步："
echo "1. 打开 GitHub: https://github.com/zhushubin1988-spec/landrop/releases"
echo "2. 编辑 Release，上传 dist/ 目录下的文件"
echo "3. 发布 Release"
