@echo off
chcp 65001 >nul
echo =========================================
echo   LanDrop Windows 构建脚本
echo =========================================
echo.

echo [1/3] 安装依赖...
call npm install

echo.
echo [2/3] 构建 Windows 版本...
call npm run build:win

echo.
echo =========================================
echo   构建完成！
echo =========================================
echo.
echo 构建产物位置: dist\
dir dist\ /b
echo.
echo 下一步：
echo 1. 打开 https://github.com/zhushubin1988-spec/landrop/releases
echo 2. 编辑 v1.0.0 Release
echo 3. 上传 dist\ 下的文件
echo.
pause
