import type { ChamberInput, ChamberResult, DoorWall } from './calculator'
import { buildChamberPanelRuns, normalizeDoorPlacement } from './chamberGeometry'

interface Point {
  x: number
  y: number
}

const fmt = (value: number): string => `${Math.round(value)} мм`
const n = (value: number): string => Number(value.toFixed(1)).toString()

function pointsToString(points: Point[]): string {
  return points.map((point) => `${n(point.x)},${n(point.y)}`).join(' ')
}

function polygon(points: Point[], fill: string, stroke = '#234f6c', opacity = 1): string {
  return `<polygon points="${pointsToString(points)}" fill="${fill}" stroke="${stroke}" stroke-width="1.4" opacity="${opacity}" />`
}

function line(start: Point, end: Point, cls = 'dim-line'): string {
  return `<line class="${cls}" x1="${n(start.x)}" y1="${n(start.y)}" x2="${n(end.x)}" y2="${n(end.y)}" />`
}

function text(
  point: Point,
  value: string,
  anchor: 'start' | 'middle' | 'end' = 'middle',
  className = 'dim-text'
): string {
  return `<text class="${className}" x="${n(point.x)}" y="${n(point.y)}" text-anchor="${anchor}">${value}</text>`
}

function dim(start: Point, end: Point, label: string, labelOffset: Point = { x: 0, y: -8 }): string {
  const mid = { x: (start.x + end.x) / 2 + labelOffset.x, y: (start.y + end.y) / 2 + labelOffset.y }
  return `${line(start, end)}${text(mid, label)}`
}

function cutDim(start: Point, end: Point, label: string, offset: Point, labelOffset: Point): string {
  const dimStart = { x: start.x + offset.x, y: start.y + offset.y }
  const dimEnd = { x: end.x + offset.x, y: end.y + offset.y }
  const mid = {
    x: (dimStart.x + dimEnd.x) / 2 + labelOffset.x,
    y: (dimStart.y + dimEnd.y) / 2 + labelOffset.y
  }

  return `${line(start, dimStart, 'cut-extension')}${line(end, dimEnd, 'cut-extension')}${line(
    dimStart,
    dimEnd,
    'cut-dim-line'
  )}${text(mid, label, 'middle', 'cut-dim-text')}`
}

function cutDimWithLabel(start: Point, end: Point, label: string, labelPosition: Point): string {
  const offset = { x: 0, y: 14 }
  const dimStart = { x: start.x + offset.x, y: start.y + offset.y }
  const dimEnd = { x: end.x + offset.x, y: end.y + offset.y }
  const dimMid = { x: (dimStart.x + dimEnd.x) / 2, y: (dimStart.y + dimEnd.y) / 2 }

  return `${line(start, dimStart, 'cut-extension')}${line(end, dimEnd, 'cut-extension')}${line(
    dimStart,
    dimEnd,
    'cut-dim-line'
  )}${line(dimMid, labelPosition, 'cut-extension')}${text(labelPosition, label, 'middle', 'cut-dim-text')}`
}

export function buildSide3dSvg(input: ChamberInput, result: ChamberResult): string {
  const longMm = result.longSideMm
  const shortMm = result.shortSideMm
  const heightMm = input.heightMm
  const thicknessMm = input.thicknessMm
  const wallHeightMm = Math.max(heightMm - thicknessMm, thicknessMm)
  const floorLongMm = Math.max(0, longMm - 2 * thicknessMm)
  const floorShortMm = Math.max(0, shortMm - 2 * thicknessMm)
  const panelRuns = buildChamberPanelRuns(longMm, shortMm, thicknessMm, input.hasPanelFloor)
  const doorSpan = normalizeDoorPlacement(input)
  const isSideFront = doorSpan.wall === 'left' || doorSpan.wall === 'right'
  const viewFrontMm = isSideFront ? shortMm : longMm
  const viewDepthMm = isSideFront ? longMm : shortMm
  const cameraWall = input.view3d.cameraView.split('-')[0]
  const cameraOffset = input.view3d.cameraView.endsWith('-left') ? -0.42 : 0.42
  const dimensionLabelFontSize =
    18 * Math.min(Math.max((input.view3d.dimensionLabelSizePercent || 100) / 100, 0.5), 2)
  const cutLabelFontSize = 18 * Math.min(Math.max((input.view3d.cutLabelSizePercent || 100) / 100, 0.5), 2)
  const cameraNormal =
    cameraWall === 'front'
      ? { x: 0, z: -1 }
      : cameraWall === 'right'
        ? { x: 1, z: 0 }
        : cameraWall === 'back'
          ? { x: 0, z: 1 }
          : { x: -1, z: 0 }
  const cameraX = cameraNormal.x - cameraNormal.z * cameraOffset
  const cameraZ = cameraNormal.z + cameraNormal.x * cameraOffset
  const cameraFromLeft = cameraX < 0
  const cameraFromBack = cameraZ > 0

  const width = 900
  const height = 430
  const depthX = 0.36
  const depthY = 0.22
  const cameraDistanceFactor = Math.min(Math.max((input.view3d.cameraDistancePercent || 100) / 100, 0.05), 1.8)
  const scale =
    Math.min(560 / (viewFrontMm + viewDepthMm * depthX), 265 / (heightMm + viewDepthMm * depthY)) /
    cameraDistanceFactor
  const ox = 82
  const oy = 354

  const orient = (x: number, z: number): { x: number; z: number } => {
    if (doorSpan.wall === 'back') return { x: longMm - x, z: shortMm - z }
    if (doorSpan.wall === 'left') return { x: shortMm - z, z: x }
    if (doorSpan.wall === 'right') return { x: z, z: longMm - x }
    return { x, z }
  }
  const projectViewPoint = (x: number, y: number, z: number): Point => {
    const projectedDepth = cameraFromBack ? viewDepthMm - z : z
    return {
      x:
        ox +
        (cameraFromLeft
          ? x + (viewDepthMm - projectedDepth) * depthX
          : viewFrontMm - x + projectedDepth * depthX) *
          scale,
      y: oy - (y + projectedDepth * depthY) * scale
    }
  }
  const p = (x: number, y: number, z: number): Point => {
    const oriented = orient(x, z)
    return projectViewPoint(oriented.x, y, oriented.z)
  }
  const dp = (alongMm: number, y: number, outwardMm: number): Point => {
    if (doorSpan.wall === 'back') return p(alongMm, y, shortMm + outwardMm)
    if (doorSpan.wall === 'left') return p(-outwardMm, y, shortMm - alongMm)
    if (doorSpan.wall === 'right') return p(longMm + outwardMm, y, shortMm - alongMm)
    return p(alongMm, y, -outwardMm)
  }

  const doorWidthMm = doorSpan.widthMm
  const doorHeightMm = Math.min(input.doorHeightMm, wallHeightMm)
  const mirrorDoorSpan = doorSpan.wall === 'front' || doorSpan.wall === 'left'
  const doorLeftMm = mirrorDoorSpan ? doorSpan.wallSpanMm - doorSpan.rightMm : doorSpan.leftMm
  const doorRightMm = mirrorDoorSpan ? doorSpan.wallSpanMm - doorSpan.leftMm : doorSpan.rightMm
  const railStartMm = mirrorDoorSpan ? doorSpan.wallSpanMm - doorSpan.railEndMm : doorSpan.railStartMm
  const railEndMm = mirrorDoorSpan ? doorSpan.wallSpanMm - doorSpan.railStartMm : doorSpan.railEndMm
  const railExtensionStartMm = mirrorDoorSpan
    ? doorSpan.wallSpanMm - doorSpan.railExtensionEndMm
    : doorSpan.railExtensionStartMm
  const railExtensionEndMm = mirrorDoorSpan
    ? doorSpan.wallSpanMm - doorSpan.railExtensionStartMm
    : doorSpan.railExtensionEndMm
  const physicalFrontWall = [p(0, 0, 0), p(longMm, 0, 0), p(longMm, wallHeightMm, 0), p(0, wallHeightMm, 0)]
  const physicalRightWall = [p(longMm, 0, 0), p(longMm, 0, shortMm), p(longMm, wallHeightMm, shortMm), p(longMm, wallHeightMm, 0)]
  const physicalBackWall = [p(0, 0, shortMm), p(longMm, 0, shortMm), p(longMm, wallHeightMm, shortMm), p(0, wallHeightMm, shortMm)]
  const physicalLeftWall = [p(0, 0, shortMm), p(0, 0, 0), p(0, wallHeightMm, 0), p(0, wallHeightMm, shortMm)]
  const frontWall =
    doorSpan.wall === 'back'
      ? physicalBackWall
      : doorSpan.wall === 'left'
        ? physicalLeftWall
        : doorSpan.wall === 'right'
          ? physicalRightWall
          : physicalFrontWall
  const rightWall =
    doorSpan.wall === 'back'
      ? physicalLeftWall
      : doorSpan.wall === 'left'
        ? physicalFrontWall
        : doorSpan.wall === 'right'
          ? physicalBackWall
          : physicalRightWall
  const backWall =
    doorSpan.wall === 'back'
      ? physicalFrontWall
      : doorSpan.wall === 'left'
        ? physicalRightWall
        : doorSpan.wall === 'right'
          ? physicalLeftWall
          : physicalBackWall
  const floor = [
    p(thicknessMm, thicknessMm, thicknessMm),
    p(thicknessMm + floorLongMm, thicknessMm, thicknessMm),
    p(thicknessMm + floorLongMm, thicknessMm, thicknessMm + floorShortMm),
    p(thicknessMm, thicknessMm, thicknessMm + floorShortMm)
  ]
  const ceiling = [p(0, heightMm, 0), p(longMm, heightMm, 0), p(longMm, heightMm, shortMm), p(0, heightMm, shortMm)]
  const door = [dp(doorLeftMm, 0, 35), dp(doorRightMm, 0, 35), dp(doorRightMm, doorHeightMm, 35), dp(doorLeftMm, doorHeightMm, 35)]
  const physicalFrontCut = panelRuns.longWall.hasCut
    ? [
        p(longMm - panelRuns.longWall.remainderMm, 0, -12),
        p(longMm, 0, -12),
        p(longMm, wallHeightMm, -12),
        p(longMm - panelRuns.longWall.remainderMm, wallHeightMm, -12)
      ]
    : null
  const physicalBackCut = panelRuns.longWall.hasCut
    ? [
        p(longMm - panelRuns.longWall.remainderMm, 0, shortMm + 12),
        p(longMm, 0, shortMm + 12),
        p(longMm, wallHeightMm, shortMm + 12),
        p(longMm - panelRuns.longWall.remainderMm, wallHeightMm, shortMm + 12)
      ]
    : null
  const shortCutStartMm = shortMm - thicknessMm - panelRuns.shortWall.remainderMm
  const shortCutEndMm = shortMm - thicknessMm
  const physicalRightCut = panelRuns.shortWall.hasCut
    ? [
        p(longMm, 0, shortCutStartMm),
        p(longMm, 0, shortCutEndMm),
        p(longMm, wallHeightMm, shortCutEndMm),
        p(longMm, wallHeightMm, shortCutStartMm)
      ]
    : null
  const physicalLeftCut = panelRuns.shortWall.hasCut
    ? [
        p(-12, 0, shortCutStartMm),
        p(-12, 0, shortCutEndMm),
        p(-12, wallHeightMm, shortCutEndMm),
        p(-12, wallHeightMm, shortCutStartMm)
      ]
    : null
  const frontCut =
    doorSpan.wall === 'back'
      ? physicalBackCut
      : doorSpan.wall === 'left'
        ? physicalLeftCut
        : doorSpan.wall === 'right'
          ? physicalRightCut
          : physicalFrontCut
  const rightCut =
    doorSpan.wall === 'back'
      ? physicalLeftCut
      : doorSpan.wall === 'left'
        ? physicalFrontCut
        : doorSpan.wall === 'right'
          ? physicalBackCut
          : physicalRightCut
  const floorCutStartMm = thicknessMm + floorLongMm - (panelRuns.floor?.remainderMm ?? 0)
  const floorCutEndMm = thicknessMm + floorLongMm
  const floorCut = panelRuns.floor?.hasCut
    ? [
        p(floorCutStartMm, thicknessMm + 10, thicknessMm),
        p(floorCutEndMm, thicknessMm + 10, thicknessMm),
        p(floorCutEndMm, thicknessMm + 10, thicknessMm + floorShortMm),
        p(floorCutStartMm, thicknessMm + 10, thicknessMm + floorShortMm)
      ]
    : null

  const panelStep = 1190
  const frontSeams: string[] = []
  if (doorSpan.wall === 'front' || doorSpan.wall === 'back') {
    const z = doorSpan.wall === 'front' ? -10 : shortMm + 10
    for (let x = panelStep; x < longMm; x += panelStep) {
      frontSeams.push(line(p(x, 0, z), p(x, wallHeightMm, z), 'seam-line'))
    }
  } else {
    const x = doorSpan.wall === 'left' ? -10 : longMm + 10
    for (let z = thicknessMm + panelStep; z < shortMm - thicknessMm; z += panelStep) {
      frontSeams.push(line(p(x, 0, z), p(x, wallHeightMm, z), 'seam-line'))
    }
  }

  const floorSeams: string[] = []
  for (let x = thicknessMm + panelStep; x < thicknessMm + floorLongMm; x += panelStep) {
    floorSeams.push(line(p(x, thicknessMm + 8, thicknessMm), p(x, thicknessMm + 8, thicknessMm + floorShortMm), 'floor-seam'))
  }

  const roofSeams: string[] = []
  for (let x = panelStep; x < longMm; x += panelStep) {
    roofSeams.push(line(p(x, heightMm + 5, 0), p(x, heightMm + 5, shortMm), 'seam-line'))
  }

  const dimensionZ = input.view3d.frontDimensionSide === 'back' ? viewDepthMm * 1.18 : -viewDepthMm * 0.18
  const dimensionX = input.view3d.depthDimensionSide === 'left' ? -viewFrontMm * 0.12 : viewFrontMm * 1.12
  const isHeightBack = input.view3d.heightDimensionCorner.startsWith('back-')
  const isHeightLeft = input.view3d.heightDimensionCorner.endsWith('-left')
  const heightZ = isHeightBack ? viewDepthMm * 1.08 : -viewDepthMm * 0.08
  const heightX = isHeightLeft ? -viewFrontMm * 0.06 : viewFrontMm * 1.06
  const frontDimensionLabel = isSideFront ? `Ширина ${fmt(shortMm)}` : `Длина ${fmt(longMm)}`
  const depthDimensionLabel = isSideFront ? `Длина ${fmt(longMm)}` : `Ширина ${fmt(shortMm)}`
  const lengthDim = input.view3d.frontDimensionVisible
    ? dim(
        projectViewPoint(0, 0, dimensionZ),
        projectViewPoint(viewFrontMm, 0, dimensionZ),
        frontDimensionLabel,
        { x: 0, y: input.view3d.frontDimensionSide === 'back' ? -10 : 18 }
      )
    : ''
  const widthStart = projectViewPoint(dimensionX, 0, 0)
  const widthEnd = projectViewPoint(dimensionX, 0, viewDepthMm)
  const widthDirection = input.view3d.depthDimensionSide === 'left' ? -1 : 1
  const widthDim = input.view3d.depthDimensionVisible
    ? dim(widthStart, widthEnd, depthDimensionLabel, { x: 34 * widthDirection, y: 4 })
    : ''
  const heightStart = projectViewPoint(heightX, 0, heightZ)
  const heightEnd = projectViewPoint(heightX, heightMm, heightZ)
  const heightDirection = isHeightLeft ? -1 : 1
  const heightDim = input.view3d.heightDimensionVisible
    ? dim(heightStart, heightEnd, `Высота ${fmt(heightMm)}`, { x: 34 * heightDirection, y: 4 })
    : ''
  const doorWidthY = input.view3d.doorWidthDimensionSide === 'below' ? -180 : doorHeightMm + 180
  const doorWidthDim = input.view3d.doorWidthDimensionVisible
    ? dim(
        dp(doorLeftMm, doorWidthY, 90),
        dp(doorRightMm, doorWidthY, 90),
        `Ширина двери ${fmt(input.doorWidthMm)}`,
        { x: 0, y: -10 }
      )
    : ''
  const doorHeightAlongMm =
    input.view3d.doorHeightDimensionSide === 'left' ? doorLeftMm - 210 : doorRightMm + 210
  const doorHeightDirection = input.view3d.doorHeightDimensionSide === 'left' ? -1 : 1
  const doorHeightDim = input.view3d.doorHeightDimensionVisible
    ? dim(
        dp(doorHeightAlongMm, 0, 90),
        dp(doorHeightAlongMm, doorHeightMm, 90),
        `Высота двери ${fmt(input.doorHeightMm)}`,
        { x: 54 * doorHeightDirection, y: 4 }
      )
    : ''
  const doorCenterMm = (doorLeftMm + doorRightMm) / 2
  const slideAlongDirection =
    (railExtensionStartMm + railExtensionEndMm) / 2 >= doorCenterMm ? 1 : -1
  const doorHandleX =
    input.doorType === 'double'
      ? doorCenterMm - doorWidthMm * 0.075
      : input.doorType === 'sliding'
        ? doorCenterMm - slideAlongDirection * doorWidthMm * 0.34
        : doorCenterMm + doorWidthMm * 0.34
  const doorHandle = dp(doorHandleX, doorHeightMm * 0.52, 82)
  const doorHandleSvg = `<circle cx="${doorHandle.x.toFixed(1)}" cy="${doorHandle.y.toFixed(1)}" r="5" fill="#124837" stroke="#0b3327" stroke-width="1.5" />`
  const doorWindowWidthMm = doorWidthMm * 0.23
  const doorWindowHeightMm = doorHeightMm * 0.13
  const doorWindowCenterMm = doorCenterMm - doorWidthMm * 0.18
  const doorWindowBottomMm = doorHeightMm * 0.72 - doorWindowHeightMm / 2
  const doorWindow = [
    dp(doorWindowCenterMm - doorWindowWidthMm / 2, doorWindowBottomMm, 56),
    dp(doorWindowCenterMm + doorWindowWidthMm / 2, doorWindowBottomMm, 56),
    dp(doorWindowCenterMm + doorWindowWidthMm / 2, doorWindowBottomMm + doorWindowHeightMm, 56),
    dp(doorWindowCenterMm - doorWindowWidthMm / 2, doorWindowBottomMm + doorWindowHeightMm, 56)
  ]
  const doubleDoorDetails =
    input.doorType === 'double'
      ? `${line(dp(doorCenterMm, 0, 48), dp(doorCenterMm, doorHeightMm, 48), 'door-leaf-seam')}${doorHandleSvg}`
      : ''
  const slidingRailInsetMm = Math.min(Math.max(doorHeightMm * 0.025, 20), doorHeightMm / 2)
  const detailedSlidingRail = (railY: number, railStartMm: number, railEndMm: number): string => {
    const start = dp(railStartMm, railY, 68)
    const end = dp(railEndMm, railY, 68)
    const railWidthMm = railEndMm - railStartMm
    const leftBolt = dp(railStartMm + railWidthMm * 0.3, railY, 78)
    const rightBolt = dp(railEndMm - railWidthMm * 0.3, railY, 78)

    return `${line(start, end, 'door-rail')}${line(start, end, 'door-rail-highlight')}<circle cx="${leftBolt.x.toFixed(1)}" cy="${leftBolt.y.toFixed(1)}" r="2.7" class="door-rail-bolt" /><circle cx="${rightBolt.x.toFixed(1)}" cy="${rightBolt.y.toFixed(1)}" r="2.7" class="door-rail-bolt" />`
  }
  const slidingRailCarriers = [doorCenterMm - doorWidthMm * 0.32, doorCenterMm + doorWidthMm * 0.32]
    .map((carrierX) =>
      line(
        dp(carrierX, doorHeightMm * 0.95, 74),
        dp(carrierX, doorHeightMm + slidingRailInsetMm, 74),
        'door-rail-carrier'
      )
    )
    .join('')
  const slidingDoorDetails =
    input.doorType === 'sliding'
      ? `${detailedSlidingRail(
          doorHeightMm + slidingRailInsetMm,
          railStartMm,
          railEndMm
        )}${detailedSlidingRail(
          doorHeightMm * 0.18,
          railExtensionStartMm,
          railExtensionEndMm
        )}${slidingRailCarriers}${doorHandleSvg}`
      : ''
  const singleDoorDetails =
    input.doorType === 'single' ? `${polygon(doorWindow, '#bfd9e5', '#52788b', 0.9)}${doorHandleSvg}` : ''
  const adjacentRightWall: Record<DoorWall, DoorWall> = {
    front: 'right',
    right: 'back',
    back: 'left',
    left: 'front'
  }
  const wallCutDim = (wall: DoorWall, frontFace: boolean): string => {
    const y = wallHeightMm * (frontFace ? 0.63 : 0.58)
    if (wall === 'front' || wall === 'back') {
      if (!panelRuns.longWall.hasCut) return ''
      const z = wall === 'front' ? -28 : shortMm + 28
      return cutDim(
        p(longMm - panelRuns.longWall.remainderMm, y, z),
        p(longMm, y, z),
        fmt(panelRuns.longWall.remainderMm),
        { x: 0, y: frontFace ? -12 : 8 },
        { x: 0, y: -10 }
      )
    }
    if (!panelRuns.shortWall.hasCut) return ''
    const x = wall === 'left' ? -28 : longMm + 28
    return cutDim(
      p(x, y, shortCutStartMm),
      p(x, y, shortCutEndMm),
      fmt(panelRuns.shortWall.remainderMm),
      { x: frontFace ? 0 : 14, y: frontFace ? -12 : 0 },
      { x: frontFace ? 0 : 24, y: -10 }
    )
  }
  const longWallCutDim = wallCutDim(doorSpan.wall, true)
  const shortWallCutDim = wallCutDim(adjacentRightWall[doorSpan.wall], false)
  const floorCutBack = input.view3d.floorCutLabelSide === 'back'
  const floorCutDimensionZ = floorCutBack ? thicknessMm + floorShortMm : thicknessMm
  const floorCutLabelDistanceFactor = Math.min(
    Math.max((input.view3d.floorCutLabelDistancePercent || 100) / 100, 0.05),
    2
  )
  const floorCutLabelZ =
    floorCutDimensionZ + (floorCutBack ? 1 : -1) * Math.max(shortMm * 0.18, 700) * floorCutLabelDistanceFactor
  const floorCutLabelPosition = p(floorCutEndMm, 0, floorCutLabelZ)
  const floorCutDim = input.view3d.floorCutDimensionVisible && panelRuns.floor?.hasCut
    ? cutDimWithLabel(
        p(floorCutStartMm, thicknessMm + 25, floorCutDimensionZ),
        p(floorCutEndMm, thicknessMm + 25, floorCutDimensionZ),
        `Пол · ${fmt(panelRuns.floor.remainderMm)}`,
        floorCutLabelPosition
      )
    : ''

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="3D-вид камеры с размерами">
      <defs>
        <marker id="dim-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 Z" fill="#163246" />
        </marker>
      </defs>
      <style>
        .dim-line { stroke: #163246; stroke-width: 1.7; marker-start: url(#dim-arrow); marker-end: url(#dim-arrow); }
        .cut-dim-line { stroke: #9a4f12; stroke-width: 1.5; marker-start: url(#dim-arrow); marker-end: url(#dim-arrow); }
        .cut-extension { stroke: #9a4f12; stroke-width: 1; stroke-dasharray: 3 3; }
        .seam-line { stroke: #8a9096; stroke-width: 1; }
        .floor-seam { stroke: #a8a39a; stroke-width: 1; }
        .door-leaf-seam { stroke: #a64a3c; stroke-width: 2; }
        .door-rail { stroke: #4c5961; stroke-width: 12; stroke-linecap: square; }
        .door-rail-highlight { stroke: #b9c2c7; stroke-width: 3; stroke-linecap: square; }
        .door-rail-bolt { fill: #124837; stroke: #e7ecef; stroke-width: 1; }
        .door-rail-carrier { stroke: #4c5961; stroke-width: 8; stroke-linecap: square; }
        .dim-text { font: 700 ${n(dimensionLabelFontSize)}px Arial, sans-serif; fill: #163246; stroke: #fff; stroke-width: 4px; paint-order: stroke; }
        .cut-dim-text { font: 700 ${n(cutLabelFontSize)}px Arial, sans-serif; fill: #9a4f12; stroke: #fff; stroke-width: 4px; paint-order: stroke; }
      </style>
      <rect width="${width}" height="${height}" fill="#eef2f5" />
      ${polygon(backWall, '#dbe6ee', '#234f6c', 0.86)}
      ${polygon(rightWall, '#d2dee8', '#234f6c', 0.92)}
      ${polygon(frontWall, '#f8fbfd', '#234f6c', 0.78)}
      ${polygon(floor, input.hasPanelFloor ? '#ffffff' : '#e6edf2', '#7c8896', input.hasPanelFloor ? 1 : 0.8)}
      ${frontCut ? polygon(frontCut, '#f4cda0', '#9a4f12', 0.9) : ''}
      ${rightCut ? polygon(rightCut, '#f4cda0', '#9a4f12', 0.9) : ''}
      ${floorCut ? polygon(floorCut, '#f4cda0', '#9a4f12', 0.82) : ''}
      ${floorSeams.join('')}
      ${frontSeams.join('')}
      ${polygon(ceiling, '#ffffff', '#234f6c', 0.96)}
      ${roofSeams.join('')}
      ${polygon(door, '#f6f8f9', '#a64a3c', 1)}
      <polyline points="${pointsToString([dp(doorLeftMm, 0, 45), dp(doorLeftMm, doorHeightMm, 45), dp(doorRightMm, doorHeightMm, 45), dp(doorRightMm, 0, 45)])}" fill="none" stroke="#a64a3c" stroke-width="4" />
      ${singleDoorDetails}
      ${doubleDoorDetails}
      ${slidingDoorDetails}
      ${lengthDim}
      ${widthDim}
      ${heightDim}
      ${doorWidthDim}
      ${doorHeightDim}
      ${longWallCutDim}
      ${shortWallCutDim}
      ${floorCutDim}
    </svg>
  `
}
