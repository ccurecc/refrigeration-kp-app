import { PANEL_WORKING_WIDTH_MM } from './calculator'

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

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

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

export function buildCenteredDoorSpan(wallSpanMm: number, requestedWidthMm: number): CenteredDoorSpan {
  const safeWallSpanMm = Math.max(wallSpanMm, 0)
  const marginMm = Math.min(450, safeWallSpanMm * 0.08)
  const maxWidthMm = Math.max(0, safeWallSpanMm - marginMm * 2)
  const minWidthMm = Math.min(250, maxWidthMm)
  const widthMm = clamp(requestedWidthMm, minWidthMm, maxWidthMm)
  const centerMm = safeWallSpanMm / 2
  const leftMm = centerMm - widthMm / 2

  return {
    centerMm,
    leftMm,
    rightMm: leftMm + widthMm,
    widthMm
  }
}
