const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  
  // Settings
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  
  // API Key storage
  saveApiKey: (apiKey) => ipcRenderer.invoke('save-api-key', apiKey),
  loadApiKey: () => ipcRenderer.invoke('load-api-key'),
  deleteApiKey: () => ipcRenderer.invoke('delete-api-key'),
  hasApiKey: () => ipcRenderer.invoke('has-api-key'),
  
  // Telegram
  getTelegramBotInfo: () => ipcRenderer.invoke('get-telegram-bot-info'),
  sendTelegramMessage: (chatId, message) => ipcRenderer.invoke('send-telegram-message', chatId, message),
  checkTelegramUpdates: (token) => ipcRenderer.invoke('check-telegram-updates', token),
  
  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // Notifications
  showNotification: (options) => ipcRenderer.invoke('show-notification', options),
  checkNotificationPermission: () => ipcRenderer.invoke('check-notification-permission'),
  getNotificationHistory: () => ipcRenderer.invoke('get-notification-history'),
  clearNotificationHistory: () => ipcRenderer.invoke('clear-notification-history'),
  onNotificationClick: (callback) => ipcRenderer.on('notification-click', (event, data) => callback(data)),
  onNotificationAction: (callback) => ipcRenderer.on('notification-action', (event, action, data) => callback(action, data)),
  
  // Window
  focusWindow: () => ipcRenderer.invoke('focus-window'),

  // Health checks (TCP port checks run in main process)
  healthBatchCheck: (data) => ipcRenderer.invoke('health-batch-check', data),

  // HTTP probe (bypasses CSP via main process)
  httpProbe: (url) => ipcRenderer.invoke('http-probe', url),

  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, status) => callback(status)),

  // Navigation
  onNavigate: (callback) => ipcRenderer.on('navigate', (event, path) => callback(path)),
});
