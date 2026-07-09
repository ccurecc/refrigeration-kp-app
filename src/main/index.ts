import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { is } from '@electron-toolkit/utils'

interface SaveCalculationPayload {
  defaultName: string
  data: unknown
}

interface ExportProposalPdfPayload {
  defaultName: string
  html: string
}

interface FileResult {
  canceled: boolean
  filePath?: string
}

interface OpenFileResult extends FileResult {
  data?: unknown
}

interface SettingsResult {
  data: unknown | null
}

function withExtension(fileName: string, extension: string): string {
  return fileName.toLowerCase().endsWith(`.${extension}`) ? fileName : `${fileName}.${extension}`
}

function safeFileName(fileName: string): string {
  return fileName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
}

async function getTargetPath(options: {
  title: string
  defaultName: string
  extension: string
  filterName: string
}): Promise<FileResult> {
  if (process.env.FW_TEST_OUTPUT_DIR) {
    await mkdir(process.env.FW_TEST_OUTPUT_DIR, { recursive: true })
    return {
      canceled: false,
      filePath: join(process.env.FW_TEST_OUTPUT_DIR, withExtension(safeFileName(options.defaultName), options.extension))
    }
  }

  const result = await dialog.showSaveDialog({
    title: options.title,
    defaultPath: withExtension(options.defaultName, options.extension),
    filters: [{ name: options.filterName, extensions: [options.extension] }]
  })

  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  return { canceled: false, filePath: result.filePath }
}

async function getOpenPath(): Promise<FileResult> {
  if (process.env.FW_TEST_OPEN_FILE) {
    return { canceled: false, filePath: process.env.FW_TEST_OPEN_FILE }
  }

  const result = await dialog.showOpenDialog({
    title: 'Открыть расчет',
    properties: ['openFile'],
    filters: [{ name: 'Расчет КП', extensions: ['json'] }]
  })

  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true }
  }

  return { canceled: false, filePath: result.filePaths[0] }
}

function settingsFilePath(): string {
  const baseDir = process.env.FW_TEST_OUTPUT_DIR || app.getPath('userData')
  return join(baseDir, 'settings.json')
}

function createMainWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1160,
    minHeight: 720,
    title: 'FrozenWest КП',
    show: false,
    backgroundColor: '#f6f5f2',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  window.once('ready-to-show', () => {
    window.show()
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('calculation:save', async (_event, payload: SaveCalculationPayload): Promise<FileResult> => {
  const result = await getTargetPath({
    title: 'Сохранить расчет',
    defaultName: payload.defaultName || 'calculation',
    extension: 'json',
    filterName: 'Расчет КП'
  })

  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  await writeFile(result.filePath, JSON.stringify(payload.data, null, 2), 'utf8')

  return { canceled: false, filePath: result.filePath }
})

ipcMain.handle('calculation:open', async (): Promise<OpenFileResult> => {
  const result = await getOpenPath()

  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  const raw = await readFile(result.filePath, 'utf8')

  return { canceled: false, filePath: result.filePath, data: JSON.parse(raw) }
})

async function mkdtempProposalDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'fw-kp-'))
}

ipcMain.handle('proposal:export-pdf', async (_event, payload: ExportProposalPdfPayload): Promise<FileResult> => {
  const result = await getTargetPath({
    title: 'Сформировать PDF',
    defaultName: payload.defaultName || 'proposal',
    extension: 'pdf',
    filterName: 'PDF'
  })

  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  const pdfWindow = new BrowserWindow({
    width: 900,
    height: 1200,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Write the HTML to a temporary file and load it via loadFile. A data: URL
  // overflows Chromium's URL length limit once an embedded photo (base64) is
  // included, failing with ERR_INVALID_URL — a real file has no such limit.
  const tempHtmlPath = join(await mkdtempProposalDir(), 'proposal.html')

  try {
    await writeFile(tempHtmlPath, payload.html, 'utf8')
    await pdfWindow.loadFile(tempHtmlPath)
    await pdfWindow.webContents.executeJavaScript('document.fonts.ready.then(() => true)', true).catch(() => false)

    const pdf = await pdfWindow.webContents.printToPDF({
      pageSize: 'A4',
      preferCSSPageSize: true,
      printBackground: true
    })

    await writeFile(result.filePath, pdf)

    return { canceled: false, filePath: result.filePath }
  } finally {
    pdfWindow.destroy()
    await rm(dirname(tempHtmlPath), { recursive: true, force: true }).catch(() => undefined)
  }
})

ipcMain.handle('settings:load', async (): Promise<SettingsResult> => {
  try {
    const raw = await readFile(settingsFilePath(), 'utf8')
    return { data: JSON.parse(raw) }
  } catch {
    return { data: null }
  }
})

ipcMain.handle('settings:save', async (_event, payload: unknown): Promise<void> => {
  const filePath = settingsFilePath()
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
})

app.whenReady().then(() => {
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
