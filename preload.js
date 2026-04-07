const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (data) => ipcRenderer.invoke('save-file', data),
  saveImage: (data) => ipcRenderer.invoke('save-image', data),
  saveVideo: (data) => ipcRenderer.invoke('save-video', data),
  getPath: (name) => ipcRenderer.invoke('get-path', name),
  cameraError: (data) => ipcRenderer.invoke('camera-permission-error', data)
});
