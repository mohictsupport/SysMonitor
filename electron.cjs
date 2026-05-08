const { app, BrowserWindow, ipcMain, dialog, shell, Notification, Menu, powerSaveBlocker, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');

// Keep a global reference of the window object
let mainWindow;

// Power save blocker to prevent OS sleep during monitoring
let powerBlockerId = null;

// Config directory for storing settings
const CONFIG_DIR = path.join(os.homedir(), '.sysmonitor');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');
const API_KEY_FILE = path.join(CONFIG_DIR, 'netbird-api-key.txt');

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Read settings from file
function readSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to read settings:', e);
  }
  return {};
}

// Write settings to file
function writeSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    return { success: true };
  } catch (e) {
    console.error('Failed to write settings:', e);
    return { success: false, error: e.message };
  }
}

// Create the browser window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      backgroundThrottling: false, // Prevent sleeping when minimized
    },
    titleBarStyle: 'hiddenInset',
    show: false, // Don't show until ready
  });

  // Prevent background throttling - ensure timers and network keep running
  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.webContents.executeJavaScript(`
      // Disable background throttling for React Query and other timers
      document.addEventListener('visibilitychange', () => {
        // Override visibility state to always be visible for critical checks
        Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: false });
        Object.defineProperty(document, 'hidden', { value: false, writable: false });
      });
    `).catch(() => {});
  });

  // Load the app
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // Use hash-based routing for file:// protocol (required for SPA in Electron)
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'), {
      hash: '/'
    });
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // F12 to toggle DevTools (production builds)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && !input.control && !input.shift && !input.alt && !input.meta) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
    // Ctrl+Shift+I as alternative
    if (input.key === 'i' && input.control && input.shift && !input.alt && !input.meta) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Handle certificate errors - allow self-signed certs for NetBird IPs and internal sites
  const { session } = require('electron');

  // Use session-level certificate verification bypass for private IPs
  mainWindow.webContents.session.setCertificateVerifyProc((request, callback) => {
    const { hostname, certificate, validatedCertificate, isIssuedByKnownRoot } = request;

    // Allow NetBird IP range (100.64.0.0/10)
    const isNetBirdIP = /^100\.(6[4-9]|[7-9]\d|1\d\d|2[0-4]\d|25[0-5])\./.test(hostname);
    // Allow private IP ranges
    const isPrivateIP = /^((10\.)|(172\.(1[6-9]|2\d|3[01])\.)|(192\.168\.)|(127\.))/.test(hostname);
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    if (isNetBirdIP || isPrivateIP || isLocalhost) {
      console.log('[Certificate] Auto-accepted for:', hostname);
      callback(0); // 0 = success/trusted
    } else {
      // Use default verification for public sites
      callback(-3); // -3 = use Chromium's verification result
    }
  });

  // Fallback: also handle the certificate-error event
  mainWindow.webContents.on('certificate-error', (event, url, error, certificate, callback) => {
    const hostname = new URL(url).hostname;

    const isNetBirdIP = /^100\.(6[4-9]|[7-9]\d|1\d\d|2[0-4]\d|25[0-5])\./.test(hostname);
    const isPrivateIP = /^((10\.)|(172\.(1[6-9]|2\d|3[01])\.)|(192\.168\.)|(127\.))/.test(hostname);
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    if (isNetBirdIP || isPrivateIP || isLocalhost) {
      event.preventDefault();
      callback(true);
      console.log('[Certificate] Event-based accept for:', hostname);
    } else {
      callback(false);
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App ready
app.whenReady().then(() => {
  console.log('Electron app ready, creating window...');
  console.log('Is packaged:', app.isPackaged);

  // Remove default menu bar
  Menu.setApplicationMenu(null);

  // Prevent system sleep to keep monitoring active in background
  powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  console.log('Power save blocker started, ID:', powerBlockerId);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch(err => {
  console.error('Failed to initialize app:', err);
});

// Quit when all windows closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers
ipcMain.handle('is-electron', () => true);

// Settings API
ipcMain.handle('load-settings', async () => {
  return { success: true, settings: readSettings() };
});

ipcMain.handle('save-settings', async (event, settings) => {
  return writeSettings(settings);
});

// API Key storage with encryption using Electron safeStorage
ipcMain.handle('save-api-key', async (event, apiKey) => {
  try {
    // Encrypt the API key using OS-level encryption (DPAPI on Windows, Keychain on macOS)
    const encrypted = safeStorage.encryptString(apiKey);
    fs.writeFileSync(API_KEY_FILE, encrypted);
    return { success: true };
  } catch (e) {
    console.error('Failed to save API key:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('load-api-key', async () => {
  try {
    if (!fs.existsSync(API_KEY_FILE)) {
      return { success: true, apiKey: null };
    }
    
    const encrypted = fs.readFileSync(API_KEY_FILE);
    
    // Check if the file contains legacy plain text (not encrypted)
    // Legacy files are UTF-8 strings, encrypted are Buffers
    const isEncrypted = encrypted.length > 0 && encrypted[0] !== 0; // Simple heuristic
    
    if (!isEncrypted) {
      // Legacy plain text - migrate to encrypted
      const plainText = encrypted.toString('utf8');
      const reEncrypted = safeStorage.encryptString(plainText);
      fs.writeFileSync(API_KEY_FILE, reEncrypted);
      return { success: true, apiKey: plainText };
    }
    
    // Decrypt the API key
    const decrypted = safeStorage.decryptString(encrypted);
    return { success: true, apiKey: decrypted };
  } catch (e) {
    console.error('Failed to load API key:', e);
    // If decryption fails, try reading as plain text (fallback for migration)
    try {
      const plainText = fs.readFileSync(API_KEY_FILE, 'utf8');
      if (plainText && !plainText.includes('\u0000')) { // Not binary/encrypted
        // Re-encrypt and save
        const encrypted = safeStorage.encryptString(plainText);
        fs.writeFileSync(API_KEY_FILE, encrypted);
        return { success: true, apiKey: plainText };
      }
    } catch (fallbackError) {
      // Ignore fallback error
    }
    return { success: false, error: 'Failed to decrypt API key. Please re-enter your API key in Settings.' };
  }
});

ipcMain.handle('delete-api-key', async () => {
  try {
    if (fs.existsSync(API_KEY_FILE)) {
      fs.unlinkSync(API_KEY_FILE);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('has-api-key', async () => {
  try {
    const hasKey = fs.existsSync(API_KEY_FILE);
    return { success: true, hasKey };
  } catch (e) {
    return { success: false, hasKey: false };
  }
});

// Telegram bot info (embedded)
const TELEGRAM_BOT_TOKEN = '8705404334:AAET-2UTdr9FaOb3C-qrfrBYIf6OFoPnZ9I';
const TELEGRAM_BOT_USERNAME = 'mstech_sysmonitor_bot';

ipcMain.handle('get-telegram-bot-info', async () => {
  return {
    success: true,
    token: TELEGRAM_BOT_TOKEN,
    username: TELEGRAM_BOT_USERNAME
  };
});

// Helper function to make Telegram API requests
function telegramApiRequest(method, data = {}) {
  return new Promise((resolve, reject) => {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;
    const postData = JSON.stringify(data);

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          if (response.ok) {
            resolve(response);
          } else {
            reject(new Error(response.description || 'Telegram API error'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Check for Telegram updates
ipcMain.handle('check-telegram-updates', async (event, expectedToken) => {
  try {
    const settings = readSettings();
    
    // Check if the link token is still valid
    if (settings.telegramLinkToken !== expectedToken) {
      return { success: true, chatId: null };
    }
    
    if (settings.telegramLinkExpires && Date.now() > settings.telegramLinkExpires) {
      return { success: true, chatId: null };
    }

    // Get updates from Telegram
    const response = await telegramApiRequest('getUpdates', {
      offset: settings.telegramUpdateOffset || 0,
      timeout: 5
    });

    if (response.result && response.result.length > 0) {
      // Process updates
      for (const update of response.result) {
        // Update offset so we don't process the same update again
        settings.telegramUpdateOffset = update.update_id + 1;
        writeSettings(settings);

        // Check for /start command with the token
        if (update.message && update.message.text) {
          const text = update.message.text;
          const chatId = update.message.chat.id;
          const username = update.message.chat.username;

          // Check if the message contains the expected token
          if (text.includes(expectedToken)) {
            console.log('[Telegram] Found matching token from user:', username);
            return {
              success: true,
              chatId: chatId.toString(),
              username: username
            };
          }
        }
      }
    }

    return { success: true, chatId: null };
  } catch (error) {
    console.error('[Telegram] Error checking updates:', error);
    return { success: false, error: error.message, chatId: null };
  }
});

// Send Telegram message
ipcMain.handle('send-telegram-message', async (event, chatId, message) => {
  try {
    const response = await telegramApiRequest('sendMessage', {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    });

    return {
      success: true,
      messageId: response.result.message_id
    };
  } catch (error) {
    console.error('[Telegram] Error sending message:', error);
    return { success: false, error: error.message };
  }
});

// Open external link
ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
});

// Notifications
ipcMain.handle('show-notification', async (event, { title, body }) => {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: title || 'SysMonitor',
      body: body || '',
    });
    notification.show();
    return { success: true, id: Date.now().toString() };
  }
  return { success: false, error: 'Notifications not supported' };
});

ipcMain.handle('check-notification-permission', async () => {
  return Notification.isSupported() ? 'granted' : 'denied';
});

// In-memory notification history
const notificationHistory = [];

ipcMain.handle('get-notification-history', async () => {
  return notificationHistory;
});

ipcMain.handle('clear-notification-history', async () => {
  notificationHistory.length = 0;
  return { success: true };
});

// Window focus
ipcMain.handle('focus-window', async () => {
  if (mainWindow) {
    mainWindow.focus();
    mainWindow.show();
  }
  return { success: true };
});

// Batch health check (TCP port checks using Node.js net module)
ipcMain.handle('health-batch-check', async (event, data) => {
  const { sites, concurrency = 25, timeoutMs = 5000 } = data;
  const limit = pLimit(concurrency);

  let checked = 0;
  let skipped = 0;
  let passed = 0;
  let failed = 0;
  let totalLatency = 0;

  const results = await Promise.all(
    sites.map((site) =>
      limit(async () => {
        if (!site.netbirdConnected) {
          skipped++;
          return {
            id: site.id,
            hostname: site.hostname,
            ok: false,
            latencyMs: 0,
            detail: 'Skipped - NetBird peer offline',
            skipped: true,
          };
        }

        checked++;
        const result = await checkTcpPort(site.hostname, 443, timeoutMs);

        if (result.ok) passed++;
        else failed++;
        totalLatency += result.latencyMs;

        return {
          id: site.id,
          hostname: site.hostname,
          ok: result.ok,
          latencyMs: result.latencyMs,
          detail: result.detail,
          skipped: false,
        };
      })
    )
  );

  const avgLatencyMs = checked > 0 ? Math.round(totalLatency / checked) : 0;

  return {
    results,
    summary: {
      total: sites.length,
      checked,
      skipped,
      passed,
      failed,
      avgLatencyMs,
    },
  };
});

// TCP check helper (runs in main process with Node.js net module)
function checkTcpPort(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new (require('net').Socket)();

    const onError = (err) => {
      socket.destroy();
      resolve({
        ok: false,
        latencyMs: Date.now() - start,
        detail: err.message.includes('ECONNREFUSED')
          ? 'Connection refused'
          : err.message.slice(0, 100),
      });
    };

    const onTimeout = () => {
      socket.destroy();
      resolve({
        ok: false,
        latencyMs: timeoutMs,
        detail: `Timeout after ${timeoutMs}ms`,
      });
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.destroy();
      resolve({
        ok: true,
        latencyMs: Date.now() - start,
        detail: `TCP port ${port} open`,
      });
    });
    socket.once('error', onError);
    socket.once('timeout', onTimeout);

    socket.connect(port, host);
  });
}

// HTTP probe handler (makes requests from main process to bypass CSP)
ipcMain.handle('http-probe', async (event, url) => {
  const start = Date.now();
  try {
    let target = url.trim();
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);

    const res = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const ms = Date.now() - start;
    return {
      success: true,
      ok: res.ok,
      status: res.status,
      latencyMs: ms,
      detail: `${res.status} ${res.statusText} · ${ms}ms`,
    };
  } catch (err) {
    const ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : 'fetch failed';
    return {
      success: true,
      ok: false,
      status: null,
      latencyMs: ms,
      detail: msg.includes('aborted') ? 'Timeout after 8s' : msg.slice(0, 120),
    };
  }
});

// Concurrency limiter (simple implementation for main process)
function pLimit(concurrency) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (queue.length > 0 && active < concurrency) {
      active++;
      const { fn, resolve, reject } = queue.shift();
      fn().then(resolve, reject).finally(() => {
        active--;
        next();
      });
    }
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}
