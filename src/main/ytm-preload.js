'use strict';

const { ipcRenderer } = require('electron');

// Forward track updates that the injected scraper sends via postMessage
window.addEventListener('message', (e) => {
  if (e.data?.type === '__YTM_TRACK__') {
    ipcRenderer.send('track:update', e.data.payload);
  }
});
