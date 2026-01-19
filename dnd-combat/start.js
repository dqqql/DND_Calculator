#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('\x1b[36m========================================\x1b[0m');
console.log('\x1b[33m   D&D 5e 战斗数据工坊 - 启动脚本\x1b[0m');
console.log('\x1b[36m========================================\x1b[0m');
console.log('');

// 切换到脚本所在目录
process.chdir(__dirname);

// 检查依赖
console.log('\x1b[32m检查项目依赖...\x1b[0m');
if (!fs.existsSync('node_modules')) {
    console.log('\x1b[33m首次运行，正在安装依赖包...\x1b[0m');
    
    const install = spawn('npm', ['install'], { stdio: 'inherit' });
    
    install.on('close', (code) => {
        if (code !== 0) {
            console.log('\x1b[31m✗ 依赖安装失败\x1b[0m');
            process.exit(1);
        }
        console.log('\x1b[32m✓ 依赖安装完成\x1b[0m');
        startServer();
    });
} else {
    console.log('\x1b[32m✓ 依赖已存在\x1b[0m');
    startServer();
}

function startServer() {
    console.log('');
    console.log('\x1b[32m启动开发服务器...\x1b[0m');
    console.log('\x1b[33m浏览器将自动打开 http://localhost:5173\x1b[0m');
    console.log('\x1b[33m按 Ctrl+C 停止服务器\x1b[0m');
    console.log('');

    // 延迟打开浏览器
    setTimeout(() => {
        const url = 'http://localhost:5173';
        const platform = os.platform();
        
        let command;
        if (platform === 'win32') {
            command = `start "" "${url}"`;
        } else if (platform === 'darwin') {
            command = `open "${url}"`;
        } else {
            command = `xdg-open "${url}"`;
        }
        
        exec(command, (error) => {
            if (error) {
                console.log('\x1b[33m请手动打开浏览器访问: http://localhost:5173\x1b[0m');
            }
        });
    }, 3000);

    // 启动开发服务器
    const dev = spawn('npm', ['run', 'dev'], { stdio: 'inherit' });
    
    dev.on('close', (code) => {
        console.log(`\n服务器已停止 (退出码: ${code})`);
    });
}