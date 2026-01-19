@echo off
echo 正在构建DND战斗计算器...
echo.
echo 第1步: 构建Web应用...
call npm run build
if %errorlevel% neq 0 (
    echo 构建失败！
    pause
    exit /b 1
)

echo.
echo 第2步: 打包成exe...
call npm run dist
if %errorlevel% neq 0 (
    echo 打包失败！
    pause
    exit /b 1
)

echo.
echo 构建完成！
echo 安装包位置: release\DND战斗计算器 Setup 1.0.0.exe
echo 便携版位置: release\DND战斗计算器-1.0.0-win.zip
echo.
pause