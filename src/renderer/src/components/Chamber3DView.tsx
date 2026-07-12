import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Minimize2, RotateCcw } from 'lucide-react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { PANEL_WORKING_WIDTH_MM, type ChamberInput } from '@renderer/domain/calculator'
import { buildChamberPanelRuns, buildPanelRun, normalizeDoorPlacement } from '@renderer/domain/chamberGeometry'

interface Chamber3DViewProps {
  input: ChamberInput
}

interface ModelMetrics {
  lengthMm: number
  widthMm: number
  lengthM: number
  widthM: number
  floorLengthM: number
  floorWidthM: number
  wallHeightM: number
  totalHeightM: number
}

interface DimensionLabelData {
  label: string
  lineEnd: THREE.Vector3
  lineStart: THREE.Vector3
}

interface DimensionLabelAnnotation {
  angle: number
  box: ScreenBox
  h: number
  label: string
  w: number
  x: number
  y: number
}

interface DimensionSprite extends THREE.Sprite {
  userData: THREE.Sprite['userData'] & {
    dimensionLabel?: DimensionLabelData
  }
}

const MIN_MODEL_SIDE_M = 0.25
const SEAM_WIDTH_M = 0.018
const SEAM_FACE_DEPTH_M = 0.012
const SEAM_FACE_OFFSET_M = 0.002
const CAMERA_FOV_DEG = 26
const CAMERA_DISTANCE_FACTOR = 1.42

function mmToM(value: number): number {
  return Math.max(value / 1000, MIN_MODEL_SIDE_M)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function formatMm(value: number): string {
  return `${Math.round(value)} мм`
}

function addBox(
  group: THREE.Group,
  size: THREE.Vector3,
  position: THREE.Vector3,
  material: THREE.Material,
  edgeMaterial?: THREE.Material
): THREE.Mesh | null {
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) {
    return null
  }

  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(position)
  group.add(mesh)

  if (edgeMaterial) {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial)
    edges.position.copy(position)
    group.add(edges)
  }

  return mesh
}

function addLine(group: THREE.Group, points: THREE.Vector3[], material: THREE.Material): void {
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const line = new THREE.Line(geometry, material)
  line.renderOrder = 20
  group.add(line)
}

function makeTextSprite(): THREE.Sprite {
  const material = new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  sprite.renderOrder = 30

  return sprite
}

function getDimensionLabelData(sprite: THREE.Sprite): DimensionLabelData | undefined {
  return (sprite as DimensionSprite).userData.dimensionLabel
}

function isDimensionSprite(object: THREE.Object3D): object is DimensionSprite {
  return object.type === 'Sprite' && Boolean(getDimensionLabelData(object as THREE.Sprite))
}

function worldToScreen(
  worldPosition: THREE.Vector3,
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number; z: number } {
  const projected = worldPosition.clone().project(camera)

  return {
    x: (projected.x * 0.5 + 0.5) * viewportWidth,
    y: (-projected.y * 0.5 + 0.5) * viewportHeight,
    z: projected.z
  }
}

function getReadableScreenAngle(start: { x: number; y: number }, end: { x: number; y: number }): number {
  const dx = end.x - start.x
  const dy = end.y - start.y

  if (Math.hypot(dx, dy) < 0.01) {
    return 0
  }

  let angle = Math.atan2(dy, dx)

  if (angle > Math.PI / 2) {
    angle -= Math.PI
  } else if (angle < -Math.PI / 2) {
    angle += Math.PI
  }

  return angle
}

function alignDimensionLabels(
  root: THREE.Object3D,
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number
): void {
  root.traverse((object) => {
    if (!isDimensionSprite(object)) {
      return
    }

    const data = object.userData.dimensionLabel

    if (!data) {
      return
    }

    const localLineCenter = data.lineStart.clone().add(data.lineEnd).multiplyScalar(0.5)
    object.position.copy(localLineCenter)

    const parent = object.parent
    const worldPosition = parent ? parent.localToWorld(localLineCenter.clone()) : localLineCenter.clone()
    const worldLineStart = parent ? parent.localToWorld(data.lineStart.clone()) : data.lineStart.clone()
    const worldLineEnd = parent ? parent.localToWorld(data.lineEnd.clone()) : data.lineEnd.clone()
    const projected = worldToScreen(worldPosition, camera, viewportWidth, viewportHeight)

    if (projected.z < -1 || projected.z > 1) {
      return
    }

    const startScreen = worldToScreen(worldLineStart, camera, viewportWidth, viewportHeight)
    const endScreen = worldToScreen(worldLineEnd, camera, viewportWidth, viewportHeight)
    const angleRad = getReadableScreenAngle(startScreen, endScreen)
    ;(object.material as THREE.SpriteMaterial).rotation = -angleRad
  })
}

function layoutDimensionLabels(
  root: THREE.Object3D,
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number
): void {
  root.updateMatrixWorld(true)
  camera.updateMatrixWorld(true)
  alignDimensionLabels(root, camera, viewportWidth, viewportHeight)
}

function screenBoxesOverlap(a: ScreenBox, b: ScreenBox, gap = 6): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y
}

function screenBoxOverlapArea(a: ScreenBox, b: ScreenBox): number {
  const width = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const height = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return width * height
}

function collectDimensionLabelAnnotations(
  ctx: CanvasRenderingContext2D,
  root: THREE.Object3D,
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number,
  uiScale: number
): DimensionLabelAnnotation[] {
  const annotations: DimensionLabelAnnotation[] = []

  ctx.save()
  ctx.font = `700 ${11 * uiScale}px Arial, sans-serif`

  root.traverse((object) => {
    if (!isDimensionSprite(object)) {
      return
    }

    const data = object.userData.dimensionLabel
    if (!data) {
      return
    }

    const localCenter = data.lineStart.clone().add(data.lineEnd).multiplyScalar(0.5)
    const parent = object.parent
    const worldCenter = parent ? parent.localToWorld(localCenter) : localCenter
    const worldStart = parent ? parent.localToWorld(data.lineStart.clone()) : data.lineStart.clone()
    const worldEnd = parent ? parent.localToWorld(data.lineEnd.clone()) : data.lineEnd.clone()
    const projectedCenter = worldToScreen(worldCenter, camera, viewportWidth, viewportHeight)
    if (projectedCenter.z < -1 || projectedCenter.z > 1) {
      return
    }

    const angle = getReadableScreenAngle(
      worldToScreen(worldStart, camera, viewportWidth, viewportHeight),
      worldToScreen(worldEnd, camera, viewportWidth, viewportHeight)
    )
    const w = ctx.measureText(data.label).width + 12 * uiScale
    const h = 19 * uiScale
    const boundsW = Math.abs(Math.cos(angle)) * w + Math.abs(Math.sin(angle)) * h
    const boundsH = Math.abs(Math.sin(angle)) * w + Math.abs(Math.cos(angle)) * h
    annotations.push({
      angle,
      box: {
        x: projectedCenter.x - boundsW / 2,
        y: projectedCenter.y - boundsH / 2,
        w: boundsW,
        h: boundsH
      },
      h,
      label: data.label,
      w,
      x: projectedCenter.x,
      y: projectedCenter.y
    })
  })

  ctx.restore()
  return annotations
}

function drawDimensionLabelAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: DimensionLabelAnnotation[],
  uiScale: number
): void {
  ctx.save()
  ctx.font = `700 ${11 * uiScale}px Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (const annotation of annotations) {
    ctx.save()
    ctx.translate(annotation.x, annotation.y)
    ctx.rotate(annotation.angle)
    roundRect(ctx, -annotation.w / 2, -annotation.h / 2, annotation.w, annotation.h, 4 * uiScale)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)'
    ctx.fill()
    ctx.strokeStyle = '#163246'
    ctx.lineWidth = uiScale
    ctx.stroke()
    ctx.fillStyle = '#163246'
    ctx.fillText(annotation.label, 0, 0.5 * uiScale)
    ctx.restore()
  }

  ctx.restore()
}

function isWorldPointOccluded(root: THREE.Object3D, camera: THREE.Camera, point: THREE.Vector3): boolean {
  const cameraPosition = new THREE.Vector3()
  camera.getWorldPosition(cameraPosition)
  const direction = point.clone().sub(cameraPosition)
  const distance = direction.length()
  if (distance < 0.08) {
    return false
  }

  const occluders: THREE.Object3D[] = []
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.visible) {
      occluders.push(object)
    }
  })

  const raycaster = new THREE.Raycaster(cameraPosition, direction.normalize(), 0.01, distance - 0.06)
  return raycaster.intersectObjects(occluders, false).length > 0
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tip: ScreenPoint,
  tangentX: number,
  tangentY: number,
  direction: 1 | -1,
  size: number
): void {
  const crossX = -tangentY
  const crossY = tangentX
  const baseX = tip.x + tangentX * size * direction
  const baseY = tip.y + tangentY * size * direction

  ctx.beginPath()
  ctx.moveTo(tip.x, tip.y)
  ctx.lineTo(baseX + crossX * size * 0.46, baseY + crossY * size * 0.46)
  ctx.lineTo(baseX - crossX * size * 0.46, baseY - crossY * size * 0.46)
  ctx.closePath()
  ctx.fill()
}

function drawCutDimensionAnnotations(
  ctx: CanvasRenderingContext2D,
  root: THREE.Object3D,
  anchors: CutDimensionAnchor[],
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number
): void {
  const uiScale = clamp(Math.min(viewportWidth / 720, viewportHeight / 420), 0.9, 1.65)
  const dimensionLabelScale = Math.min(uiScale, 22 / 19)
  const dimensionLabels = collectDimensionLabelAnnotations(
    ctx,
    root,
    camera,
    viewportWidth,
    viewportHeight,
    dimensionLabelScale
  )
  const occupied = dimensionLabels.map((annotation) => annotation.box)
  occupied.push({ x: viewportWidth - 104 * uiScale, y: 8 * uiScale, w: 96 * uiScale, h: 48 * uiScale })

  const visible = anchors
    .filter((anchor) => {
      const midpoint = anchor.start.clone().add(anchor.end).multiplyScalar(0.5)
      const toCamera = camera.position.clone().sub(midpoint).normalize()
      const facesCamera = anchor.normal.dot(toCamera) > (anchor.kind === 'floor' ? 0.08 : 0.12)
      return facesCamera && (!anchor.labelGuide || !isWorldPointOccluded(root, camera, anchor.labelGuide.position))
    })
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'wall' ? -1 : 1))

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.font = `700 ${11 * uiScale}px Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const color = '#9a4f12'
  const labelsToDraw: Array<{ angle: number; h: number; label: string; w: number; x: number; y: number }> = []

  for (const anchor of visible) {
    const start = worldToScreen(anchor.start, camera, viewportWidth, viewportHeight)
    const end = worldToScreen(anchor.end, camera, viewportWidth, viewportHeight)
    if (start.z < -1 || start.z > 1 || end.z < -1 || end.z > 1) {
      continue
    }

    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.hypot(dx, dy)
    if (length < 2) {
      continue
    }

    const tangentX = dx / length
    const tangentY = dy / length
    const midpointWorld = anchor.start.clone().add(anchor.end).multiplyScalar(0.5)
    const midpoint = worldToScreen(midpointWorld, camera, viewportWidth, viewportHeight)
    const annotationNormal = anchor.labelGuide
      ? anchor.labelGuide.position.clone().sub(midpointWorld).normalize()
      : anchor.normal
    const normalPoint = worldToScreen(
      midpointWorld.clone().add(annotationNormal.clone().multiplyScalar(0.35)),
      camera,
      viewportWidth,
      viewportHeight
    )
    let normalX = normalPoint.x - midpoint.x
    let normalY = normalPoint.y - midpoint.y
    const normalLength = Math.hypot(normalX, normalY)
    if (normalLength < 0.5) {
      normalX = -tangentY
      normalY = tangentX
    } else {
      normalX /= normalLength
      normalY /= normalLength
    }

    const lineOffset = 11 * uiScale
    const dimStart = { x: start.x + normalX * lineOffset, y: start.y + normalY * lineOffset, z: start.z }
    const dimEnd = { x: end.x + normalX * lineOffset, y: end.y + normalY * lineOffset, z: end.z }
    const dimMid = { x: (dimStart.x + dimEnd.x) / 2, y: (dimStart.y + dimEnd.y) / 2 }
    const labelW = ctx.measureText(anchor.label).width + 12 * uiScale
    const labelH = 19 * uiScale
    const candidates: Array<{ x: number; y: number }> = []
    let labelAngle = 0

    if (anchor.labelGuide) {
      const guideStart = worldToScreen(anchor.labelGuide.start, camera, viewportWidth, viewportHeight)
      const guideEnd = worldToScreen(anchor.labelGuide.end, camera, viewportWidth, viewportHeight)
      labelAngle = getReadableScreenAngle(guideStart, guideEnd)
      candidates.push(worldToScreen(anchor.labelGuide.position, camera, viewportWidth, viewportHeight))
    } else {
      for (const direction of [1, -1]) {
        for (const distance of [25, 42, 59]) {
          candidates.push({
            x: dimMid.x + normalX * distance * uiScale * direction,
            y: dimMid.y + normalY * distance * uiScale * direction
          })
        }
      }
      for (const direction of [-1, 1]) {
        candidates.push({
          x: dimMid.x + tangentX * direction * (labelW / 2 + 16 * uiScale),
          y: dimMid.y + tangentY * direction * (labelW / 2 + 16 * uiScale)
        })
      }
    }

    const margin = 8 * uiScale
    const boundsW = Math.abs(Math.cos(labelAngle)) * labelW + Math.abs(Math.sin(labelAngle)) * labelH
    const boundsH = Math.abs(Math.sin(labelAngle)) * labelW + Math.abs(Math.cos(labelAngle)) * labelH
    const boxes = candidates.map((candidate) =>
      anchor.labelGuide
        ? { x: candidate.x - boundsW / 2, y: candidate.y - boundsH / 2, w: boundsW, h: boundsH }
        : {
            x: clamp(candidate.x - boundsW / 2, margin, viewportWidth - margin - boundsW),
            y: clamp(candidate.y - boundsH / 2, margin, viewportHeight - margin - boundsH),
            w: boundsW,
            h: boundsH
          }
    )
    const box = anchor.labelGuide
      ? boxes[0]
      : (boxes.find((candidate) => !occupied.some((other) => screenBoxesOverlap(candidate, other, 5 * uiScale))) ??
        boxes.reduce((best, candidate) => {
          const score = occupied.reduce((sum, other) => sum + screenBoxOverlapArea(candidate, other), 0)
          const bestScore = occupied.reduce((sum, other) => sum + screenBoxOverlapArea(best, other), 0)
          return score < bestScore ? candidate : best
        }))
    if (!box) {
      continue
    }
    occupied.push(box)

    const labelCenterX = box.x + box.w / 2
    const labelCenterY = box.y + box.h / 2
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = 1.35 * uiScale

    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(dimStart.x, dimStart.y)
    ctx.moveTo(end.x, end.y)
    ctx.lineTo(dimEnd.x, dimEnd.y)
    ctx.moveTo(dimStart.x, dimStart.y)
    ctx.lineTo(dimEnd.x, dimEnd.y)
    ctx.stroke()

    const arrowSize = Math.min(7 * uiScale, Math.max(3.5 * uiScale, length * 0.24))
    drawArrowHead(ctx, dimStart, tangentX, tangentY, 1, arrowSize)
    drawArrowHead(ctx, dimEnd, tangentX, tangentY, -1, arrowSize)

    ctx.save()
    ctx.setLineDash([3 * uiScale, 3 * uiScale])
    ctx.beginPath()
    ctx.moveTo(dimMid.x, dimMid.y)
    ctx.lineTo(labelCenterX, labelCenterY)
    ctx.stroke()
    ctx.restore()

    labelsToDraw.push({ angle: labelAngle, h: labelH, label: anchor.label, w: labelW, x: labelCenterX, y: labelCenterY })
  }

  drawDimensionLabelAnnotations(ctx, dimensionLabels, dimensionLabelScale)

  for (const label of labelsToDraw) {
    ctx.save()
    ctx.translate(label.x, label.y)
    ctx.rotate(label.angle)
    roundRect(ctx, -label.w / 2, -label.h / 2, label.w, label.h, 4 * uiScale)
    ctx.fillStyle = 'rgba(255, 250, 244, 0.96)'
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = uiScale
    ctx.stroke()
    ctx.fillStyle = color
    ctx.fillText(label.label, 0, 0.5 * uiScale)
    ctx.restore()
  }

  ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function addPanelSeams(
  group: THREE.Group,
  metrics: ModelMetrics,
  thicknessM: number,
  seamMaterial: THREE.Material
): void {
  const panelStepM = PANEL_WORKING_WIDTH_MM / 1000
  const wallCenterY = metrics.wallHeightM / 2
  const frontSurfaceZ = -metrics.widthM / 2 - thicknessM - 0.006
  const backSurfaceZ = metrics.widthM / 2 + thicknessM + 0.006
  const leftSurfaceX = -metrics.lengthM / 2 - thicknessM - 0.006
  const rightSurfaceX = metrics.lengthM / 2 + thicknessM + 0.006

  for (let x = -metrics.lengthM / 2 + panelStepM; x < metrics.lengthM / 2; x += panelStepM) {
    addBox(
      group,
      new THREE.Vector3(SEAM_WIDTH_M, metrics.wallHeightM, SEAM_WIDTH_M),
      new THREE.Vector3(x, wallCenterY, frontSurfaceZ),
      seamMaterial
    )
    addBox(
      group,
      new THREE.Vector3(SEAM_WIDTH_M, metrics.wallHeightM, SEAM_WIDTH_M),
      new THREE.Vector3(x, wallCenterY, backSurfaceZ),
      seamMaterial
    )
  }

  for (let z = -metrics.widthM / 2 + panelStepM; z < metrics.widthM / 2; z += panelStepM) {
    addBox(
      group,
      new THREE.Vector3(SEAM_WIDTH_M, metrics.wallHeightM, SEAM_WIDTH_M),
      new THREE.Vector3(leftSurfaceX, wallCenterY, z),
      seamMaterial
    )
    addBox(
      group,
      new THREE.Vector3(SEAM_WIDTH_M, metrics.wallHeightM, SEAM_WIDTH_M),
      new THREE.Vector3(rightSurfaceX, wallCenterY, z),
      seamMaterial
    )
  }
}

function addInteriorPanelSeams(
  group: THREE.Group,
  metrics: ModelMetrics,
  thicknessM: number,
  seamMaterial: THREE.Material
): void {
  const panelStepM = PANEL_WORKING_WIDTH_MM / 1000
  const wallCenterY = metrics.wallHeightM / 2
  const frontInnerZ = -metrics.widthM / 2 + 0.008
  const backInnerZ = metrics.widthM / 2 - 0.008
  const leftInnerX = -metrics.lengthM / 2 + 0.008
  const rightInnerX = metrics.lengthM / 2 - 0.008

  for (let x = -metrics.lengthM / 2 + panelStepM; x < metrics.lengthM / 2; x += panelStepM) {
    addBox(
      group,
      new THREE.Vector3(SEAM_WIDTH_M, metrics.wallHeightM, SEAM_WIDTH_M),
      new THREE.Vector3(x, wallCenterY, frontInnerZ),
      seamMaterial
    )
    addBox(
      group,
      new THREE.Vector3(SEAM_WIDTH_M, metrics.wallHeightM, SEAM_WIDTH_M),
      new THREE.Vector3(x, wallCenterY, backInnerZ),
      seamMaterial
    )
  }

  for (let z = -metrics.widthM / 2 + panelStepM; z < metrics.widthM / 2; z += panelStepM) {
    addBox(
      group,
      new THREE.Vector3(SEAM_WIDTH_M, metrics.wallHeightM, SEAM_WIDTH_M),
      new THREE.Vector3(leftInnerX, wallCenterY, z),
      seamMaterial
    )
    addBox(
      group,
      new THREE.Vector3(SEAM_WIDTH_M, metrics.wallHeightM, SEAM_WIDTH_M),
      new THREE.Vector3(rightInnerX, wallCenterY, z),
      seamMaterial
    )
  }
}

function wallPanelSegments(spanM: number): Array<{ offsetM: number; sizeM: number; isCut: boolean }> {
  return buildPanelRun(spanM * 1000).segments.map((segment) => ({
    isCut: segment.isCut,
    offsetM: segment.offsetMm / 1000,
    sizeM: segment.sizeMm / 1000
  }))
}

interface CutDimensionAnchor {
  end: THREE.Vector3
  kind: 'floor' | 'wall'
  label: string
  labelGuide?: {
    end: THREE.Vector3
    position: THREE.Vector3
    start: THREE.Vector3
  }
  normal: THREE.Vector3
  start: THREE.Vector3
}

interface ScreenBox {
  x: number
  y: number
  w: number
  h: number
}

interface ScreenPoint {
  x: number
  y: number
  z: number
}

function addWallPanels(
  group: THREE.Group,
  metrics: ModelMetrics,
  thicknessM: number,
  panelMaterial: THREE.Material,
  sidePanelMaterial: THREE.Material,
  cutMaterial: THREE.Material,
  seamMaterial: THREE.Material,
  edgeMaterial: THREE.Material
): void {
  const xMin = -metrics.lengthM / 2
  const xMax = metrics.lengthM / 2
  const zMin = -metrics.widthM / 2
  const zMax = metrics.widthM / 2
  const y = metrics.wallHeightM / 2
  const longSpanM = Math.max(metrics.lengthM, 0)
  const shortSpanM = Math.max(metrics.widthM - 2 * thicknessM, 0)
  const seamFaceOffsetM = SEAM_FACE_DEPTH_M / 2 + SEAM_FACE_OFFSET_M

  const addXWall = (
    startX: number,
    direction: 1 | -1,
    centerZ: number,
    material: THREE.Material
  ): void => {
    for (const segment of wallPanelSegments(longSpanM)) {
      const centerX = startX + direction * (segment.offsetM + segment.sizeM / 2)
      addBox(
        group,
        new THREE.Vector3(segment.sizeM, metrics.wallHeightM, thicknessM),
        new THREE.Vector3(centerX, y, centerZ),
        segment.isCut ? cutMaterial : material,
        edgeMaterial
      )

      const seamX = startX + direction * (segment.offsetM + segment.sizeM)
      if (segment.offsetM + segment.sizeM < longSpanM - 0.001) {
        const verticalFaceSize = new THREE.Vector3(SEAM_WIDTH_M, metrics.wallHeightM, SEAM_FACE_DEPTH_M)
        const horizontalFaceSize = new THREE.Vector3(SEAM_WIDTH_M, SEAM_FACE_DEPTH_M, thicknessM)
        addBox(
          group,
          verticalFaceSize,
          new THREE.Vector3(seamX, y, centerZ + thicknessM / 2 + seamFaceOffsetM),
          seamMaterial
        )
        addBox(
          group,
          verticalFaceSize,
          new THREE.Vector3(seamX, y, centerZ - thicknessM / 2 - seamFaceOffsetM),
          seamMaterial
        )
        addBox(
          group,
          horizontalFaceSize,
          new THREE.Vector3(seamX, metrics.wallHeightM + seamFaceOffsetM, centerZ),
          seamMaterial
        )
        addBox(
          group,
          horizontalFaceSize,
          new THREE.Vector3(seamX, -seamFaceOffsetM, centerZ),
          seamMaterial
        )
      }
    }
  }

  const addZWall = (
    centerX: number,
    startZ: number,
    direction: 1 | -1,
    material: THREE.Material
  ): void => {
    for (const segment of wallPanelSegments(shortSpanM)) {
      const centerZ = startZ + direction * (segment.offsetM + segment.sizeM / 2)
      addBox(
        group,
        new THREE.Vector3(thicknessM, metrics.wallHeightM, segment.sizeM),
        new THREE.Vector3(centerX, y, centerZ),
        segment.isCut ? cutMaterial : material,
        edgeMaterial
      )

      const seamZ = startZ + direction * (segment.offsetM + segment.sizeM)
      if (segment.offsetM + segment.sizeM < shortSpanM - 0.001) {
        const verticalFaceSize = new THREE.Vector3(SEAM_FACE_DEPTH_M, metrics.wallHeightM, SEAM_WIDTH_M)
        const horizontalFaceSize = new THREE.Vector3(thicknessM, SEAM_FACE_DEPTH_M, SEAM_WIDTH_M)
        addBox(
          group,
          verticalFaceSize,
          new THREE.Vector3(centerX + thicknessM / 2 + seamFaceOffsetM, y, seamZ),
          seamMaterial
        )
        addBox(
          group,
          verticalFaceSize,
          new THREE.Vector3(centerX - thicknessM / 2 - seamFaceOffsetM, y, seamZ),
          seamMaterial
        )
        addBox(
          group,
          horizontalFaceSize,
          new THREE.Vector3(centerX, metrics.wallHeightM + seamFaceOffsetM, seamZ),
          seamMaterial
        )
        addBox(
          group,
          horizontalFaceSize,
          new THREE.Vector3(centerX, -seamFaceOffsetM, seamZ),
          seamMaterial
        )
      }
    }
  }

  // Long front/back walls cover the full outside length; short side walls sit
  // inside between them.
  addXWall(xMin, 1, zMax - thicknessM / 2, sidePanelMaterial)
  addZWall(xMax - thicknessM / 2, zMin + thicknessM, 1, sidePanelMaterial)
  addXWall(xMin, 1, zMin + thicknessM / 2, panelMaterial)
  addZWall(xMin + thicknessM / 2, zMin + thicknessM, 1, panelMaterial)
}

function addDeckSeams(
  group: THREE.Group,
  metrics: ModelMetrics,
  thicknessM: number,
  hasPanelFloor: boolean,
  seamMaterial: THREE.Material,
  cutMaterial: THREE.Material
): void {
  const panelStepM = PANEL_WORKING_WIDTH_MM / 1000
  const seamFaceOffsetM = SEAM_FACE_DEPTH_M / 2 + SEAM_FACE_OFFSET_M
  const ceilingY = metrics.totalHeightM + 0.008
  const floorY = thicknessM + 0.008

  const addXDeckSeamOnFaces = (x: number, yMin: number, yMax: number, widthM: number): void => {
    const centerY = (yMin + yMax) / 2
    const thicknessY = yMax - yMin
    const surfaceSize = new THREE.Vector3(SEAM_WIDTH_M, SEAM_FACE_DEPTH_M, widthM)
    const edgeSize = new THREE.Vector3(SEAM_WIDTH_M, thicknessY, SEAM_FACE_DEPTH_M)

    addBox(group, surfaceSize, new THREE.Vector3(x, yMax + seamFaceOffsetM, 0), seamMaterial)
    addBox(group, surfaceSize, new THREE.Vector3(x, yMin - seamFaceOffsetM, 0), seamMaterial)
    addBox(group, edgeSize, new THREE.Vector3(x, centerY, widthM / 2 + seamFaceOffsetM), seamMaterial)
    addBox(group, edgeSize, new THREE.Vector3(x, centerY, -widthM / 2 - seamFaceOffsetM), seamMaterial)
  }

  const addZDeckSeamOnFaces = (z: number, yMin: number, yMax: number, lengthM: number): void => {
    const centerY = (yMin + yMax) / 2
    const thicknessY = yMax - yMin
    const surfaceSize = new THREE.Vector3(lengthM, SEAM_FACE_DEPTH_M, SEAM_WIDTH_M)
    const edgeSize = new THREE.Vector3(SEAM_FACE_DEPTH_M, thicknessY, SEAM_WIDTH_M)

    addBox(group, surfaceSize, new THREE.Vector3(0, yMax + seamFaceOffsetM, z), seamMaterial)
    addBox(group, surfaceSize, new THREE.Vector3(0, yMin - seamFaceOffsetM, z), seamMaterial)
    addBox(group, edgeSize, new THREE.Vector3(lengthM / 2 + seamFaceOffsetM, centerY, z), seamMaterial)
    addBox(group, edgeSize, new THREE.Vector3(-lengthM / 2 - seamFaceOffsetM, centerY, z), seamMaterial)
  }

  if (metrics.lengthM >= metrics.widthM) {
    const ceilingRun = buildPanelRun(metrics.lengthM * 1000)

    for (let x = -metrics.lengthM / 2 + panelStepM; x < metrics.lengthM / 2; x += panelStepM) {
      addXDeckSeamOnFaces(x, metrics.wallHeightM, metrics.totalHeightM, metrics.widthM)
    }

    if (ceilingRun.hasCut) {
      const cutSizeM = ceilingRun.remainderMm / 1000
      const cutCenterX = metrics.lengthM / 2 - cutSizeM / 2
      addBox(
        group,
        new THREE.Vector3(cutSizeM, 0.014, metrics.widthM),
        new THREE.Vector3(cutCenterX, ceilingY + 0.002, 0),
        cutMaterial
      )
    }

    if (!hasPanelFloor) {
      return
    }

    const floorRun = buildPanelRun(metrics.floorLengthM * 1000)

    for (let x = -metrics.floorLengthM / 2 + panelStepM; x < metrics.floorLengthM / 2; x += panelStepM) {
      addXDeckSeamOnFaces(x, 0, thicknessM, metrics.floorWidthM)
    }

    if (floorRun.hasCut) {
      const cutSizeM = floorRun.remainderMm / 1000
      const cutCenterX = metrics.floorLengthM / 2 - cutSizeM / 2
      const cutSize = new THREE.Vector3(cutSizeM, 0.014, metrics.floorWidthM)
      addBox(group, cutSize, new THREE.Vector3(cutCenterX, floorY + 0.002, 0), cutMaterial)
      addBox(group, cutSize, new THREE.Vector3(cutCenterX, -0.01, 0), cutMaterial)
    }

  } else {
    const ceilingRun = buildPanelRun(metrics.widthM * 1000)

    for (let z = -metrics.widthM / 2 + panelStepM; z < metrics.widthM / 2; z += panelStepM) {
      addZDeckSeamOnFaces(z, metrics.wallHeightM, metrics.totalHeightM, metrics.lengthM)
    }

    if (ceilingRun.hasCut) {
      const cutSizeM = ceilingRun.remainderMm / 1000
      const cutCenterZ = metrics.widthM / 2 - cutSizeM / 2
      addBox(
        group,
        new THREE.Vector3(metrics.lengthM, 0.014, cutSizeM),
        new THREE.Vector3(0, ceilingY + 0.002, cutCenterZ),
        cutMaterial
      )
    }

    if (!hasPanelFloor) {
      return
    }

    const floorRun = buildPanelRun(metrics.floorWidthM * 1000)

    for (let z = -metrics.floorWidthM / 2 + panelStepM; z < metrics.floorWidthM / 2; z += panelStepM) {
      addZDeckSeamOnFaces(z, 0, thicknessM, metrics.floorLengthM)
    }

    if (floorRun.hasCut) {
      const cutSizeM = floorRun.remainderMm / 1000
      const cutCenterZ = metrics.floorWidthM / 2 - cutSizeM / 2
      const cutSize = new THREE.Vector3(metrics.floorLengthM, 0.014, cutSizeM)
      addBox(group, cutSize, new THREE.Vector3(0, floorY + 0.002, cutCenterZ), cutMaterial)
      addBox(group, cutSize, new THREE.Vector3(0, -0.01, cutCenterZ), cutMaterial)
    }

  }
}

function addPerimeterProfiles(
  group: THREE.Group,
  metrics: ModelMetrics,
  thicknessM: number,
  profileMaterial: THREE.Material
): void {
  const profileW = Math.max(thicknessM * 0.55, 0.045)
  const profileH = 0.045
  const bottomY = profileH / 2
  const ceilingY = metrics.totalHeightM - profileH / 2
  const frontZ = -metrics.widthM / 2 - thicknessM - profileW / 2
  const backZ = metrics.widthM / 2 + thicknessM + profileW / 2
  const leftX = -metrics.lengthM / 2 - thicknessM - profileW / 2
  const rightX = metrics.lengthM / 2 + thicknessM + profileW / 2

  for (const y of [bottomY, ceilingY]) {
    addBox(group, new THREE.Vector3(metrics.lengthM + thicknessM * 2, profileH, profileW), new THREE.Vector3(0, y, frontZ), profileMaterial)
    addBox(group, new THREE.Vector3(metrics.lengthM + thicknessM * 2, profileH, profileW), new THREE.Vector3(0, y, backZ), profileMaterial)
    addBox(group, new THREE.Vector3(profileW, profileH, metrics.widthM + thicknessM * 2), new THREE.Vector3(leftX, y, 0), profileMaterial)
    addBox(group, new THREE.Vector3(profileW, profileH, metrics.widthM + thicknessM * 2), new THREE.Vector3(rightX, y, 0), profileMaterial)
  }

  const angleSize = Math.max(thicknessM * 0.7, 0.07)
  const cornerY = metrics.wallHeightM / 2

  for (const x of [leftX, rightX]) {
    for (const z of [frontZ, backZ]) {
      addBox(
        group,
        new THREE.Vector3(angleSize, metrics.wallHeightM, angleSize),
        new THREE.Vector3(x, cornerY, z),
        profileMaterial
      )
    }
  }
}

function addDoor(
  group: THREE.Group,
  input: ChamberInput,
  metrics: ModelMetrics,
  doorMaterial: THREE.Material,
  frameMaterial: THREE.Material,
  glassMaterial: THREE.Material,
  railMaterial: THREE.Material,
  railAccentMaterial: THREE.Material,
  handleMaterial: THREE.Material
): void {
  const placement = normalizeDoorPlacement(input)
  const doorAssembly = new THREE.Group()
  group.add(doorAssembly)
  const reverseOffset = placement.wall === 'back' || placement.wall === 'right'
  const maxDoorHeightM = Math.max(0.2, metrics.wallHeightM - 0.08)
  const doorWidthM = placement.widthMm / 1000
  const doorHeightM = clamp(input.doorHeightMm / 1000, 0.3, maxDoorHeightM)
  const doorCenterX = (placement.offsetMm / 1000) * (reverseOffset ? -1 : 1)
  const doorBottomY = 0
  const doorCenterY = doorBottomY + doorHeightM / 2
  const frontSurfaceZ = -0.048
  const frameW = 0.055
  const leafDepthM = 0.05
  const leafWidthM = doorWidthM * 0.93
  const leafHeightM = doorHeightM * 0.95
  const handleRadiusM = clamp(doorWidthM * 0.018, 0.026, 0.04)
  const addHandle = (x: number): void => {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(handleRadiusM, handleRadiusM, 0.09, 24), handleMaterial)
    handle.rotation.x = Math.PI / 2
    handle.position.set(x, doorBottomY + doorHeightM * 0.52, frontSurfaceZ - 0.08)
    doorAssembly.add(handle)
  }

  if (input.doorType === 'double') {
    const leafGapM = clamp(doorWidthM * 0.008, 0.01, 0.024)
    const doubleLeafWidthM = (leafWidthM - leafGapM) / 2
    const leafOffsetX = (doubleLeafWidthM + leafGapM) / 2

    addBox(
      doorAssembly,
      new THREE.Vector3(doubleLeafWidthM, leafHeightM, leafDepthM),
      new THREE.Vector3(doorCenterX - leafOffsetX, doorCenterY, frontSurfaceZ),
      doorMaterial,
      frameMaterial
    )
    addBox(
      doorAssembly,
      new THREE.Vector3(doubleLeafWidthM, leafHeightM, leafDepthM),
      new THREE.Vector3(doorCenterX + leafOffsetX, doorCenterY, frontSurfaceZ),
      doorMaterial,
      frameMaterial
    )

    // The handle belongs to the right leaf and sits next to the meeting stile.
    addHandle(doorCenterX - doorWidthM * 0.075)
  } else {
    addBox(
      doorAssembly,
      new THREE.Vector3(leafWidthM, leafHeightM, leafDepthM),
      new THREE.Vector3(doorCenterX, doorCenterY, frontSurfaceZ),
      doorMaterial,
      frameMaterial
    )

    addHandle(doorCenterX + doorWidthM * 0.34)

    if (input.doorType === 'single') {
      addBox(
        doorAssembly,
        new THREE.Vector3(doorWidthM * 0.23, doorHeightM * 0.13, 0.018),
        new THREE.Vector3(doorCenterX - doorWidthM * 0.18, doorBottomY + doorHeightM * 0.72, frontSurfaceZ - 0.034),
        glassMaterial
      )
    }
  }

  addBox(
    doorAssembly,
    new THREE.Vector3(frameW, doorHeightM + frameW, 0.07),
    new THREE.Vector3(doorCenterX - doorWidthM / 2 - frameW / 2, doorCenterY, frontSurfaceZ - 0.008),
    frameMaterial
  )
  addBox(
    doorAssembly,
    new THREE.Vector3(frameW, doorHeightM + frameW, 0.07),
    new THREE.Vector3(doorCenterX + doorWidthM / 2 + frameW / 2, doorCenterY, frontSurfaceZ - 0.008),
    frameMaterial
  )
  addBox(
    doorAssembly,
    new THREE.Vector3(doorWidthM + frameW * 2, frameW, 0.07),
    new THREE.Vector3(doorCenterX, doorBottomY + doorHeightM + frameW / 2, frontSurfaceZ - 0.008),
    frameMaterial
  )

  if (input.doorHasThreshold) {
    addBox(
      doorAssembly,
      new THREE.Vector3(doorWidthM + frameW * 2, frameW, 0.07),
      new THREE.Vector3(doorCenterX, doorBottomY + frameW / 2, frontSurfaceZ - 0.008),
      frameMaterial
    )
  }

  if (input.doorType === 'sliding') {
    const railHeightM = clamp(doorHeightM * 0.035, 0.065, 0.085)
    const railDepthM = 0.115
    const railLipHeightM = clamp(railHeightM * 0.2, 0.014, 0.018)
    const railLipDepthM = railDepthM + 0.035
    const railAccentHeightM = railHeightM * 0.22
    const railAccentDepthM = 0.018
    const railZ = frontSurfaceZ - leafDepthM / 2 - railDepthM / 2 - 0.012
    const railFrontZ = railZ - railDepthM / 2 - railAccentDepthM / 2 - 0.004
    const endCapWidthM = clamp(doorWidthM * 0.028, 0.03, 0.05)
    const boltRadiusM = clamp(railHeightM * 0.15, 0.011, 0.015)

    const addRailBolt = (x: number, y: number): void => {
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(boltRadiusM, boltRadiusM, 0.024, 20), handleMaterial)
      bolt.rotation.x = Math.PI / 2
      bolt.position.set(x, y, railFrontZ - railAccentDepthM / 2 - 0.012)
      doorAssembly.add(bolt)
    }

    const addDetailedRail = (railY: number): void => {
      // The main body and both lips form a deep U-shaped metal channel.
      addBox(
        doorAssembly,
        new THREE.Vector3(doorWidthM, railHeightM, railDepthM),
        new THREE.Vector3(doorCenterX, railY, railZ),
        railMaterial
      )
      for (const lipY of [railY - railHeightM / 2 + railLipHeightM / 2, railY + railHeightM / 2 - railLipHeightM / 2]) {
        addBox(
          doorAssembly,
          new THREE.Vector3(doorWidthM, railLipHeightM, railLipDepthM),
          new THREE.Vector3(doorCenterX, lipY, railZ - (railLipDepthM - railDepthM) / 2),
          railAccentMaterial
        )
      }

      // A recessed face strip, inset end caps and visible fasteners make the profile readable at a distance.
      addBox(
        doorAssembly,
        new THREE.Vector3(doorWidthM - endCapWidthM * 2, railAccentHeightM, railAccentDepthM),
        new THREE.Vector3(doorCenterX, railY, railFrontZ),
        railAccentMaterial
      )
      for (const capX of [
        doorCenterX - doorWidthM / 2 + endCapWidthM / 2,
        doorCenterX + doorWidthM / 2 - endCapWidthM / 2
      ]) {
        addBox(
          doorAssembly,
          new THREE.Vector3(endCapWidthM, railHeightM * 0.9, railLipDepthM),
          new THREE.Vector3(capX, railY, railZ - (railLipDepthM - railDepthM) / 2),
          railAccentMaterial
        )
      }
      for (const boltX of [doorCenterX - doorWidthM * 0.3, doorCenterX + doorWidthM * 0.3]) {
        addRailBolt(boltX, railY)
      }
    }

    // Both sliding rails follow the selected door width exactly.
    for (const railY of [doorBottomY + railHeightM / 2, doorBottomY + doorHeightM + railHeightM / 2]) {
      addDetailedRail(railY)
    }
  }

  const dimensionMaterial = new THREE.LineBasicMaterial({
    color: 0x163246,
    linewidth: 2,
    depthTest: false,
    depthWrite: false
  })
  const doorDimZ = -0.26
  const doorTopY = doorHeightM + 0.18
  const doorLeftX = doorCenterX - doorWidthM / 2
  const doorRightX = doorCenterX + doorWidthM / 2
  addDimensionLine(
    doorAssembly,
    new THREE.Vector3(doorLeftX, doorTopY, doorDimZ),
    new THREE.Vector3(doorRightX, doorTopY, doorDimZ),
    new THREE.Vector3(0, 0.12, 0),
    formatMm(placement.widthMm),
    dimensionMaterial
  )
  addDimensionLine(
    doorAssembly,
    new THREE.Vector3(doorRightX + 0.24, 0, doorDimZ),
    new THREE.Vector3(doorRightX + 0.24, doorHeightM, doorDimZ),
    new THREE.Vector3(0.12, 0, 0),
    formatMm(input.doorHeightMm),
    dimensionMaterial
  )

  if (placement.wall === 'front') {
    doorAssembly.position.z = -metrics.widthM / 2
  } else if (placement.wall === 'back') {
    doorAssembly.position.z = metrics.widthM / 2
    doorAssembly.rotation.y = Math.PI
  } else if (placement.wall === 'left') {
    doorAssembly.position.x = -metrics.lengthM / 2
    doorAssembly.rotation.y = Math.PI / 2
  } else {
    doorAssembly.position.x = metrics.lengthM / 2
    doorAssembly.rotation.y = -Math.PI / 2
  }
}

function addWallCuts(
  group: THREE.Group,
  metrics: ModelMetrics,
  wallCenterY: number,
  thicknessM: number,
  material: THREE.Material
): void {
  const stepM = PANEL_WORKING_WIDTH_MM / 1000
  const { lengthM, widthM, wallHeightM } = metrics
  const longIsX = lengthM >= widthM
  const longM = Math.max(lengthM, widthM)
  const shortInnerM = Math.min(lengthM, widthM) - 2 * thicknessM
  const SLAB = 0.014
  const OUT = 0.006

  const remLongM = longM - Math.floor(longM / stepM + 1e-6) * stepM
  const longHasCut = remLongM > 0.02 && stepM - remLongM > 0.02
  const remShortM = shortInnerM - Math.floor(shortInnerM / stepM + 1e-6) * stepM
  const shortHasCut = remShortM > 0.02 && stepM - remShortM > 0.02

  // Long walls run along the long side; cut at the far (+) end, matching the ceiling.
  if (longHasCut) {
    if (longIsX) {
      const cx = lengthM / 2 - remLongM / 2
      addBox(group, new THREE.Vector3(remLongM, wallHeightM, SLAB), new THREE.Vector3(cx, wallCenterY, -widthM / 2 - thicknessM - OUT), material)
      addBox(group, new THREE.Vector3(remLongM, wallHeightM, SLAB), new THREE.Vector3(cx, wallCenterY, widthM / 2 + thicknessM + OUT), material)
    } else {
      const cz = widthM / 2 - remLongM / 2
      addBox(group, new THREE.Vector3(SLAB, wallHeightM, remLongM), new THREE.Vector3(-lengthM / 2 - thicknessM - OUT, wallCenterY, cz), material)
      addBox(group, new THREE.Vector3(SLAB, wallHeightM, remLongM), new THREE.Vector3(lengthM / 2 + thicknessM + OUT, wallCenterY, cz), material)
    }
  }

  // Short walls span (short − 2·thickness); their cut is independent of the ceiling.
  if (shortHasCut) {
    if (longIsX) {
      const cz = widthM / 2 - thicknessM - remShortM / 2
      addBox(group, new THREE.Vector3(SLAB, wallHeightM, remShortM), new THREE.Vector3(-lengthM / 2 - thicknessM - OUT, wallCenterY, cz), material)
      addBox(group, new THREE.Vector3(SLAB, wallHeightM, remShortM), new THREE.Vector3(lengthM / 2 + thicknessM + OUT, wallCenterY, cz), material)
    } else {
      const cx = lengthM / 2 - thicknessM - remShortM / 2
      addBox(group, new THREE.Vector3(remShortM, wallHeightM, SLAB), new THREE.Vector3(cx, wallCenterY, -widthM / 2 - thicknessM - OUT), material)
      addBox(group, new THREE.Vector3(remShortM, wallHeightM, SLAB), new THREE.Vector3(cx, wallCenterY, widthM / 2 + thicknessM + OUT), material)
    }
  }
}

function addDimensionLine(
  group: THREE.Group,
  start: THREE.Vector3,
  end: THREE.Vector3,
  tick: THREE.Vector3,
  label: string,
  material: THREE.Material
): void {
  addLine(group, [start, end], material)
  addLine(group, [start.clone().sub(tick), start.clone().add(tick)], material)
  addLine(group, [end.clone().sub(tick), end.clone().add(tick)], material)

  const labelCenter = start.clone().add(end).multiplyScalar(0.5)
  const sprite = makeTextSprite()
  sprite.position.copy(labelCenter)
  ;(sprite as DimensionSprite).userData.dimensionLabel = {
    label,
    lineEnd: end.clone(),
    lineStart: start.clone()
  }
  group.add(sprite)
}

function addDimensions(
  group: THREE.Group,
  input: ChamberInput,
  metrics: ModelMetrics,
  thicknessM: number
): void {
  const material = new THREE.LineBasicMaterial({
    color: 0x163246,
    linewidth: 2,
    depthTest: false,
    depthWrite: false
  })
  const tick = Math.max(Math.min(metrics.lengthM, metrics.widthM) * 0.035, 0.16)
  const frontZ = -metrics.widthM / 2 - thicknessM - Math.max(metrics.widthM * 0.11, 0.62)
  const rightX = metrics.lengthM / 2 + thicknessM + Math.max(metrics.lengthM * 0.055, 0.62)
  const heightZ = -metrics.widthM / 2 - thicknessM - 0.2
  const y = 0.08

  addDimensionLine(
    group,
    new THREE.Vector3(-metrics.lengthM / 2, y, frontZ),
    new THREE.Vector3(metrics.lengthM / 2, y, frontZ),
    new THREE.Vector3(0, 0, tick),
    formatMm(metrics.lengthMm),
    material
  )

  addDimensionLine(
    group,
    new THREE.Vector3(rightX, y, -metrics.widthM / 2),
    new THREE.Vector3(rightX, y, metrics.widthM / 2),
    new THREE.Vector3(tick, 0, 0),
    formatMm(metrics.widthMm),
    material
  )

  addDimensionLine(
    group,
    new THREE.Vector3(rightX, 0, heightZ),
    new THREE.Vector3(rightX, metrics.totalHeightM, heightZ),
    new THREE.Vector3(tick, 0, 0),
    formatMm(input.heightMm),
    material
  )

}

function buildCutDimensionAnchors(input: ChamberInput, metrics: ModelMetrics, thicknessM: number): CutDimensionAnchor[] {
  const runs = buildChamberPanelRuns(metrics.lengthMm, metrics.widthMm, input.thicknessMm, input.hasPanelFloor)
  const anchors: CutDimensionAnchor[] = []
  const wallY = metrics.wallHeightM * 0.62
  const surfaceOffset = Math.max(thicknessM * 0.12, 0.018)

  if (runs.longWall.hasCut) {
    const cutM = runs.longWall.remainderMm / 1000
    const startX = metrics.lengthM / 2 - cutM
    const endX = metrics.lengthM / 2

    anchors.push({
      end: new THREE.Vector3(endX, wallY, -metrics.widthM / 2 - surfaceOffset),
      kind: 'wall',
      label: formatMm(runs.longWall.remainderMm),
      normal: new THREE.Vector3(0, 0, -1),
      start: new THREE.Vector3(startX, wallY, -metrics.widthM / 2 - surfaceOffset)
    })
    anchors.push({
      end: new THREE.Vector3(endX, wallY, metrics.widthM / 2 + surfaceOffset),
      kind: 'wall',
      label: formatMm(runs.longWall.remainderMm),
      normal: new THREE.Vector3(0, 0, 1),
      start: new THREE.Vector3(startX, wallY, metrics.widthM / 2 + surfaceOffset)
    })
  }

  if (runs.shortWall.hasCut) {
    const cutM = runs.shortWall.remainderMm / 1000
    const endZ = metrics.widthM / 2 - thicknessM
    const startZ = endZ - cutM

    anchors.push({
      end: new THREE.Vector3(-metrics.lengthM / 2 - surfaceOffset, wallY, endZ),
      kind: 'wall',
      label: formatMm(runs.shortWall.remainderMm),
      normal: new THREE.Vector3(-1, 0, 0),
      start: new THREE.Vector3(-metrics.lengthM / 2 - surfaceOffset, wallY, startZ)
    })
    anchors.push({
      end: new THREE.Vector3(metrics.lengthM / 2 + surfaceOffset, wallY, endZ),
      kind: 'wall',
      label: formatMm(runs.shortWall.remainderMm),
      normal: new THREE.Vector3(1, 0, 0),
      start: new THREE.Vector3(metrics.lengthM / 2 + surfaceOffset, wallY, startZ)
    })
  }

  if (runs.floor?.hasCut) {
    const cutM = runs.floor.remainderMm / 1000
    const endX = metrics.floorLengthM / 2
    const startX = endX - cutM
    const frontZ = -metrics.floorWidthM / 2 - surfaceOffset
    const dimensionY = 0.08
    const dimensionZ = -metrics.widthM / 2 - thicknessM - Math.max(metrics.widthM * 0.11, 0.62)
    const labelDistanceM = Math.max(metrics.widthM * 0.18, 0.8)

    anchors.push({
      end: new THREE.Vector3(endX, Math.max(thicknessM * 0.45, 0.025), frontZ),
      kind: 'floor',
      label: `Пол · ${formatMm(runs.floor.remainderMm)}`,
      labelGuide: {
        end: new THREE.Vector3(-metrics.lengthM / 2, dimensionY, dimensionZ),
        position: new THREE.Vector3(metrics.lengthM / 2, dimensionY, dimensionZ - labelDistanceM),
        start: new THREE.Vector3(metrics.lengthM / 2, dimensionY, dimensionZ)
      },
      normal: new THREE.Vector3(0, 1, 0),
      start: new THREE.Vector3(startX, Math.max(thicknessM * 0.45, 0.025), frontZ)
    })
  }

  return anchors
}

function createChamberModel(input: ChamberInput): {
  group: THREE.Group
  metrics: ModelMetrics
  cutDimensions: CutDimensionAnchor[]
} {
  const group = new THREE.Group()
  const lengthMm = Math.max(input.lengthMm, input.widthMm)
  const widthMm = Math.min(input.lengthMm, input.widthMm)
  const lengthM = mmToM(lengthMm)
  const widthM = mmToM(widthMm)
  const thicknessM = clamp(input.thicknessMm / 1000, 0.04, 0.18)
  const wallHeightM = mmToM(Math.max(input.heightMm - input.thicknessMm, input.thicknessMm))
  const totalHeightM = wallHeightM + thicknessM
  const floorLengthM = Math.max(lengthM - 2 * thicknessM, MIN_MODEL_SIDE_M)
  const floorWidthM = Math.max(widthM - 2 * thicknessM, MIN_MODEL_SIDE_M)
  const metrics = { lengthMm, widthMm, lengthM, widthM, floorLengthM, floorWidthM, wallHeightM, totalHeightM }

  const panelMaterial = new THREE.MeshStandardMaterial({
    color: 0xfafafa,
    metalness: 0.03,
    roughness: 0.62
  })
  const sidePanelMaterial = new THREE.MeshStandardMaterial({
    color: 0xe5edf2,
    metalness: 0.03,
    roughness: 0.7
  })
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x7f8c98 })
  const seamMaterial = new THREE.MeshStandardMaterial({ color: 0x86827a, roughness: 0.8 })
  const cutMaterial = new THREE.MeshStandardMaterial({
    color: 0xd98f43,
    opacity: 0.46,
    transparent: true,
    depthWrite: false
  })
  const wallCutMaterial = new THREE.MeshStandardMaterial({ color: 0xe8a45c, roughness: 0.72, metalness: 0.02 })
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f7f8, metalness: 0.05, roughness: 0.58 })
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xa64a3c, roughness: 0.56 })
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0xbfd9e5,
    opacity: 0.72,
    transparent: true,
    roughness: 0.2
  })
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x4c5961, metalness: 0.62, roughness: 0.3 })
  const railAccentMaterial = new THREE.MeshStandardMaterial({ color: 0xaeb8bd, metalness: 0.76, roughness: 0.24 })
  const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x124837, metalness: 0.2, roughness: 0.35 })

  if (input.hasPanelFloor) {
    addBox(
      group,
      new THREE.Vector3(floorLengthM, thicknessM, floorWidthM),
      new THREE.Vector3(0, thicknessM / 2, 0),
      sidePanelMaterial,
      edgeMaterial
    )
  }

  addBox(
    group,
    new THREE.Vector3(lengthM, thicknessM, widthM),
    new THREE.Vector3(0, wallHeightM + thicknessM / 2, 0),
    panelMaterial,
    edgeMaterial
  )

  addWallPanels(group, metrics, thicknessM, panelMaterial, sidePanelMaterial, wallCutMaterial, seamMaterial, edgeMaterial)
  addDeckSeams(group, metrics, thicknessM, input.hasPanelFloor, seamMaterial, cutMaterial)
  addDoor(group, input, metrics, doorMaterial, frameMaterial, glassMaterial, railMaterial, railAccentMaterial, handleMaterial)
  addDimensions(group, input, metrics, thicknessM)

  const placement = normalizeDoorPlacement(input)
  const rotationY =
    placement.wall === 'back'
      ? Math.PI
      : placement.wall === 'left'
        ? -Math.PI / 2
        : placement.wall === 'right'
          ? Math.PI / 2
          : 0
  group.rotation.y = rotationY

  const rotation = new THREE.Euler(0, rotationY, 0)
  const rotatePoint = (point: THREE.Vector3): THREE.Vector3 => point.clone().applyEuler(rotation)
  const cutDimensions = buildCutDimensionAnchors(input, metrics, thicknessM).map((anchor) => ({
    ...anchor,
    start: rotatePoint(anchor.start),
    end: rotatePoint(anchor.end),
    normal: rotatePoint(anchor.normal).normalize(),
    labelGuide: anchor.labelGuide
      ? {
          start: rotatePoint(anchor.labelGuide.start),
          end: rotatePoint(anchor.labelGuide.end),
          position: rotatePoint(anchor.labelGuide.position)
        }
      : undefined
  }))

  return { group, metrics, cutDimensions }
}

function addSceneLights(scene: THREE.Scene, maxSideM: number): void {
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x9ca8b2, 2.1)
  scene.add(hemiLight)

  const keyLight = new THREE.DirectionalLight(0xffffff, 3.4)
  keyLight.position.set(maxSideM * 0.8, maxSideM * 1.4, -maxSideM * 0.8)
  scene.add(keyLight)

  const fillLight = new THREE.DirectionalLight(0xcfe9ff, 1.1)
  fillLight.position.set(-maxSideM, maxSideM * 0.55, maxSideM)
  scene.add(fillLight)
}

function addGround(scene: THREE.Scene, maxSideM: number): void {
  const grid = new THREE.GridHelper(maxSideM * 2.4, 12, 0xb7c1ca, 0xd2d9df)
  grid.position.y = -0.012
  scene.add(grid)
}

function configurePerspectiveCamera(camera: THREE.PerspectiveCamera, viewportWidth: number, viewportHeight: number): void {
  camera.aspect = Math.max(viewportWidth, 1) / Math.max(viewportHeight, 1)
  camera.updateProjectionMatrix()
}

function placeCamera(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  modelRadiusM: number,
  distanceFactor = CAMERA_DISTANCE_FACTOR
): void {
  const verticalFov = THREE.MathUtils.degToRad(camera.fov)
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect)
  const limitingHalfFov = Math.min(verticalFov, horizontalFov) / 2
  const distance = Math.max((modelRadiusM / Math.sin(limitingHalfFov)) * distanceFactor, 3.5)
  const direction = new THREE.Vector3(0.42, 0.5, -1).normalize()
  camera.position.copy(target).add(direction.multiplyScalar(distance))
  camera.lookAt(target)
  camera.updateProjectionMatrix()
}

export function renderChamber3DToDataUrl(
  input: ChamberInput,
  width = 1400,
  height = 760,
  cameraDistanceFactor = 1.14
): string {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xeef2f5)

  const { group, metrics, cutDimensions } = createChamberModel(input)
  scene.add(group)

  const maxSideM = Math.max(metrics.lengthM, metrics.widthM, metrics.totalHeightM)
  const modelRadiusM = Math.sqrt(metrics.lengthM ** 2 + metrics.widthM ** 2 + metrics.totalHeightM ** 2) / 2
  const target = new THREE.Vector3(0, metrics.totalHeightM * 0.48, 0)
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, width / height, 0.03, Math.max(80, maxSideM * 12))
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })

  renderer.setPixelRatio(1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setSize(width, height, false)

  addSceneLights(scene, maxSideM)
  addGround(scene, maxSideM)
  configurePerspectiveCamera(camera, width, height)
  placeCamera(camera, target, modelRadiusM, cameraDistanceFactor)
  layoutDimensionLabels(scene, camera, width, height)
  renderer.render(scene, camera)

  const composite = document.createElement('canvas')
  composite.width = width
  composite.height = height
  const compositeContext = composite.getContext('2d')
  if (compositeContext) {
    compositeContext.drawImage(renderer.domElement, 0, 0, width, height)
    drawCutDimensionAnnotations(compositeContext, scene, cutDimensions, camera, width, height)
  }
  const dataUrl = compositeContext ? composite.toDataURL('image/png') : renderer.domElement.toDataURL('image/png')
  renderer.dispose()
  renderer.forceContextLoss()
  disposeScene(scene)

  return dataUrl
}

function disposeScene(scene: THREE.Scene): void {
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()

  scene.traverse((object) => {
    const disposable = object as THREE.Object3D & {
      geometry?: THREE.BufferGeometry
      material?: (THREE.Material & { map?: THREE.Texture }) | Array<THREE.Material & { map?: THREE.Texture }>
    }

    disposable.geometry?.dispose()

    if (Array.isArray(disposable.material)) {
      disposable.material.forEach((material) => {
        materials.add(material)
        if (material.map) {
          textures.add(material.map)
        }
      })
    } else if (disposable.material) {
      materials.add(disposable.material)
      if (disposable.material.map) {
        textures.add(disposable.material.map)
      }
    }
  })

  textures.forEach((texture) => texture.dispose())
  materials.forEach((material) => material.dispose())
}

export function Chamber3DView({ input }: Chamber3DViewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const resetCameraRef = useRef<(() => void) | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const geometryKey = useMemo(
    () =>
      [
        input.lengthMm,
        input.widthMm,
        input.heightMm,
        input.thicknessMm,
        input.hasPanelFloor ? 'floor' : 'nofloor',
        input.doorWidthMm,
        input.doorWall,
        input.doorOffsetMm,
        input.doorHeightMm,
        input.doorType,
        input.doorHasThreshold ? 'threshold' : 'nothreshold'
      ].join('-'),
    [
      input.doorHasThreshold,
      input.doorHeightMm,
      input.doorType,
      input.doorWidthMm,
      input.doorWall,
      input.doorOffsetMm,
      input.hasPanelFloor,
      input.heightMm,
      input.lengthMm,
      input.thicknessMm,
      input.widthMm
    ]
  )

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return undefined
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xeef2f5)

    const { group, metrics, cutDimensions } = createChamberModel(input)
    scene.add(group)

    const maxSideM = Math.max(metrics.lengthM, metrics.widthM, metrics.totalHeightM)
    const modelRadiusM = Math.sqrt(metrics.lengthM ** 2 + metrics.widthM ** 2 + metrics.totalHeightM ** 2) / 2
    const target = new THREE.Vector3(0, metrics.totalHeightM * 0.48, 0)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.className = 'chamber-3d-canvas'
    const annotationCanvas = document.createElement('canvas')
    const annotationContext = annotationCanvas.getContext('2d')
    annotationCanvas.className = 'chamber-3d-annotations'
    container.replaceChildren(renderer.domElement, annotationCanvas)

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 1, 0.03, Math.max(80, maxSideM * 12))
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = Math.max(modelRadiusM * 0.7, 1)
    controls.maxDistance = Math.max(modelRadiusM * 5, 6)
    controls.maxPolarAngle = Math.PI * 0.92
    controls.minPolarAngle = Math.PI * 0.04
    controls.target.copy(target)

    const resetCamera = (): void => {
      placeCamera(camera, target, modelRadiusM, CAMERA_DISTANCE_FACTOR)
      controls.target.copy(target)
      controls.update()
    }

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x9ca8b2, 2.1)
    scene.add(hemiLight)

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.4)
    keyLight.position.set(maxSideM * 0.8, maxSideM * 1.4, -maxSideM * 0.8)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0xcfe9ff, 1.1)
    fillLight.position.set(-maxSideM, maxSideM * 0.55, maxSideM)
    scene.add(fillLight)

    const grid = new THREE.GridHelper(maxSideM * 2.4, 12, 0xb7c1ca, 0xd2d9df)
    grid.position.y = -0.012
    scene.add(grid)

    const resize = (): void => {
      const width = Math.max(container.clientWidth, 320)
      const height = Math.max(container.clientHeight, 260)
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      renderer.setSize(width, height, false)
      annotationCanvas.width = Math.round(width * pixelRatio)
      annotationCanvas.height = Math.round(height * pixelRatio)
      annotationCanvas.style.width = `${width}px`
      annotationCanvas.style.height = `${height}px`
      configurePerspectiveCamera(camera, width, height)
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()
    resetCamera()
    controls.saveState()
    resetCameraRef.current = resetCamera

    let frameId = window.requestAnimationFrame(function render() {
      controls.update()
      layoutDimensionLabels(
        scene,
        camera,
        renderer.domElement.clientWidth || container.clientWidth,
        renderer.domElement.clientHeight || container.clientHeight
      )
      renderer.render(scene, camera)
      if (annotationContext) {
        const width = renderer.domElement.clientWidth || container.clientWidth
        const height = renderer.domElement.clientHeight || container.clientHeight
        const pixelRatio = annotationCanvas.width / Math.max(width, 1)
        annotationContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
        annotationContext.clearRect(0, 0, width, height)
        drawCutDimensionAnnotations(annotationContext, scene, cutDimensions, camera, width, height)
      }
      frameId = window.requestAnimationFrame(render)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
      resetCameraRef.current = null
      resizeObserver.disconnect()
      controls.dispose()
      renderer.dispose()
      container.replaceChildren()
      disposeScene(scene)
    }
  }, [
    input.doorHasThreshold,
    input.doorHeightMm,
    input.doorType,
    input.doorWidthMm,
    input.doorWall,
    input.doorOffsetMm,
    input.hasPanelFloor,
    input.heightMm,
    input.lengthMm,
    input.thicknessMm,
    input.widthMm
  ])

  useEffect(() => {
    if (!fullscreen) {
      return undefined
    }

    document.body.classList.add('view-fullscreen-open')

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setFullscreen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('view-fullscreen-open')
    }
  }, [fullscreen])

  return (
    <div className={`chamber-3d-wrapper${fullscreen ? ' view-fullscreen' : ''}`}>
      <div
        ref={containerRef}
        className="chamber-3d-view"
        data-geometry-key={geometryKey}
        role="img"
        aria-label={`3D-вид камеры ${input.lengthMm}x${input.widthMm}x${input.heightMm} мм, дверь: ${input.doorType}, стена: ${input.doorWall}`}
      />
      <div className="view-floating-controls">
        <button
          className="view-control-button"
          type="button"
          title="Сбросить ракурс"
          aria-label="Сбросить ракурс"
          onClick={() => resetCameraRef.current?.()}
        >
          <RotateCcw size={16} />
        </button>
        <button
          className="view-control-button"
          type="button"
          title={fullscreen ? 'Свернуть 3D-вид' : 'Развернуть 3D-вид'}
          aria-label={fullscreen ? 'Свернуть 3D-вид' : 'Развернуть 3D-вид'}
          onClick={() => setFullscreen((value) => !value)}
        >
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>
    </div>
  )
}
