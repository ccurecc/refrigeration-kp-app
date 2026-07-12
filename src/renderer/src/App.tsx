import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Copy, FolderOpen, ImagePlus, Plus, Printer, Save, Settings, Snowflake, Trash2, Wand2, X } from 'lucide-react'
import {
  calculateProposal,
  createChamber,
  defaultChamberInput,
  defaultProposalOptions,
  getChamberTitle,
  PanelFilling,
  PanelThickness,
  ChamberInput,
  EstimateExtraRow,
  ProposalOptions
} from './domain/calculator'
import { DOOR_INSTALLATION_NOTE, buildProposalHtml, buildVisualsPdfHtml, type ProposalPdfChamber } from './domain/proposal'
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
import { Chamber3DView, renderChamber3DToDataUrl } from './components/Chamber3DView'
import { TopView } from './components/TopView'
import { SettingsModal } from './components/SettingsModal'
import { NumberField } from './components/NumberField'
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
const PROPOSAL_PDF_3D_CAMERA_DISTANCE_FACTOR = 0.92

const formatMoney = (value: number): string => moneyFormatter.format(value)
const formatNumber = (value: number): string => numberFormatter.format(value)

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `row-${Date.now()}-${Math.round(Math.random() * 1e6)}`
}

// Settings saved before the rename still carry the old placeholder brand name.
// Replace stale placeholders with the current defaults so they don't override them.
const STALE_BRAND_NAMES = new Set(['FrozenWest КП', 'FrozenWest', 'Название компании', ''])
const STALE_LEGAL_NAMES = new Set(['Название компании', ''])

function migrateCompany(saved: Partial<CompanySettings> | undefined): Partial<CompanySettings> {
  if (!saved) {
    return {}
  }
  const next = { ...saved }
  if (next.brandName !== undefined && STALE_BRAND_NAMES.has(next.brandName.trim())) {
    next.brandName = defaultCompanySettings.brandName
  }
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

function defaultFileName(chambers: ChamberInput[], proposal: ProposalSettings): string {
  const prefix = proposal.number.trim() || 'КП'
  const first = chambers[0]
  const size = first ? `${first.lengthMm}x${first.widthMm}x${first.heightMm}` : ''
  const suffix = chambers.length > 1 ? `_и_ещё_${chambers.length - 1}` : ''
  return `${prefix}_${size}${suffix}`
}

export function App(): JSX.Element {
  const [chambers, setChambers] = useState<ChamberInput[]>([defaultChamberInput])
  const [activeId, setActiveId] = useState<string>(defaultChamberInput.id)
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

  const activeChamber = chambers.find((chamber) => chamber.id === activeId) ?? chambers[0]
  const proposalResult = useMemo(
    () => calculateProposal(chambers, catalog, options),
    [chambers, catalog, options]
  )
  const activeComputed =
    proposalResult.chambers.find((chamber) => chamber.input.id === activeChamber.id) ?? proposalResult.chambers[0]
  const activeResult = activeComputed.result
  const optimization = useMemo(
    () => buildOptimizationReport(activeChamber.lengthMm, activeChamber.widthMm, activeChamber.thicknessMm),
    [activeChamber.lengthMm, activeChamber.widthMm, activeChamber.thicknessMm]
  )
  const activeRows = options.proposalMode === 'compact' ? activeResult.compactRows : activeResult.materialRows

  const updateActive = <K extends keyof ChamberInput>(key: K, value: ChamberInput[K]): void => {
    setChambers((current) => current.map((chamber) => (chamber.id === activeId ? { ...chamber, [key]: value } : chamber)))
  }

  const updateOptions = <K extends keyof ProposalOptions>(key: K, value: ProposalOptions[K]): void => {
    setOptions((current) => ({ ...current, [key]: value }))
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
    setStatusMessage('Добавлена новая камера')
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

    setProposal({ ...defaultProposalSettings, ...saved.proposal })
    setCompany({ ...defaultCompanySettings, ...saved.company })
    setCatalog({ ...defaultCatalogSettings, ...saved.catalog })
    setCustomer({ ...defaultCustomerData, ...saved.customer })

    if (saved.chambers && saved.chambers.length > 0) {
      const restored = saved.chambers.map((chamber) => ({ ...defaultChamberInput, ...chamber }))
      setChambers(restored)
      setActiveId(restored[0].id)
      setOptions({ ...defaultProposalOptions, ...saved.options })
      setEquipmentImages(saved.equipmentImages ?? {})
    } else if (saved.input) {
      // Legacy single-chamber file.
      const legacy = createChamber({ ...defaultChamberInput, ...saved.input })
      setChambers([legacy])
      setActiveId(legacy.id)
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

  const handleEquipmentImageChange = (fileList: FileList | null): void => {
    const file = fileList?.[0]
    updateActive('equipmentImageName', file?.name ?? '')

    if (!file) {
      setEquipmentImages((current) => {
        const next = { ...current }
        delete next[activeId]
        return next
      })
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : ''
      setEquipmentImages((current) => ({ ...current, [activeId]: url }))
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
        defaultName: defaultFileName(chambers, proposal),
        data: {
          version: 2,
          savedAt: new Date().toISOString(),
          proposal,
          company,
          customer,
          catalog,
          chambers,
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

      const html = buildProposalHtml({
        chambers: pdfChambers,
        proposalResult,
        proposalMode: options.proposalMode,
        company,
        customer,
        proposal
      })
      const exportResult = await window.fwApp.exportProposalPdf({
        defaultName: defaultFileName(chambers, proposal),
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

    setIsBusy(true)
    setStatusMessage('Формирую PDF с видами...')

    try {
      const pdfChambers: ProposalPdfChamber[] = proposalResult.chambers.map((chamber) => {
        let side3dImageDataUrl = ''

        try {
          side3dImageDataUrl = renderChamber3DToDataUrl(chamber.input, 1700, 1700)
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
        defaultName: `${defaultFileName(chambers, proposal)}_виды`,
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
            <strong>{company.brandName || 'FrozenWest КП'}</strong>
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
          <button className="ghost-button" type="button" disabled={isBusy} onClick={handlePrintViewsPdf}>
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

          <div className="chamber-tabs" role="tablist" aria-label="Камеры в КП">
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
                    aria-label="Удалить камеру"
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
            <button type="button" className="chamber-tab add" onClick={addChamber} title="Добавить камеру">
              <Plus size={15} /> Камера
            </button>
          </div>

          <FormCard
            title="Камера"
            action={
              <button className="link-button" type="button" onClick={() => duplicateChamber(activeId)}>
                <Copy size={14} /> Дублировать
              </button>
            }
          >
            <label>
              Название камеры (необязательно)
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
                <p className="optimizer-note">Стеновые пролёты кратны рабочей ширине 1190 мм. Пол и потолок здесь не учитываются.</p>
              )}
            </div>
          </FormCard>

          <FormCard title="Панели">
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

          <FormCard title="Монтаж камеры">
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
              Продаётся вместе с камерой
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
                  {equipmentImages[activeChamber.id] ? 'Заменить фото' : 'Выбрать фото'}
                  <input
                    disabled={!activeChamber.equipmentEnabled}
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleEquipmentImageChange(event.target.files)}
                  />
                </label>
                {activeChamber.equipmentImageName ? (
                  <span className="file-name" title={activeChamber.equipmentImageName}>
                    {activeChamber.equipmentImageName}
                  </span>
                ) : (
                  <span className="file-name muted">Файл не выбран</span>
                )}
                {equipmentImages[activeChamber.id] ? (
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Убрать фото"
                    onClick={() => handleEquipmentImageChange(null)}
                  >
                    <Trash2 size={15} />
                  </button>
                ) : null}
              </div>
              {equipmentImages[activeChamber.id] ? (
                <img className="equipment-preview" src={equipmentImages[activeChamber.id]} alt="Превью оборудования" />
              ) : null}
            </div>
          </FormCard>

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

          <FormCard title="Примечание">
            <textarea
              className="proposal-note-input"
              placeholder="Введите примечание, которое будет добавлено в конец КП"
              value={proposal.note}
              onChange={(event) => updateProposal('note', event.target.value)}
            />
          </FormCard>

          <FormCard title="Вид КП">
            <div className="segmented-control" role="group" aria-label="Режим коммерческого предложения">
              <button
                className={options.proposalMode === 'detailed' ? 'active' : ''}
                type="button"
                onClick={() => updateOptions('proposalMode', 'detailed')}
              >
                Подробное
              </button>
              <button
                className={options.proposalMode === 'compact' ? 'active' : ''}
                type="button"
                onClick={() => updateOptions('proposalMode', 'compact')}
              >
                Краткое
              </button>
            </div>
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
            <div className="drawings">
              <div className="drawing-card">
                <div className="card-heading">
                  <h3>3D-вид</h3>
                  <span>
                    {activeResult.panelFillingLabel} {activeChamber.thicknessMm} мм
                  </span>
                </div>
                <Chamber3DView input={activeChamber} />
              </div>
              <div className="drawing-card">
                <div className="card-heading">
                  <h3>Вид сверху</h3>
                  <span>{activeChamber.hasPanelFloor ? 'с полом' : 'без пола'}</span>
                </div>
                <TopView input={activeChamber} result={activeResult} />
              </div>
            </div>

            <p className="result-door-note">{DOOR_INSTALLATION_NOTE}</p>

            <div className="totals-strip">
              <div className="total-chip">
                <span>Панели (продажа)</span>
                <strong>{formatNumber(activeResult.panelAreaSoldM2)} м²</strong>
              </div>
              <div className="total-chip">
                <span>Камера</span>
                <strong>{formatMoney(activeResult.panelCost)}</strong>
              </div>
              <div className="total-chip">
                <span>Комплектующие</span>
                <strong>{formatMoney(activeResult.accessoryCost)}</strong>
              </div>
              <div className="total-chip">
                <span>Дверь</span>
                <strong>{formatMoney(activeResult.doorCost + activeResult.doorMountingCost)}</strong>
              </div>
              <div className="total-chip">
                <span>Итого по камере</span>
                <strong>{formatMoney(activeResult.chamberSubtotal)}</strong>
              </div>
              <div className="total-chip accent">
                <span>Итого по КП</span>
                <strong>{formatMoney(proposalResult.total)}</strong>
              </div>
            </div>

            <div className="result-card">
              <div className="card-heading">
                <h3>
                  {options.proposalMode === 'compact' ? 'Краткое КП' : 'Материалы и работы'} ·{' '}
                  {getChamberTitle(activeChamber)}
                </h3>
                <span>{activeChamber.quantity > 1 ? `${activeChamber.quantity} шт` : '1 шт'}</span>
              </div>
              <div className="table-wrap">
                <table className="material-table">
                  <thead>
                    <tr>
                      <th>Позиция</th>
                      <th>Ед.</th>
                      <th>На камеру</th>
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
                <h3>{chambers.length > 1 ? 'Сводная смета по КП' : 'Смета'}</h3>
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
