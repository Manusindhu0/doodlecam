const { app, BrowserWindow, ipcMain, dialog, nativeImage, session, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');

// Enable real camera access — permissions handled via session handler below
// NOTE: do NOT use 'use-fake-device-for-media-stream' (causes green screen)
// NOTE: do NOT use 'use-fake-ui-for-media-stream' (can block real Windows camera prompt)
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'DoodleCam',
    icon: path.join(__dirname, 'src', 'assets', 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    },
    backgroundColor: '#0a0a1a',
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0a1a',
      symbolColor: '#00f5d4',
      height: 36
    }
  });

  // Grant camera & microphone permissions automatically
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'display-capture'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    const allowedPermissions = ['media', 'mediaKeySystem'];
    return allowedPermissions.includes(permission);
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Forward renderer console to terminal for debugging
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levels = ['LOG', 'WARN', 'ERROR'];
    const prefix = levels[level] || 'LOG';
    // Only forward our app logs, not DevTools noise
    if (message.includes('[') || message.includes('Error') || message.includes('error') || level >= 2) {
      console.log(`[Renderer ${prefix}] ${message}`);
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in dev mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── IPC Handlers ────────────────────────────────────────────────

// Camera permission error — show native OS dialog to guide user
ipcMain.handle('camera-permission-error', async (event, { errorName }) => {
  let detail = 'Make sure your webcam is connected and try again.';

  if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
    detail = 'Windows is blocking camera access for this app.\n\nTo fix this:\n1. Open Windows Settings\n2. Go to Privacy & Security → Camera\n3. Enable "Let apps access your camera"\n4. Restart DoodleCam';
  } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
    detail = 'No webcam was found. Please connect a USB webcam and restart DoodleCam.';
  } else if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
    detail = 'Your camera is already in use by another app (e.g. Zoom, Teams, OBS). Close those apps and restart DoodleCam.';
  }

  await dialog.showMessageBox(mainWindow, {
    type: 'error',
    title: 'Camera Access Failed',
    message: 'DoodleCam could not access your camera.',
    detail,
    buttons: ['OK']
  });
});

// Save file dialog
ipcMain.handle('save-file', async (event, { buffer, defaultName, filters }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: filters || [
      { name: 'Images', extensions: ['png', 'jpg'] },
      { name: 'Videos', extensions: ['webm', 'mp4'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePath) {
    const data = Buffer.from(buffer);
    fs.writeFileSync(result.filePath, data);
    return { success: true, path: result.filePath };
  }
  return { success: false };
});

// Save base64 image
ipcMain.handle('save-image', async (event, { dataUrl, defaultName }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'doodlecam-photo.png',
    filters: [
      { name: 'PNG Image', extensions: ['png'] },
      { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }
    ]
  });

  if (!result.canceled && result.filePath) {
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(result.filePath, buffer);
    return { success: true, path: result.filePath };
  }
  return { success: false };
});

// Save video blob
ipcMain.handle('save-video', async (event, { buffer, defaultName }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'doodlecam-video.webm',
    filters: [
      { name: 'WebM Video', extensions: ['webm'] }
    ]
  });

  if (!result.canceled && result.filePath) {
    const data = Buffer.from(buffer);
    fs.writeFileSync(result.filePath, data);
    return { success: true, path: result.filePath };
  }
  return { success: false };
});

// Get app path
ipcMain.handle('get-path', (event, name) => {
  return app.getPath(name);
});

// ─── App Lifecycle ───────────────────────────────────────────────

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
