import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { Copy, FolderOpen, ImagePlus, Move, Plus, Printer, Save, Settings, Snowflake, Trash2, Wand2, X } from 'lucide-react'
import {
  calculateProposal,
  createChamber,
  createEquipmentOnlyItem,
  defaultChamberInput,
  defaultEquipmentOnlyItem,
  defaultProposalOptions,
  getChamberTitle,
  getEquipmentOnlyTitle,
  PanelFilling,
  PanelThickness,
  ChamberInput,
  Chamber3DSettings,
  CameraView,
  DimensionCorner,
  DoorWall,
  EquipmentOnlyItem,
  EstimateExtraRow,
  ProposalOptions,
  ProposalSubject,
  defaultChamber3DSettings
} from './domain/calculator'
import {
  DOOR_INSTALLATION_NOTE,
  buildProposalHtml,
  buildVisualsPdfHtml,
  type ProposalPdfChamber,
  type ProposalPdfEquipmentItem
} from './domain/proposal'
import { buildOptimizationReport } from './domain/optimizer'
import {
  CompanySettings,
  CatalogSettings,
  CustomerData,
  ProposalSettings,
  defaultAppSettings,
  defaultCatalogSettings,
  defaultCompanySettings,
  defaultCustomerData,
  defaultProposalSettings
} from './domain/proposalData'
import { Chamber3DSettingsEditor, Chamber3DView, renderChamber3DToDataUrl } from './components/Chamber3DView'
import { TopView } from './components/TopView'
import { SettingsModal } from './components/SettingsModal'
import { NumberField } from './components/NumberField'
import { DoorPositionEditor } from './components/DoorPositionEditor'
import { normalizeDoorPlacement } from './domain/chamberGeometry'
import './styles/app.css'

const thicknessOptions: PanelThickness[] = [50, 60, 80, 100, 120]
const fillingOptions: Array<{ value: PanelFilling; label: string }> = [
  { value: 'PIR', label: 'PIR' },
  { value: 'PUR', label: 'PUR' },
  { value: 'PPS', label: 'ППС' },
  { value: 'custom', label: 'Другой' }
]
const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  style: 'currency',
  currency: 'RUB'
})
const numberFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
const PROPOSAL_PDF_3D_CAMERA_DISTANCE_FACTOR = 1.06
const EQUIPMENT_IMAGE_SIZE_MIN = 50
const EQUIPMENT_IMAGE_SIZE_MAX = 500
const EQUIPMENT_IMAGE_SIZE_STEP = 5

const formatMoney = (value: number): string => moneyFormatter.format(value)
const formatNumber = (value: number): string => numberFormatter.format(value)

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `row-${Date.now()}-${Math.round(Math.random() * 1e6)}`
}

const STALE_LEGAL_NAMES = new Set(['Название компании', ''])

function migrateCompany(
  saved: (Partial<CompanySettings> & { brandName?: string }) | undefined
): Partial<CompanySettings> {
  if (!saved) {
    return {}
  }
  const next = { ...saved }
  delete next.brandName
  if (next.legalName !== undefined && STALE_LEGAL_NAMES.has(next.legalName.trim())) {
    next.legalName = defaultCompanySettings.legalName
  }
  return next
}

interface SavedCalculation {
  version: number
  savedAt: string
  proposal: ProposalSettings
  company: CompanySettings
  customer: CustomerData
  catalog?: CatalogSettings
  chambers?: ChamberInput[]
  equipmentOnlyItems?: EquipmentOnlyItem[]
  options?: ProposalOptions
  equipmentImages?: Record<string, string>
  // legacy single-chamber format
  input?: Partial<ChamberInput> & {
    proposalMode?: ProposalOptions['proposalMode']
    vatEnabled?: boolean
    vatRatePercent?: number
    extraEstimateRows?: EstimateExtraRow[]
  }
  equipmentImageDataUrl?: string
}

function numberInput(value: number, onChange: (value: number) => void, min = 0): JSX.Element {
  return <NumberField value={value} onChange={onChange} min={min} />
}

function defaultFileName(
  chambers: ChamberInput[],
  equipmentOnlyItems: EquipmentOnlyItem[],
  proposal: ProposalSettings,
  proposalSubject: ProposalSubject
): string {
  const prefix = proposal.number.trim() || 'КП'
  if (proposalSubject === 'equipment-only') {
    const first = equipmentOnlyItems[0]
    const itemLabel = first ? getEquipmentOnlyTitle(first).replace(/\s+/g, '_') : 'оборудование'
    const suffix = equipmentOnlyItems.length > 1 ? `_и_ещё_${equipmentOnlyItems.length - 1}` : ''
    return `${prefix}_${itemLabel}${suffix}`
  }
  const first = chambers[0]
  const size = first ? `${first.lengthMm}x${first.widthMm}x${first.heightMm}` : ''
  const suffix = chambers.length > 1 ? `_и_ещё_${chambers.length - 1}` : ''
  return `${prefix}_${size}${suffix}`
}

type RestorableChamber = Partial<ChamberInput> & {
  dimensionCorner?: DimensionCorner
  view3d?: Partial<Chamber3DSettings>
}

function normalizeChamberDoor(chamber: ChamberInput): ChamberInput {
  const placement = normalizeDoorPlacement(chamber)
  return {
    ...chamber,
    doorWidthMm: placement.widthMm,
    doorWall: placement.wall,
    doorOffsetMm: placement.offsetMm
  }
}

function restoreCameraView(value: string | undefined): CameraView {
  if (
    value === 'front-left' ||
    value === 'front-right' ||
    value === 'right-left' ||
    value === 'right-right' ||
    value === 'back-left' ||
    value === 'back-right' ||
    value === 'left-left' ||
    value === 'left-right'
  ) {
    return value
  }
  if (value === 'left-front') return 'front-left'
  if (value === 'left-side') return 'left-right'
  if (value === 'right-side') return 'right-left'
  return 'front-right'
}

function restorePercent(value: number | undefined, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(Math.round(value), min), max) : 100
}

function restoreChamber(chamber: RestorableChamber, createNewId = false): ChamberInput {
  const { dimensionCorner: legacyCorner, ...currentChamber } = chamber
  const legacyView3d = legacyCorner
    ? {
        frontDimensionSide: legacyCorner.startsWith('back-') ? ('back' as const) : ('front' as const),
        depthDimensionSide: legacyCorner.endsWith('-left') ? ('left' as const) : ('right' as const),
        heightDimensionCorner: legacyCorner
      }
    : {}
  const restored = {
    ...defaultChamberInput,
    ...currentChamber,
      view3d: {
        ...defaultChamber3DSettings,
        ...legacyView3d,
        ...currentChamber.view3d,
        cameraView: restoreCameraView(currentChamber.view3d?.cameraView),
        cameraDistancePercent: restorePercent(currentChamber.view3d?.cameraDistancePercent, 5, 180),
        dimensionLabelSizePercent: restorePercent(currentChamber.view3d?.dimensionLabelSizePercent, 50, 200),
        cutLabelSizePercent: restorePercent(currentChamber.view3d?.cutLabelSizePercent, 50, 200),
        frontDimensionVisible: currentChamber.view3d?.frontDimensionVisible ?? true,
        depthDimensionVisible: currentChamber.view3d?.depthDimensionVisible ?? true,
        heightDimensionVisible: currentChamber.view3d?.heightDimensionVisible ?? true,
        floorCutLabelDistancePercent: restorePercent(currentChamber.view3d?.floorCutLabelDistancePercent, 5, 200),
        floorCutDimensionVisible: currentChamber.view3d?.floorCutDimensionVisible ?? true,
        doorWidthDimensionVisible: currentChamber.view3d?.doorWidthDimensionVisible ?? true,
        doorHeightDimensionVisible: currentChamber.view3d?.doorHeightDimensionVisible ?? true
      }
  }
  restored.equipmentImageSizePercent = restorePercent(
    currentChamber.equipmentImageSizePercent,
    EQUIPMENT_IMAGE_SIZE_MIN,
    EQUIPMENT_IMAGE_SIZE_MAX
  )
  restored.manualWallPanelCount = restoreOptionalPanelCount(currentChamber.manualWallPanelCount)
  restored.manualCeilingPanelCount = restoreOptionalPanelCount(currentChamber.manualCeilingPanelCount)
  restored.manualFloorPanelCount = restoreOptionalPanelCount(currentChamber.manualFloorPanelCount)
  restored.panelCutKerfMm = restoreNonNegativeNumber(currentChamber.panelCutKerfMm, 0)

  return normalizeChamberDoor(createNewId ? createChamber(restored) : restored)
}

function restoreNonNegativeNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback
}

function restoreOptionalPanelCount(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.max(1, Math.round(value)) : null
}

function restoreEquipmentOnlyItem(item: Partial<EquipmentOnlyItem>): EquipmentOnlyItem {
  return {
    ...defaultEquipmentOnlyItem,
    ...item,
    imageSizePercent: restorePercent(item.imageSizePercent, EQUIPMENT_IMAGE_SIZE_MIN, EQUIPMENT_IMAGE_SIZE_MAX)
  }
}

export function App(): JSX.Element {
  const [chambers, setChambers] = useState<ChamberInput[]>([defaultChamberInput])
  const [activeId, setActiveId] = useState<string>(defaultChamberInput.id)
  const [equipmentOnlyItems, setEquipmentOnlyItems] = useState<EquipmentOnlyItem[]>([defaultEquipmentOnlyItem])
  const [activeEquipmentOnlyId, setActiveEquipmentOnlyId] = useState<string>(defaultEquipmentOnlyItem.id)
  const [options, setOptions] = useState<ProposalOptions>(defaultProposalOptions)
  const [company, setCompany] = useState<CompanySettings>(defaultCompanySettings)
  const [catalog, setCatalog] = useState<CatalogSettings>(defaultCatalogSettings)
  const [customer, setCustomer] = useState<CustomerData>(defaultCustomerData)
  const [proposal, setProposal] = useState<ProposalSettings>(defaultProposalSettings)
  const [equipmentImages, setEquipmentImages] = useState<Record<string, string>>({})
  const [statusMessage, setStatusMessage] = useState('Готово к расчёту')
  const [isBusy, setIsBusy] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [doorEditorOpen, setDoorEditorOpen] = useState(false)
  const [view3dSettingsOpen, setView3dSettingsOpen] = useState(false)

  const isEquipmentOnlyProposal = options.proposalSubject === 'equipment-only'
  const activeChamber = chambers.find((chamber) => chamber.id === activeId) ?? chambers[0]
  const activeEquipmentOnlyItem =
    equipmentOnlyItems.find((item) => item.id === activeEquipmentOnlyId) ?? equipmentOnlyItems[0]
  const proposalResult = useMemo(
    () => calculateProposal(chambers, catalog, options, equipmentOnlyItems),
    [chambers, catalog, equipmentOnlyItems, options]
  )
  const activeComputed = isEquipmentOnlyProposal
    ? undefined
    : proposalResult.chambers.find((chamber) => chamber.input.id === activeChamber.id) ?? proposalResult.chambers[0]
  const activeEquipmentComputed = isEquipmentOnlyProposal
    ? proposalResult.equipmentItems.find((item) => item.input.id === activeEquipmentOnlyItem.id) ?? proposalResult.equipmentItems[0]
    : undefined
  const activeResult = activeComputed?.result
  const optimization = useMemo(
    () => buildOptimizationReport(activeChamber.lengthMm, activeChamber.widthMm, activeChamber.thicknessMm),
    [activeChamber.lengthMm, activeChamber.widthMm, activeChamber.thicknessMm]
  )
  const activeRows = isEquipmentOnlyProposal
    ? activeEquipmentComputed?.rows ?? []
    : options.proposalMode === 'compact'
      ? activeResult?.compactRows ?? []
      : activeResult?.materialRows ?? []
  const activeWallGroup = activeResult?.panelGroups.find((group) => group.kind === 'wall')
  const activeCeilingGroup = activeResult?.panelGroups.find((group) => group.kind === 'ceiling')
  const activeFloorGroup = activeResult?.panelGroups.find((group) => group.kind === 'floor')
  const wallPanelSaving = activeResult?.wallPanelOptimization.savingAgainstIndependentCount ?? 0
  const activeChamberEquipmentImage = equipmentImages[activeChamber.id]
  const activeEquipmentOnlyImage = equipmentImages[activeEquipmentOnlyItem.id]

  const updateActive = <K extends keyof ChamberInput>(key: K, value: ChamberInput[K]): void => {
    setChambers((current) =>
      current.map((chamber) =>
        chamber.id === activeId ? normalizeChamberDoor({ ...chamber, [key]: value }) : chamber
      )
    )
  }

  const updatePanelOverride = (
    key: 'manualWallPanelCount' | 'manualCeilingPanelCount' | 'manualFloorPanelCount',
    value: number
  ): void => {
    updateActive(key, Math.max(1, Math.round(value)))
  }

  const resetPanelOverrides = (): void => {
    setChambers((current) =>
      current.map((chamber) =>
        chamber.id === activeId
          ? {
              ...chamber,
              manualWallPanelCount: null,
              manualCeilingPanelCount: null,
              manualFloorPanelCount: null
            }
          : chamber
      )
    )
    setStatusMessage('Количество панелей возвращено к автоматическому расчёту')
  }

  const updateActiveEquipmentOnly = <K extends keyof EquipmentOnlyItem>(key: K, value: EquipmentOnlyItem[K]): void => {
    setEquipmentOnlyItems((current) =>
      current.map((item) => (item.id === activeEquipmentOnlyId ? { ...item, [key]: value } : item))
    )
  }

  const updateOptions = <K extends keyof ProposalOptions>(key: K, value: ProposalOptions[K]): void => {
    setOptions((current) => ({ ...current, [key]: value }))
  }

  const updateProposalSubject = (proposalSubject: ProposalSubject): void => {
    setOptions((current) => ({ ...current, proposalSubject }))
    setStatusMessage(
      proposalSubject === 'equipment-only'
        ? 'Режим КП: только холодильное оборудование'
        : 'Режим КП: холодильная камера + оборудование'
    )
    if (proposalSubject === 'equipment-only' && equipmentOnlyItems.length === 0) {
      const fresh = createEquipmentOnlyItem()
      setEquipmentOnlyItems([fresh])
      setActiveEquipmentOnlyId(fresh.id)
    }
    if (proposalSubject === 'chambers' && chambers.length === 0) {
      const fresh = createChamber()
      setChambers([fresh])
      setActiveId(fresh.id)
    }
  }

  const updateCompany = <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]): void => {
    setCompany((current) => ({ ...current, [key]: value }))
  }

  const updateCatalog = <K extends keyof CatalogSettings>(key: K, value: CatalogSettings[K]): void => {
    setCatalog((current) => ({ ...current, [key]: value }))
  }

  const updateCustomer = <K extends keyof CustomerData>(key: K, value: CustomerData[K]): void => {
    setCustomer((current) => ({ ...current, [key]: value }))
  }

  const updateProposal = <K extends keyof ProposalSettings>(key: K, value: ProposalSettings[K]): void => {
    setProposal((current) => ({ ...current, [key]: value }))
  }

  const addChamber = (): void => {
    const fresh = createChamber()
    setChambers((current) => [...current, fresh])
    setActiveId(fresh.id)
    setStatusMessage('Добавлена новая холодильная камера')
  }

  const duplicateChamber = (id: string): void => {
    const source = chambers.find((chamber) => chamber.id === id)
    if (!source) {
      return
    }
    const copy = createChamber({ ...source, title: source.title ? `${source.title} (копия)` : '' })
    setChambers((current) => {
      const index = current.findIndex((chamber) => chamber.id === id)
      const next = [...current]
      next.splice(index + 1, 0, copy)
      return next
    })
    setActiveId(copy.id)
  }

  const removeChamber = (id: string): void => {
    setChambers((current) => {
      if (current.length === 1) {
        return current
      }
      const next = current.filter((chamber) => chamber.id !== id)
      if (id === activeId) {
        setActiveId(next[0].id)
      }
      return next
    })
    setEquipmentImages((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  const addEquipmentOnlyItem = (): void => {
    const fresh = createEquipmentOnlyItem()
    setEquipmentOnlyItems((current) => [...current, fresh])
    setActiveEquipmentOnlyId(fresh.id)
    setStatusMessage('Добавлена новая позиция оборудования')
  }

  const duplicateEquipmentOnlyItem = (id: string): void => {
    const source = equipmentOnlyItems.find((item) => item.id === id)
    if (!source) {
      return
    }
    const copy = createEquipmentOnlyItem({
      ...source,
      name: source.name ? `${source.name} (копия)` : ''
    })
    setEquipmentOnlyItems((current) => {
      const index = current.findIndex((item) => item.id === id)
      const next = [...current]
      next.splice(index + 1, 0, copy)
      return next
    })
    setActiveEquipmentOnlyId(copy.id)
  }

  const removeEquipmentOnlyItem = (id: string): void => {
    setEquipmentOnlyItems((current) => {
      if (current.length === 1) {
        return current
      }
      const next = current.filter((item) => item.id !== id)
      if (id === activeEquipmentOnlyId) {
        setActiveEquipmentOnlyId(next[0].id)
      }
      return next
    })
    setEquipmentImages((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  const addExtraRow = (): void => {
    updateOptions('extraEstimateRows', [...options.extraEstimateRows, { id: createId(), name: '', amount: 0 }])
  }

  const updateExtraRow = (id: string, patch: Partial<EstimateExtraRow>): void => {
    updateOptions(
      'extraEstimateRows',
      options.extraEstimateRows.map((row) => (row.id === id ? { ...row, ...patch } : row))
    )
  }

  const removeExtraRow = (id: string): void => {
    updateOptions(
      'extraEstimateRows',
      options.extraEstimateRows.filter((row) => row.id !== id)
    )
  }

  useEffect(() => {
    let mounted = true

    async function loadSettings(): Promise<void> {
      if (!window.fwApp) {
        setSettingsLoaded(true)
        return
      }

      try {
        const loaded = await window.fwApp.loadSettings()
        const data = loaded.data as Partial<typeof defaultAppSettings> | null

        if (mounted && data) {
          setCompany({ ...defaultCompanySettings, ...migrateCompany(data.company) })
          setCatalog({ ...defaultCatalogSettings, ...data.catalog })
          setStatusMessage('Настройки компании и справочники загружены')
        }
      } catch {
        if (mounted) {
          setStatusMessage('Не удалось загрузить настройки, используются значения по умолчанию')
        }
      } finally {
        if (mounted) {
          setSettingsLoaded(true)
        }
      }
    }

    void loadSettings()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!settingsLoaded || !window.fwApp) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      void window.fwApp?.saveSettings({ company, catalog })
    }, 500)

    return () => window.clearTimeout(timeoutId)
  }, [catalog, company, settingsLoaded])

  const applySavedCalculation = (data: unknown): void => {
    const saved = data as SavedCalculation
    const restoredProposalSubject: ProposalSubject =
      saved.options?.proposalSubject ??
      (saved.equipmentOnlyItems && saved.equipmentOnlyItems.length > 0 && (!saved.chambers || saved.chambers.length === 0)
        ? 'equipment-only'
        : 'chambers')

    setProposal({ ...defaultProposalSettings, ...saved.proposal })
    setCompany({ ...defaultCompanySettings, ...saved.company })
    setCatalog({ ...defaultCatalogSettings, ...saved.catalog })
    setCustomer({ ...defaultCustomerData, ...saved.customer })

    if (saved.chambers && saved.chambers.length > 0) {
      const restored = saved.chambers.map((chamber) => restoreChamber(chamber))
      const restoredEquipmentOnlyItems =
        saved.equipmentOnlyItems && saved.equipmentOnlyItems.length > 0
          ? saved.equipmentOnlyItems.map((item) => restoreEquipmentOnlyItem(item))
          : [defaultEquipmentOnlyItem]
      setChambers(restored)
      setActiveId(restored[0].id)
      setEquipmentOnlyItems(restoredEquipmentOnlyItems)
      setActiveEquipmentOnlyId(restoredEquipmentOnlyItems[0].id)
      setOptions({ ...defaultProposalOptions, ...saved.options, proposalSubject: restoredProposalSubject })
      setEquipmentImages(saved.equipmentImages ?? {})
    } else if (saved.equipmentOnlyItems && saved.equipmentOnlyItems.length > 0) {
      const restoredEquipmentOnlyItems = saved.equipmentOnlyItems.map((item) => restoreEquipmentOnlyItem(item))
      setChambers([defaultChamberInput])
      setActiveId(defaultChamberInput.id)
      setEquipmentOnlyItems(restoredEquipmentOnlyItems)
      setActiveEquipmentOnlyId(restoredEquipmentOnlyItems[0].id)
      setOptions({ ...defaultProposalOptions, ...saved.options, proposalSubject: restoredProposalSubject })
      setEquipmentImages(saved.equipmentImages ?? {})
    } else if (saved.input) {
      // Legacy single-chamber file.
      const legacy = restoreChamber(saved.input, true)
      setChambers([legacy])
      setActiveId(legacy.id)
      setEquipmentOnlyItems([defaultEquipmentOnlyItem])
      setActiveEquipmentOnlyId(defaultEquipmentOnlyItem.id)
      setOptions({
        ...defaultProposalOptions,
        proposalMode: saved.input.proposalMode ?? defaultProposalOptions.proposalMode,
        vatEnabled: saved.input.vatEnabled ?? defaultProposalOptions.vatEnabled,
        vatRatePercent: saved.input.vatRatePercent ?? defaultProposalOptions.vatRatePercent,
        extraEstimateRows: saved.input.extraEstimateRows ?? []
      })
      setEquipmentImages(saved.equipmentImageDataUrl ? { [legacy.id]: saved.equipmentImageDataUrl } : {})
    }
  }

  const clearActiveEquipmentImage = (): void => {
    const imageOwnerId = isEquipmentOnlyProposal ? activeEquipmentOnlyItem.id : activeChamber.id

    if (isEquipmentOnlyProposal) {
      updateActiveEquipmentOnly('imageName', '')
    } else {
      updateActive('equipmentImageName', '')
    }

    setEquipmentImages((current) => {
      const next = { ...current }
      delete next[imageOwnerId]
      return next
    })
  }

  const handleEquipmentImageChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget
    const file = input.files?.[0]
    const imageOwnerId = isEquipmentOnlyProposal ? activeEquipmentOnlyItem.id : activeChamber.id
    input.value = ''

    if (!file) {
      return
    }

    if (isEquipmentOnlyProposal) {
      updateActiveEquipmentOnly('imageName', file.name)
    } else {
      updateActive('equipmentImageName', file.name)
    }

    const reader = new FileReader()
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : ''
      setEquipmentImages((current) => ({ ...current, [imageOwnerId]: url }))
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async (): Promise<void> => {
    if (!window.fwApp) {
      setStatusMessage('Сохранение доступно в Electron-приложении')
      return
    }

    setIsBusy(true)
    setStatusMessage('Сохраняю расчёт...')

    try {
      const saveResult = await window.fwApp.saveCalculation({
        defaultName: defaultFileName(chambers, equipmentOnlyItems, proposal, options.proposalSubject),
        data: {
          version: 12,
          savedAt: new Date().toISOString(),
          proposal,
          company,
          customer,
          catalog,
          chambers,
          equipmentOnlyItems,
          options,
          equipmentImages
        }
      })

      setStatusMessage(saveResult.canceled ? 'Сохранение отменено' : `Расчёт сохранён: ${saveResult.filePath}`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Не удалось сохранить расчёт')
    } finally {
      setIsBusy(false)
    }
  }

  const handleOpen = async (): Promise<void> => {
    if (!window.fwApp) {
      setStatusMessage('Открытие расчёта доступно в Electron-приложении')
      return
    }

    setIsBusy(true)
    setStatusMessage('Открываю расчёт...')

    try {
      const openResult = await window.fwApp.openCalculation()

      if (openResult.canceled) {
        setStatusMessage('Открытие отменено')
      } else {
        applySavedCalculation(openResult.data)
        setStatusMessage(`Расчёт открыт: ${openResult.filePath}`)
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Не удалось открыть расчёт')
    } finally {
      setIsBusy(false)
    }
  }

  const handleExportPdf = async (): Promise<void> => {
    if (!window.fwApp) {
      setStatusMessage('PDF-экспорт доступен в Electron-приложении')
      return
    }

    setIsBusy(true)
    setStatusMessage('Формирую PDF...')

    try {
      const pdfChambers: ProposalPdfChamber[] = proposalResult.chambers.map((chamber) => {
        let side3dImageDataUrl = ''

        try {
          side3dImageDataUrl = renderChamber3DToDataUrl(chamber.input, 1400, 760, PROPOSAL_PDF_3D_CAMERA_DISTANCE_FACTOR)
        } catch {
          side3dImageDataUrl = ''
        }

        return {
          input: chamber.input,
          title: chamber.title,
          result: chamber.result,
          rows: options.proposalMode === 'compact' ? chamber.result.compactRows : chamber.result.materialRows,
          side3dImageDataUrl,
          equipmentImageDataUrl: equipmentImages[chamber.input.id]
        }
      })
      const pdfEquipmentOnlyItems: ProposalPdfEquipmentItem[] = proposalResult.equipmentItems.map((item) => ({
        ...item,
        equipmentImageDataUrl: equipmentImages[item.input.id]
      }))

      const html = buildProposalHtml({
        chambers: pdfChambers,
        equipmentOnlyItems: pdfEquipmentOnlyItems,
        proposalResult,
        proposalSubject: options.proposalSubject,
        proposalMode: options.proposalMode,
        company,
        customer,
        proposal
      })
      const exportResult = await window.fwApp.exportProposalPdf({
        defaultName: defaultFileName(chambers, equipmentOnlyItems, proposal, options.proposalSubject),
        html
      })

      setStatusMessage(exportResult.canceled ? 'Формирование PDF отменено' : `PDF сформирован: ${exportResult.filePath}`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Не удалось сформировать PDF')
    } finally {
      setIsBusy(false)
    }
  }

  const handlePrintViewsPdf = async (): Promise<void> => {
    if (!window.fwApp) {
      setStatusMessage('Печать доступна в Electron-приложении')
      return
    }
    if (isEquipmentOnlyProposal) {
      setStatusMessage('Печать видов доступна только для КП с холодильными камерами')
      return
    }

    setIsBusy(true)
    setStatusMessage('Формирую PDF с видами...')

    try {
      const pdfChambers: ProposalPdfChamber[] = proposalResult.chambers.map((chamber) => {
        let side3dImageDataUrl = ''

        try {
          side3dImageDataUrl = renderChamber3DToDataUrl(
            chamber.input,
            1700,
            923,
            PROPOSAL_PDF_3D_CAMERA_DISTANCE_FACTOR
          )
        } catch {
          side3dImageDataUrl = ''
        }

        return {
          input: chamber.input,
          title: chamber.title,
          result: chamber.result,
          rows: [],
          side3dImageDataUrl
        }
      })

      const html = buildVisualsPdfHtml({
        chambers: pdfChambers,
        company,
        customer,
        proposal
      })
      const exportResult = await window.fwApp.exportProposalPdf({
        defaultName: `${defaultFileName(chambers, equipmentOnlyItems, proposal, options.proposalSubject)}_виды`,
        html
      })

      setStatusMessage(exportResult.canceled ? 'Печать видов отменена' : `PDF с видами сформирован: ${exportResult.filePath}`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Не удалось сформировать PDF с видами')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-mark">
            <Snowflake size={26} strokeWidth={2.4} />
          </div>
          <div className="topbar-title">
            <strong>{company.legalName || 'Коммерческое предложение'}</strong>
            <span>
              {proposal.number || 'КП'} · {customer.name || 'покупатель не указан'}
            </span>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button" type="button" disabled={isBusy} onClick={handleOpen}>
            <FolderOpen size={16} /> Открыть
          </button>
          <button className="ghost-button" type="button" disabled={isBusy} onClick={handleSave}>
            <Save size={16} /> Сохранить
          </button>
          <button className="ghost-button" type="button" onClick={() => setSettingsOpen(true)}>
            <Settings size={16} /> Настройки
          </button>
          <button
            className="ghost-button"
            type="button"
            disabled={isBusy || isEquipmentOnlyProposal}
            onClick={handlePrintViewsPdf}
          >
            <Printer size={16} /> Печать
          </button>
          <button className="primary-button" type="button" disabled={isBusy} onClick={handleExportPdf}>
            Сформировать PDF
          </button>
        </div>
      </header>

      <div className="status-bar" role="status">
        {statusMessage}
      </div>

      <main className="layout">
        <section className="input-column" aria-label="Параметры расчёта">
          <FormCard title="Коммерческое предложение">
            <div className="field-grid two-columns">
              <label>
                Номер КП
                <input value={proposal.number} onChange={(event) => updateProposal('number', event.target.value)} />
              </label>
              <label>
                Действует до
                <input
                  type="date"
                  value={proposal.validUntil}
                  onChange={(event) => updateProposal('validUntil', event.target.value)}
                />
              </label>
            </div>
            <label>
              Шапка документа
              <textarea
                className="proposal-header-input"
                placeholder={'ИП Камышанов А. А.\nКоммерческое предложение\nПриложение к договору №…'}
                value={proposal.headerText}
                onChange={(event) => updateProposal('headerText', event.target.value)}
              />
            </label>
            <p className="hint-text">Выводится слева вверху PDF. Если поле пустое, блок не показывается. Переносы строк сохраняются.</p>
            <div className="field-grid two-columns">
              <label>
                Покупатель
                <input value={customer.name} onChange={(event) => updateCustomer('name', event.target.value)} />
              </label>
              <label>
                Телефон
                <input value={customer.phone} onChange={(event) => updateCustomer('phone', event.target.value)} />
              </label>
              <label>
                Почта
                <input value={customer.email} onChange={(event) => updateCustomer('email', event.target.value)} />
              </label>
              <label>
                Адрес объекта
                <input value={customer.address} onChange={(event) => updateCustomer('address', event.target.value)} />
              </label>
            </div>
          </FormCard>

          <FormCard title="Режим КП">
            <div className="segmented-control" role="group" aria-label="Предмет коммерческого предложения">
              <button
                className={options.proposalSubject === 'chambers' ? 'active' : ''}
                type="button"
                onClick={() => updateProposalSubject('chambers')}
              >
                Холодильная камера + оборудование
              </button>
              <button
                className={options.proposalSubject === 'equipment-only' ? 'active' : ''}
                type="button"
                onClick={() => updateProposalSubject('equipment-only')}
              >
                Только оборудование
              </button>
            </div>
            <p className="hint-text">
              В режиме «Только оборудование» расчёт холодильной камеры, панелей, дверей и видов сверху не используется.
            </p>
          </FormCard>

          {isEquipmentOnlyProposal ? (
            <>
              <div className="chamber-tabs" role="tablist" aria-label="Позиции оборудования в КП">
                {equipmentOnlyItems.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={item.id === activeEquipmentOnlyId}
                    className={`chamber-tab${item.id === activeEquipmentOnlyId ? ' active' : ''}`}
                    onClick={() => setActiveEquipmentOnlyId(item.id)}
                  >
                    <span className="chamber-tab-name">
                      {index + 1}. {getEquipmentOnlyTitle(item)}
                    </span>
                    {equipmentOnlyItems.length > 1 ? (
                      <span
                        className="chamber-tab-close"
                        role="button"
                        aria-label="Удалить позицию оборудования"
                        onClick={(event) => {
                          event.stopPropagation()
                          removeEquipmentOnlyItem(item.id)
                        }}
                      >
                        <X size={13} />
                      </span>
                    ) : null}
                  </button>
                ))}
                <button type="button" className="chamber-tab add" onClick={addEquipmentOnlyItem} title="Добавить позицию">
                  <Plus size={15} /> Позиция
                </button>
              </div>

              <FormCard
                title="Холодильное оборудование"
                action={
                  <div className="form-card-actions">
                    <button className="link-button" type="button" onClick={() => duplicateEquipmentOnlyItem(activeEquipmentOnlyId)}>
                      <Copy size={14} /> Дублировать
                    </button>
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => {
                        updateActiveEquipmentOnly('name', catalog.defaultEquipmentName)
                        updateActiveEquipmentOnly('price', catalog.defaultEquipmentPrice)
                        updateActiveEquipmentOnly('mountingPrice', catalog.defaultEquipmentMountingPrice)
                      }}
                    >
                      Из справочника
                    </button>
                  </div>
                }
              >
                <label>
                  Название/модель
                  <input
                    value={activeEquipmentOnlyItem.name}
                    placeholder={getEquipmentOnlyTitle(activeEquipmentOnlyItem)}
                    onChange={(event) => updateActiveEquipmentOnly('name', event.target.value)}
                  />
                </label>
                <div className="field-grid three-columns">
                  <label>
                    Количество (шт)
                    {numberInput(activeEquipmentOnlyItem.quantity, (value) => updateActiveEquipmentOnly('quantity', value), 1)}
                  </label>
                  <label>
                    Цена оборудования
                    {numberInput(activeEquipmentOnlyItem.price, (value) => updateActiveEquipmentOnly('price', value))}
                  </label>
                  <label>
                    Монтаж с расходниками
                    {numberInput(activeEquipmentOnlyItem.mountingPrice, (value) => updateActiveEquipmentOnly('mountingPrice', value))}
                  </label>
                </div>
                <div className="field-label-block">
                  <span className="field-label">Фото для PDF</span>
                  <div className="file-field">
                    <label className="file-button">
                      <ImagePlus size={15} />
                      {activeEquipmentOnlyImage ? 'Заменить фото' : 'Выбрать фото'}
                      <input type="file" accept="image/*" onChange={handleEquipmentImageChange} />
                    </label>
                    {activeEquipmentOnlyItem.imageName ? (
                      <span className="file-name" title={activeEquipmentOnlyItem.imageName}>
                        {activeEquipmentOnlyItem.imageName}
                      </span>
                    ) : (
                      <span className="file-name muted">Файл не выбран</span>
                    )}
                    {activeEquipmentOnlyImage ? (
                      <button className="icon-button" type="button" aria-label="Убрать фото" onClick={clearActiveEquipmentImage}>
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </div>
                  {activeEquipmentOnlyImage ? (
                    <img className="equipment-preview" src={activeEquipmentOnlyImage} alt="Превью оборудования" />
                  ) : null}
                  <label className="equipment-size-setting">
                    <span>Размер фото в PDF</span>
                    <input
                      disabled={!activeEquipmentOnlyImage}
                      type="range"
                      min={EQUIPMENT_IMAGE_SIZE_MIN}
                      max={EQUIPMENT_IMAGE_SIZE_MAX}
                      step={EQUIPMENT_IMAGE_SIZE_STEP}
                      value={activeEquipmentOnlyItem.imageSizePercent}
                      onChange={(event) => updateActiveEquipmentOnly('imageSizePercent', Number(event.currentTarget.value))}
                    />
                    <output>{activeEquipmentOnlyItem.imageSizePercent}%</output>
                  </label>
                </div>
                <label>
                  Характеристики холодильного оборудования
                  <textarea
                    className="equipment-characteristics-input"
                    value={activeEquipmentOnlyItem.characteristics}
                    onChange={(event) => updateActiveEquipmentOnly('characteristics', event.target.value)}
                  />
                </label>
              </FormCard>
            </>
          ) : (
            <>
              <div className="chamber-tabs" role="tablist" aria-label="Холодильные камеры в КП">
                {chambers.map((chamber, index) => (
                  <button
                    key={chamber.id}
                    type="button"
                    role="tab"
                    aria-selected={chamber.id === activeId}
                    className={`chamber-tab${chamber.id === activeId ? ' active' : ''}`}
                    onClick={() => setActiveId(chamber.id)}
                  >
                    <span className="chamber-tab-name">
                      {index + 1}. {getChamberTitle(chamber)}
                    </span>
                    {chambers.length > 1 ? (
                      <span
                        className="chamber-tab-close"
                        role="button"
                        aria-label="Удалить холодильную камеру"
                        onClick={(event) => {
                          event.stopPropagation()
                          removeChamber(chamber.id)
                        }}
                      >
                        <X size={13} />
                      </span>
                    ) : null}
                  </button>
                ))}
                <button
                  type="button"
                  className="chamber-tab add"
                  onClick={addChamber}
                  title="Добавить холодильную камеру"
                >
                  <Plus size={15} /> Холодильная камера
                </button>
              </div>

              <FormCard
                title="Холодильная камера"
                action={
                  <button className="link-button" type="button" onClick={() => duplicateChamber(activeId)}>
                    <Copy size={14} /> Дублировать
                  </button>
                }
              >
                <label>
                  Название холодильной камеры (необязательно)
                  <input
                    value={activeChamber.title}
                    placeholder={getChamberTitle(activeChamber)}
                    onChange={(event) => updateActive('title', event.target.value)}
                  />
                </label>
                <div className="field-grid two-columns">
                  <label>
                    Длина, мм
                    {numberInput(activeChamber.lengthMm, (value) => updateActive('lengthMm', value), 1)}
                  </label>
                  <label>
                    Ширина, мм
                    {numberInput(activeChamber.widthMm, (value) => updateActive('widthMm', value), 1)}
                  </label>
                  <label>
                    Высота, мм
                    {numberInput(activeChamber.heightMm, (value) => updateActive('heightMm', value), 1)}
                  </label>
                  <label>
                    Количество (шт)
                    {numberInput(activeChamber.quantity, (value) => updateActive('quantity', value), 1)}
                  </label>
                </div>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={activeChamber.hasPanelFloor}
                    onChange={(event) => updateActive('hasPanelFloor', event.target.checked)}
                  />
                  Пол из сэндвич-панелей
                </label>

                <div className={`optimizer${optimization.hasCut ? ' has-cut' : ' clean'}`}>
                  <div className="optimizer-head">
                    <Wand2 size={16} />
                    {optimization.hasCut ? 'Оптимизация стен' : 'Стены без подрезки'}
                  </div>
                  {optimization.hasCut ? (
                    <>
                      <p className="optimizer-note">
                        {optimization.longWallCut
                          ? `Длинные стены дают обрезок ${optimization.longWallRemainderMm} мм. `
                          : ''}
                        {optimization.shortWallCut
                          ? `Торцевые стены между длинными дают обрезок ${optimization.shortWallRemainderMm} мм. `
                          : ''}
                        Рекомендуемые габариты для стен:
                      </p>
                      <div className="optimizer-options">
                        {optimization.options.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            className="optimizer-button"
                            onClick={() => {
                              updateActive('lengthMm', option.lengthMm)
                              updateActive('widthMm', option.widthMm)
                              setStatusMessage(`Габариты обновлены: ${option.lengthMm} × ${option.widthMm} мм`)
                            }}
                            title={option.note}
                          >
                            <span className="optimizer-button-title">{option.label}</span>
                            <span className="optimizer-button-note">{option.note}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="optimizer-note">
                      Стеновые пролёты кратны рабочей ширине 1190 мм. Пол и потолок здесь не учитываются.
                    </p>
                  )}
                </div>
              </FormCard>

              <FormCard
                title="Панели"
                action={
                  <button className="link-button" type="button" onClick={resetPanelOverrides}>
                    Сбросить количества
                  </button>
                }
              >
                <div className="field-grid two-columns">
                  <label>
                    Толщина панели
                    <select
                      value={activeChamber.thicknessMm}
                      onChange={(event) => updateActive('thicknessMm', Number(event.target.value) as PanelThickness)}
                    >
                      {thicknessOptions.map((thickness) => (
                        <option key={thickness} value={thickness}>
                          {thickness} мм
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Наполнитель
                    <select
                      value={activeChamber.panelFilling}
                      onChange={(event) => updateActive('panelFilling', event.target.value as PanelFilling)}
                    >
                      {fillingOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {activeChamber.panelFilling === 'custom' ? (
                  <label>
                    Свой наполнитель
                    <input
                      value={activeChamber.customPanelFilling}
                      onChange={(event) => updateActive('customPanelFilling', event.target.value)}
                    />
                  </label>
                ) : null}
                <label>
                  Цена панели, руб/м²
                  {numberInput(activeChamber.panelPricePerM2, (value) => updateActive('panelPricePerM2', value))}
                </label>
                <label>
                  Запас на пропил, мм
                  {numberInput(activeChamber.panelCutKerfMm, (value) => updateActive('panelCutKerfMm', value), 0)}
                </label>
              <p className="hint-text">
                Остатки стен автоматически объединяются в общий раскрой. Нулевой запас позволяет использовать листы
                вплотную; при реальном распиле укажите технологический запас.
              </p>
              {wallPanelSaving > 0 ? (
                <p className="panel-saving-note">
                  Экономия за счёт общего раскроя стен: {wallPanelSaving} шт.
                </p>
              ) : null}
              <div className="panel-counts">
                <div className="panel-counts-head">
                  <span>Группа панелей</span>
                  <span>Авто</span>
                  <span>Количество к продаже</span>
                  <span>Всего</span>
                </div>
                {activeWallGroup ? (
                  <div className="panel-count-row">
                    <span>
                      Стены
                      {activeWallGroup.cutPlan.length > 0 ? (
                        <small>Раскрой: {activeWallGroup.cutPlan.join('; ')}</small>
                      ) : null}
                    </span>
                    <strong>{activeWallGroup.automaticCountPerChamber}</strong>
                    <div className="panel-count-editor">
                      {numberInput(
                        activeWallGroup.countPerChamber,
                        (value) => updatePanelOverride('manualWallPanelCount', value),
                        1
                      )}
                      {activeWallGroup.isManualOverride ? (
                        <button
                          className="panel-count-reset"
                          type="button"
                          onClick={() => updateActive('manualWallPanelCount', null)}
                          title="Вернуть автоматическое количество"
                        >
                          Авто
                        </button>
                      ) : null}
                    </div>
                    <span>{activeWallGroup.countTotal}</span>
                  </div>
                ) : null}
                {activeCeilingGroup ? (
                  <div className="panel-count-row">
                    <span>Потолок</span>
                    <strong>{activeCeilingGroup.automaticCountPerChamber}</strong>
                    <div className="panel-count-editor">
                      {numberInput(
                        activeCeilingGroup.countPerChamber,
                        (value) => updatePanelOverride('manualCeilingPanelCount', value),
                        1
                      )}
                      {activeCeilingGroup.isManualOverride ? (
                        <button
                          className="panel-count-reset"
                          type="button"
                          onClick={() => updateActive('manualCeilingPanelCount', null)}
                          title="Вернуть автоматическое количество"
                        >
                          Авто
                        </button>
                      ) : null}
                    </div>
                    <span>{activeCeilingGroup.countTotal}</span>
                  </div>
                ) : null}
                {activeChamber.hasPanelFloor && activeFloorGroup ? (
                  <div className="panel-count-row">
                    <span>Пол</span>
                    <strong>{activeFloorGroup.automaticCountPerChamber}</strong>
                    <div className="panel-count-editor">
                      {numberInput(
                        activeFloorGroup.countPerChamber,
                        (value) => updatePanelOverride('manualFloorPanelCount', value),
                        1
                      )}
                      {activeFloorGroup.isManualOverride ? (
                        <button
                          className="panel-count-reset"
                          type="button"
                          onClick={() => updateActive('manualFloorPanelCount', null)}
                          title="Вернуть автоматическое количество"
                        >
                          Авто
                        </button>
                      ) : null}
                    </div>
                    <span>{activeFloorGroup.countTotal}</span>
                  </div>
                ) : null}
              </div>
              {activeWallGroup?.isManualOverride && activeWallGroup.countPerChamber < activeWallGroup.automaticCountPerChamber ? (
                <p className="panel-count-warning" role="alert">
                  Введено меньше стеновых панелей, чем рассчитано автоматически. Проверьте раскрой перед заказом.
                </p>
              ) : null}
              {activeCeilingGroup?.isManualOverride && activeCeilingGroup.countPerChamber < activeCeilingGroup.automaticCountPerChamber ? (
                <p className="panel-count-warning" role="alert">
                  Введено меньше потолочных панелей, чем рассчитано автоматически. Проверьте раскрой перед заказом.
                </p>
              ) : null}
              {activeFloorGroup?.isManualOverride && activeFloorGroup.countPerChamber < activeFloorGroup.automaticCountPerChamber ? (
                <p className="panel-count-warning" role="alert">
                  Введено меньше панелей пола, чем рассчитано автоматически. Проверьте раскрой перед заказом.
                </p>
              ) : null}
              </FormCard>

              <FormCard
                title="Дверь"
                action={
                  <button
                    className="link-button"
                    type="button"
                    onClick={() => {
                      updateActive('doorName', catalog.defaultDoorName)
                      updateActive('doorPrice', catalog.defaultDoorPrice)
                      updateActive('doorMountingPrice', catalog.defaultDoorMountingPrice)
                    }}
                  >
                    Из справочника
                  </button>
                }
              >
                <label>
                  Название/модель
                  <input value={activeChamber.doorName} onChange={(event) => updateActive('doorName', event.target.value)} />
                </label>
                <div className="field-label-block">
                  <span className="field-label">Тип двери</span>
                  <div className="segmented-control three-options">
                    {(['single', 'double', 'sliding'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        className={activeChamber.doorType === type ? 'active' : undefined}
                        onClick={() => updateActive('doorType', type)}
                      >
                        {type === 'single' ? 'Одностворчатая' : type === 'double' ? 'Двустворчатая' : 'Откатная'}
                      </button>
                    ))}
                  </div>
                </div>
                {activeChamber.doorType === 'sliding' ? (
                  <div className="field-label-block">
                    <span className="field-label">Сторона отката</span>
                    <div className="segmented-control">
                      {(['left', 'right'] as const).map((side) => (
                        <button
                          key={side}
                          type="button"
                          className={activeChamber.doorSlideSide === side ? 'active' : undefined}
                          onClick={() => updateActive('doorSlideSide', side)}
                        >
                          {side === 'left' ? 'Влево' : 'Вправо'}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <label>
                  Проём двери, мм (Ш × В)
                  <div className="inline-fields">
                    {numberInput(activeChamber.doorWidthMm, (value) => updateActive('doorWidthMm', value), 1)}
                    {numberInput(activeChamber.doorHeightMm, (value) => updateActive('doorHeightMm', value), 1)}
                  </div>
                </label>
                <button className="door-position-button" type="button" onClick={() => setDoorEditorOpen(true)}>
                  <Move size={16} />
                  <span>
                    Изменить положение двери
                    <small>
                      {{ front: 'передняя', right: 'правая', back: 'задняя', left: 'левая' }[activeChamber.doorWall]} стена
                      {Math.abs(activeChamber.doorOffsetMm) < 1
                        ? ' · по центру'
                        : ` · смещение ${Math.round(activeChamber.doorOffsetMm)} мм`}
                    </small>
                  </span>
                </button>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={activeChamber.doorHasThreshold}
                    onChange={(event) => updateActive('doorHasThreshold', event.target.checked)}
                  />
                  Дверь с порогом
                </label>
                <div className="field-grid two-columns">
                  <label>
                    Цена двери
                    {numberInput(activeChamber.doorPrice, (value) => updateActive('doorPrice', value))}
                  </label>
                  <label>
                    Монтаж двери
                    {numberInput(activeChamber.doorMountingPrice, (value) => updateActive('doorMountingPrice', value))}
                  </label>
                </div>
              </FormCard>

              <FormCard title="Монтаж холодильной камеры">
                <div className="field-grid three-columns">
                  <label>
                    Стены, руб/м²
                    {numberInput(activeChamber.mountingWallPricePerM2, (value) => updateActive('mountingWallPricePerM2', value))}
                  </label>
                  <label>
                    Потолок, руб/м²
                    {numberInput(activeChamber.mountingCeilingPricePerM2, (value) =>
                      updateActive('mountingCeilingPricePerM2', value)
                    )}
                  </label>
                  <label>
                    Пол, руб/м²
                    {numberInput(activeChamber.mountingFloorPricePerM2, (value) => updateActive('mountingFloorPricePerM2', value))}
                  </label>
                </div>
              </FormCard>

              <FormCard
                title="Холодильное оборудование"
                action={
                  <button
                    className="link-button"
                    type="button"
                    onClick={() => {
                      updateActive('equipmentEnabled', true)
                      updateActive('equipmentName', catalog.defaultEquipmentName)
                      updateActive('equipmentPrice', catalog.defaultEquipmentPrice)
                      updateActive('equipmentMountingPrice', catalog.defaultEquipmentMountingPrice)
                    }}
                  >
                    Из справочника
                  </button>
                }
              >
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={activeChamber.equipmentEnabled}
                    onChange={(event) => updateActive('equipmentEnabled', event.target.checked)}
                  />
                  Продаётся вместе с холодильной камерой
                </label>
                <label>
                  Название/модель
                  <input
                    disabled={!activeChamber.equipmentEnabled}
                    value={activeChamber.equipmentName}
                    onChange={(event) => updateActive('equipmentName', event.target.value)}
                  />
                </label>
                <div className="field-grid two-columns">
                  <label>
                    Цена оборудования
                    {numberInput(activeChamber.equipmentPrice, (value) => updateActive('equipmentPrice', value))}
                  </label>
                  <label>
                    Монтаж с расходниками
                    {numberInput(activeChamber.equipmentMountingPrice, (value) => updateActive('equipmentMountingPrice', value))}
                  </label>
                </div>
                <div className="field-label-block">
                  <span className="field-label">Фото для PDF</span>
                  <div className="file-field">
                    <label className={`file-button${activeChamber.equipmentEnabled ? '' : ' disabled'}`}>
                      <ImagePlus size={15} />
                      {activeChamberEquipmentImage ? 'Заменить фото' : 'Выбрать фото'}
                      <input
                        disabled={!activeChamber.equipmentEnabled}
                        type="file"
                        accept="image/*"
                        onChange={handleEquipmentImageChange}
                      />
                    </label>
                    {activeChamber.equipmentImageName ? (
                      <span className="file-name" title={activeChamber.equipmentImageName}>
                        {activeChamber.equipmentImageName}
                      </span>
                    ) : (
                      <span className="file-name muted">Файл не выбран</span>
                    )}
                    {activeChamberEquipmentImage ? (
                      <button className="icon-button" type="button" aria-label="Убрать фото" onClick={clearActiveEquipmentImage}>
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </div>
                  {activeChamberEquipmentImage ? (
                    <img className="equipment-preview" src={activeChamberEquipmentImage} alt="Превью оборудования" />
                  ) : null}
                  <label className="equipment-size-setting">
                    <span>Размер фото в PDF</span>
                    <input
                      disabled={!activeChamber.equipmentEnabled || !activeChamberEquipmentImage}
                      type="range"
                      min={EQUIPMENT_IMAGE_SIZE_MIN}
                      max={EQUIPMENT_IMAGE_SIZE_MAX}
                      step={EQUIPMENT_IMAGE_SIZE_STEP}
                      value={activeChamber.equipmentImageSizePercent}
                      onChange={(event) => updateActive('equipmentImageSizePercent', Number(event.currentTarget.value))}
                    />
                    <output>{activeChamber.equipmentImageSizePercent}%</output>
                  </label>
                </div>
                <label>
                  Характеристики холодильного оборудования
                  <textarea
                    className="equipment-characteristics-input"
                    disabled={!activeChamber.equipmentEnabled}
                    value={activeChamber.equipmentCharacteristics}
                    onChange={(event) => updateActive('equipmentCharacteristics', event.target.value)}
                  />
                </label>
              </FormCard>
            </>
          )}

          <FormCard
            title="Дополнительные строки сметы"
            action={
              <button className="link-button" type="button" onClick={addExtraRow}>
                <Plus size={14} /> Добавить
              </button>
            }
          >
            <p className="hint-text">Доставка, разгрузка, спецтехника и прочее — на всё КП, вводится вручную.</p>
            {options.extraEstimateRows.length === 0 ? (
              <p className="hint-text muted">Пока нет дополнительных строк.</p>
            ) : (
              options.extraEstimateRows.map((row) => (
                <div className="extra-row" key={row.id}>
                  <input
                    className="extra-row-name"
                    placeholder="Например: Доставка и разгрузка"
                    value={row.name}
                    onChange={(event) => updateExtraRow(row.id, { name: event.target.value })}
                  />
                  <div className="extra-row-amount">
                    <NumberField value={row.amount} onChange={(value) => updateExtraRow(row.id, { amount: value })} min={0} />
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Удалить строку"
                    onClick={() => removeExtraRow(row.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            )}
          </FormCard>

          <FormCard title="Дополнительная информация">
            <textarea
              className="proposal-note-input"
              placeholder="Введите дополнительную информацию, которая будет добавлена в конец КП"
              value={proposal.note}
              onChange={(event) => updateProposal('note', event.target.value)}
            />
          </FormCard>

          <FormCard title="Вид КП">
            <div className="segmented-control" role="group" aria-label="Режим коммерческого предложения">
              <button
                className={options.proposalMode === 'detailed' ? 'active' : ''}
                type="button"
                disabled={isEquipmentOnlyProposal}
                onClick={() => updateOptions('proposalMode', 'detailed')}
              >
                Подробное
              </button>
              <button
                className={options.proposalMode === 'compact' ? 'active' : ''}
                type="button"
                disabled={isEquipmentOnlyProposal}
                onClick={() => updateOptions('proposalMode', 'compact')}
              >
                Краткое
              </button>
            </div>
            {isEquipmentOnlyProposal ? (
              <p className="hint-text">Для КП только с оборудованием используется единый формат таблицы.</p>
            ) : null}
            <div className="field-grid two-columns">
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={options.vatEnabled}
                  onChange={(event) => updateOptions('vatEnabled', event.target.checked)}
                />
                Показывать НДС
              </label>
              <label>
                Ставка НДС, %
                {numberInput(options.vatRatePercent, (value) => updateOptions('vatRatePercent', value))}
              </label>
            </div>
          </FormCard>
        </section>

        <section className="result-column" aria-label="Результат расчёта">
          <div className="result-scroll">
            {isEquipmentOnlyProposal ? (
              <>
                <div className="result-card">
                  <div className="card-heading">
                    <h3>{getEquipmentOnlyTitle(activeEquipmentOnlyItem)}</h3>
                    <span>{activeEquipmentOnlyItem.quantity > 1 ? `${activeEquipmentOnlyItem.quantity} шт` : '1 шт'}</span>
                  </div>
                  {activeEquipmentOnlyImage ? (
                    <img className="equipment-preview result-equipment-preview" src={activeEquipmentOnlyImage} alt="Фото оборудования" />
                  ) : (
                    <p className="result-placeholder">Фото позиции будет показано здесь и попадёт в PDF после загрузки изображения.</p>
                  )}
                  <div className="equipment-only-summary">
                    <strong>Оборудование без холодильной камеры</strong>
                    <span>
                      Цена оборудования: {formatMoney(activeEquipmentOnlyItem.price)} · монтаж и расходники:{' '}
                      {formatMoney(activeEquipmentOnlyItem.mountingPrice)}
                    </span>
                  </div>
                </div>

                <div className="totals-strip">
                  <div className="total-chip">
                    <span>Позиций в КП</span>
                    <strong>{proposalResult.equipmentItems.length}</strong>
                  </div>
                  <div className="total-chip">
                    <span>Текущая позиция</span>
                    <strong>{formatMoney(activeEquipmentComputed?.subtotal ?? 0)}</strong>
                  </div>
                  <div className="total-chip">
                    <span>Доп. строки</span>
                    <strong>{formatMoney(proposalResult.extraRowsTotal)}</strong>
                  </div>
                  <div className="total-chip">
                    <span>{options.vatEnabled ? `НДС ${options.vatRatePercent}%` : 'НДС'}</span>
                    <strong>{options.vatEnabled ? formatMoney(proposalResult.vatAmount) : 'не облагается'}</strong>
                  </div>
                  <div className="total-chip accent">
                    <span>Итого по КП</span>
                    <strong>{formatMoney(proposalResult.total)}</strong>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="drawings">
                  <div className="drawing-card">
                    <div className="card-heading">
                      <h3>3D-вид</h3>
                      <span>
                        {activeResult!.panelFillingLabel} {activeChamber.thicknessMm} мм
                      </span>
                    </div>
                    <Chamber3DView
                      input={activeChamber}
                      settingsOpen={view3dSettingsOpen}
                      onSettingsToggle={() => setView3dSettingsOpen((value) => !value)}
                    />
                  </div>
                  <div className="drawing-card">
                    <div className="card-heading">
                      <h3>Вид сверху</h3>
                      <span>{activeChamber.hasPanelFloor ? 'с полом' : 'без пола'}</span>
                    </div>
                    <TopView input={activeChamber} result={activeResult!} />
                  </div>
                </div>

                <p className="result-door-note">{DOOR_INSTALLATION_NOTE}</p>

                <div className="totals-strip">
                  <div className="total-chip">
                    <span>Панели (продажа)</span>
                    <strong>{formatNumber(activeResult!.panelAreaSoldM2)} м²</strong>
                  </div>
                  <div className="total-chip">
                    <span>Холодильная камера</span>
                    <strong>{formatMoney(activeResult!.panelCost)}</strong>
                  </div>
                  <div className="total-chip">
                    <span>Комплектующие</span>
                    <strong>{formatMoney(activeResult!.accessoryCost)}</strong>
                  </div>
                  <div className="total-chip">
                    <span>Дверь</span>
                    <strong>{formatMoney(activeResult!.doorCost + activeResult!.doorMountingCost)}</strong>
                  </div>
                  <div className="total-chip">
                    <span>Итого по холодильной камере</span>
                    <strong>{formatMoney(activeResult!.chamberSubtotal)}</strong>
                  </div>
                  <div className="total-chip accent">
                    <span>Итого по КП</span>
                    <strong>{formatMoney(proposalResult.total)}</strong>
                  </div>
                </div>
              </>
            )}

            <div className="result-card">
              <div className="card-heading">
                <h3>
                  {isEquipmentOnlyProposal
                    ? `Позиция оборудования · ${getEquipmentOnlyTitle(activeEquipmentOnlyItem)}`
                    : `${options.proposalMode === 'compact' ? 'Краткое КП' : 'Материалы и работы'} · ${getChamberTitle(activeChamber)}`}
                </h3>
                <span>
                  {isEquipmentOnlyProposal
                    ? activeEquipmentOnlyItem.quantity > 1
                      ? `${activeEquipmentOnlyItem.quantity} шт`
                      : '1 шт'
                    : activeChamber.quantity > 1
                      ? `${activeChamber.quantity} шт`
                      : '1 шт'}
                </span>
              </div>
              <div className="table-wrap">
                <table className="material-table">
                  <thead>
                    <tr>
                      <th>Позиция</th>
                      <th>Ед.</th>
                      <th>{isEquipmentOnlyProposal ? 'На ед.' : 'На холодильную камеру'}</th>
                      <th>Всего</th>
                      <th>Цена</th>
                      <th>Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRows.map((row) => (
                      <tr key={row.id}>
                        <td className="cell-name">
                          {row.name}
                          {row.note ? <span className="cell-note">{row.note}</span> : null}
                        </td>
                        <td>{row.unit}</td>
                        <td>{formatNumber(row.amountPerChamber)}</td>
                        <td>{formatNumber(row.amountTotal)}</td>
                        <td className="cell-money">{formatMoney(row.unitPrice)}</td>
                        <td className="cell-money">{formatMoney(row.sum)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="result-card">
              <div className="card-heading">
                <h3>
                  Сводная смета
                </h3>
                <span>{options.vatEnabled ? `НДС ${options.vatRatePercent}%` : 'без НДС'}</span>
              </div>
              <table className="cost-table">
                <tbody>
                  {proposalResult.costRows.map((row) => (
                    <tr
                      key={row.id}
                      className={row.kind === 'total' ? 'total-row' : row.kind === 'subtotal' ? 'subtotal-row' : undefined}
                    >
                      <td>{row.name}</td>
                      <td>{formatMoney(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      <SettingsModal
        open={settingsOpen}
        company={company}
        catalog={catalog}
        onClose={() => setSettingsOpen(false)}
        onCompanyChange={updateCompany}
        onCatalogChange={updateCatalog}
      />
      <DoorPositionEditor
        open={doorEditorOpen}
        input={activeChamber}
        onClose={() => setDoorEditorOpen(false)}
        onApply={(doorWall: DoorWall, doorOffsetMm: number) => {
          setChambers((current) =>
            current.map((chamber) =>
              chamber.id === activeId ? normalizeChamberDoor({ ...chamber, doorWall, doorOffsetMm }) : chamber
            )
          )
          setDoorEditorOpen(false)
          setStatusMessage('Положение двери изменено')
        }}
      />
      {view3dSettingsOpen ? (
        <Chamber3DSettingsEditor
          input={activeChamber}
          pdfCameraDistanceFactor={PROPOSAL_PDF_3D_CAMERA_DISTANCE_FACTOR}
          onClose={() => setView3dSettingsOpen(false)}
          onViewSettingsChange={(view3d) => updateActive('view3d', view3d)}
        />
      ) : null}
    </div>
  )
}

interface FormCardProps {
  title: string
  action?: JSX.Element
  children: ReactNode
}

function FormCard({ title, action, children }: FormCardProps): JSX.Element {
  return (
    <section className="form-card">
      <div className="form-card-head">
        <h3>{title}</h3>
        {action ?? null}
      </div>
      <div className="form-card-body">{children}</div>
    </section>
  )
}
