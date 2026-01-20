const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  // 创建浏览器窗口
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    autoHideMenuBar: true, // 隐藏菜单栏
    icon: path.join(__dirname, 'public/icon.ico') // 如果你有图标的话
  });

  // 根据环境加载页面
  if (app.isPackaged) {
    // 生产环境(打包后)：加载构建好的 html
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    // 开发环境：加载本地开发服务器地址
    win.loadURL('http://localhost:5173');
    // 开发环境自动打开调试控制台 (可选)
    // win.webContents.openDevTools();
  }
}

// Electron 初始化完成
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});