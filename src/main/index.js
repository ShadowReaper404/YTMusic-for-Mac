'use strict';

const { app, BrowserWindow, ipcMain, Menu, Tray, shell, nativeTheme, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const DiscordRPCManager = require('./discord-rpc');

// ─── Store / Settings ───────────────────────────────────────────────────────
const store = new Store({
  defaults: {
    discordRPC: {
      enabled: true,
      showSongTitle: true,
      showArtist: true,
      showAlbumArt: true,
      showTimestamp: true,
      showPlaybackButtons: true,
      statusText: 'Listening on YouTube Music',
      applicationId: '1234567890123456789', // User's Discord App ID
    },
    window: {
      width: 1100,
      height: 740,
      x: undefined,
      y: undefined,
    },
    appearance: {
      theme: 'system', // 'light' | 'dark' | 'system'
    },
    behavior: {
      startMinimized: false,
      minimizeToTray: true,
      hardwareAcceleration: true,
      rememberLastTab: true,
    },
    notifications: {
      nowPlaying: true,
    }
  }
});

// ─── Global State ───────────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let discordRPC = null;
let currentTrack = null;
let isPlaying = false;

// ─── App Init ───────────────────────────────────────────────────────────────
if (!store.get('behavior.hardwareAcceleration')) {
  app.disableHardwareAcceleration();
}

app.whenReady().then(async () => {
  createWindow();
  createTray();

  // Init Discord RPC if enabled
  if (store.get('discordRPC.enabled')) {
    discordRPC = new DiscordRPCManager(store);
    await discordRPC.connect();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  discordRPC?.destroy();
});

// ─── Window Creation ─────────────────────────────────────────────────────────
function createWindow() {
  const { width, height, x, y } = store.get('window');

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#0f0f0f',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
    },
  });

  // Load the renderer UI
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Save window position/size on resize/move
  const saveWindowBounds = () => {
    const bounds = mainWindow.getBounds();
    store.set('window', bounds);
  };
  mainWindow.on('resize', saveWindowBounds);
  mainWindow.on('move', saveWindowBounds);

  // Handle minimize to tray
  mainWindow.on('close', (e) => {
    if (store.get('behavior.minimizeToTray') && !app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ─── Tray ────────────────────────────────────────────────────────────────────
function createTray() {
  // Use a template icon from assets or fallback
  const iconPath = path.join(__dirname, '../../assets/tray-icon.png');
  try {
    tray = new Tray(iconPath);
  } catch {
    // Skip tray if icon missing during dev
    return;
  }

  tray.setToolTip('YT Music');
  updateTrayMenu();

  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const trackLabel = currentTrack
    ? `${currentTrack.title} — ${currentTrack.artist}`
    : 'Nothing playing';

  const menu = Menu.buildFromTemplate([
    { label: trackLabel, enabled: false },
    { type: 'separator' },
    {
      label: isPlaying ? '⏸  Pause' : '▶  Play',
      click: () => mainWindow?.webContents.send('control:toggle'),
    },
    { label: '⏮  Previous', click: () => mainWindow?.webContents.send('control:prev') },
    { label: '⏭  Next', click: () => mainWindow?.webContents.send('control:next') },
    { type: 'separator' },
    {
      label: 'Discord Rich Presence',
      submenu: [
        {
          label: store.get('discordRPC.enabled') ? '✓ Enabled' : 'Disabled',
          click: () => ipcMain.emit('settings:toggle-rpc'),
        },
      ]
    },
    { type: 'separator' },
    { label: 'Open YT Music', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'Settings', click: () => mainWindow?.webContents.send('nav:settings') },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(menu);
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

// Track info update from webview
ipcMain.on('track:update', (_, track) => {
  currentTrack = track;
  isPlaying = track?.isPlaying ?? false;
  updateTrayMenu();

  // Update Discord RPC
  if (discordRPC && store.get('discordRPC.enabled')) {
    discordRPC.update(track);
  }
});

// Settings: get all
ipcMain.handle('settings:get', () => store.store);

// Settings: set a key
ipcMain.handle('settings:set', (_, key, value) => {
  store.set(key, value);
  return store.store;
});

// Toggle Discord RPC on/off
ipcMain.handle('settings:toggle-rpc', async () => {
  const enabled = !store.get('discordRPC.enabled');
  store.set('discordRPC.enabled', enabled);

  if (enabled) {
    if (!discordRPC) discordRPC = new DiscordRPCManager(store);
    await discordRPC.connect();
    if (currentTrack) discordRPC.update(currentTrack);
  } else {
    discordRPC?.clearActivity();
    discordRPC?.destroy();
    discordRPC = null;
  }

  mainWindow?.webContents.send('settings:rpc-changed', enabled);
  updateTrayMenu();
  return enabled;
});

// Get current RPC status
ipcMain.handle('discord:status', () => ({
  enabled: store.get('discordRPC.enabled'),
  connected: discordRPC?.isConnected ?? false,
}));

// Open external link
ipcMain.on('shell:open', (_, url) => shell.openExternal(url));

// App version
ipcMain.handle('app:version', () => app.getVersion());
