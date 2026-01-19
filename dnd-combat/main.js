const { app, BrowserWindow } = require('electron');
const path = require('path');
const { readFileSync, existsSync } = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true
    },
    autoHideMenuBar: true,
    show: false // 先不显示，等加载完成后再显示
  });

  // 检查文件是否存在
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  console.log('尝试加载文件:', indexPath);
  console.log('文件是否存在:', existsSync(indexPath));

  // 加载完成后显示窗口
  win.once('ready-to-show', () => {
    win.show();
    console.log('窗口已显示');
  });

  // 监听加载失败事件
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('页面加载失败:', errorCode, errorDescription, validatedURL);
  });

  // 监听控制台消息
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log('控制台消息:', message);
  });

  // 加载打包后的 index.html
  win.loadFile(indexPath).catch(err => {
    console.error('加载文件失败:', err);
  });

  // 开发时打开开发者工具
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  console.log('Electron应用已准备就绪');
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});