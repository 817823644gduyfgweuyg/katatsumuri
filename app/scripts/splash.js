const { ipcRenderer } = require('electron');

window.onload = async () => {
    const version = await ipcRenderer.invoke('getAppVersion');
    document.getElementById('versionText').innerText = `v${version}`;
};

ipcRenderer.on('status', (event, data) => {
    document.getElementById('statusText').innerText = data;
});