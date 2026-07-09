import { PANEL_WORKING_WIDTH_MM } from './calculator'

export interface SizeOption {
  id: string
  axis: 'length' | 'width' | 'both'
  direction: 'down' | 'up' | 'mixed'
  lengthMm: number
  widthMm: number
  deltaMm: number
  strips: number
  label: string
  note: string
}

export interface OptimizationReport {
  longSideMm: number
  shortSideMm: number
  longWallCut: boolean
  shortWallCut: boolean
  longWallRemainderMm: number
  shortWallRemainderMm: number
  hasCut: boolean
  options: SizeOption[]
}

const W = PANEL_WORKING_WIDTH_MM
const stripsAcross = (spanMm: number): number => Math.max(1, Math.ceil(Math.max(spanMm, 1) / W))
const snapDown = (spanMm: number): number => Math.max(W, Math.floor((spanMm - 1) / W) * W)
const snapUp = (spanMm: number): number => Math.ceil((spanMm + 1) / W) * W
const remainder = (spanMm: number): number => Math.round(spanMm - (stripsAcross(spanMm) - 1) * W)
const isCut = (spanMm: number): boolean => {
  const r = remainder(spanMm)
  return r > 0 && r < W
}

/**
 * Wall optimization follows the wall layout used by the top view:
 *  - long walls cover the full outside long side;
 *  - short end walls sit inside, between long walls: short side − 2 × panel thickness.
 *
 * Floor and ceiling cuts are intentionally ignored here. If both wall axes have cuts,
 * each option changes both dimensions at once, so applying any option leaves the walls
 * on whole 1190 mm panel steps.
 */
export function buildOptimizationReport(lengthMm: number, widthMm: number, thicknessMm: number): OptimizationReport {
  const longIsLength = lengthMm >= widthMm
  const longSideMm = Math.max(lengthMm, widthMm)
  const shortSideMm = Math.min(lengthMm, widthMm)
  const longWallSpanMm = Math.max(1, longSideMm)
  const shortWallSpanMm = Math.max(1, shortSideMm - 2 * thicknessMm)

  const longWallCut = isCut(longWallSpanMm)
  const shortWallCut = isCut(shortWallSpanMm)

  const longAxis: 'length' | 'width' = longIsLength ? 'length' : 'width'
  const shortAxis: 'length' | 'width' = longIsLength ? 'width' : 'length'

  const withSides = (longMm: number, shortMm: number): { lengthMm: number; widthMm: number } =>
    longIsLength ? { lengthMm: longMm, widthMm: shortMm } : { lengthMm: shortMm, widthMm: longMm }

  const options: SizeOption[] = []

  type Target = {
    changed: boolean
    direction: 'down' | 'up'
    sideMm: number
    spanMm: number
  }
  const unchanged = (sideMm: number, spanMm: number): Target[] => [{ changed: false, direction: 'up', sideMm, spanMm }]
  const targetsForCut = (spanMm: number, offsetMm: number): Target[] => {
    const downSpan = snapDown(spanMm)
    const upSpan = snapUp(spanMm)
    return [
      { changed: true, direction: 'down', sideMm: downSpan + offsetMm, spanMm: downSpan },
      { changed: true, direction: 'up', sideMm: upSpan + offsetMm, spanMm: upSpan }
    ]
  }

  const longTargets = longWallCut ? targetsForCut(longWallSpanMm, 0) : unchanged(longSideMm, longWallSpanMm)
  const shortTargets = shortWallCut ? targetsForCut(shortWallSpanMm, 2 * thicknessMm) : unchanged(shortSideMm, shortWallSpanMm)

  const axisName = (axis: 'length' | 'width'): string => (axis === 'length' ? 'Длина' : 'Ширина')
  const pushOption = (longTarget: Target, shortTarget: Target): void => {
    if (!longTarget.changed && !shortTarget.changed) {
      return
    }

    const dims = withSides(longTarget.sideMm, shortTarget.sideMm)
    const exists = options.some((option) => option.lengthMm === dims.lengthMm && option.widthMm === dims.widthMm)
    if (exists) {
      return
    }

    const labelParts: string[] = []
    if (longTarget.changed) {
      labelParts.push(`${axisName(longAxis)} ${longSideMm} → ${longTarget.sideMm}`)
    }
    if (shortTarget.changed) {
      labelParts.push(`${axisName(shortAxis)} ${shortSideMm} → ${shortTarget.sideMm}`)
    }

    const changedAxis: SizeOption['axis'] =
      longTarget.changed && shortTarget.changed ? 'both' : longTarget.changed ? longAxis : shortAxis
    const direction: SizeOption['direction'] =
      longTarget.changed && shortTarget.changed && longTarget.direction !== shortTarget.direction
        ? 'mixed'
        : longTarget.changed
          ? longTarget.direction
          : shortTarget.direction
    const lengthDelta = dims.lengthMm - lengthMm
    const widthDelta = dims.widthMm - widthMm
    const deltaParts = [
      lengthDelta !== 0 ? `длина ${lengthDelta > 0 ? '+' : ''}${lengthDelta} мм` : '',
      widthDelta !== 0 ? `ширина ${widthDelta > 0 ? '+' : ''}${widthDelta} мм` : ''
    ].filter(Boolean)
    const stripsNote = `длинные стены ${stripsAcross(longTarget.spanMm)} шт/сторона; короткие стены ${stripsAcross(
      shortTarget.spanMm
    )} шт/сторона`

    options.push({
      id: `${dims.lengthMm}-${dims.widthMm}`,
      axis: changedAxis,
      direction,
      lengthMm: dims.lengthMm,
      widthMm: dims.widthMm,
      deltaMm: Math.abs(lengthDelta) + Math.abs(widthDelta),
      strips: stripsAcross(longTarget.spanMm) + stripsAcross(shortTarget.spanMm),
      label: labelParts.join(', '),
      note: `${deltaParts.join(', ')} · стены без реза: ${stripsNote}`
    })
  }

  for (const longTarget of longTargets) {
    for (const shortTarget of shortTargets) {
      pushOption(longTarget, shortTarget)
    }
  }

  return {
    longSideMm,
    shortSideMm,
    longWallCut,
    shortWallCut,
    longWallRemainderMm: remainder(longWallSpanMm),
    shortWallRemainderMm: remainder(shortWallSpanMm),
    hasCut: longWallCut || shortWallCut,
    options
  }
}
