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

  createWindow()
})
