const { contextBridge, ipcRenderer } = require('electron')
const {NewConnectParams} = require("./model");

contextBridge.exposeInMainWorld('electronAPI', {
  connectSsh: (params) => ipcRenderer.invoke('app.ssh.connect', params),
  disconnectSsh: (params) => ipcRenderer.invoke('app.ssh.disconnect', params),
  addTunnel: (params) => ipcRenderer.invoke('app.add-tunnel', params),
  appListenStart: (port, items) => ipcRenderer.invoke('app.listen.start', port, items),
  appListenStop: () => ipcRenderer.send('app.listen.stop'),
})

ipcRenderer.on('app.event', (event, type, data) => window.appHandler(type, data));
