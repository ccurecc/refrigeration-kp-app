export const PANEL_WORKING_WIDTH_MM = 1190
export const PANEL_NOMINAL_WIDTH_MM = 1200
export const PROFILE_UNIT_LENGTH_M = 2

export type PanelThickness = 50 | 60 | 80 | 100 | 120
export type PanelFilling = 'PIR' | 'PUR' | 'PPS' | 'custom'
export type ProposalMode = 'detailed' | 'compact'
export type ProposalSubject = 'chambers' | 'equipment-only'
export type DoorType = 'single' | 'double' | 'sliding'
export type SlideSide = 'left' | 'right'
export type DoorWall = 'front' | 'right' | 'back' | 'left'
export type DimensionCorner = 'front-left' | 'front-right' | 'back-left' | 'back-right'
export type CameraView =
  | 'front-left'
  | 'front-right'
  | 'right-left'
  | 'right-right'
  | 'back-left'
  | 'back-right'
  | 'left-left'
  | 'left-right'
export type FrontDimensionSide = 'front' | 'back'
export type DepthDimensionSide = 'left' | 'right'
export type DoorWidthDimensionSide = 'above' | 'below'
export type DoorHeightDimensionSide = 'left' | 'right'
export type FloorCutLabelSide = 'front' | 'back'

export interface Chamber3DSettings {
  cameraView: CameraView
  cameraDistancePercent: number
  dimensionLabelSizePercent: number
  cutLabelSizePercent: number
  frontDimensionSide: FrontDimensionSide
  frontDimensionVisible: boolean
  depthDimensionSide: DepthDimensionSide
  depthDimensionVisible: boolean
  heightDimensionCorner: DimensionCorner
  heightDimensionVisible: boolean
  doorWidthDimensionSide: DoorWidthDimensionSide
  doorWidthDimensionVisible: boolean
  doorHeightDimensionSide: DoorHeightDimensionSide
  doorHeightDimensionVisible: boolean
  floorCutLabelSide: FloorCutLabelSide
  floorCutLabelDistancePercent: number
  floorCutDimensionVisible: boolean
}

export const defaultChamber3DSettings: Chamber3DSettings = {
  cameraView: 'front-right',
  cameraDistancePercent: 100,
  dimensionLabelSizePercent: 100,
  cutLabelSizePercent: 100,
  frontDimensionSide: 'front',
  frontDimensionVisible: true,
  depthDimensionSide: 'right',
  depthDimensionVisible: true,
  heightDimensionCorner: 'front-right',
  heightDimensionVisible: true,
  doorWidthDimensionSide: 'above',
  doorWidthDimensionVisible: true,
  doorHeightDimensionSide: 'right',
  doorHeightDimensionVisible: true,
  floorCutLabelSide: 'front',
  floorCutLabelDistancePercent: 100,
  floorCutDimensionVisible: true
}

export const doorTypeLabels: Record<DoorType, string> = {
  single: 'распашная одностворчатая',
  double: 'распашная двустворчатая',
  sliding: 'откатная'
}

export interface EstimateExtraRow {
  id: string
  name: string
  amount: number
}

/** A single chamber configuration. A КП can contain several of these. */
export interface ChamberInput {
  id: string
  title: string
  lengthMm: number
  widthMm: number
  heightMm: number
  quantity: number
  thicknessMm: PanelThickness
  panelFilling: PanelFilling
  customPanelFilling: string
  hasPanelFloor: boolean
  doorName: string
  doorType: DoorType
  doorSlideSide: SlideSide
  doorHasThreshold: boolean
  doorWidthMm: number
  doorHeightMm: number
  doorWall: DoorWall
  doorOffsetMm: number
  view3d: Chamber3DSettings
  doorPrice: number
  doorMountingPrice: number
  equipmentEnabled: boolean
  equipmentName: string
  equipmentPrice: number
  equipmentMountingPrice: number
  equipmentImageName: string
  equipmentImageSizePercent: number
  panelPricePerM2: number
  mountingWallPricePerM2: number
  mountingFloorPricePerM2: number
  mountingCeilingPricePerM2: number
}

export interface EquipmentOnlyItem {
  id: string
  name: string
  quantity: number
  price: number
  mountingPrice: number
  imageName: string
  imageSizePercent: number
}

/** КП-level options shared across all chambers. */
export interface ProposalOptions {
  proposalSubject: ProposalSubject
  proposalMode: ProposalMode
  vatEnabled: boolean
  vatRatePercent: number
  extraEstimateRows: EstimateExtraRow[]
}

export interface MaterialRow {
  id: string
  name: string
  unit: string
  amountPerChamber: number
  amountTotal: number
  unitPrice: number
  sum: number
  note: string
}

export interface CostRow {
  id: string
  name: string
  amount: number
  kind?: 'chamber' | 'equipment' | 'extra' | 'subtotal' | 'vat' | 'total'
}

export interface PanelGroup {
  id: string
  kind: 'wall' | 'ceiling' | 'floor'
  title: string
  typeSize: string
  panelLengthMm: number
  countPerChamber: number
  countTotal: number
  areaPerChamberM2: number
  areaTotalM2: number
}

export interface CalculationPricing {
  internalAnglePricePerM: number
  floorChannelPricePerM: number
  doorChannelPricePerM: number
  externalVerticalAnglePricePerM: number
  externalCeilingAnglePricePerM: number
  foamName: string
  foamNormPerM2: number
  foamPricePerUnit: number
  sealantName: string
  sealantNormPerM2: number
  sealantPricePerUnit: number
  screwsName: string
  screwsNormPerM2: number
  screwsPricePerUnit: number
}

/** Result for one chamber (без НДС — НДС считается на уровне КП). */
export interface ChamberResult {
  // Exact (installed) surface areas — for consumables norms and metrics.
  wallAreaM2: number
  floorAreaM2: number
  ceilingAreaM2: number
  panelAreaExactM2: number
  panelAreaSoldM2: number
  panelGroups: PanelGroup[]
  wallPanelCount: number
  ceilingPanelCount: number
  floorPanelCount: number
  internalAngleMeters: number
  internalAnglePieces: number
  floorChannelMeters: number
  floorChannelPieces: number
  doorChannelMeters: number
  doorChannelPieces: number
  externalVerticalAngleMeters: number
  externalVerticalAnglePieces: number
  externalCeilingAngleMeters: number
  externalCeilingAnglePieces: number
  longSideMm: number
  shortSideMm: number
  ceilingStripCount: number
  ceilingRemainderMm: number
  accessoryCost: number
  panelFillingLabel: string
  chamberSummary: string
  panelCost: number
  chamberMountingCost: number
  doorCost: number
  doorMountingCost: number
  equipmentCost: number
  equipmentMountingCost: number
  /** Сумма по этой камере (× количество), без НДС. */
  chamberSubtotal: number
  materialRows: MaterialRow[]
  compactRows: MaterialRow[]
}

export interface ProposalChamber {
  input: ChamberInput
  title: string
  result: ChamberResult
}

export interface ProposalEquipmentItem {
  input: EquipmentOnlyItem
  title: string
  rows: MaterialRow[]
  subtotal: number
}

export interface ProposalResult {
  chambers: ProposalChamber[]
  equipmentItems: ProposalEquipmentItem[]
  summaryRows: CostRow[]
  costRows: CostRow[]
  chambersSubtotal: number
  equipmentSubtotal: number
  extraRows: EstimateExtraRow[]
  extraRowsTotal: number
  subtotal: number
  vatEnabled: boolean
  vatRatePercent: number
  vatAmount: number
  total: number
}

const round2 = (value: number): number => Math.round(value * 100) / 100
const mmToM = (value: number): number => value / 1000
const toM2 = (value: number): number => value / 1_000_000
const ceilToUnit = (meters: number): number => Math.max(0, Math.ceil(round2(meters) / PROFILE_UNIT_LENGTH_M))
// Money is kept to kopecks (2 decimals) to match the sample КП precision.
const money = (value: number): number => Math.round(value * 100) / 100
const panelsAcross = (spanMm: number): number => Math.max(1, Math.ceil(Math.max(spanMm, 1) / PANEL_WORKING_WIDTH_MM))
const workingWidthM = PANEL_WORKING_WIDTH_MM / 1000

const defaultPricing: CalculationPricing = {
  internalAnglePricePerM: 0,
  floorChannelPricePerM: 0,
  doorChannelPricePerM: 0,
  externalVerticalAnglePricePerM: 0,
  externalCeilingAnglePricePerM: 0,
  foamName: 'Пена монтажная',
  foamNormPerM2: 0,
  foamPricePerUnit: 0,
  sealantName: 'Герметик',
  sealantNormPerM2: 0,
  sealantPricePerUnit: 0,
  screwsName: 'Саморезы',
  screwsNormPerM2: 0,
  screwsPricePerUnit: 0
}

export function getPanelFillingLabel(input: Pick<ChamberInput, 'panelFilling' | 'customPanelFilling'>): string {
  if (input.panelFilling === 'custom') {
    return input.customPanelFilling.trim() || 'Другой'
  }

  return input.panelFilling
}

export function getDoorDescription(
  input: Pick<ChamberInput, 'doorName' | 'doorWidthMm' | 'doorHeightMm' | 'doorHasThreshold' | 'doorType'>
): string {
  const doorName = input.doorName.trim() || 'Дверь'
  const doorSize = `${input.doorWidthMm}x${input.doorHeightMm}`
  const sizeAlreadyIncluded = doorName.replace(/\s/g, '').includes(doorSize)
  const thresholdAlreadyMentioned = /порог/i.test(doorName)
  const thresholdLabel = input.doorHasThreshold ? 'с порогом' : 'без порога'

  const typeLabel = doorTypeLabels[input.doorType ?? 'single']
  const typeAlreadyMentioned =
    /створ|распашн|откатн|раздвижн/i.test(doorName) || doorName.toLowerCase().includes(typeLabel.toLowerCase())

  let result = doorName
  if (!typeAlreadyMentioned) {
    result = `${result}, ${typeLabel}`
  }
  if (!sizeAlreadyIncluded) {
    result = `${result} ${doorSize}`
  }
  if (!thresholdAlreadyMentioned) {
    result = `${result} ${thresholdLabel}`
  }

  return result
}

/** Default chamber title from its dimensions, used when the user left it blank. */
export function getChamberTitle(input: ChamberInput): string {
  const longSideMm = Math.max(input.lengthMm, input.widthMm)
  const shortSideMm = Math.min(input.lengthMm, input.widthMm)
  return input.title.trim() || `Камера ${longSideMm}×${shortSideMm}×${input.heightMm}`
}

export function getEquipmentOnlyTitle(input: EquipmentOnlyItem): string {
  return input.name.trim() || 'Холодильное оборудование'
}

export function calculateChamber(input: ChamberInput, pricing: CalculationPricing = defaultPricing): ChamberResult {
  const quantity = Math.max(1, Math.round(input.quantity))
  const thicknessMm = input.thicknessMm
  const heightM = mmToM(input.heightMm)
  const panelFillingLabel = getPanelFillingLabel(input)
  const panelPrice = input.panelPricePerM2

  // FrozenWest convention: "длина" is the longer plan side (strips run across it),
  // "ширина" is the shorter side (= ceiling panel length, laid "по узкой части").
  const longSideMm = Math.max(input.lengthMm, input.widthMm)
  const shortSideMm = Math.min(input.lengthMm, input.widthMm)
  const perimeterM = 2 * (mmToM(longSideMm) + mmToM(shortSideMm))
  const innerLongSideMm = Math.max(0, longSideMm - 2 * thicknessMm)
  const innerShortSideMm = Math.max(0, shortSideMm - 2 * thicknessMm)
  const wallPanelLenMm = Math.max(0, input.heightMm - thicknessMm)
  const longWallSpanMm = longSideMm
  const shortWallSpanMm = Math.max(0, shortSideMm - 2 * thicknessMm)

  // --- Exact (installed) surface areas — for consumables norms and metrics ---
  const wallAreaM2 = toM2(2 * (longWallSpanMm + shortWallSpanMm) * wallPanelLenMm)
  const floorAreaM2 = input.hasPanelFloor ? toM2(innerLongSideMm * innerShortSideMm) : 0
  const ceilingAreaM2 = toM2(longSideMm * shortSideMm)
  const panelAreaExactM2 = wallAreaM2 + floorAreaM2 + ceilingAreaM2

  // --- Whole sold panels, grouped by type-size (priced by 1190 working width) ---
  // Walls: long walls cover the full outside length; short end walls sit between them.
  const longWallPanels = panelsAcross(longWallSpanMm)
  const shortWallPanels = panelsAcross(shortWallSpanMm)
  const wallPanelCount = 2 * longWallPanels + 2 * shortWallPanels

  // Ceiling: strips along the narrow side, count covers the long side.
  const ceilingStripCount = panelsAcross(longSideMm)
  const ceilingRemainderMm = longSideMm - (ceilingStripCount - 1) * PANEL_WORKING_WIDTH_MM
  const ceilingPanelLenMm = shortSideMm
  const ceilingPanelCount = ceilingStripCount

  // Floor panels are laid after the walls, between them. Both plan dimensions
  // are therefore the inner clear size: outer size minus two panel thicknesses.
  const floorPanelLenMm = innerShortSideMm
  const floorPanelCount = input.hasPanelFloor ? panelsAcross(innerLongSideMm) : 0

  const wallAreaPerChamber = wallPanelCount * workingWidthM * mmToM(wallPanelLenMm)
  const ceilingAreaPerChamber = ceilingPanelCount * workingWidthM * mmToM(ceilingPanelLenMm)
  const floorAreaPerChamber = floorPanelCount * workingWidthM * mmToM(floorPanelLenMm)
  const panelAreaSoldM2 = (wallAreaPerChamber + ceilingAreaPerChamber + floorAreaPerChamber) * quantity

  const panelLabel = (lenMm: number, zone: string): string =>
    `Панели ${panelFillingLabel} ${thicknessMm}мм ${PANEL_WORKING_WIDTH_MM}x${lenMm} (${zone})`

  const panelGroups: PanelGroup[] = [
    {
      id: 'wall-panels',
      kind: 'wall',
      title: panelLabel(wallPanelLenMm, 'стены'),
      typeSize: `${PANEL_WORKING_WIDTH_MM}x${wallPanelLenMm}`,
      panelLengthMm: wallPanelLenMm,
      countPerChamber: wallPanelCount,
      countTotal: wallPanelCount * quantity,
      areaPerChamberM2: round2(wallAreaPerChamber),
      areaTotalM2: round2(wallAreaPerChamber * quantity)
    },
    {
      id: 'ceiling-panels',
      kind: 'ceiling',
      title: panelLabel(ceilingPanelLenMm, 'потолок'),
      typeSize: `${PANEL_WORKING_WIDTH_MM}x${ceilingPanelLenMm}`,
      panelLengthMm: ceilingPanelLenMm,
      countPerChamber: ceilingPanelCount,
      countTotal: ceilingPanelCount * quantity,
      areaPerChamberM2: round2(ceilingAreaPerChamber),
      areaTotalM2: round2(ceilingAreaPerChamber * quantity)
    }
  ]

  if (input.hasPanelFloor) {
    panelGroups.push({
      id: 'floor-panels',
      kind: 'floor',
      title: panelLabel(floorPanelLenMm, 'пол'),
      typeSize: `${PANEL_WORKING_WIDTH_MM}x${floorPanelLenMm}`,
      panelLengthMm: floorPanelLenMm,
      countPerChamber: floorPanelCount,
      countTotal: floorPanelCount * quantity,
      areaPerChamberM2: round2(floorAreaPerChamber),
      areaTotalM2: round2(floorAreaPerChamber * quantity)
    })
  }

  // --- Profiles: linear meters per the mounting scheme, sold as 2 m pieces ---
  const internalAngleMeters = perimeterM * 2 + heightM * 4
  const floorChannelMeters = perimeterM
  const doorChannelMeters = 2 * (mmToM(input.doorWidthMm) + mmToM(input.doorHeightMm))
  const externalVerticalAngleMeters = heightM * 4
  const externalCeilingAngleMeters = perimeterM

  const internalAnglePieces = ceilToUnit(internalAngleMeters)
  const floorChannelPieces = ceilToUnit(floorChannelMeters)
  const doorChannelPieces = ceilToUnit(doorChannelMeters)
  const externalVerticalAnglePieces = ceilToUnit(externalVerticalAngleMeters)
  const externalCeilingAnglePieces = ceilToUnit(externalCeilingAngleMeters)

  // --- Consumables (by norm per m² of installed surface) ---
  const foamUnits = Math.ceil(panelAreaExactM2 * pricing.foamNormPerM2)
  const sealantUnits = Math.ceil(panelAreaExactM2 * pricing.sealantNormPerM2)
  const screwsUnits = Math.ceil(panelAreaExactM2 * pricing.screwsNormPerM2)

  const chamberSummary = `Камера холодильная ${longSideMm}x${shortSideMm}x${input.heightMm} ${
    input.hasPanelFloor ? 'с полом' : 'без пола'
  } (${panelFillingLabel} ${thicknessMm})`

  // --- Per-line money (sum already × quantity, kept to kopecks) ---
  const wallPanelSum = money(wallAreaPerChamber * quantity * panelPrice)
  const ceilingPanelSum = money(ceilingAreaPerChamber * quantity * panelPrice)
  const floorPanelSum = money(floorAreaPerChamber * quantity * panelPrice)
  const panelCost = money(wallPanelSum + ceilingPanelSum + floorPanelSum)

  const internalAngleSum = money(internalAnglePieces * PROFILE_UNIT_LENGTH_M * quantity * pricing.internalAnglePricePerM)
  const floorChannelSum = money(floorChannelPieces * PROFILE_UNIT_LENGTH_M * quantity * pricing.floorChannelPricePerM)
  const doorChannelSum = money(doorChannelPieces * PROFILE_UNIT_LENGTH_M * quantity * pricing.doorChannelPricePerM)
  const externalVerticalSum = money(
    externalVerticalAnglePieces * PROFILE_UNIT_LENGTH_M * quantity * pricing.externalVerticalAnglePricePerM
  )
  const externalCeilingSum = money(
    externalCeilingAnglePieces * PROFILE_UNIT_LENGTH_M * quantity * pricing.externalCeilingAnglePricePerM
  )
  const foamSum = money(foamUnits * quantity * pricing.foamPricePerUnit)
  const sealantSum = money(sealantUnits * quantity * pricing.sealantPricePerUnit)
  const screwsSum = money(screwsUnits * quantity * pricing.screwsPricePerUnit)

  const accessoryCost = money(
    internalAngleSum +
      floorChannelSum +
      doorChannelSum +
      externalVerticalSum +
      externalCeilingSum +
      foamSum +
      sealantSum +
      screwsSum
  )

  const chamberMountingCost = money(
    (wallAreaM2 * input.mountingWallPricePerM2 +
      floorAreaM2 * input.mountingFloorPricePerM2 +
      ceilingAreaM2 * input.mountingCeilingPricePerM2) *
      quantity
  )
  const doorCost = money(input.doorPrice * quantity)
  const doorMountingCost = money(input.doorMountingPrice * quantity)
  const equipmentCost = input.equipmentEnabled ? money(input.equipmentPrice * quantity) : 0
  const equipmentMountingCost = input.equipmentEnabled ? money(input.equipmentMountingPrice * quantity) : 0

  const chamberSubtotal = money(
    panelCost +
      accessoryCost +
      chamberMountingCost +
      doorCost +
      doorMountingCost +
      equipmentCost +
      equipmentMountingCost
  )

  const doorDescription = getDoorDescription(input)

  const panelRow = (group: PanelGroup, sum: number): MaterialRow => {
    const notePrefix = group.kind === 'floor' ? 'пол между стенами; ' : group.kind === 'ceiling' ? 'потолок на стенах; ' : ''

    return {
      id: group.id,
      name: group.title,
      unit: 'м²',
      amountPerChamber: group.areaPerChamberM2,
      amountTotal: group.areaTotalM2,
      unitPrice: panelPrice,
      sum,
      note: `${notePrefix}${group.countPerChamber} шт по ${group.panelLengthMm} мм на камеру`
    }
  }

  const profileRow = (
    id: string,
    name: string,
    pieces: number,
    pricePerM: number,
    sum: number,
    rawMeters: number
  ): MaterialRow => ({
    id,
    name,
    unit: 'м',
    amountPerChamber: pieces * PROFILE_UNIT_LENGTH_M,
    amountTotal: pieces * PROFILE_UNIT_LENGTH_M * quantity,
    unitPrice: pricePerM,
    sum,
    note: `${pieces} шт по 2 м · расчёт ${round2(rawMeters)} м`
  })

  const materialRows: MaterialRow[] = [
    panelRow(panelGroups[0], wallPanelSum),
    panelRow(panelGroups[1], ceilingPanelSum)
  ]

  if (input.hasPanelFloor) {
    materialRows.push(panelRow(panelGroups[2], floorPanelSum))
  }

  materialRows.push(
    profileRow(
      'floor-channel',
      `Швеллер под панель ${thicknessMm + 3} мм (пол)`,
      floorChannelPieces,
      pricing.floorChannelPricePerM,
      floorChannelSum,
      floorChannelMeters
    ),
    profileRow(
      'door-channel',
      'Швеллер дверного проёма',
      doorChannelPieces,
      pricing.doorChannelPricePerM,
      doorChannelSum,
      doorChannelMeters
    ),
    profileRow(
      'internal-angle',
      'Внутренний угол 40x40',
      internalAnglePieces,
      pricing.internalAnglePricePerM,
      internalAngleSum,
      internalAngleMeters
    ),
    profileRow(
      'external-vertical-angle',
      `Наружный вертикальный угол ${40 + thicknessMm}x${40 + thicknessMm}`,
      externalVerticalAnglePieces,
      pricing.externalVerticalAnglePricePerM,
      externalVerticalSum,
      externalVerticalAngleMeters
    ),
    profileRow(
      'external-ceiling-angle',
      `Наружный потолочный угол 40x${40 + thicknessMm}`,
      externalCeilingAnglePieces,
      pricing.externalCeilingAnglePricePerM,
      externalCeilingSum,
      externalCeilingAngleMeters
    )
  )

  if (pricing.foamNormPerM2 > 0) {
    materialRows.push({
      id: 'foam',
      name: pricing.foamName || 'Пена монтажная',
      unit: 'шт',
      amountPerChamber: foamUnits,
      amountTotal: foamUnits * quantity,
      unitPrice: pricing.foamPricePerUnit,
      sum: foamSum,
      note: `Норма ${pricing.foamNormPerM2} на м²`
    })
  }

  if (pricing.sealantNormPerM2 > 0) {
    materialRows.push({
      id: 'sealant',
      name: pricing.sealantName || 'Герметик',
      unit: 'шт',
      amountPerChamber: sealantUnits,
      amountTotal: sealantUnits * quantity,
      unitPrice: pricing.sealantPricePerUnit,
      sum: sealantSum,
      note: `Норма ${pricing.sealantNormPerM2} на м²`
    })
  }

  if (pricing.screwsNormPerM2 > 0) {
    materialRows.push({
      id: 'screws',
      name: pricing.screwsName || 'Саморезы',
      unit: 'шт',
      amountPerChamber: screwsUnits,
      amountTotal: screwsUnits * quantity,
      unitPrice: pricing.screwsPricePerUnit,
      sum: screwsSum,
      note: `Норма ${pricing.screwsNormPerM2} на м²`
    })
  }

  if (chamberMountingCost > 0) {
    materialRows.push({
      id: 'chamber-mounting',
      name: 'Монтаж камеры',
      unit: 'м²',
      amountPerChamber: round2(wallAreaM2 + floorAreaM2 + ceilingAreaM2),
      amountTotal: round2((wallAreaM2 + floorAreaM2 + ceilingAreaM2) * quantity),
      unitPrice: 0,
      sum: chamberMountingCost,
      note: 'Стены, пол, потолок'
    })
  }

  materialRows.push({
    id: 'door',
    name: doorDescription,
    unit: 'компл.',
    amountPerChamber: 1,
    amountTotal: quantity,
    unitPrice: money(input.doorPrice + input.doorMountingPrice),
    sum: money((input.doorPrice + input.doorMountingPrice) * quantity),
    note: input.doorMountingPrice > 0 ? 'Дверь с монтажом' : 'Дверь'
  })

  if (input.equipmentEnabled) {
    materialRows.push({
      id: 'equipment',
      name: input.equipmentName || 'Холодильное оборудование',
      unit: 'компл.',
      amountPerChamber: 1,
      amountTotal: quantity,
      unitPrice: money(input.equipmentPrice + input.equipmentMountingPrice),
      sum: money((input.equipmentPrice + input.equipmentMountingPrice) * quantity),
      note: 'Оборудование с монтажом и расходниками'
    })
  }

  const chamberLineSum = money(panelCost + accessoryCost + chamberMountingCost)
  const doorLineSum = money(doorCost + doorMountingCost)
  const equipmentLineSum = money(equipmentCost + equipmentMountingCost)

  const compactRows: MaterialRow[] = [
    {
      id: 'compact-chamber',
      name: chamberSummary,
      unit: 'компл.',
      amountPerChamber: 1,
      amountTotal: quantity,
      unitPrice: money(chamberLineSum / quantity),
      sum: chamberLineSum,
      note: 'Панели, профили, расходники и монтаж камеры'
    },
    {
      id: 'compact-door',
      name: doorDescription,
      unit: 'шт',
      amountPerChamber: 1,
      amountTotal: quantity,
      unitPrice: money(doorLineSum / quantity),
      sum: doorLineSum,
      note: 'Дверь с монтажом, проём из стен не вычитается'
    }
  ]

  if (input.equipmentEnabled) {
    compactRows.push({
      id: 'compact-equipment',
      name: input.equipmentName || 'Холодильное оборудование',
      unit: 'компл.',
      amountPerChamber: 1,
      amountTotal: quantity,
      unitPrice: money(equipmentLineSum / quantity),
      sum: equipmentLineSum,
      note: input.equipmentImageName ? `Фото: ${input.equipmentImageName}` : 'Оборудование с монтажом и расходниками'
    })
  }

  return {
    wallAreaM2: round2(wallAreaM2),
    floorAreaM2: round2(floorAreaM2),
    ceilingAreaM2: round2(ceilingAreaM2),
    panelAreaExactM2: round2(panelAreaExactM2),
    panelAreaSoldM2: round2(panelAreaSoldM2),
    panelGroups,
    wallPanelCount,
    ceilingPanelCount,
    floorPanelCount,
    internalAngleMeters: round2(internalAngleMeters),
    internalAnglePieces,
    floorChannelMeters: round2(floorChannelMeters),
    floorChannelPieces,
    doorChannelMeters: round2(doorChannelMeters),
    doorChannelPieces,
    externalVerticalAngleMeters: round2(externalVerticalAngleMeters),
    externalVerticalAnglePieces,
    externalCeilingAngleMeters: round2(externalCeilingAngleMeters),
    externalCeilingAnglePieces,
    longSideMm,
    shortSideMm,
    ceilingStripCount,
    ceilingRemainderMm: Math.round(ceilingRemainderMm),
    accessoryCost,
    panelFillingLabel,
    chamberSummary,
    panelCost,
    chamberMountingCost,
    doorCost,
    doorMountingCost,
    equipmentCost,
    equipmentMountingCost,
    chamberSubtotal,
    materialRows,
    compactRows
  }
}

export function calculateEquipmentOnlyItem(input: EquipmentOnlyItem): ProposalEquipmentItem {
  const quantity = Math.max(1, Math.round(input.quantity))
  const title = getEquipmentOnlyTitle(input)
  const unitPrice = money(input.price + input.mountingPrice)
  const subtotal = money(unitPrice * quantity)
  const rows: MaterialRow[] = [
    {
      id: `equipment-${input.id}`,
      name: title,
      unit: 'компл.',
      amountPerChamber: 1,
      amountTotal: quantity,
      unitPrice,
      sum: subtotal,
      note: input.imageName ? `Фото: ${input.imageName}` : 'Оборудование с монтажом и расходниками'
    }
  ]

  return {
    input,
    title,
    rows,
    subtotal
  }
}

/** Calculate a whole КП made of one or more chambers + shared options. */
export function calculateProposal(
  chambers: ChamberInput[],
  pricing: CalculationPricing = defaultPricing,
  options: ProposalOptions,
  equipmentOnlyItems: EquipmentOnlyItem[] = []
): ProposalResult {
  const proposalSubject = options.proposalSubject ?? 'chambers'
  const extraRows = (options.extraEstimateRows ?? []).filter((row) => row.name.trim() || row.amount)
  const extraRowsTotal = money(extraRows.reduce((acc, row) => acc + row.amount, 0))

  if (proposalSubject === 'equipment-only') {
    const computedEquipment = equipmentOnlyItems.map(calculateEquipmentOnlyItem)
    const summaryRows: CostRow[] = computedEquipment.map((item, index) => {
      const quantity = Math.max(1, Math.round(item.input.quantity))
      const qtyLabel = quantity > 1 ? ` · ${quantity} шт` : ''
      return {
        id: `equipment-${item.input.id}`,
        name: `${index + 1}. ${item.title}${qtyLabel}`,
        amount: item.subtotal,
        kind: 'equipment'
      }
    })
    const equipmentSubtotal = money(computedEquipment.reduce((acc, item) => acc + item.subtotal, 0))
    const subtotal = money(equipmentSubtotal + extraRowsTotal)
    const vatAmount = options.vatEnabled ? money((subtotal * options.vatRatePercent) / 100) : 0
    const total = money(subtotal + vatAmount)
    const costRows: CostRow[] = [...summaryRows]

    for (const row of extraRows) {
      costRows.push({
        id: `extra-${row.id}`,
        name: row.name.trim() || 'Дополнительная позиция',
        amount: money(row.amount),
        kind: 'extra'
      })
    }

    if (options.vatEnabled) {
      costRows.push(
        { id: 'subtotal', name: 'Итого без НДС', amount: subtotal, kind: 'subtotal' },
        { id: 'vat', name: `НДС ${options.vatRatePercent}%`, amount: vatAmount, kind: 'vat' }
      )
    } else {
      costRows.push({ id: 'vat', name: 'НДС не облагается', amount: 0, kind: 'vat' })
    }

    costRows.push({ id: 'total', name: 'Итого к оплате', amount: total, kind: 'total' })

    return {
      chambers: [],
      equipmentItems: computedEquipment,
      summaryRows,
      costRows,
      chambersSubtotal: 0,
      equipmentSubtotal,
      extraRows,
      extraRowsTotal,
      subtotal,
      vatEnabled: options.vatEnabled,
      vatRatePercent: options.vatRatePercent,
      vatAmount,
      total
    }
  }

  const computed: ProposalChamber[] = chambers.map((input) => ({
    input,
    title: getChamberTitle(input),
    result: calculateChamber(input, pricing)
  }))

  const summaryRows: CostRow[] = computed.map((chamber, index) => {
    const quantity = Math.max(1, Math.round(chamber.input.quantity))
    const qtyLabel = quantity > 1 ? ` · ${quantity} шт` : ''
    return {
      id: `chamber-${chamber.input.id}`,
      name: `${index + 1}. ${chamber.title}${qtyLabel}`,
      amount: chamber.result.chamberSubtotal,
      kind: 'chamber'
    }
  })

  const chambersSubtotal = money(computed.reduce((acc, chamber) => acc + chamber.result.chamberSubtotal, 0))

  const subtotal = money(chambersSubtotal + extraRowsTotal)
  const vatAmount = options.vatEnabled ? money((subtotal * options.vatRatePercent) / 100) : 0
  const total = money(subtotal + vatAmount)

  const costRows: CostRow[] = [...summaryRows]

  for (const row of extraRows) {
    costRows.push({ id: `extra-${row.id}`, name: row.name.trim() || 'Дополнительная позиция', amount: money(row.amount), kind: 'extra' })
  }

  if (options.vatEnabled) {
    costRows.push(
      { id: 'subtotal', name: 'Итого без НДС', amount: subtotal, kind: 'subtotal' },
      { id: 'vat', name: `НДС ${options.vatRatePercent}%`, amount: vatAmount, kind: 'vat' }
    )
  } else {
    costRows.push({ id: 'vat', name: 'НДС не облагается', amount: 0, kind: 'vat' })
  }

  costRows.push({ id: 'total', name: 'Итого к оплате', amount: total, kind: 'total' })

  return {
    chambers: computed,
    equipmentItems: [],
    summaryRows,
    costRows,
    chambersSubtotal,
    equipmentSubtotal: 0,
    extraRows,
    extraRowsTotal,
    subtotal,
    vatEnabled: options.vatEnabled,
    vatRatePercent: options.vatRatePercent,
    vatAmount,
    total
  }
}

let chamberSeq = 0
let equipmentSeq = 0
export function createChamber(partial: Partial<ChamberInput> = {}): ChamberInput {
  chamberSeq += 1
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `chamber-${Date.now()}-${chamberSeq}`
  return {
    ...defaultChamberInput,
    ...partial,
    id,
    view3d: { ...defaultChamber3DSettings, ...partial.view3d }
  }
}

export function createEquipmentOnlyItem(partial: Partial<EquipmentOnlyItem> = {}): EquipmentOnlyItem {
  equipmentSeq += 1
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `equipment-${Date.now()}-${equipmentSeq}`
  return {
    ...defaultEquipmentOnlyItem,
    ...partial,
    id
  }
}

export const defaultChamberInput: ChamberInput = {
  id: 'chamber-1',
  title: '',
  lengthMm: 10710,
  widthMm: 6000,
  heightMm: 2500,
  quantity: 1,
  thicknessMm: 100,
  panelFilling: 'PIR',
  customPanelFilling: '',
  hasPanelFloor: true,
  doorName: 'Дверь РДОП низкотемпературная',
  doorType: 'single',
  doorSlideSide: 'right',
  doorHasThreshold: true,
  doorWidthMm: 1200,
  doorHeightMm: 2000,
  doorWall: 'front',
  doorOffsetMm: 0,
  view3d: defaultChamber3DSettings,
  doorPrice: 0,
  doorMountingPrice: 0,
  equipmentEnabled: false,
  equipmentName: '',
  equipmentPrice: 0,
  equipmentMountingPrice: 0,
  equipmentImageName: '',
  equipmentImageSizePercent: 100,
  panelPricePerM2: 2768.48,
  mountingWallPricePerM2: 0,
  mountingFloorPricePerM2: 0,
  mountingCeilingPricePerM2: 0
}

export const defaultEquipmentOnlyItem: EquipmentOnlyItem = {
  id: 'equipment-1',
  name: '',
  quantity: 1,
  price: 0,
  mountingPrice: 0,
  imageName: '',
  imageSizePercent: 100
}

export const defaultProposalOptions: ProposalOptions = {
  proposalSubject: 'chambers',
  proposalMode: 'detailed',
  vatEnabled: true,
  vatRatePercent: 22,
  extraEstimateRows: []
}
