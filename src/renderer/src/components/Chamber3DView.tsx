import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Minimize2, RotateCcw } from 'lucide-react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { PANEL_WORKING_WIDTH_MM, type ChamberInput } from '@renderer/domain/calculator'

interface Chamber3DViewProps {
  input: ChamberInput
}

interface ModelMetrics {
  lengthM: number
  widthM: number
  floorLengthM: number
  floorWidthM: number
  wallHeightM: number
  totalHeightM: number
}

interface DimensionLabelData {
  lineEnd: THREE.Vector3
  lineStart: THREE.Vector3
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
  mesh.castShadow = true
  mesh.receiveShadow = true
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

function makeTextSprite(text: string, color = '#163246'): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const fontSize = 42
  const paddingX = 22
  const paddingY = 14

  canvas.width = 512
  canvas.height = 128

  if (ctx) {
    ctx.font = `700 ${fontSize}px Arial, sans-serif`
    const metrics = ctx.measureText(text)
    canvas.width = Math.ceil(metrics.width + paddingX * 2)
    canvas.height = fontSize + paddingY * 2
    ctx.font = `700 ${fontSize}px Arial, sans-serif`
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
    ctx.strokeStyle = 'rgba(35, 79, 108, 0.28)'
    ctx.lineWidth = 4
    roundRect(ctx, 0, 0, canvas.width, canvas.height, 14)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = color
    ctx.fillText(text, paddingX, canvas.height / 2)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  const aspect = canvas.width / canvas.height
  sprite.scale.set(aspect * 0.28, 0.28, 1)
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
  camera: THREE.PerspectiveCamera,
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
  camera: THREE.PerspectiveCamera,
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
  camera: THREE.PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number
): void {
  root.updateMatrixWorld(true)
  camera.updateMatrixWorld(true)
  alignDimensionLabels(root, camera, viewportWidth, viewportHeight)
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
  const stepM = PANEL_WORKING_WIDTH_MM / 1000
  const panelCount = Math.max(1, Math.ceil(Math.max(spanM, 0.001) / stepM))
  const fullPanels = Math.max(0, panelCount - 1)
  const remainderM = spanM - fullPanels * stepM
  const segments: Array<{ offsetM: number; sizeM: number; isCut: boolean }> = []
  let offsetM = 0

  for (let index = 0; index < panelCount; index += 1) {
    const isLast = index === panelCount - 1
    const sizeM = isLast ? Math.max(spanM - offsetM, 0) : Math.min(stepM, Math.max(spanM - offsetM, 0))

    if (sizeM > 0.001) {
      segments.push({
        isCut: isLast && remainderM > 0.001 && remainderM < stepM - 0.001,
        offsetM,
        sizeM
      })
    }

    offsetM += sizeM
  }

  return segments
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
  const wideSideM = Math.max(metrics.lengthM, metrics.widthM)
  const ceilingRemainderM = wideSideM % panelStepM
  const hasCeilingCutStrip = ceilingRemainderM > 0.04 && panelStepM - ceilingRemainderM > 0.04

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
    for (let x = -metrics.lengthM / 2 + panelStepM; x < metrics.lengthM / 2; x += panelStepM) {
      addXDeckSeamOnFaces(x, metrics.wallHeightM, metrics.totalHeightM, metrics.widthM)
    }

    if (hasCeilingCutStrip) {
      const cutCenterX = metrics.lengthM / 2 - ceilingRemainderM / 2
      const cutSize = new THREE.Vector3(ceilingRemainderM, 0.014, metrics.widthM)
      addBox(group, cutSize, new THREE.Vector3(cutCenterX, ceilingY + 0.002, 0), cutMaterial)
    }

    if (!hasPanelFloor) {
      return
    }

    const floorRemainderM = metrics.floorLengthM % panelStepM
    const hasFloorCutStrip = floorRemainderM > 0.04 && panelStepM - floorRemainderM > 0.04

    for (let x = -metrics.floorLengthM / 2 + panelStepM; x < metrics.floorLengthM / 2; x += panelStepM) {
      addXDeckSeamOnFaces(x, 0, thicknessM, metrics.floorWidthM)
    }

    if (hasFloorCutStrip) {
      const cutCenterX = metrics.floorLengthM / 2 - floorRemainderM / 2
      const cutSize = new THREE.Vector3(floorRemainderM, 0.014, metrics.floorWidthM)
      addBox(group, cutSize, new THREE.Vector3(cutCenterX, floorY + 0.002, 0), cutMaterial)
      addBox(group, cutSize, new THREE.Vector3(cutCenterX, -0.01, 0), cutMaterial)
    }
  } else {
    for (let z = -metrics.widthM / 2 + panelStepM; z < metrics.widthM / 2; z += panelStepM) {
      addZDeckSeamOnFaces(z, metrics.wallHeightM, metrics.totalHeightM, metrics.lengthM)
    }

    if (hasCeilingCutStrip) {
      const cutCenterZ = metrics.widthM / 2 - ceilingRemainderM / 2
      const cutSize = new THREE.Vector3(metrics.lengthM, 0.014, ceilingRemainderM)
      addBox(group, cutSize, new THREE.Vector3(0, ceilingY + 0.002, cutCenterZ), cutMaterial)
    }

    if (!hasPanelFloor) {
      return
    }

    const floorRemainderM = metrics.floorWidthM % panelStepM
    const hasFloorCutStrip = floorRemainderM > 0.04 && panelStepM - floorRemainderM > 0.04

    for (let z = -metrics.floorWidthM / 2 + panelStepM; z < metrics.floorWidthM / 2; z += panelStepM) {
      addZDeckSeamOnFaces(z, 0, thicknessM, metrics.floorLengthM)
    }

    if (hasFloorCutStrip) {
      const cutCenterZ = metrics.floorWidthM / 2 - floorRemainderM / 2
      const cutSize = new THREE.Vector3(metrics.floorLengthM, 0.014, floorRemainderM)
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
  handleMaterial: THREE.Material
): void {
  const marginM = Math.min(0.45, metrics.lengthM * 0.08)
  const maxDoorWidthM = Math.max(0.2, metrics.lengthM - marginM * 2)
  const maxDoorHeightM = Math.max(0.2, metrics.wallHeightM - 0.08)
  const doorWidthM = clamp(input.doorWidthMm / 1000, 0.25, maxDoorWidthM)
  const doorHeightM = clamp(input.doorHeightMm / 1000, 0.3, maxDoorHeightM)
  const minCenterX = -metrics.lengthM / 2 + doorWidthM / 2 + marginM
  const maxCenterX = metrics.lengthM / 2 - doorWidthM / 2 - marginM
  const preferredCenterX = metrics.lengthM * 0.18
  const doorCenterX = minCenterX <= maxCenterX ? clamp(preferredCenterX, minCenterX, maxCenterX) : 0
  const doorBottomY = 0
  const doorCenterY = doorBottomY + doorHeightM / 2
  const frontSurfaceZ = -metrics.widthM / 2 - 0.048
  const frameW = 0.055

  addBox(
    group,
    new THREE.Vector3(doorWidthM * 0.93, doorHeightM * 0.95, 0.05),
    new THREE.Vector3(doorCenterX, doorCenterY, frontSurfaceZ),
    doorMaterial,
    frameMaterial
  )

  addBox(
    group,
    new THREE.Vector3(frameW, doorHeightM + frameW, 0.07),
    new THREE.Vector3(doorCenterX - doorWidthM / 2 - frameW / 2, doorCenterY, frontSurfaceZ - 0.008),
    frameMaterial
  )
  addBox(
    group,
    new THREE.Vector3(frameW, doorHeightM + frameW, 0.07),
    new THREE.Vector3(doorCenterX + doorWidthM / 2 + frameW / 2, doorCenterY, frontSurfaceZ - 0.008),
    frameMaterial
  )
  addBox(
    group,
    new THREE.Vector3(doorWidthM + frameW * 2, frameW, 0.07),
    new THREE.Vector3(doorCenterX, doorBottomY + doorHeightM + frameW / 2, frontSurfaceZ - 0.008),
    frameMaterial
  )

  if (input.doorHasThreshold) {
    addBox(
      group,
      new THREE.Vector3(doorWidthM + frameW * 2, frameW, 0.07),
      new THREE.Vector3(doorCenterX, doorBottomY + frameW / 2, frontSurfaceZ - 0.008),
      frameMaterial
    )
  }

  addBox(
    group,
    new THREE.Vector3(doorWidthM * 0.23, doorHeightM * 0.13, 0.018),
    new THREE.Vector3(doorCenterX - doorWidthM * 0.18, doorBottomY + doorHeightM * 0.72, frontSurfaceZ - 0.034),
    glassMaterial
  )

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 24), handleMaterial)
  handle.rotation.x = Math.PI / 2
  handle.position.set(doorCenterX + doorWidthM * 0.34, doorBottomY + doorHeightM * 0.52, frontSurfaceZ - 0.08)
  handle.castShadow = true
  group.add(handle)
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
  const sprite = makeTextSprite(label)
  sprite.position.copy(labelCenter)
  ;(sprite as DimensionSprite).userData.dimensionLabel = {
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
    formatMm(input.lengthMm),
    material
  )

  addDimensionLine(
    group,
    new THREE.Vector3(rightX, y, -metrics.widthM / 2),
    new THREE.Vector3(rightX, y, metrics.widthM / 2),
    new THREE.Vector3(tick, 0, 0),
    formatMm(input.widthMm),
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

  const doorMarginM = Math.min(0.45, metrics.lengthM * 0.08)
  const doorWidthM = clamp(
    input.doorWidthMm / 1000,
    0.25,
    Math.max(0.25, metrics.lengthM - doorMarginM * 2)
  )
  const doorHeightM = clamp(input.doorHeightMm / 1000, 0.3, Math.max(0.3, metrics.wallHeightM - 0.08))
  const minDoorCenterX = -metrics.lengthM / 2 + doorWidthM / 2 + doorMarginM
  const maxDoorCenterX = metrics.lengthM / 2 - doorWidthM / 2 - doorMarginM
  const doorCenterX = minDoorCenterX <= maxDoorCenterX ? clamp(metrics.lengthM * 0.18, minDoorCenterX, maxDoorCenterX) : 0
  const doorLeftX = doorCenterX - doorWidthM / 2
  const doorRightX = doorCenterX + doorWidthM / 2
  const doorDimZ = -metrics.widthM / 2 - thicknessM - 0.26
  const doorTopY = doorHeightM + 0.18
  const doorSideX = doorRightX + 0.24

  addDimensionLine(
    group,
    new THREE.Vector3(doorLeftX, doorTopY, doorDimZ),
    new THREE.Vector3(doorRightX, doorTopY, doorDimZ),
    new THREE.Vector3(0, 0.12, 0),
    formatMm(input.doorWidthMm),
    material
  )

  addDimensionLine(
    group,
    new THREE.Vector3(doorSideX, 0, doorDimZ),
    new THREE.Vector3(doorSideX, doorHeightM, doorDimZ),
    new THREE.Vector3(0.12, 0, 0),
    formatMm(input.doorHeightMm),
    material
  )
}

function createChamberModel(input: ChamberInput): { group: THREE.Group; metrics: ModelMetrics } {
  const group = new THREE.Group()
  const lengthM = mmToM(input.lengthMm)
  const widthM = mmToM(input.widthMm)
  const thicknessM = clamp(input.thicknessMm / 1000, 0.04, 0.18)
  const wallHeightM = mmToM(Math.max(input.heightMm - input.thicknessMm, input.thicknessMm))
  const totalHeightM = wallHeightM + thicknessM
  const floorLengthM = Math.max(lengthM - 2 * thicknessM, MIN_MODEL_SIDE_M)
  const floorWidthM = Math.max(widthM - 2 * thicknessM, MIN_MODEL_SIDE_M)
  const metrics = { lengthM, widthM, floorLengthM, floorWidthM, wallHeightM, totalHeightM }

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
  addDoor(group, input, metrics, doorMaterial, frameMaterial, glassMaterial, handleMaterial)
  addDimensions(group, input, metrics, thicknessM)

  return { group, metrics }
}

function addSceneLights(scene: THREE.Scene, maxSideM: number): void {
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x9ca8b2, 2.1)
  scene.add(hemiLight)

  const keyLight = new THREE.DirectionalLight(0xffffff, 3.4)
  keyLight.position.set(maxSideM * 0.8, maxSideM * 1.4, -maxSideM * 0.8)
  keyLight.castShadow = true
  keyLight.shadow.mapSize.set(2048, 2048)
  scene.add(keyLight)

  const fillLight = new THREE.DirectionalLight(0xcfe9ff, 1.1)
  fillLight.position.set(-maxSideM, maxSideM * 0.55, maxSideM)
  scene.add(fillLight)
}

function addGround(scene: THREE.Scene, maxSideM: number): void {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(maxSideM * 2.4, maxSideM * 2.4),
    new THREE.ShadowMaterial({ color: 0x77818b, opacity: 0.16 })
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.018
  ground.receiveShadow = true
  scene.add(ground)

  const grid = new THREE.GridHelper(maxSideM * 2.4, 12, 0xb7c1ca, 0xd2d9df)
  grid.position.y = -0.012
  scene.add(grid)
}

function placeCamera(camera: THREE.PerspectiveCamera, target: THREE.Vector3, modelRadiusM: number, distanceFactor = 1.42): void {
  const distance = Math.max(modelRadiusM / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * distanceFactor, 3.5)
  const direction = new THREE.Vector3(0.78, 0.52, -1).normalize()
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

  const { group, metrics } = createChamberModel(input)
  scene.add(group)

  const maxSideM = Math.max(metrics.lengthM, metrics.widthM, metrics.totalHeightM)
  const modelRadiusM = Math.sqrt(metrics.lengthM ** 2 + metrics.widthM ** 2 + metrics.totalHeightM ** 2) / 2
  const target = new THREE.Vector3(0, metrics.totalHeightM * 0.48, 0)
  const camera = new THREE.PerspectiveCamera(34, width / height, 0.03, Math.max(80, maxSideM * 12))
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })

  renderer.setPixelRatio(1)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setSize(width, height, false)

  addSceneLights(scene, maxSideM)
  addGround(scene, maxSideM)
  placeCamera(camera, target, modelRadiusM, cameraDistanceFactor)
  layoutDimensionLabels(scene, camera, width, height)
  renderer.render(scene, camera)

  const dataUrl = renderer.domElement.toDataURL('image/png')
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
        input.doorHeightMm,
        input.doorHasThreshold ? 'threshold' : 'nothreshold'
      ].join('-'),
    [
      input.doorHasThreshold,
      input.doorHeightMm,
      input.doorWidthMm,
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

    const { group, metrics } = createChamberModel(input)
    scene.add(group)

    const maxSideM = Math.max(metrics.lengthM, metrics.widthM, metrics.totalHeightM)
    const modelRadiusM = Math.sqrt(metrics.lengthM ** 2 + metrics.widthM ** 2 + metrics.totalHeightM ** 2) / 2
    const target = new THREE.Vector3(0, metrics.totalHeightM * 0.48, 0)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.className = 'chamber-3d-canvas'
    container.replaceChildren(renderer.domElement)

    const camera = new THREE.PerspectiveCamera(34, 1, 0.03, Math.max(80, maxSideM * 12))
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = Math.max(modelRadiusM * 0.7, 1)
    controls.maxDistance = Math.max(modelRadiusM * 5, 6)
    controls.maxPolarAngle = Math.PI * 0.92
    controls.minPolarAngle = Math.PI * 0.04
    controls.target.copy(target)

    const placeCamera = (): void => {
      const distance = Math.max(modelRadiusM / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.42, 3.5)
      const direction = new THREE.Vector3(0.78, 0.52, -1).normalize()
      camera.position.copy(target).add(direction.multiplyScalar(distance))
      camera.lookAt(target)
      controls.target.copy(target)
      controls.update()
    }

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x9ca8b2, 2.1)
    scene.add(hemiLight)

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.4)
    keyLight.position.set(maxSideM * 0.8, maxSideM * 1.4, -maxSideM * 0.8)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(2048, 2048)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0xcfe9ff, 1.1)
    fillLight.position.set(-maxSideM, maxSideM * 0.55, maxSideM)
    scene.add(fillLight)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(maxSideM * 2.4, maxSideM * 2.4),
      new THREE.ShadowMaterial({ color: 0x77818b, opacity: 0.16 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.018
    ground.receiveShadow = true
    scene.add(ground)

    const grid = new THREE.GridHelper(maxSideM * 2.4, 12, 0xb7c1ca, 0xd2d9df)
    grid.position.y = -0.012
    scene.add(grid)

    const resize = (): void => {
      const width = Math.max(container.clientWidth, 320)
      const height = Math.max(container.clientHeight, 260)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()
    placeCamera()
    controls.saveState()
    resetCameraRef.current = placeCamera

    let frameId = window.requestAnimationFrame(function render() {
      controls.update()
      layoutDimensionLabels(
        scene,
        camera,
        renderer.domElement.clientWidth || container.clientWidth,
        renderer.domElement.clientHeight || container.clientHeight
      )
      renderer.render(scene, camera)
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
    input.doorWidthMm,
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
        aria-label={`3D-вид камеры ${input.lengthMm}x${input.widthMm}x${input.heightMm} мм`}
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
