const { ipcRenderer } = require('electron');

// ESCキーの有効化
ipcRenderer.on('ESC', () => {
    document.exitPointerLock();
});