import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.setMenu(null);
  win.loadURL('http://localhost:4200/')
}

app.whenReady().then(() => {
  ipcMain.on('app:quit', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || event.senderFrame !== event.sender.mainFrame ||
        new URL(event.senderFrame.url).origin !== 'http://localhost:4200') {
      return
    }

    app.quit()
  })

  ipcMain.handle('project:select-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || event.senderFrame !== event.sender.mainFrame ||
        new URL(event.senderFrame.url).origin !== 'http://localhost:4200') {
      throw new Error('Folder selection is only available in the application window')
    }

    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Select project folder',
      buttonLabel: 'Select folder',
      properties: ['openDirectory']
    })

    return canceled ? null : filePaths[0] ?? null
  })

  ipcMain.handle('project:open-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || event.senderFrame !== event.sender.mainFrame ||
        new URL(event.senderFrame.url).origin !== 'http://localhost:4200') {
      throw new Error('Project selection is only available in the application window')
    }
    const result = await dialog.showOpenDialog(win, {
      title: 'Open project', properties: ['openFile'],
      filters: [{ name: 'GTFS Visualiser project', extensions: ['gtfsv'] }]
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  })

  ipcMain.handle('project:save-file', async (event, suggestedName: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || event.senderFrame !== event.sender.mainFrame ||
        new URL(event.senderFrame.url).origin !== 'http://localhost:4200' ||
        typeof suggestedName !== 'string') {
      throw new Error('Project selection is only available in the application window')
    }
    const result = await dialog.showSaveDialog(win, {
      title: 'Save project as', defaultPath: path.basename(suggestedName),
      filters: [{ name: 'GTFS Visualiser project', extensions: ['gtfsv'] }],
      properties: ['showOverwriteConfirmation']
    })
    if (result.canceled || !result.filePath) return null
    return result.filePath
  })

  createWindow()
})
