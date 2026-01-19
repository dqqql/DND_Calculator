@echo off
echo ========================================
echo    D&D 5e 战斗数据工坊 - 启动脚本
echo ========================================
echo.

cd /d "%~dp0"

echo 检查 Node.js 环境...
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo 检查依赖包...
if not exist "node_modules" (
    echo 首次运行，正在安装依赖包...
    npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

echo.
echo 启动开发服务器...
echo 浏览器将自动打开 http://localhost:5173
echo 按 Ctrl+C 停止服务器
echo.

start "" "http://localhost:5173"
npm run dev

pause