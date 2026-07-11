import type { ChamberInput, ChamberResult } from './calculator'
import { buildCenteredDoorSpan } from './chamberGeometry'

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

function text(point: Point, value: string, anchor: 'start' | 'middle' | 'end' = 'middle'): string {
  return `<text class="dim-text" x="${n(point.x)}" y="${n(point.y)}" text-anchor="${anchor}">${value}</text>`
}

function dim(start: Point, end: Point, label: string, labelOffset: Point = { x: 0, y: -8 }): string {
  const mid = { x: (start.x + end.x) / 2 + labelOffset.x, y: (start.y + end.y) / 2 + labelOffset.y }
  return `${line(start, end)}${text(mid, label)}`
}

export function buildSide3dSvg(input: ChamberInput, result: ChamberResult): string {
  const longMm = result.longSideMm
  const shortMm = result.shortSideMm
  const heightMm = input.heightMm
  const thicknessMm = input.thicknessMm
  const wallHeightMm = Math.max(heightMm - thicknessMm, thicknessMm)
  const floorLongMm = Math.max(0, longMm - 2 * thicknessMm)
  const floorShortMm = Math.max(0, shortMm - 2 * thicknessMm)

  const width = 900
  const height = 430
  const depthX = 0.36
  const depthY = 0.22
  const scale = Math.min(560 / (longMm + shortMm * depthX), 265 / (heightMm + shortMm * depthY))
  const ox = 82
  const oy = 354

  const p = (x: number, y: number, z: number): Point => ({
    x: ox + (longMm - x + z * depthX) * scale,
    y: oy - (y + z * depthY) * scale
  })

  const doorSpan = buildCenteredDoorSpan(longMm, input.doorWidthMm)
  const doorWidthMm = doorSpan.widthMm
  const doorHeightMm = Math.min(input.doorHeightMm, wallHeightMm)
  const doorLeftMm = doorSpan.leftMm
  const doorRightMm = doorSpan.rightMm
  const frontWall = [p(0, 0, 0), p(longMm, 0, 0), p(longMm, wallHeightMm, 0), p(0, wallHeightMm, 0)]
  const rightWall = [p(longMm, 0, 0), p(longMm, 0, shortMm), p(longMm, wallHeightMm, shortMm), p(longMm, wallHeightMm, 0)]
  const backWall = [p(0, 0, shortMm), p(longMm, 0, shortMm), p(longMm, wallHeightMm, shortMm), p(0, wallHeightMm, shortMm)]
  const floor = [
    p(thicknessMm, thicknessMm, thicknessMm),
    p(thicknessMm + floorLongMm, thicknessMm, thicknessMm),
    p(thicknessMm + floorLongMm, thicknessMm, thicknessMm + floorShortMm),
    p(thicknessMm, thicknessMm, thicknessMm + floorShortMm)
  ]
  const ceiling = [p(0, heightMm, 0), p(longMm, heightMm, 0), p(longMm, heightMm, shortMm), p(0, heightMm, shortMm)]
  const door = [p(doorLeftMm, 0, -35), p(doorRightMm, 0, -35), p(doorRightMm, doorHeightMm, -35), p(doorLeftMm, doorHeightMm, -35)]

  const panelStep = 1190
  const frontSeams: string[] = []
  for (let x = panelStep; x < longMm; x += panelStep) {
    frontSeams.push(line(p(x, 0, -10), p(x, wallHeightMm, -10), 'seam-line'))
  }

  const floorSeams: string[] = []
  for (let x = thicknessMm + panelStep; x < thicknessMm + floorLongMm; x += panelStep) {
    floorSeams.push(line(p(x, thicknessMm + 8, thicknessMm), p(x, thicknessMm + 8, thicknessMm + floorShortMm), 'floor-seam'))
  }

  const roofSeams: string[] = []
  for (let x = panelStep; x < longMm; x += panelStep) {
    roofSeams.push(line(p(x, heightMm + 5, 0), p(x, heightMm + 5, shortMm), 'seam-line'))
  }

  const lengthDimZ = -shortMm * 0.18
  const lengthDim = dim(p(0, 0, lengthDimZ), p(longMm, 0, lengthDimZ), `Длина ${fmt(longMm)}`, { x: 0, y: 18 })
  const widthStart = p(longMm, 0, 0)
  const widthEnd = p(longMm, 0, shortMm)
  const widthDim = dim(
    { x: widthStart.x + 42, y: widthStart.y + 8 },
    { x: widthEnd.x + 42, y: widthEnd.y + 8 },
    `Ширина ${fmt(shortMm)}`,
    { x: 34, y: 4 }
  )
  const heightStart = p(longMm, 0, shortMm)
  const heightEnd = p(longMm, heightMm, shortMm)
  const heightDim = dim(
    { x: heightStart.x + 72, y: heightStart.y },
    { x: heightEnd.x + 72, y: heightEnd.y },
    `Высота ${fmt(heightMm)}`,
    { x: 46, y: 4 }
  )
  const doorWidthDim = dim(
    p(doorLeftMm, doorHeightMm + 180, -90),
    p(doorRightMm, doorHeightMm + 180, -90),
    `Ширина двери ${fmt(input.doorWidthMm)}`,
    { x: 0, y: -10 }
  )
  const doorHeightDim = dim(
    p(doorRightMm + 210, 0, -90),
    p(doorRightMm + 210, doorHeightMm, -90),
    `Высота двери ${fmt(input.doorHeightMm)}`,
    { x: 54, y: 4 }
  )

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="3D-вид камеры с размерами">
      <defs>
        <marker id="dim-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 Z" fill="#163246" />
        </marker>
      </defs>
      <style>
        .dim-line { stroke: #163246; stroke-width: 1.7; marker-start: url(#dim-arrow); marker-end: url(#dim-arrow); }
        .seam-line { stroke: #8a9096; stroke-width: 1; }
        .floor-seam { stroke: #a8a39a; stroke-width: 1; }
        .dim-text { font: 700 13px Arial, sans-serif; fill: #163246; stroke: #fff; stroke-width: 4px; paint-order: stroke; }
      </style>
      <rect width="${width}" height="${height}" fill="#eef2f5" />
      ${polygon(backWall, '#dbe6ee', '#234f6c', 0.86)}
      ${polygon(rightWall, '#d2dee8', '#234f6c', 0.92)}
      ${polygon(frontWall, '#f8fbfd', '#234f6c', 0.78)}
      ${polygon(floor, input.hasPanelFloor ? '#ffffff' : '#e6edf2', '#7c8896', input.hasPanelFloor ? 1 : 0.8)}
      ${floorSeams.join('')}
      ${frontSeams.join('')}
      ${polygon(ceiling, '#ffffff', '#234f6c', 0.96)}
      ${roofSeams.join('')}
      ${polygon(door, '#f6f8f9', '#a64a3c', 1)}
      <polyline points="${pointsToString([p(doorLeftMm, 0, -45), p(doorLeftMm, doorHeightMm, -45), p(doorRightMm, doorHeightMm, -45), p(doorRightMm, 0, -45)])}" fill="none" stroke="#a64a3c" stroke-width="4" />
      ${lengthDim}
      ${widthDim}
      ${heightDim}
      ${doorWidthDim}
      ${doorHeightDim}
    </svg>
  `
}
