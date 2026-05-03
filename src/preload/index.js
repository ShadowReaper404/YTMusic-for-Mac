'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose safe API to renderer
contextBridge.exposeInMainWorld('ytmusic', {
  // ── Settings ──────────────────────────────────────────────────────────────
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  toggleRPC: () => ipcRenderer.invoke('settings:toggle-rpc'),

  // ── Discord ───────────────────────────────────────────────────────────────
  getDiscordStatus: () => ipcRenderer.invoke('discord:status'),

  // ── Track Updates (renderer → main) ──────────────────────────────────────
  updateTrack: (trackInfo) => ipcRenderer.send('track:update', trackInfo),

  // ── Shell ─────────────────────────────────────────────────────────────────
  openExternal: (url) => ipcRenderer.send('shell:open', url),

  // ── App Info ──────────────────────────────────────────────────────────────
  getVersion: () => ipcRenderer.invoke('app:version'),
  openSignIn: () => ipcRenderer.send('open:signin'),

  // ── Listeners (main → renderer) ───────────────────────────────────────────
  on: (channel, fn) => {
    const allowed = [
      'control:toggle', 'control:prev', 'control:next',
      'nav:settings', 'settings:rpc-changed', 'auth:reload-webview',
    ];
    if (allowed.includes(channel)) {
      const wrapped = (_, ...args) => fn(...args);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.removeListener(channel, wrapped);
    }
  },
  off: (channel, fn) => ipcRenderer.removeAllListeners(channel),
});
