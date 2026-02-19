const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherAPI', {
    checkUpdate: () => ipcRenderer.invoke('check-update'),
    downloadGame: (url, version) => ipcRenderer.invoke('download-game', { url, version }),
    launchGame: () => ipcRenderer.invoke('launch-game'),
    
    // Listen for download progress from the backend and pass it to the UI
    onProgress: (callback) => ipcRenderer.on('download-progress', (event, value) => callback(value))
});