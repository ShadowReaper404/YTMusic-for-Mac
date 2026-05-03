'use strict';

const { app, BrowserWindow, ipcMain, Menu, Tray, shell, session } = require('electron');
const path = require('path');
const Store = require('electron-store');
const DiscordRPCManager = require('./discord-rpc');

const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── Store ───────────────────────────────────────────────────────────────────
const store = new Store({
  defaults: {
    discordRPC: {
      enabled: true, showSongTitle: true, showArtist: true,
      showAlbumArt: true, showTimestamp: true, showPlaybackButtons: true,
      statusText: 'Listening on YouTube Music',
      applicationId: '1234567890123456789',
    },
    window: { width: 1100, height: 740, x: undefined, y: undefined },
    appearance: { theme: 'system' },
    behavior: { startMinimized: false, minimizeToTray: true, hardwareAcceleration: true },
    notifications: { nowPlaying: true },
  }
});

let mainWindow = null, tray = null, discordRPC = null, signInWin = null;
let currentTrack = null, isPlaying = false;

if (!store.get('behavior.hardwareAcceleration')) app.disableHardwareAcceleration();

// ─── App Init ────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Strip Electron fingerprints from the YTM session
  const ytSession = session.fromPartition('persist:ytmusic');
  ytSession.setUserAgent(CHROME_UA);
  ytSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const h = details.requestHeaders;
    h['User-Agent'] = CHROME_UA;
    h['sec-ch-ua'] = '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"';
    h['sec-ch-ua-mobile'] = '?0';
    h['sec-ch-ua-platform'] = '"macOS"';
    delete h['X-Client-Data'];
    callback({ requestHeaders: h });
  });

  createWindow();
  createTray();

  if (store.get('discordRPC.enabled')) {
    discordRPC = new DiscordRPCManager(store);
    await discordRPC.connect();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { discordRPC?.destroy(); });

// ─── Main Window (loads local UI with webview) ───────────────────────────────
function createWindow() {
  const { width, height, x, y } = store.get('window');
  mainWindow = new BrowserWindow({
    width, height, x, y,
    minWidth: 900, minHeight: 600,
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

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  const saveBounds = () => store.set('window', mainWindow.getBounds());
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);
  mainWindow.on('close', (e) => {
    if (store.get('behavior.minimizeToTray') && !app.isQuitting) {
      e.preventDefault(); mainWindow.hide();
    }
  });

  // All external links → system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url); return { action: 'deny' };
  });

  // Patch UA on the webview when it attaches
  mainWindow.webContents.on('did-attach-webview', (_, wc) => {
    wc.setUserAgent(CHROME_UA);
    wc.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url); return { action: 'deny' };
    });
  });
}

// ─── Sign-In Window ──────────────────────────────────────────────────────────
function openSignInWindow() {
  if (signInWin && !signInWin.isDestroyed()) { signInWin.focus(); return; }

  signInWin = new BrowserWindow({
    width: 1000, height: 700,
    title: 'Sign in — YouTube Music',
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      partition: 'persist:ytmusic',
    },
  });

  signInWin.webContents.setUserAgent(CHROME_UA);
  signInWin.loadURL('https://music.youtube.com');

  // Strip parameters that tell Google this is an embedded/webview request.
  // YouTube Music adds these when running inside Electron — removing them
  // makes Google treat the sign-in as a normal browser flow.
  signInWin.webContents.on('will-navigate', (event, url) => {
    if (url.includes('accounts.google.com') || url.includes('accounts.youtube.com')) {
      try {
        const u = new URL(url);
        // Remove webview-identifying parameters
        ['embeddedWebView', 'type', 'passive', 'flowName', 'flowEntry'].forEach(p => u.searchParams.delete(p));
        // Ensure it's treated as a browser flow
        u.searchParams.set('flowName', 'GlifWebSignIn');
        const cleanUrl = u.toString();
        if (cleanUrl !== url) {
          event.preventDefault();
          signInWin.loadURL(cleanUrl);
        }
      } catch { /* leave url unchanged */ }
    }
  });

  let visitedGoogle = false;
  signInWin.webContents.on('did-navigate', (_, url) => {
    if (url.includes('accounts.google.com') || url.includes('accounts.youtube.com')) {
      visitedGoogle = true;
    } else if (visitedGoogle && url.startsWith('https://music.youtube.com')) {
      signInWin.close();
      mainWindow?.webContents.send('auth:reload-webview');
    }
  });

  signInWin.on('closed', () => { signInWin = null; });
}


// ─── Tray ─────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '../../assets/tray-icon.png');
  try { tray = new Tray(iconPath); } catch { return; }
  tray.setToolTip('YT Music');
  updateTrayMenu();
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

function updateTrayMenu() {
  if (!tray) return;
  const trackLabel = currentTrack ? `${currentTrack.title} — ${currentTrack.artist}` : 'Nothing playing';
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: trackLabel, enabled: false },
    { type: 'separator' },
    { label: isPlaying ? '⏸  Pause' : '▶  Play', click: () => mainWindow?.webContents.send('control:toggle') },
    { label: '⏮  Previous', click: () => mainWindow?.webContents.send('control:prev') },
    { label: '⏭  Next', click: () => mainWindow?.webContents.send('control:next') },
    { type: 'separator' },
    { label: '🔑  Sign In…', click: openSignInWindow },
    { label: 'Open YT Music', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'Settings', click: () => mainWindow?.webContents.send('nav:settings') },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

// ─── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.on('track:update', (_, track) => {
  currentTrack = track; isPlaying = track?.isPlaying ?? false;
  updateTrayMenu();
  if (discordRPC && store.get('discordRPC.enabled')) discordRPC.update(track);
});

ipcMain.handle('settings:get', () => store.store);
ipcMain.handle('settings:set', (_, key, value) => { store.set(key, value); return store.store; });
ipcMain.handle('settings:toggle-rpc', async () => {
  const enabled = !store.get('discordRPC.enabled');
  store.set('discordRPC.enabled', enabled);
  if (enabled) {
    if (!discordRPC) discordRPC = new DiscordRPCManager(store);
    await discordRPC.connect();
    if (currentTrack) discordRPC.update(currentTrack);
  } else { discordRPC?.clearActivity(); discordRPC?.destroy(); discordRPC = null; }
  mainWindow?.webContents.send('settings:rpc-changed', enabled);
  updateTrayMenu();
  return enabled;
});

ipcMain.handle('discord:status', () => ({ enabled: store.get('discordRPC.enabled'), connected: discordRPC?.isConnected ?? false }));
ipcMain.on('shell:open', (_, url) => shell.openExternal(url));
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.on('open:signin', () => openSignInWindow());
