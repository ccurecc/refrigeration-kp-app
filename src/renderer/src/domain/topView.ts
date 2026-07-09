import { PANEL_WORKING_WIDTH_MM } from './calculator'

export type TopShape =
  | { k: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number; dash?: string }
  | { k: 'path'; d: string; fill?: string; stroke?: string; sw?: number }
  | { k: 'poly'; points: string; fill: string }
  | {
      k: 'text'
      x: number
      y: number
      text: string
      anchor: 'start' | 'middle' | 'end'
      size: number
      weight: number
      fill: string
      rotate?: number
    }

export interface TopViewModel {
  width: number
  height: number
  shapes: TopShape[]
}

export interface TopViewParams {
  longMm: number
  shortMm: number
  thicknessMm: number
  hasPanelFloor: boolean
  doorWidthMm: number
  stripCount: number
  remainderMm: number
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

const COLORS = {
  surface: '#f4f6f8',
  ceiling: '#fbfcfd',
  floor: '#ffffff',
  roomFloor: '#e7edf2',
  cut: '#f4cda0',
  strip: '#b3ada3',
  wallFill: '#d7dee5',
  wallStroke: '#7f8c98',
  internal: '#2b3a47',
  external: '#2f5d86',
  door: '#b4472f',
  channel: '#2f5d86',
  dim: '#2a3138',
  dimLine: '#566270',
  title: '#1f2933',
  legendText: '#33414e',
  panelEdge: '#7c8896'
}

const ARROW = 7

/**
 * Collision-proof top-down drawing. The canvas is split into fixed zones that
 * never overlap regardless of the chamber aspect ratio:
 *   - top band      → title / panel-layout text
 *   - left + bottom → dimension lines with arrows + labels
 *   - right column  → legend (colour key for angles / door / cut)
 *   - centre-left   → the chamber itself
 */
export function buildTopView(params: TopViewParams): TopViewModel {
  const { longMm, shortMm, thicknessMm, hasPanelFloor, doorWidthMm, stripCount, remainderMm } = params

  const width = 900
  const height = 470
  const legendW = 248
  const padLeft = 90
  const padRight = 14
  const padTop = 60
  const padBottom = 66

  const zoneRight = width - legendW - padRight
  const availW = zoneRight - padLeft
  const availH = height - padTop - padBottom
  const scale = Math.min(availW / longMm, availH / shortMm)

  const cw = longMm * scale
  const ch = shortMm * scale
  const x0 = padLeft + (availW - cw) / 2
  const y0 = padTop + (availH - ch) / 2
  const x1 = x0 + cw
  const y1 = y0 + ch

  // Keep the wall thickness on the same millimetre-to-pixel scale as panel
  // seams. A visual clamp here makes wall/floor joints drift apart on long runs.
  const tw = thicknessMm * scale
  const ix0 = x0 + tw
  const iy0 = y0 + tw
  const ix1 = x1 - tw
  const iy1 = y1 - tw
  const iw = Math.max(0, ix1 - ix0)
  const ih = Math.max(0, iy1 - iy0)
  const step = PANEL_WORKING_WIDTH_MM * scale
  const fullStrips = Math.max(0, stripCount - 1)
  const hasCut = remainderMm > 0 && remainderMm < PANEL_WORKING_WIDTH_MM
  const floorLongMm = Math.max(0, longMm - 2 * thicknessMm)
  const floorStripCount = Math.max(1, Math.ceil(Math.max(floorLongMm, 1) / PANEL_WORKING_WIDTH_MM))
  const floorFullStrips = Math.max(0, floorStripCount - 1)
  const floorRemainderMm = Math.round(floorLongMm - floorFullStrips * PANEL_WORKING_WIDTH_MM)
  const hasFloorCut = hasPanelFloor && floorRemainderMm > 0 && floorRemainderMm < PANEL_WORKING_WIDTH_MM

  const shapes: TopShape[] = []

  // Background.
  shapes.push({ k: 'rect', x: 0, y: 0, w: width, h: height, fill: COLORS.surface })

  // Ceiling footprint: the ceiling lies on top of the walls and covers the
  // outer chamber size.
  shapes.push({ k: 'rect', x: x0, y: y0, w: cw, h: ch, fill: COLORS.ceiling })

  // Ceiling cut remainder strip.
  const cutStart = x0 + fullStrips * step
  if (hasCut && x1 - cutStart > 0.5) {
    shapes.push({ k: 'rect', x: cutStart, y: y0, w: x1 - cutStart, h: ch, fill: COLORS.cut })
  }

  // Ceiling strip seams.
  for (let i = 1; i <= fullStrips; i += 1) {
    const x = x0 + i * step
    shapes.push({ k: 'line', x1: x, y1: y0, x2: x, y2: y1, stroke: COLORS.strip, sw: 1.2 })
  }

  // Floor panel is optional and is laid between the walls, not under them.
  if (hasPanelFloor) {
    shapes.push({ k: 'rect', x: ix0, y: iy0, w: iw, h: ih, fill: COLORS.floor, stroke: COLORS.panelEdge, sw: 0.7 })

    const floorCutStart = ix0 + floorFullStrips * step
    if (hasFloorCut && ix1 - floorCutStart > 0.5) {
      shapes.push({ k: 'rect', x: floorCutStart, y: iy0, w: ix1 - floorCutStart, h: ih, fill: COLORS.cut })
    }

    for (let i = 1; i <= floorFullStrips; i += 1) {
      const x = ix0 + i * step
      if (x < ix1) {
        shapes.push({ k: 'line', x1: x, y1: iy0, x2: x, y2: iy1, stroke: COLORS.strip, sw: 1 })
      }
    }
  } else {
    shapes.push({ k: 'rect', x: ix0, y: iy0, w: iw, h: ih, fill: COLORS.roomFloor, stroke: COLORS.panelEdge, sw: 0.7 })
  }

  // Walls: long walls cover the full outside length; short end walls are
  // placed inside between the long walls.
  const wallOutline = (x: number, y: number, w: number, h: number): void => {
    shapes.push({ k: 'rect', x, y, w, h, fill: 'none', stroke: COLORS.wallStroke, sw: 1 })
  }
  const panelRun = (
    spanMm: number
  ): { fullStrips: number; remainderMm: number; hasCut: boolean; panelCount: number } => {
    const panelCount = Math.max(1, Math.ceil(Math.max(spanMm, 1) / PANEL_WORKING_WIDTH_MM))
    const fullStrips = Math.max(0, panelCount - 1)
    const remainderMm = Math.round(spanMm - fullStrips * PANEL_WORKING_WIDTH_MM)

    return {
      fullStrips,
      hasCut: remainderMm > 0 && remainderMm < PANEL_WORKING_WIDTH_MM,
      panelCount,
      remainderMm
    }
  }
  const segmentFill = (segmentMm: number): string => (segmentMm < PANEL_WORKING_WIDTH_MM ? COLORS.cut : COLORS.wallFill)
  const drawHorizontalWallPanels = (
    wallRect: { x: number; y: number; w: number; h: number },
    spanMm: number,
    reverse: boolean
  ): void => {
    const run = panelRun(spanMm)
    let offset = 0

    for (let i = 0; i < run.panelCount; i += 1) {
      const segmentMm = i < run.fullStrips ? PANEL_WORKING_WIDTH_MM : run.remainderMm
      const segmentW = i === run.panelCount - 1 ? wallRect.w - offset : Math.min(segmentMm * scale, wallRect.w - offset)
      const x = reverse ? wallRect.x + wallRect.w - offset - segmentW : wallRect.x + offset
      shapes.push({ k: 'rect', x, y: wallRect.y, w: segmentW, h: wallRect.h, fill: segmentFill(segmentMm) })
      offset += segmentW
    }
  }
  const drawVerticalWallPanels = (
    wallRect: { x: number; y: number; w: number; h: number },
    spanMm: number,
    reverse: boolean
  ): void => {
    const run = panelRun(spanMm)
    let offset = 0

    for (let i = 0; i < run.panelCount; i += 1) {
      const segmentMm = i < run.fullStrips ? PANEL_WORKING_WIDTH_MM : run.remainderMm
      const segmentH = i === run.panelCount - 1 ? wallRect.h - offset : Math.min(segmentMm * scale, wallRect.h - offset)
      const y = reverse ? wallRect.y + wallRect.h - offset - segmentH : wallRect.y + offset
      shapes.push({ k: 'rect', x: wallRect.x, y, w: wallRect.w, h: segmentH, fill: segmentFill(segmentMm) })
      offset += segmentH
    }
  }
  const topWall = { x: x0, y: y0, w: cw, h: tw }
  const rightWall = { x: x1 - tw, y: y0 + tw, w: tw, h: Math.max(0, ch - 2 * tw) }
  const bottomWall = { x: x0, y: y1 - tw, w: cw, h: tw }
  const leftWall = { x: x0, y: y0 + tw, w: tw, h: Math.max(0, ch - 2 * tw) }

  const longWallSpanMm = longMm
  const shortWallSpanMm = Math.max(0, shortMm - 2 * thicknessMm)
  const longWallRun = panelRun(longWallSpanMm)
  const shortWallRun = panelRun(shortWallSpanMm)
  const longWallFullStrips = longWallRun.fullStrips
  const shortWallFullStrips = shortWallRun.fullStrips
  const longWallHasCut = longWallRun.hasCut
  const shortWallHasCut = shortWallRun.hasCut

  drawHorizontalWallPanels(topWall, longWallSpanMm, false)
  drawVerticalWallPanels(rightWall, shortWallSpanMm, false)
  drawHorizontalWallPanels(bottomWall, longWallSpanMm, false)
  drawVerticalWallPanels(leftWall, shortWallSpanMm, false)

  wallOutline(topWall.x, topWall.y, topWall.w, topWall.h)
  wallOutline(rightWall.x, rightWall.y, rightWall.w, rightWall.h)
  wallOutline(bottomWall.x, bottomWall.y, bottomWall.w, bottomWall.h)
  wallOutline(leftWall.x, leftWall.y, leftWall.w, leftWall.h)

  // Wall panel seams follow the actual wall spans: long walls are full length,
  // short end walls are inside between them.
  const longWallStep = PANEL_WORKING_WIDTH_MM * scale
  const shortWallStep = PANEL_WORKING_WIDTH_MM * scale
  for (let i = 1; i <= longWallFullStrips; i += 1) {
    const topX = topWall.x + i * longWallStep
    const bottomX = bottomWall.x + i * longWallStep
    if (topX < topWall.x + topWall.w) {
      shapes.push({ k: 'line', x1: topX, y1: topWall.y, x2: topX, y2: topWall.y + topWall.h, stroke: COLORS.wallStroke, sw: 1 })
    }
    if (bottomX < bottomWall.x + bottomWall.w) {
      shapes.push({
        k: 'line',
        x1: bottomX,
        y1: bottomWall.y,
        x2: bottomX,
        y2: bottomWall.y + bottomWall.h,
        stroke: COLORS.wallStroke,
        sw: 1
      })
    }
  }

  for (let i = 1; i <= shortWallFullStrips; i += 1) {
    const rightY = rightWall.y + i * shortWallStep
    const leftY = leftWall.y + i * shortWallStep
    if (rightY < rightWall.y + rightWall.h) {
      shapes.push({
        k: 'line',
        x1: rightWall.x,
        y1: rightY,
        x2: rightWall.x + rightWall.w,
        y2: rightY,
        stroke: COLORS.wallStroke,
        sw: 1
      })
    }
    if (leftY < leftWall.y + leftWall.h) {
      shapes.push({ k: 'line', x1: leftWall.x, y1: leftY, x2: leftWall.x + leftWall.w, y2: leftY, stroke: COLORS.wallStroke, sw: 1 })
    }
  }

  // Internal 40×40 angles.
  const ia = Math.max(1, Math.min(40 * scale, tw * 0.72))
  for (const [sx, sy] of [
    [x0 + tw, y0 + tw],
    [x1 - tw - ia, y0 + tw],
    [x0 + tw, y1 - tw - ia],
    [x1 - tw - ia, y1 - tw - ia]
  ]) {
    shapes.push({ k: 'rect', x: sx, y: sy, w: ia, h: ia, fill: COLORS.internal })
  }

  // External (40+t) angles wrapping the outer corners.
  const leg = clamp((40 + thicknessMm) * scale, 12, 26)
  const el = Math.max(tw * 0.6, 3.5)
  const extAngle = (cx: number, cy: number, dirX: number, dirY: number): void => {
    shapes.push({ k: 'rect', x: dirX > 0 ? cx : cx - leg, y: dirY > 0 ? cy - el : cy, w: leg, h: el, fill: COLORS.external })
    shapes.push({ k: 'rect', x: dirX > 0 ? cx - el : cx, y: dirY > 0 ? cy : cy - leg, w: el, h: leg, fill: COLORS.external })
  }
  extAngle(x0, y0, 1, 1)
  extAngle(x1, y0, -1, 1)
  extAngle(x0, y1, 1, -1)
  extAngle(x1, y1, -1, -1)

  // Door opening + channel on the front wall.
  const doorW = clamp(doorWidthMm * scale, 20, Math.max(20, Math.min(bottomWall.w * 0.5, bottomWall.w - 2 * el)))
  const doorMinX = bottomWall.x + el
  const doorMaxX = bottomWall.x + bottomWall.w - doorW - el
  const preferredDoorX = bottomWall.x + bottomWall.w / 2 - doorW / 2
  const dx = doorMaxX >= doorMinX ? clamp(preferredDoorX, doorMinX, doorMaxX) : bottomWall.x + (bottomWall.w - doorW) / 2
  shapes.push({ k: 'rect', x: dx, y: bottomWall.y, w: doorW, h: bottomWall.h, fill: COLORS.door, stroke: COLORS.wallStroke, sw: 1 })
  shapes.push({ k: 'rect', x: dx - el, y: bottomWall.y, w: el, h: bottomWall.h, fill: COLORS.channel })
  shapes.push({ k: 'rect', x: dx + doorW, y: bottomWall.y, w: el, h: bottomWall.h, fill: COLORS.channel })

  // ---- Dimension lines (bottom = long side, left = short side) ----
  const labelBox = (cx: number, cy: number, text: string, size: number, vertical: boolean): void => {
    const bw = text.length * size * 0.6 + 10
    if (vertical) {
      shapes.push({ k: 'rect', x: cx - size / 2 - 5, y: cy - bw / 2, w: size + 6, h: bw, fill: COLORS.surface })
      shapes.push({ k: 'text', x: cx + size / 2 - 4, y: cy, text, anchor: 'middle', size, weight: 700, fill: COLORS.dim, rotate: -90 })
    } else {
      shapes.push({ k: 'rect', x: cx - bw / 2, y: cy - size / 2 - 5, w: bw, h: size + 6, fill: COLORS.surface })
      shapes.push({ k: 'text', x: cx, y: cy + size / 2 - 4, text, anchor: 'middle', size, weight: 700, fill: COLORS.dim })
    }
  }

  const yDim = y1 + 42
  shapes.push({ k: 'line', x1: x0, y1: y1 + 6, x2: x0, y2: yDim + 5, stroke: COLORS.dimLine, sw: 1 })
  shapes.push({ k: 'line', x1: x1, y1: y1 + 6, x2: x1, y2: yDim + 5, stroke: COLORS.dimLine, sw: 1 })
  shapes.push({ k: 'line', x1: x0, y1: yDim, x2: x1, y2: yDim, stroke: COLORS.dimLine, sw: 1.4 })
  shapes.push({ k: 'poly', points: `${x0},${yDim} ${x0 + ARROW},${yDim - ARROW / 2} ${x0 + ARROW},${yDim + ARROW / 2}`, fill: COLORS.dimLine })
  shapes.push({ k: 'poly', points: `${x1},${yDim} ${x1 - ARROW},${yDim - ARROW / 2} ${x1 - ARROW},${yDim + ARROW / 2}`, fill: COLORS.dimLine })
  labelBox((x0 + x1) / 2, yDim, `${longMm} мм`, 17, false)

  const xDim = x0 - 46
  shapes.push({ k: 'line', x1: x0 - 6, y1: y0, x2: xDim - 5, y2: y0, stroke: COLORS.dimLine, sw: 1 })
  shapes.push({ k: 'line', x1: x0 - 6, y1: y1, x2: xDim - 5, y2: y1, stroke: COLORS.dimLine, sw: 1 })
  shapes.push({ k: 'line', x1: xDim, y1: y0, x2: xDim, y2: y1, stroke: COLORS.dimLine, sw: 1.4 })
  shapes.push({ k: 'poly', points: `${xDim},${y0} ${xDim - ARROW / 2},${y0 + ARROW} ${xDim + ARROW / 2},${y0 + ARROW}`, fill: COLORS.dimLine })
  shapes.push({ k: 'poly', points: `${xDim},${y1} ${xDim - ARROW / 2},${y1 - ARROW} ${xDim + ARROW / 2},${y1 - ARROW}`, fill: COLORS.dimLine })
  labelBox(xDim, (y0 + y1) / 2, `${shortMm} мм`, 17, true)

  // ---- Title band (top-left) ----
  shapes.push({
    k: 'text',
    x: padLeft,
    y: 28,
    text: `Потолок на стенах: ${longMm}×${shortMm} мм, ${stripCount} шт`,
    anchor: 'start',
    size: 14.5,
    weight: 700,
    fill: COLORS.title
  })

  // ---- Legend (right column, fixed — never overlaps the drawing) ----
  const legX = width - legendW + 8
  shapes.push({ k: 'text', x: legX, y: padTop - 6, text: 'Обозначения', anchor: 'start', size: 13, weight: 700, fill: COLORS.title })

  const legendItems: Array<{ color: string; label: string }> = [
    { color: COLORS.internal, label: 'Внутренний угол 40×40' },
    { color: COLORS.external, label: `Наружный угол ${40 + thicknessMm}×${40 + thicknessMm}` },
    { color: COLORS.door, label: 'Дверной проём (швеллер)' },
    { color: hasPanelFloor ? COLORS.floor : COLORS.roomFloor, label: hasPanelFloor ? 'Пол между стенами' : 'Пол помещения' }
  ]
  if (hasCut || hasFloorCut || longWallHasCut || shortWallHasCut) {
    legendItems.push({ color: COLORS.cut, label: 'Подрезка панели' })
  }
  legendItems.push({ color: COLORS.wallFill, label: 'Длинные стены поверх торцевых' })

  let ly = padTop + 14
  for (const item of legendItems) {
    shapes.push({ k: 'rect', x: legX, y: ly - 11, w: 15, h: 15, fill: item.color, stroke: COLORS.panelEdge, sw: 0.8 })
    shapes.push({ k: 'text', x: legX + 23, y: ly + 1, text: item.label, anchor: 'start', size: 12.5, weight: 600, fill: COLORS.legendText })
    ly += 28
  }

  return { width, height, shapes }
}

export function topShapeToSvg(shape: TopShape): string {
  if (shape.k === 'rect') {
    const fill = shape.fill ?? 'none'
    const stroke = shape.stroke ? ` stroke="${shape.stroke}" stroke-width="${shape.sw ?? 1}"` : ''
    return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" fill="${fill}"${stroke} />`
  }
  if (shape.k === 'line') {
    const dash = shape.dash ? ` stroke-dasharray="${shape.dash}"` : ''
    return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" stroke="${shape.stroke}" stroke-width="${shape.sw}"${dash} />`
  }
  if (shape.k === 'path') {
    const fill = shape.fill ?? 'none'
    const stroke = shape.stroke ? ` stroke="${shape.stroke}" stroke-width="${shape.sw ?? 1}"` : ''
    return `<path d="${shape.d}" fill="${fill}"${stroke} />`
  }
  if (shape.k === 'poly') {
    return `<polygon points="${shape.points}" fill="${shape.fill}" />`
  }
  const transform = shape.rotate ? ` transform="rotate(${shape.rotate} ${shape.x} ${shape.y})"` : ''
  return `<text x="${shape.x}" y="${shape.y}" text-anchor="${shape.anchor}" font-size="${shape.size}" font-weight="${shape.weight}" fill="${shape.fill}"${transform}>${shape.text}</text>`
}
