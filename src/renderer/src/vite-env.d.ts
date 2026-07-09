/// <reference types="vite/client" />

interface FileOperationResult {
  canceled: boolean
  filePath?: string
}

interface OpenCalculationResult extends FileOperationResult {
  data?: unknown
}

interface LoadSettingsResult {
  data: unknown | null
}

interface Window {
  fwApp?: {
    platform: NodeJS.Platform
    versions: {
      chrome: string
      electron: string
      node: string
    }
    openCalculation: () => Promise<OpenCalculationResult>
    saveCalculation: (payload: { defaultName: string; data: unknown }) => Promise<FileOperationResult>
    exportProposalPdf: (payload: { defaultName: string; html: string }) => Promise<FileOperationResult>
    loadSettings: () => Promise<LoadSettingsResult>
    saveSettings: (payload: unknown) => Promise<void>
  }
}
