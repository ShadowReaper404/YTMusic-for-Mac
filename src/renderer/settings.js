'use strict';

let settings = {};

async function loadSettings() {
  settings = await window.ytmusic.getSettings();
  applySettings();
}

function applySettings() {
  const rpc = settings.discordRPC || {};
  const beh = settings.behavior || {};

  setCheckbox('rpcEnabled', rpc.enabled);
  setInput('appId', rpc.applicationId !== '1234567890123456789' ? rpc.applicationId : '');
  setCheckbox('showTitle', rpc.showSongTitle);
  setCheckbox('showArtist', rpc.showArtist);
  setCheckbox('showTimestamp', rpc.showTimestamp);
  setCheckbox('showButtons', rpc.showPlaybackButtons);
  setInput('statusText', rpc.statusText);
  updateRpcOptionsState(rpc.enabled);

  setCheckbox('startMinimized', beh.startMinimized);
  setCheckbox('minimizeToTray', beh.minimizeToTray);

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

document.getElementById('rpcEnabled')?.addEventListener('change', async (e) => {
  updateRpcOptionsState(e.target.checked);
  await window.ytmusic.toggleRPC();
});

let saveTimer = null;
function debouncedSave(key, value) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.ytmusic.setSetting(key, value).then(s => settings = s);
  }, 500);
}

document.getElementById('appId')?.addEventListener('input', e => debouncedSave('discordRPC.applicationId', e.target.value || '1234567890123456789'));
document.getElementById('showTitle')?.addEventListener('change', e => debouncedSave('discordRPC.showSongTitle', e.target.checked));
document.getElementById('showArtist')?.addEventListener('change', e => debouncedSave('discordRPC.showArtist', e.target.checked));
document.getElementById('showTimestamp')?.addEventListener('change', e => debouncedSave('discordRPC.showTimestamp', e.target.checked));
document.getElementById('showButtons')?.addEventListener('change', e => debouncedSave('discordRPC.showPlaybackButtons', e.target.checked));
document.getElementById('statusText')?.addEventListener('input', e => debouncedSave('discordRPC.statusText', e.target.value));
document.getElementById('startMinimized')?.addEventListener('change', e => window.ytmusic.setSetting('behavior.startMinimized', e.target.checked));
document.getElementById('minimizeToTray')?.addEventListener('change', e => window.ytmusic.setSetting('behavior.minimizeToTray', e.target.checked));

loadSettings();
