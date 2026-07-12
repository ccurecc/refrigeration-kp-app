import { PANEL_WORKING_WIDTH_MM, type DoorWall } from './calculator'

const CUT_EPSILON_MM = 1

export interface PanelRunSegment {
  offsetMm: number
  sizeMm: number
  isCut: boolean
}

export interface PanelRun {
  panelCount: number
  fullPanelCount: number
  remainderMm: number
  hasCut: boolean
  segments: PanelRunSegment[]
}

export interface CenteredDoorSpan {
  centerMm: number
  leftMm: number
  rightMm: number
  widthMm: number
}

export interface DoorPlacementParams {
  lengthMm: number
  widthMm: number
  thicknessMm: number
  doorWidthMm: number
  doorWall?: DoorWall | string
  doorOffsetMm?: number
}

export interface DoorPlacement extends CenteredDoorSpan {
  wall: DoorWall
  wallSpanMm: number
  availableStartMm: number
  availableEndMm: number
  availableSpanMm: number
  offsetMm: number
  startDistanceMm: number
  endDistanceMm: number
}

export interface ChamberPanelRuns {
  floor: PanelRun | null
  floorSpanMm: number
  longWall: PanelRun
  shortWall: PanelRun
  shortWallSpanMm: number
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

const DOOR_WALLS: DoorWall[] = ['front', 'right', 'back', 'left']

export function isDoorWall(value: unknown): value is DoorWall {
  return typeof value === 'string' && DOOR_WALLS.includes(value as DoorWall)
}

/**
 * Resolves a door opening against the normalized plan (long side is horizontal).
 * The opening is kept clear of both corner joints by one panel thickness.
 * `doorOffsetMm` is the centre offset from the usable wall centre.
 */
export function normalizeDoorPlacement(params: DoorPlacementParams): DoorPlacement {
  const longMm = Math.max(Number.isFinite(params.lengthMm) ? params.lengthMm : 0, Number.isFinite(params.widthMm) ? params.widthMm : 0, 0)
  const shortMm = Math.max(Math.min(Number.isFinite(params.lengthMm) ? params.lengthMm : 0, Number.isFinite(params.widthMm) ? params.widthMm : 0), 0)
  const wall = isDoorWall(params.doorWall) ? params.doorWall : 'front'
  const wallSpanMm = wall === 'front' || wall === 'back' ? longMm : shortMm
  const safeThicknessMm = clamp(Number.isFinite(params.thicknessMm) ? params.thicknessMm : 0, 0, wallSpanMm / 2)
  const availableStartMm = safeThicknessMm
  const availableEndMm = Math.max(availableStartMm, wallSpanMm - safeThicknessMm)
  const availableSpanMm = Math.max(0, availableEndMm - availableStartMm)
  const requestedWidthMm = Number.isFinite(params.doorWidthMm) ? Math.max(params.doorWidthMm, 0) : 0
  const widthMm = Math.min(requestedWidthMm, availableSpanMm)
  const maxOffsetMm = Math.max(0, (availableSpanMm - widthMm) / 2)
  const requestedOffsetMm = Number.isFinite(params.doorOffsetMm) ? (params.doorOffsetMm ?? 0) : 0
  const offsetMm = clamp(requestedOffsetMm, -maxOffsetMm, maxOffsetMm)
  const centerMm = wallSpanMm / 2 + offsetMm
  const leftMm = centerMm - widthMm / 2
  const rightMm = centerMm + widthMm / 2

  return {
    wall,
    wallSpanMm,
    availableStartMm,
    availableEndMm,
    availableSpanMm,
    centerMm,
    leftMm,
    rightMm,
    widthMm,
    offsetMm,
    startDistanceMm: leftMm,
    endDistanceMm: Math.max(0, wallSpanMm - rightMm)
  }
}

export function buildPanelRun(spanMm: number): PanelRun {
  const safeSpanMm = Math.max(spanMm, 0)
  const panelCount = Math.max(1, Math.ceil(Math.max(safeSpanMm, 1) / PANEL_WORKING_WIDTH_MM))
  const fullPanelCount = Math.max(0, panelCount - 1)
  const remainderMm = Math.max(0, safeSpanMm - fullPanelCount * PANEL_WORKING_WIDTH_MM)
  const hasCut = remainderMm > CUT_EPSILON_MM && remainderMm < PANEL_WORKING_WIDTH_MM - CUT_EPSILON_MM
  const segments: PanelRunSegment[] = []

  for (let index = 0; index < panelCount; index += 1) {
    const offsetMm = index * PANEL_WORKING_WIDTH_MM
    const sizeMm = index === panelCount - 1 ? remainderMm : Math.min(PANEL_WORKING_WIDTH_MM, safeSpanMm - offsetMm)

    if (sizeMm > 0) {
      segments.push({
        offsetMm,
        sizeMm,
        isCut: index === panelCount - 1 && hasCut
      })
    }
  }

  return { panelCount, fullPanelCount, remainderMm, hasCut, segments }
}

export function buildChamberPanelRuns(
  longMm: number,
  shortMm: number,
  thicknessMm: number,
  hasPanelFloor: boolean
): ChamberPanelRuns {
  const floorSpanMm = Math.max(0, longMm - 2 * thicknessMm)
  const shortWallSpanMm = Math.max(0, shortMm - 2 * thicknessMm)

  return {
    floor: hasPanelFloor ? buildPanelRun(floorSpanMm) : null,
    floorSpanMm,
    longWall: buildPanelRun(longMm),
    shortWall: buildPanelRun(shortWallSpanMm),
    shortWallSpanMm
  }
}
