'use strict';

/**
 * Discord Rich Presence Manager for YT Music Mac
 * Uses discord-rpc package to communicate with Discord desktop app.
 *
 * Discord Application Setup:
 * 1. Go to https://discord.com/developers/applications
 * 2. Create a new application (name it "YouTube Music" or similar)
 * 3. Copy the Client ID and paste it in Settings → Discord → Application ID
 * 4. Under "Rich Presence → Art Assets", upload images named:
 *    - "ytmusic"   (YouTube Music logo, used as large image)
 *    - "playing"   (play button icon, used as small image)
 *    - "paused"    (pause icon, used as small image)
 */

let DiscordRPC;
try {
  DiscordRPC = require('discord-rpc');
} catch {
  // discord-rpc not installed yet; handled gracefully
  DiscordRPC = null;
}

class DiscordRPCManager {
  constructor(store) {
    this.store = store;
    this.client = null;
    this.isConnected = false;
    this._reconnectTimer = null;
    this._lastActivity = null;
    this._startTimestamp = null;
  }

  async connect() {
    if (!DiscordRPC) {
      console.warn('[Discord RPC] discord-rpc package not found. Run: npm install discord-rpc');
      return;
    }

    const appId = this.store.get('discordRPC.applicationId');
    if (!appId || appId === '1234567890123456789') {
      console.warn('[Discord RPC] No valid Application ID set. Configure in Settings.');
      return;
    }

    try {
      DiscordRPC.register(appId);
      this.client = new DiscordRPC.Client({ transport: 'ipc' });

      this.client.on('ready', () => {
        console.log('[Discord RPC] Connected as', this.client.user?.username);
        this.isConnected = true;
        if (this._lastActivity) {
          this.client.setActivity(this._lastActivity);
        }
      });

      this.client.on('disconnected', () => {
        console.log('[Discord RPC] Disconnected. Retrying in 15s...');
        this.isConnected = false;
        this._scheduleReconnect(appId);
      });

      await this.client.login({ clientId: appId });
    } catch (err) {
      console.error('[Discord RPC] Connection failed:', err.message);
      this.isConnected = false;
      this._scheduleReconnect(appId);
    }
  }

  _scheduleReconnect(appId) {
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => {
      if (!this.isConnected) this.connect();
    }, 15000);
  }

  /**
   * Update Discord activity based on current track info.
   * @param {Object} track - { title, artist, album, thumbnailUrl, isPlaying, duration, currentTime }
   */
  update(track) {
    if (!this.isConnected || !this.client) {
      this._lastActivity = this._buildActivity(track);
      return;
    }

    const activity = this._buildActivity(track);
    this._lastActivity = activity;

    try {
      console.log('[Discord RPC] Sending activity:', JSON.stringify(activity, null, 2));
      this.client.setActivity(activity);
    } catch (err) {
      console.error('[Discord RPC] setActivity failed:', err.message);
    }
  }

  _buildActivity(track) {
    const cfg = this.store.get('discordRPC');
    if (!track) {
      return {
        details: cfg.statusText || 'YouTube Music',
        state: 'Browsing...',
        largeImageKey: 'ytmusic',
        largeImageText: 'YouTube Music',
        instance: false,
      };
    }

    const activity = {};

    // Details line (song title)
    if (cfg.showSongTitle && track.title) {
      activity.details = track.title.length > 128
        ? track.title.substring(0, 125) + '...'
        : track.title;
    } else {
      activity.details = cfg.statusText || 'YouTube Music';
    }

    // State line (artist)
    if (cfg.showArtist && track.artist) {
      activity.state = `by ${track.artist}`;
    }

    // Timestamps
    if (cfg.showTimestamp && track.isPlaying && track.duration > 0) {
      const now = Date.now();
      const elapsed = (track.currentTime || 0) * 1000;
      activity.startTimestamp = Math.floor((now - elapsed) / 1000);
      activity.endTimestamp = Math.floor((now + (track.duration - (track.currentTime || 0)) * 1000) / 1000);
    }

    // Images
    // Discord now supports external HTTPS URLs directly in the image keys.
    // Instead of requiring the user to upload static assets to the Developer Portal,
    // we just pass the live album art thumbnail!
    // Note: YTM initially uses a data: URI for thumbnails, which crashes Discord RPC.
    if (track.thumbnailUrl && track.thumbnailUrl.startsWith('http')) {
      activity.largeImageKey = track.thumbnailUrl;
      activity.largeImageText = track.album || 'YouTube Music';
    } else {
      // Fallback public logo if no valid thumbnail is available
      activity.largeImageKey = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Youtube_Music_icon.svg/512px-Youtube_Music_icon.svg.png';
      activity.largeImageText = 'YouTube Music';
    }
    
    // We omit smallImageKey since it requires a public URL for play/pause, 
    // and the album art looks much cleaner on its own anyway.

    // (Omitted buttons because Discord IPC often silently rejects the entire
    // payload for standard users if buttons are included without proper auth)

    return activity;
  }

  clearActivity() {
    this._lastActivity = null;
    if (this.isConnected && this.client) {
      try {
        this.client.clearActivity();
      } catch {}
    }
  }

  destroy() {
    clearTimeout(this._reconnectTimer);
    if (this.client) {
      try {
        this.client.destroy();
      } catch {}
      this.client = null;
    }
    this.isConnected = false;
  }
}

module.exports = DiscordRPCManager;
