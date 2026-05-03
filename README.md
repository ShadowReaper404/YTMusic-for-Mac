# YT Music for Mac 🎵

A polished YouTube Music desktop client for macOS with **Discord Rich Presence** support — shows what you're listening to on your Discord profile.

![macOS](https://img.shields.io/badge/macOS-10.15+-black?logo=apple)
![Electron](https://img.shields.io/badge/Electron-29-47848F?logo=electron)

---

## Features

- 🎧 **Full YouTube Music experience** — native webview with persistent login
- 🎮 **Discord Rich Presence** — show current track on Discord (toggle on/off)
- 🔔 **System Tray** — media controls from the menu bar icon
- ⚙️ **Settings panel** — configure every RPC detail
- 🌙 **macOS native feel** — vibrancy, hidden titlebar, traffic lights

---

## Quick Start

### 1. Prerequisites

- **Node.js** v18+ — [nodejs.org](https://nodejs.org)
- **Discord desktop app** — must be running for RPC to work

### 2. Install

```bash
git clone https://github.com/ShadowReaper404/YTMusic-for-Mac.git
cd YTMusic-for-Mac
npm install
```

### 3. Run (development)

```bash
npm start
```

### 4. Build DMG for distribution

```bash
npm run build
# Output: dist/YT Music-1.0.0.dmg
```

---

## Discord Rich Presence Setup

> This step is **required** for Discord RPC to work.

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** — name it "YouTube Music" (or anything you want)
3. Copy the **Client ID** from the General Information page
4. In the app: open **Settings → Discord Rich Presence** and paste your Client ID
5. Under **Rich Presence → Art Assets**, upload these images with these exact names:
   - `ytmusic` — YouTube Music logo (shown as the large image)
   - `playing` — A play button icon (shown when playing)
   - `paused` — A pause icon (shown when paused)
6. Make sure Discord is running, then toggle Rich Presence **ON** in Settings

---

## Project Structure

```
ytmusic-mac/
├── src/
│   ├── main/
│   │   ├── index.js          # Main process (Electron entry)
│   │   └── discord-rpc.js    # Discord RPC manager
│   ├── preload/
│   │   └── index.js          # Secure IPC bridge
│   └── renderer/
│       ├── index.html        # App shell
│       ├── style.css         # Styles
│       └── app.js            # UI logic + track scraper
├── assets/                   # Icons (add tray-icon.png, icon.icns)
├── package.json
└── README.md
```

---

## Assets Needed

Add these to the `assets/` folder before building:

| File | Description |
|------|-------------|
| `tray-icon.png` | 16×16 or 22×22 template image for menu bar |
| `icon.icns` | macOS app icon (1024×1024 recommended) |

You can generate `.icns` from a PNG using:
```bash
# On macOS
mkdir icon.iconset
# ... add PNG sizes ...
iconutil -c icns icon.iconset
```

---

## Settings

| Setting | Description |
|---------|-------------|
| Discord Application ID | Your Discord Developer App Client ID |
| Show Song Title | Display track name on Discord profile |
| Show Artist | Display artist name |
| Show Timestamp | Show progress/countdown timer |
| Show Listen Button | Add a "Listen on YouTube Music" button |
| Status Text | Text shown when no track is playing |
| Minimize to Tray | Hide to menu bar instead of quitting |

---

## Tech Stack

- **Electron 29** — desktop app framework
- **discord-rpc** — Discord IPC client
- **electron-store** — persistent settings storage
- **electron-builder** — packaging & distribution

---

## License

MIT — unofficial project, not affiliated with YouTube or Discord.
