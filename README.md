# SysMonitor

A real-time network monitoring dashboard for managing NetBird VPN connections across distributed sites. Built with React, TypeScript, and Electron.

![Version](https://img.shields.io/badge/version-1.2.0-blue)
![Electron](https://img.shields.io/badge/Electron-33.0.0-47848F)
![React](https://img.shields.io/badge/React-19.2.0-61DAFB)
![License](https://img.shields.io/badge/License-UNLICENSED-red)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Development](#development)
- [Building](#building)
- [Auto-Update System](#auto-update-system)
- [Publishing Releases](#publishing-releases)
- [Configuration](#configuration)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

---

## Overview

SysMonitor provides real-time visibility into site health, tunnel status, and connectivity metrics through a modern, cyberpunk-inspired interface. It is specifically designed for monitoring NetBird VPN infrastructure across geographically distributed locations.

**Key Use Cases:**
- IT Operations monitoring distributed network infrastructure
- Healthcare organizations monitoring clinics/hospitals across regions
- Remote work VPN connectivity tracking
- Service providers managing client site connectivity

---

## Features

### Core Features

| Feature | Description |
|---------|-------------|
| **Real-Time Site Monitoring** | Live NetBird peer connection status with visual indicators |
| **Regional Organization** | Sites grouped by geographic regions (Western One/Two, Lower River, etc.) |
| **Health Check & Probing** | On-demand HTTP/HTTPS and TCP port checks with latency metrics |
| **Historical Data** | 24-hour uptime tracking with visual history graphs |
| **Notifications** | Desktop and Telegram alerts for site status changes |
| **Site Provisioning** | Automated NetBird setup key generation with step-by-step wizard |

### Security Features

- **Access Code Protection**: Password required for adding/opening sites
- **Secure Storage**: OS-level encryption for API keys (DPAPI/Keychain)
- **Hidden IPs**: NetBird IP addresses never exposed in UI
- **Input Validation**: All access codes validated and sanitized
- **Real-time Access Control**: Firestore-backed access key with instant updates

### UI Features

- Dark-themed cyberpunk interface with phosphor green accents
- Responsive design for desktop and tablet
- Real-time sync status indicator
- Update notification system
- CRT-style visual effects

---

## Architecture

### Tech Stack

**Frontend:**
- React 19.2.0 with TypeScript
- TanStack Router for navigation
- TanStack Query (React Query) for server state
- Tailwind CSS with custom cyberpunk theme
- Vite for fast development

**Desktop:**
- Electron 33.0.0
- Node.js for TCP health checks and HTTP probing
- OS-level secure storage for API keys
- Context Bridge for secure IPC

**Cloud Services:**
- Firebase/Firestore for real-time data sync
- NetBird API for VPN peer management
- GitHub Releases for auto-updates

### Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Desktop   │────▶│  NetBird API │────▶│   Sites     │
│   (React)   │     │              │     │  Dashboard  │
└──────┬──────┘     └──────────────┘     └─────────────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│   Firestore │────▶│  Access Keys │
│   (Realtime)│     │  Uptime Data │
└─────────────┘     └──────────────┘
```

---

## Prerequisites

- **Node.js**: 18.x or higher
- **npm**: 9.x or higher
- **Windows**: Windows 10/11 (for desktop builds)
- **Git**: For version control

### Optional for Code Signing

- Self-signed certificate in `certs/sysmonitor-cert.pfx`
- Certificate password configured in `package.json`

---

## Development

### Installation

```bash
# Clone the repository
git clone https://github.com/mohictsupport/SysMonitor.git
cd SysMonitor

# Install dependencies
npm install
```

### Running in Development Mode

```bash
# Web-only development
npm run dev

# Desktop development (with Electron)
npm run desktop
```

### Environment Setup

Create a `.env` file in the project root:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# NetBird API (optional - can be configured in app)
VITE_NETBIRD_TOKEN=your_netbird_token
```

---

## Building

### Web Build

```bash
npm run build
```

Output: `dist/` folder with static files ready for deployment.

### Desktop Build

```bash
# Build without publishing (creates .exe files)
npm run electron:build
```

Output files in `dist-electron/`:
- `SysMonitor 1.1.0.exe` - Portable version
- `SysMonitor Setup 1.1.0.exe` - Installer version
- `win-unpacked/` - Unpacked app files

### Build Configuration

Key settings in `package.json`:

```json
{
  "build": {
    "appId": "com.sysmonitor.app",
    "productName": "SysMonitor",
    "directories": {
      "output": "dist-electron"
    },
    "win": {
      "target": ["portable", "nsis"],
      "signtoolOptions": {
        "certificateFile": "certs/sysmonitor-cert.pfx",
        "certificatePassword": "SysMonitor123!"
      }
    }
  }
}
```

---

## Auto-Update System

SysMonitor includes a complete auto-update system using `electron-updater` and GitHub Releases.

### How It Works

| Stage | What Happens | User Experience |
|-------|--------------|-----------------|
| **Startup** | App checks for updates silently | No interruption |
| **Available** | New version detected | Notification: "Update downloading..." |
| **Downloading** | Differential download in background | Progress shown if notification clicked |
| **Ready** | Update downloaded | Notification + TopNav badge: "Restart to Update" |
| **Install** | User clicks restart | App quits, installs update, relaunches |

### Technical Details

**Update Check Flow:**
```
App Start → Check GitHub Releases → Compare Version
    ↓
Newer? → Download Delta → Verify → Notify User
    ↓
User Restarts → Replace Current Version → Launch New Version
```

**Key Features:**
- **Silent Download**: Updates download in background without user interaction
- **Differential Updates**: Only changed files are downloaded (~5-20MB instead of full 100MB)
- **Install on Restart**: Update applies when user restarts the app
- **Periodic Checks**: Additional check every 30 minutes while app is running
- **Desktop Notifications**: System notifications for update states

### Configuration

Auto-updater is configured in `electron.cjs`:

```javascript
autoUpdater.autoDownload = true;        // Silent download
autoUpdater.autoInstallOnAppQuit = true; // Install on restart
```

---

## Publishing Releases

### Method 1: Automatic Publishing (Recommended)

Requires GitHub Personal Access Token with `repo` scope.

**Setup:**
1. Create token at `https://github.com/settings/tokens`
2. Set environment variable:
   ```powershell
   $env:GH_TOKEN="ghp_your_token_here"
   ```

**Publish Process:**
```bash
# 1. Update version in package.json
# 2. Commit changes
git add .
git commit -m "Release v1.1.0"
git push

# 3. Create and push tag
git tag v1.1.0
git push origin v1.1.0

# 4. Build and publish
$env:GH_TOKEN="your_token"
npm run electron:build
```

electron-builder will automatically:
- Create a GitHub Release for the tag
- Upload both .exe files
- Generate blockmap for differential updates

### Method 2: Manual Publishing

If you don't have a GH_TOKEN, upload files manually:

```bash
# Build locally (no publishing)
npm run electron:build
```

Then:
1. Go to `https://github.com/mohictsupport/SysMonitor/releases/new`
2. Select existing tag (e.g., `v1.1.0`)
3. Title: `v1.1.0`
4. Upload files from `dist-electron/`:
   - `SysMonitor 1.1.0.exe`
   - `SysMonitor Setup 1.1.0.exe`
5. Click **Publish release**

### Publishing Configuration

In `package.json`:

```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "mohictsupport",
      "repo": "SysMonitor",
      "releaseType": "release"
    }
  }
}
```

**Important:** Ensure the `owner` matches the repository owner for auto-publishing to work.

---

## Configuration

### Firestore Access Key

For access code protection, create a Firestore document:

**Path:** `access_key/main`
**Fields:**
- `password`: string (the access code)

**Firestore Rules:**
```javascript
match /access_key/{documentId} {
  allow read: if true;  // Public read for auth checks
  allow write: if false; // Only server/console
}
```

### NetBird API Integration

1. Get API token from NetBird dashboard
2. Enter in app Settings → API Configuration
3. Token is encrypted and stored using OS-level secure storage

### Telegram Notifications (Optional)

1. Create Telegram bot via @BotFather
2. Configure bot token in `electron.cjs`:
   ```javascript
   const TELEGRAM_BOT_TOKEN = 'your_bot_token';
   ```
3. Users subscribe via Settings → Notifications

### Sync Interval

Default sync intervals (configurable in code):
- NetBird peer sync: **60 seconds**
- Health checks: **60 seconds**
- Update checks: **30 minutes**

---

## Security

### Access Control

- Access code required for adding new sites
- Access code required for opening existing sites
- Real-time validation against Firestore
- Input sanitization and validation

### Data Protection

- API keys encrypted with OS-level encryption (DPAPI on Windows, Keychain on macOS)
- NetBird IP addresses never displayed in UI
- HTTPS for all external communications
- Certificate validation bypass only for private/NetBird IP ranges

### Build Security

- Code signing with self-signed certificate
- ASAR packaging for source protection
- Context isolation enabled
- Preload script for secure IPC

---

## Troubleshooting

### Build Issues

**Error: `certificateFile` not found**
- Create `certs/` directory
- Add certificate file or remove signing config from `package.json`

**Error: GitHub publish failed (403)**
- Check GH_TOKEN environment variable is set
- Verify token has `repo` scope
- Ensure you have write access to the repository

**Error: Files too large for GitHub**
- Do NOT commit `dist-electron/` to git
- Ensure `dist-electron/` is in `.gitignore`

### Runtime Issues

**App won't start after update**
- Delete `%APPDATA%/sysmonitor-updater/` folder
- Reinstall latest version manually

**Updates not downloading**
- Check internet connection
- Verify GitHub Release exists for current tag
- Check Console for auto-updater errors

**Sync not working**
- Verify NetBird API token is set
- Check Firestore rules allow reads
- Ensure network allows connections to api.netbird.io

### Development Issues

**Vite HMR not working in Electron**
- Ensure `NODE_ENV=development` when running desktop mode
- Check DevTools Console for errors

**TypeScript errors with electron-notifications**
- Restart TypeScript server in IDE
- Ensure `window.electronAPI` interface is up to date

---

## Support

For issues and feature requests:
- GitHub Issues: `https://github.com/mohictsupport/SysMonitor/issues`
- Email: matarrsama@gmail.com

---

## Changelog

### v1.1.0
- Added auto-update system with GitHub Releases
- Implemented silent download and install-on-restart
- Added update notification UI with progress indicators
- Sync interval increased to 60 seconds
- Fixed CSP issues for HTTP probing
- Updated Electron Builder signing configuration

### v1.0.0
- Initial release
- Real-time NetBird peer monitoring
- Access code protection system
- Health check and probing
- Telegram notifications
- Site provisioning wizard

---

<div align="center">

**Built with ❤️ by Ministry of Health (MOH)**

**SysMonitor** • Version 1.2.0 • © 2025-2026

All Rights Reserved.

</div>
