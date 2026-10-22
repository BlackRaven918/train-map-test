import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  quitApp: (): void => ipcRenderer.send('app:quit'),
  selectProjectFolder: (): Promise<string | null> => ipcRenderer.invoke('project:select-folder'),
  openProjectFile: (): Promise<string | null> => ipcRenderer.invoke('project:open-file'),
  saveProjectFile: (name: string): Promise<string | null> => ipcRenderer.invoke('project:save-file', name)
})
