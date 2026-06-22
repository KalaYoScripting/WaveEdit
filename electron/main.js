const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const AUDIO_FILTERS = [
  { name: 'Audio Files', extensions: ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac'] },
  { name: 'All Files', extensions: ['*'] },
];

let mainWindow = null;
let isDirty = false;
let forceClose = false;

const stateFile = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  } catch {
    return { width: 1280, height: 820 };
  }
}

function saveWindowState() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized() || mainWindow.isMaximized()) return;
  const { x, y, width, height } = mainWindow.getBounds();
  try {
    fs.writeFileSync(stateFile, JSON.stringify({ x, y, width, height }));
  } catch {
    /* ignore persistence failures */
  }
}

function createWindow() {
  const saved = loadWindowState();

  mainWindow = new BrowserWindow({
    x: saved.x,
    y: saved.y,
    width: saved.width,
    height: saved.height,
    minWidth: 1024,
    minHeight: 700,
    title: 'WaveEdit',
    backgroundColor: '#111110',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  mainWindow.on('close', (e) => {
    if (forceClose || !isDirty) {
      saveWindowState();
      return;
    }
    e.preventDefault();
    promptUnsavedChanges();
  });

  ['resize', 'move'].forEach((evt) => mainWindow.on(evt, saveWindowState));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function promptUnsavedChanges() {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    title: 'Unsaved Changes',
    message: 'You have unsaved changes. Save before closing?',
  });

  if (response === 0) {
    mainWindow.webContents.send('menu:action', 'save-then-close');
  } else if (response === 1) {
    forceClose = true;
    mainWindow.close();
  }
  // response === 2 -> cancel, do nothing
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const send = (action) => () => mainWindow && mainWindow.webContents.send('menu:action', action);

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: send('new') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: send('open') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: send('save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: send('save-as') },
        { label: 'Export…', accelerator: 'CmdOrCtrl+E', click: send('export') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
        { type: 'separator' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: send('select-all') },
        { label: 'Clear Selection', accelerator: 'Escape', click: send('clear-selection') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: send('zoom-in') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: send('zoom-out') },
        { label: 'Fit to View', accelerator: 'CmdOrCtrl+0', click: send('zoom-fit') },
        { type: 'separator' },
        { label: 'Toggle Theme', accelerator: 'CmdOrCtrl+T', click: send('toggle-theme') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Transport',
      submenu: [
        { label: 'Play/Pause', accelerator: 'Space', click: send('play') },
        { type: 'separator' },
        { label: 'Skip Back 5s', accelerator: 'Left', click: send('skip-back') },
        { label: 'Skip Forward 5s', accelerator: 'Right', click: send('skip-forward') },
        { label: 'Skip to Start', accelerator: 'Home', click: send('skip-start') },
        { label: 'Skip to End', accelerator: 'End', click: send('skip-end') },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About WaveEdit',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About WaveEdit',
              message: 'WaveEdit',
              detail:
                'A cross-platform desktop audio editor.\nVersion ' +
                app.getVersion() +
                '\nBuilt with Electron and the Web Audio API.',
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ===================== IPC HANDLERS =====================
ipcMain.handle('dialog:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Audio File',
    properties: ['openFile'],
    filters: AUDIO_FILTERS,
  });
  if (canceled || !filePaths.length) return { canceled: true };
  const filePath = filePaths[0];
  const data = fs.readFileSync(filePath);
  return { canceled: false, filePath, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
});

ipcMain.handle('dialog:save', async (_e, { defaultName, extension }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Audio',
    defaultPath: defaultName,
    filters: [{ name: (extension || 'wav').toUpperCase(), extensions: [extension || 'wav'] }],
  });
  if (canceled || !filePath) return { canceled: true };
  return { canceled: false, filePath };
});

ipcMain.handle('fs:read', async (_e, filePath) => {
  const data = fs.readFileSync(filePath);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
});

ipcMain.handle('fs:write', async (_e, { filePath, data }) => {
  fs.writeFileSync(filePath, Buffer.from(data));
  return { ok: true, filePath };
});

ipcMain.on('app:set-dirty', (_e, dirty) => {
  isDirty = !!dirty;
});

ipcMain.on('app:ready-to-close', () => {
  forceClose = true;
  if (mainWindow) mainWindow.close();
});

ipcMain.on('app:open-external', (_e, url) => {
  shell.openExternal(url);
});

// ===================== APP LIFECYCLE =====================
app.whenReady().then(() => {
  createWindow();
  buildMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
