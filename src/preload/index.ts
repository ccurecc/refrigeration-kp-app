import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('fwApp', {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  },
  openCalculation: () => ipcRenderer.invoke('calculation:open'),
  saveCalculation: (payload: { defaultName: string; data: unknown }) =>
    ipcRenderer.invoke('calculation:save', payload),
  exportProposalPdf: (payload: { defaultName: string; html: string }) =>
    ipcRenderer.invoke('proposal:export-pdf', payload),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (payload: unknown) => ipcRenderer.invoke('settings:save', payload)
})
