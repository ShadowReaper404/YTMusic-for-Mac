'use strict';

// ─── Navigation ───────────────────────────────────────────────────────────────
const views = document.querySelectorAll('.view');
const navBtns = document.querySelectorAll('.nav-btn[data-view]');
let currentView = 'player';

function showView(name) {
  views.forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  navBtns.forEach(b => b.classList.toggle('active', b.dataset.view === name));
  currentView = name;
}

navBtns.forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

// From main process (tray menu, etc.)
window.ytmusic.on('nav:settings', () => showView('settings'));

// Sign In button → opens a clean BrowserWindow so Google allows it
document.getElementById('signInBtn')?.addEventListener('click', () => {
  window.ytmusic.openSignIn();
});

// After sign-in completes, reload the webview to pick up the new session
window.ytmusic.on('auth:reload-webview', () => {
  webview?.loadURL('https://music.youtube.com');
});

// ─── WebView + Track Scraping ─────────────────────────────────────────────────
const webview = document.getElementById('ytmWebview');
const loadingEl = document.getElementById('webviewLoading');

webview.addEventListener('dom-ready', () => {
  loadingEl.classList.add('hidden');
  startTrackScraper();
});

webview.addEventListener('did-start-loading', () => {
  loadingEl.classList.remove('hidden');
});

webview.addEventListener('did-stop-loading', () => {
  setTimeout(() => loadingEl.classList.add('hidden'), 500);
});

// Track polling state
let trackPollInterval = null;
let lastTitle = '';
let lastPlaying = null;
let lastThumbnail = '';

function startTrackScraper() {
  clearInterval(trackPollInterval);
  
  // The function to evaluate in the webview
  const getInfoCode = `
    (function() {
      try {
        const titleEl = document.querySelector('.title.ytmusic-player-bar') || document.querySelector('yt-formatted-string.title');
        const title = titleEl?.textContent?.trim() || '';
        if (!title) return null; // Don't send empty updates during song transitions

        const artistEl = document.querySelector('.subtitle .yt-formatted-string') || document.querySelector('yt-formatted-string.byline-text');
        const artist = artistEl?.textContent?.trim() || '';
        const imgEl = document.querySelector('#thumbnail img') || document.querySelector('img.ytmusic-player-bar');
        const thumbnailUrl = imgEl?.src || '';
        const albumEl = document.querySelectorAll('.subtitle .yt-formatted-string')?.[1];
        const album = albumEl?.textContent?.trim() || '';
        const playBtn = document.querySelector('.play-pause-button');
        const isPaused = playBtn?.getAttribute('aria-label')?.toLowerCase()?.includes('play') ?? true;
        const isPlaying = !isPaused && title.length > 0;
        const progressEl = document.querySelector('#progress-bar');
        const currentTime = progressEl ? parseFloat(progressEl.value) || 0 : 0;
        const duration = progressEl ? parseFloat(progressEl.max) || 0 : 0;
        const urlParams = new URLSearchParams(window.location.search);
        const videoId = urlParams.get('v') || '';
        return { title, artist, album, thumbnailUrl, isPlaying, currentTime, duration, videoId };
      } catch(e) { return null; }
    })();
  `;

  trackPollInterval = setInterval(async () => {
    try {
      const info = await webview.executeJavaScript(getInfoCode);
      if (!info) return;
      
      if (info.title !== lastTitle || info.isPlaying !== lastPlaying || info.thumbnailUrl !== lastThumbnail) {
        lastTitle = info.title;
        lastPlaying = info.isPlaying;
        lastThumbnail = info.thumbnailUrl;
        
        // Update local UI
        currentTrack = info;
        updatePreview(currentTrack);
        // Send to main process (Discord RPC)
        window.ytmusic.updateTrack(currentTrack);
      }
    } catch(e) { /* ignore errors during nav */ }
  }, 1500);
}

// Re-start scraper on navigation
webview.addEventListener('did-navigate-in-page', () => {
  setTimeout(startTrackScraper, 1000);
});
webview.addEventListener('did-navigate', () => {
  setTimeout(startTrackScraper, 2000);
});

// After Google sign-in completes in the auth popup, reload the webview
// so it picks up the fresh session cookies
window.ytmusic.on('auth:reload-webview', () => {
  webview.loadURL('https://music.youtube.com');
});

// ─── Controls from tray ───────────────────────────────────────────────────────
window.ytmusic.on('control:toggle', () => {
  webview.executeJavaScript(`
    document.querySelector('.play-pause-button')?.click();
  `);
});
window.ytmusic.on('control:next', () => {
  webview.executeJavaScript(`
    document.querySelector('.next-button')?.click() ||
    document.querySelector('[aria-label="Next"]')?.click();
  `);
});
window.ytmusic.on('control:prev', () => {
  webview.executeJavaScript(`
    document.querySelector('.previous-button')?.click() ||
    document.querySelector('[aria-label="Previous"]')?.click();
  `);
});

// ─── Settings UI ──────────────────────────────────────────────────────────────
let settings = {};

async function loadSettings() {
  settings = await window.ytmusic.getSettings();
  applySettings();
}

function applySettings() {
  const rpc = settings.discordRPC || {};
  const beh = settings.behavior || {};
  const app = settings.appearance || {};

  // Discord RPC
  setCheckbox('rpcEnabled', rpc.enabled);
  setInput('appId', rpc.applicationId !== '1234567890123456789' ? rpc.applicationId : '');
  setCheckbox('showTitle', rpc.showSongTitle);
  setCheckbox('showArtist', rpc.showArtist);
  setCheckbox('showTimestamp', rpc.showTimestamp);
  setCheckbox('showButtons', rpc.showPlaybackButtons);
  setInput('statusText', rpc.statusText);
  updateRpcOptionsState(rpc.enabled);

  // Behavior
  setCheckbox('startMinimized', beh.startMinimized);
  setCheckbox('minimizeToTray', beh.minimizeToTray);
  setCheckbox('hardwareAccel', beh.hardwareAcceleration);

  // Appearance
  const themeSelect = document.getElementById('themeSelect');
  if (themeSelect) themeSelect.value = app.theme || 'system';

  // Version
  window.ytmusic.getVersion().then(v => {
    const el = document.getElementById('appVersion');
    if (el) el.textContent = `v${v}`;
  });
}

function setCheckbox(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = !!value;
}
function setInput(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value || '';
}

function updateRpcOptionsState(enabled) {
  const opts = document.getElementById('rpcOptions');
  if (opts) opts.classList.toggle('disabled', !enabled);
}

// Main RPC toggle (settings page)
document.getElementById('rpcEnabled')?.addEventListener('change', async (e) => {
  updateRpcOptionsState(e.target.checked);
  await window.ytmusic.toggleRPC();
});

// Sidebar quick toggle
const rpcToggleBtn = document.getElementById('rpcToggle');
rpcToggleBtn?.addEventListener('click', async () => {
  const enabled = await window.ytmusic.toggleRPC();
  rpcToggleBtn.classList.toggle('on', enabled);
  document.getElementById('rpcEnabled').checked = enabled;
  updateRpcOptionsState(enabled);
  updateDiscordStatusUI(enabled ? 'connecting' : 'off');
});

// Save on input change (debounced)
let saveTimer = null;
function debouncedSave(key, value) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.ytmusic.setSetting(key, value).then(s => settings = s);
  }, 500);
}

document.getElementById('appId')?.addEventListener('input', e => {
  debouncedSave('discordRPC.applicationId', e.target.value || '1234567890123456789');
});
document.getElementById('showTitle')?.addEventListener('change', e => {
  debouncedSave('discordRPC.showSongTitle', e.target.checked);
});
document.getElementById('showArtist')?.addEventListener('change', e => {
  debouncedSave('discordRPC.showArtist', e.target.checked);
});
document.getElementById('showTimestamp')?.addEventListener('change', e => {
  debouncedSave('discordRPC.showTimestamp', e.target.checked);
});
document.getElementById('showButtons')?.addEventListener('change', e => {
  debouncedSave('discordRPC.showPlaybackButtons', e.target.checked);
});
document.getElementById('statusText')?.addEventListener('input', e => {
  debouncedSave('discordRPC.statusText', e.target.value);
  updatePreview(null);
});
document.getElementById('startMinimized')?.addEventListener('change', e => {
  window.ytmusic.setSetting('behavior.startMinimized', e.target.checked);
});
document.getElementById('minimizeToTray')?.addEventListener('change', e => {
  window.ytmusic.setSetting('behavior.minimizeToTray', e.target.checked);
});
document.getElementById('hardwareAccel')?.addEventListener('change', e => {
  window.ytmusic.setSetting('behavior.hardwareAcceleration', e.target.checked);
});
document.getElementById('themeSelect')?.addEventListener('change', e => {
  window.ytmusic.setSetting('appearance.theme', e.target.value);
});

// ─── Discord Status Indicator ─────────────────────────────────────────────────
async function updateDiscordStatusUI(force) {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText2') || document.getElementById('statusText');
  const btn = document.getElementById('rpcToggle');

  const status = force ? { enabled: force !== 'off', connected: force === 'connected' }
                       : await window.ytmusic.getDiscordStatus();

  if (!status.enabled) {
    dot?.classList.remove('connected', 'error');
    if (text) text.textContent = 'Disabled';
    btn?.classList.remove('on');
  } else if (status.connected) {
    dot?.classList.add('connected');
    dot?.classList.remove('error');
    if (text) text.textContent = 'Connected';
    btn?.classList.add('on');
  } else {
    dot?.classList.remove('connected');
    if (text) text.textContent = 'Disconnected';
    btn?.classList.add('on');
  }
}

// Sync RPC toggle change from main process
window.ytmusic.on('settings:rpc-changed', (enabled) => {
  const btn = document.getElementById('rpcToggle');
  const checkbox = document.getElementById('rpcEnabled');
  btn?.classList.toggle('on', enabled);
  if (checkbox) checkbox.checked = enabled;
  updateRpcOptionsState(enabled);
  updateDiscordStatusUI(enabled ? 'connecting' : 'off');
});

// ─── Discord Preview ──────────────────────────────────────────────────────────
let currentTrack = null;

function updatePreview(track) {
  const t = track || currentTrack;
  const statusInput = document.getElementById('statusText');

  const titleEl = document.getElementById('previewTitle');
  const artistEl = document.getElementById('previewArtist');
  const timeEl = document.getElementById('previewTime');

  if (titleEl) titleEl.textContent = t?.title || (statusInput?.value || 'YouTube Music');
  if (artistEl) {
    artistEl.style.display = t?.artist ? 'block' : 'none';
    artistEl.textContent = t?.artist ? `by ${t.artist}` : '';
  }
  if (timeEl && t?.duration > 0) {
    const remaining = Math.max(0, t.duration - (t.currentTime || 0));
    const m = Math.floor(remaining / 60);
    const s = Math.floor(remaining % 60).toString().padStart(2, '0');
    timeEl.textContent = `${m}:${s} remaining`;
  }
}

// Also update preview when webview sends track info
// We listen indirectly via a custom event
window.addEventListener('message', (e) => {
  if (e.data?.type === 'YTM_TRACK_UPDATE') {
    currentTrack = e.data.payload;
    updatePreview(currentTrack);
    window.ytmusic.updateTrack(currentTrack);
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
loadSettings();
setTimeout(updateDiscordStatusUI, 1000);
setInterval(updateDiscordStatusUI, 10000);
