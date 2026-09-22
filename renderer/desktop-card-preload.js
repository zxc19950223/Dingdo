const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopCardAPI', {
  getState: () => ipcRenderer.invoke('desktop-card:get-state'),
  toggleTask: () => ipcRenderer.invoke('desktop-card:toggle-task'),
  openTask: () => ipcRenderer.invoke('desktop-card:open-task'),
  closeCard: () => ipcRenderer.invoke('desktop-card:close'),
  updateTask: (patch) => ipcRenderer.invoke('desktop-card:update-task', patch),
  resizeContent: (height) => ipcRenderer.invoke('desktop-card:resize-content', height),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('desktop-card:set-always-on-top', enabled === true),
  onState: (callback) => {
    const listener = (event, state) => callback(state);
    ipcRenderer.on('desktop-card:state', listener);
    return () => ipcRenderer.removeListener('desktop-card:state', listener);
  },
});
