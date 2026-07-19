import { useEffect, useMemo, useRef, useState } from 'react'
import { FileImage, Maximize2, Minimize2, MousePointer2, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  PANEL_WORKING_WIDTH_MM,
  type CameraView,
  type Chamber3DSettings,
  type ChamberInput,
  type DepthDimensionSide,
  type DimensionCorner,
  type DoorHeightDimensionSide,
  type DoorWidthDimensionSide,
  type FloorCutLabelSide,
  type FrontDimensionSide
} from '@renderer/domain/calculator'
import { buildChamberPanelRuns, buildPanelRun, normalizeDoorPlacement } from '@renderer/domain/chamberGeometry'

interface Chamber3DViewProps {
  input: ChamberInput
  settingsOpen?: boolean
  onSettingsToggle?: () => void
  showSettingsControl?: boolean
  allowFullscreen?: boolean
}

interface Chamber3DSettingsPanelProps {
  input: ChamberInput
  onViewSettingsChange: (settings: Chamber3DSettings) => void
}

interface Chamber3DSettingsEditorProps extends Chamber3DSettingsPanelProps {
  onClose: () => void
  pdfCameraDistanceFactor?: number
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
const CAMERA_DISTANCE_FACTOR = 1.06
const PROPOSAL_IMAGE_WIDTH = 1400
const PROPOSAL_IMAGE_HEIGHT = 760
const LABEL_BASE_SCALE = 1.4
const AUTO_CAMERA_ZOOM_FACTOR = 0.9
const cornerOptions: Array<{ value: DimensionCorner; label: string }> = [
  { value: 'front-left', label: 'Передний левый' },
  { value: 'front-right', label: 'Передний правый' },
  { value: 'back-left', label: 'Задний левый' },
  { value: 'back-right', label: 'Задний правый' }
]
const cameraViewOptions: Array<{ value: CameraView; label: string }> = [
  { value: 'front-left', label: 'Передняя · камера левее' },
  { value: 'front-right', label: 'Передняя · камера правее' },
  { value: 'right-left', label: 'Правая · камера левее' },
  { value: 'right-right', label: 'Правая · камера правее' },
  { value: 'back-left', label: 'Задняя · камера левее' },
  { value: 'back-right', label: 'Задняя · камера правее' },
  { value: 'left-left', label: 'Левая · камера левее' },
  { value: 'left-right', label: 'Левая · камера правее' }
]
const frontSideOptions: Array<{ value: FrontDimensionSide; label: string }> = [
  { value: 'front', label: 'Спереди' },
  { value: 'back', label: 'Сзади' }
]
const depthSideOptions: Array<{ value: DepthDimensionSide; label: string }> = [
  { value: 'left', label: 'Слева' },
  { value: 'right', label: 'Справа' }
]
const doorWidthSideOptions: Array<{ value: DoorWidthDimensionSide; label: string }> = [
  { value: 'above', label: 'Сверху' },
  { value: 'below', label: 'Снизу' }
]
const doorHeightSideOptions: Array<{ value: DoorHeightDimensionSide; label: string }> = depthSideOptions
const floorCutSideOptions: Array<{ value: FloorCutLabelSide; label: string }> = [
  { value: 'front', label: 'Спереди' },
  { value: 'back', label: 'Сзади' }
]

interface SegmentedSettingProps<T extends string> {
  label: string
  valueLabel?: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  visible?: boolean
  visibilityAriaLabel?: string
  onVisibilityChange?: (visible: boolean) => void
}

interface DimensionVisibilityToggleProps {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}

interface RangeSettingProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}

function DimensionVisibilityToggle({ checked, label, onChange }: DimensionVisibilityToggleProps): JSX.Element {
  return (
    <button
      className="chamber-3d-visibility-toggle"
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={checked ? 'Скрыть размер' : 'Показать размер'}
      onClick={() => onChange(!checked)}
    >
      <span aria-hidden="true" />
    </button>
  )
}

function SegmentedSetting<T extends string>({
  label,
  valueLabel,
  value,
  options,
  onChange,
  visible,
  visibilityAriaLabel,
  onVisibilityChange
}: SegmentedSettingProps<T>): JSX.Element {
  return (
    <div className="chamber-3d-setting" role="group" aria-label={label}>
      <div className="chamber-3d-setting-heading">
        <div className="chamber-3d-setting-title">
          <span className="chamber-3d-setting-label">{label}</span>
          {visible !== undefined && visibilityAriaLabel && onVisibilityChange ? (
            <DimensionVisibilityToggle
              checked={visible}
              label={visibilityAriaLabel}
              onChange={onVisibilityChange}
            />
          ) : null}
        </div>
        {valueLabel ? <strong>{valueLabel}</strong> : null}
      </div>
      <div className="chamber-3d-setting-options">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function RangeSetting({
  label,
  value,
  min,
  max,
  step,
  onChange
}: RangeSettingProps): JSX.Element {
  const [draftValue, setDraftValue] = useState(value)
  const draftValueRef = useRef(value)
  const committedValueRef = useRef(value)
  const progress = ((draftValue - min) / (max - min)) * 100

  useEffect(() => {
    setDraftValue(value)
    draftValueRef.current = value
    committedValueRef.current = value
  }, [value])

  const commitValue = (): void => {
    const nextValue = draftValueRef.current
    if (nextValue !== committedValueRef.current) {
      committedValueRef.current = nextValue
      onChange(nextValue)
    }
  }

  const resetValue = (): void => {
    setDraftValue(100)
    draftValueRef.current = 100
    if (committedValueRef.current !== 100) {
      committedValueRef.current = 100
      onChange(100)
    }
  }

  return (
    <div className="chamber-3d-range-setting" role="group" aria-label={label}>
      <span className="chamber-3d-range-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draftValue}
        aria-label={label}
        style={{ background: `linear-gradient(to right, var(--green) 0 ${progress}%, #dce4e0 ${progress}% 100%)` }}
        onChange={(event) => {
          const nextValue = Number(event.currentTarget.value)
          draftValueRef.current = nextValue
          setDraftValue(nextValue)
        }}
        onPointerUp={commitValue}
        onPointerCancel={commitValue}
        onKeyUp={commitValue}
        onBlur={commitValue}
      />
      <output>{draftValue}%</output>
      <button type="button" title="Сбросить на 100%" aria-label={`Сбросить ${label}`} disabled={draftValue === 100} onClick={resetValue}>
        <RotateCcw size={12} />
      </button>
    </div>
  )
}

export function Chamber3DSettingsPanel({
  input,
  onViewSettingsChange
}: Chamber3DSettingsPanelProps): JSX.Element {
  const placement = normalizeDoorPlacement(input)
  const sideWallFront = placement.wall === 'left' || placement.wall === 'right'
  const viewFrontMm = sideWallFront ? Math.min(input.lengthMm, input.widthMm) : Math.max(input.lengthMm, input.widthMm)
  const viewDepthMm = sideWallFront ? Math.max(input.lengthMm, input.widthMm) : Math.min(input.lengthMm, input.widthMm)
  const panelRuns = buildChamberPanelRuns(
    Math.max(input.lengthMm, input.widthMm),
    Math.min(input.lengthMm, input.widthMm),
    input.thicknessMm,
    input.hasPanelFloor
  )
  const floorCutMm = panelRuns.floor?.hasCut ? panelRuns.floor.remainderMm : null
  const cameraDistancePercent = Number.isFinite(input.view3d.cameraDistancePercent)
    ? input.view3d.cameraDistancePercent
    : 100
  const floorCutLabelDistancePercent = Number.isFinite(input.view3d.floorCutLabelDistancePercent)
    ? input.view3d.floorCutLabelDistancePercent
    : 100
  const dimensionLabelSizePercent = Number.isFinite(input.view3d.dimensionLabelSizePercent)
    ? input.view3d.dimensionLabelSizePercent
    : 100
  const cutLabelSizePercent = Number.isFinite(input.view3d.cutLabelSizePercent) ? input.view3d.cutLabelSizePercent : 100
  const formatSettingMm = (value: number): string => `${Math.round(value).toLocaleString('ru-RU')} мм`
  const updateViewSetting = <K extends keyof Chamber3DSettings>(key: K, value: Chamber3DSettings[K]): void => {
    onViewSettingsChange({ ...input.view3d, [key]: value })
  }

  return (
    <div className="chamber-3d-settings-panel">
      <section className="chamber-3d-settings-group is-camera">
        <div className="chamber-3d-settings-group-heading">
          <span>01</span>
          <div>
            <h3>Ракурс камеры</h3>
            <p>100% автоматически вмещает в кадр модель, размеры и таблички.</p>
          </div>
        </div>
        <SegmentedSetting<CameraView>
          label="Сторона и положение камеры"
          value={input.view3d.cameraView}
          options={cameraViewOptions}
          onChange={(value) => updateViewSetting('cameraView', value)}
        />
        <RangeSetting
          label="Поправка к автодальности в КП"
          value={cameraDistancePercent}
          min={5}
          max={180}
          step={5}
          onChange={(value) => updateViewSetting('cameraDistancePercent', value)}
        />
      </section>

      <section className="chamber-3d-settings-group is-dimensions">
        <div className="chamber-3d-settings-group-heading">
          <span>02</span>
          <div>
            <h3>Габариты камеры</h3>
            <p>Расположите основные размеры вокруг модели.</p>
          </div>
        </div>
        <div className="chamber-3d-settings-group-controls">
          <SegmentedSetting<FrontDimensionSide>
            label="Длина камеры"
            valueLabel={formatSettingMm(viewFrontMm)}
            value={input.view3d.frontDimensionSide}
            options={frontSideOptions}
            onChange={(value) => updateViewSetting('frontDimensionSide', value)}
            visible={input.view3d.frontDimensionVisible}
            visibilityAriaLabel="Показывать длину камеры"
            onVisibilityChange={(visible) => updateViewSetting('frontDimensionVisible', visible)}
          />
          <SegmentedSetting<DepthDimensionSide>
            label="Ширина камеры"
            valueLabel={formatSettingMm(viewDepthMm)}
            value={input.view3d.depthDimensionSide}
            options={depthSideOptions}
            onChange={(value) => updateViewSetting('depthDimensionSide', value)}
            visible={input.view3d.depthDimensionVisible}
            visibilityAriaLabel="Показывать ширину камеры"
            onVisibilityChange={(visible) => updateViewSetting('depthDimensionVisible', visible)}
          />
          <SegmentedSetting<DimensionCorner>
            label="Высота камеры"
            valueLabel={formatSettingMm(input.heightMm)}
            value={input.view3d.heightDimensionCorner}
            options={cornerOptions}
            onChange={(value) => updateViewSetting('heightDimensionCorner', value)}
            visible={input.view3d.heightDimensionVisible}
            visibilityAriaLabel="Показывать высоту камеры"
            onVisibilityChange={(visible) => updateViewSetting('heightDimensionVisible', visible)}
          />
          {floorCutMm !== null ? (
            <div className="chamber-3d-floor-cut-settings">
              <SegmentedSetting<FloorCutLabelSide>
                label="Подрезка пола"
                valueLabel={formatSettingMm(floorCutMm)}
                value={input.view3d.floorCutLabelSide}
                options={floorCutSideOptions}
                onChange={(value) => updateViewSetting('floorCutLabelSide', value)}
                visible={input.view3d.floorCutDimensionVisible}
                visibilityAriaLabel="Показывать размер подрезки пола"
                onVisibilityChange={(visible) => updateViewSetting('floorCutDimensionVisible', visible)}
              />
              <RangeSetting
                label="Вынос таблички подрезки"
                value={floorCutLabelDistancePercent}
                min={5}
                max={200}
                step={5}
                onChange={(value) => updateViewSetting('floorCutLabelDistancePercent', value)}
              />
            </div>
          ) : (
            <div className="chamber-3d-setting is-unavailable">
              <div className="chamber-3d-setting-heading">
                <div className="chamber-3d-setting-title">
                  <span className="chamber-3d-setting-label">Подрезка пола</span>
                  <DimensionVisibilityToggle
                    checked={input.view3d.floorCutDimensionVisible}
                    label="Показывать размер подрезки пола"
                    onChange={(visible) => updateViewSetting('floorCutDimensionVisible', visible)}
                  />
                </div>
              </div>
              <span>Не требуется для текущего пола</span>
            </div>
          )}
          <RangeSetting
            label="Чёрные таблички"
            value={dimensionLabelSizePercent}
            min={50}
            max={200}
            step={5}
            onChange={(value) => updateViewSetting('dimensionLabelSizePercent', value)}
          />
          <RangeSetting
            label="Оранжевые таблички"
            value={cutLabelSizePercent}
            min={50}
            max={200}
            step={5}
            onChange={(value) => updateViewSetting('cutLabelSizePercent', value)}
          />
        </div>
      </section>

      <section className="chamber-3d-settings-group is-door">
        <div className="chamber-3d-settings-group-heading">
          <span>03</span>
          <div>
            <h3>Размеры двери</h3>
            <p>Настройте подписи проёма отдельно от габаритов камеры.</p>
          </div>
        </div>
        <div className="chamber-3d-settings-group-controls">
          <SegmentedSetting<DoorWidthDimensionSide>
            label="Ширина двери"
            valueLabel={formatSettingMm(placement.widthMm)}
            value={input.view3d.doorWidthDimensionSide}
            options={doorWidthSideOptions}
            onChange={(value) => updateViewSetting('doorWidthDimensionSide', value)}
            visible={input.view3d.doorWidthDimensionVisible}
            visibilityAriaLabel="Показывать ширину двери"
            onVisibilityChange={(visible) => updateViewSetting('doorWidthDimensionVisible', visible)}
          />
          <SegmentedSetting<DoorHeightDimensionSide>
            label="Высота двери"
            valueLabel={formatSettingMm(input.doorHeightMm)}
            value={input.view3d.doorHeightDimensionSide}
            options={doorHeightSideOptions}
            onChange={(value) => updateViewSetting('doorHeightDimensionSide', value)}
            visible={input.view3d.doorHeightDimensionVisible}
            visibilityAriaLabel="Показывать высоту двери"
            onVisibilityChange={(visible) => updateViewSetting('doorHeightDimensionVisible', visible)}
          />
        </div>
      </section>
    </div>
  )
}

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
  viewportHeight: number,
  dimensionLabelSizePercent = 100,
  cutLabelSizePercent = 100,
  matchProposalImageScale = false
): void {
  const uiScale = clamp(Math.min(viewportWidth / 720, viewportHeight / 420), 0.9, 1.65)
  const proposalDisplayScale = Math.max(
    0.2,
    Math.min(viewportWidth / PROPOSAL_IMAGE_WIDTH, viewportHeight / PROPOSAL_IMAGE_HEIGHT)
  )
  const baseDimensionLabelScale = matchProposalImageScale
    ? (22 / 19) * proposalDisplayScale * LABEL_BASE_SCALE
    : Math.min(uiScale, 22 / 19) * LABEL_BASE_SCALE
  const baseCutLabelScale = baseDimensionLabelScale
  const dimensionLabelScale =
    baseDimensionLabelScale * clamp(dimensionLabelSizePercent / 100 || 1, 0.5, 2)
  const cutLabelScale = baseCutLabelScale * clamp(cutLabelSizePercent / 100 || 1, 0.5, 2)
  const dimensionLabels = collectDimensionLabelAnnotations(
    ctx,
    root,
    camera,
    viewportWidth,
    viewportHeight,
    dimensionLabelScale
  )
  const occupied = dimensionLabels.map((annotation) => annotation.box)
  occupied.push({ x: 8 * uiScale, y: 8 * uiScale, w: 128 * uiScale, h: 48 * uiScale })
  occupied.push({ x: viewportWidth - 104 * uiScale, y: 8 * uiScale, w: 96 * uiScale, h: 48 * uiScale })

  const directionToCamera = camera.getWorldDirection(new THREE.Vector3()).negate().normalize()
  const visible = anchors
    .filter((anchor) => {
      const facesCamera = anchor.normal.dot(directionToCamera) > (anchor.kind === 'floor' ? 0.08 : 0.12)
      const facesSelectedSide = anchor.visibilityNormal ? anchor.visibilityNormal.dot(directionToCamera) > 0.08 : true
      const occlusionPoint = anchor.kind === 'wall' ? anchor.labelGuide?.position : undefined
      const occluded = occlusionPoint ? isWorldPointOccluded(root, camera, occlusionPoint) : false
      return facesCamera && facesSelectedSide && !occluded
    })
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'wall' ? -1 : 1))

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.font = `700 ${11 * cutLabelScale}px Arial, sans-serif`
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
    const labelW = ctx.measureText(anchor.label).width + 12 * cutLabelScale
    const labelH = 19 * cutLabelScale
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
    roundRect(ctx, -label.w / 2, -label.h / 2, label.w, label.h, 4 * cutLabelScale)
    ctx.fillStyle = 'rgba(255, 250, 244, 0.96)'
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = cutLabelScale
    ctx.stroke()
    ctx.fillStyle = color
    ctx.fillText(label.label, 0, 0.5 * cutLabelScale)
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
  visibilityNormal?: THREE.Vector3
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
  const maxDoorHeightM = Math.max(0.2, metrics.wallHeightM - 0.08)
  const doorWidthM = placement.widthMm / 1000
  const doorHeightM = clamp(input.doorHeightMm / 1000, 0.3, maxDoorHeightM)
  const wallCoordinateToLocalX = placement.wall === 'right' ? 1 : -1
  const doorCenterX = (placement.offsetMm / 1000) * wallCoordinateToLocalX
  const doorBottomY = 0
  const doorCenterY = doorBottomY + doorHeightM / 2
  const frontSurfaceZ = -0.048
  const frameW = 0.055
  const leafDepthM = 0.05
  const leafWidthM = doorWidthM * 0.93
  const leafHeightM = doorHeightM * 0.95
  const handleRadiusM = clamp(doorWidthM * 0.018, 0.026, 0.04)
  const railExtensionCenterX =
    (((placement.railExtensionStartMm + placement.railExtensionEndMm) / 2 - placement.wallSpanMm / 2) /
      1000) *
    wallCoordinateToLocalX
  const slideDirectionX = railExtensionCenterX >= doorCenterX ? 1 : -1
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

    addHandle(
      input.doorType === 'sliding'
        ? doorCenterX - slideDirectionX * doorWidthM * 0.34
        : doorCenterX + doorWidthM * 0.34
    )

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

    const addDetailedRail = (railY: number, railWidthM: number, railCenterX: number): void => {
      // The main body and both lips form a deep U-shaped metal channel.
      addBox(
        doorAssembly,
        new THREE.Vector3(railWidthM, railHeightM, railDepthM),
        new THREE.Vector3(railCenterX, railY, railZ),
        railMaterial
      )
      for (const lipY of [railY - railHeightM / 2 + railLipHeightM / 2, railY + railHeightM / 2 - railLipHeightM / 2]) {
        addBox(
          doorAssembly,
          new THREE.Vector3(railWidthM, railLipHeightM, railLipDepthM),
          new THREE.Vector3(railCenterX, lipY, railZ - (railLipDepthM - railDepthM) / 2),
          railAccentMaterial
        )
      }

      // A recessed face strip, inset end caps and visible fasteners make the profile readable at a distance.
      addBox(
        doorAssembly,
        new THREE.Vector3(Math.max(railWidthM - endCapWidthM * 2, endCapWidthM), railAccentHeightM, railAccentDepthM),
        new THREE.Vector3(railCenterX, railY, railFrontZ),
        railAccentMaterial
      )
      for (const capX of [
        railCenterX - railWidthM / 2 + endCapWidthM / 2,
        railCenterX + railWidthM / 2 - endCapWidthM / 2
      ]) {
        addBox(
          doorAssembly,
          new THREE.Vector3(endCapWidthM, railHeightM * 0.9, railLipDepthM),
          new THREE.Vector3(capX, railY, railZ - (railLipDepthM - railDepthM) / 2),
          railAccentMaterial
        )
      }
      for (const boltX of [railCenterX - railWidthM * 0.3, railCenterX + railWidthM * 0.3]) {
        addRailBolt(boltX, railY)
      }
    }

    const topRailWidthM = (placement.railEndMm - placement.railStartMm) / 1000
    const topRailCenterX =
      (((placement.railStartMm + placement.railEndMm) / 2 - placement.wallSpanMm / 2) / 1000) *
      wallCoordinateToLocalX

    // As on the reference door: the upper rail covers the closed doorway and
    // continues by one door width toward the opening side. The lower guide is
    // only on that adjacent wall section and is exactly one door width long.
    addDetailedRail(doorBottomY + doorHeightM + railHeightM / 2, topRailWidthM, topRailCenterX)
    addDetailedRail(doorBottomY + doorHeightM * 0.18, doorWidthM, railExtensionCenterX)

    const carrierWidthM = clamp(doorWidthM * 0.055, 0.045, 0.075)
    const carrierHeightM = clamp(doorHeightM * 0.052, 0.09, 0.13)
    for (const carrierX of [doorCenterX - doorWidthM * 0.32, doorCenterX + doorWidthM * 0.32]) {
      addBox(
        doorAssembly,
        new THREE.Vector3(carrierWidthM, carrierHeightM, railLipDepthM),
        new THREE.Vector3(
          carrierX,
          doorBottomY + doorHeightM - carrierHeightM / 2 + railHeightM * 0.15,
          railZ - (railLipDepthM - railDepthM) / 2
        ),
        railMaterial
      )
    }
  }

  const dimensionMaterial = new THREE.LineBasicMaterial({
    color: 0x163246,
    linewidth: 2,
    depthTest: false,
    depthWrite: false
  })
  const doorDimZ = -0.26
  const doorLeftX = doorCenterX - doorWidthM / 2
  const doorRightX = doorCenterX + doorWidthM / 2
  const doorWidthDimensionY = input.view3d.doorWidthDimensionSide === 'below' ? -0.18 : doorHeightM + 0.18
  const doorHeightDimensionX =
    input.view3d.doorHeightDimensionSide === 'left' ? doorLeftX - 0.24 : doorRightX + 0.24
  if (input.view3d.doorWidthDimensionVisible) {
    addDimensionLine(
      doorAssembly,
      new THREE.Vector3(doorLeftX, doorWidthDimensionY, doorDimZ),
      new THREE.Vector3(doorRightX, doorWidthDimensionY, doorDimZ),
      new THREE.Vector3(0, 0.12, 0),
      formatMm(placement.widthMm),
      dimensionMaterial
    )
  }
  if (input.view3d.doorHeightDimensionVisible) {
    addDimensionLine(
      doorAssembly,
      new THREE.Vector3(doorHeightDimensionX, 0, doorDimZ),
      new THREE.Vector3(doorHeightDimensionX, doorHeightM, doorDimZ),
      new THREE.Vector3(0.12, 0, 0),
      formatMm(input.doorHeightMm),
      dimensionMaterial
    )
  }

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
  thicknessM: number,
  sideWallFront: boolean
): void {
  const material = new THREE.LineBasicMaterial({
    color: 0x163246,
    linewidth: 2,
    depthTest: false,
    depthWrite: false
  })
  const viewFrontM = sideWallFront ? metrics.widthM : metrics.lengthM
  const viewDepthM = sideWallFront ? metrics.lengthM : metrics.widthM
  const viewFrontMm = sideWallFront ? metrics.widthMm : metrics.lengthMm
  const viewDepthMm = sideWallFront ? metrics.lengthMm : metrics.widthMm
  const tick = Math.max(Math.min(viewFrontM, viewDepthM) * 0.035, 0.16)
  const zOffset = thicknessM + Math.max(viewDepthM * 0.11, 0.62)
  const xOffset = thicknessM + Math.max(viewFrontM * 0.055, 0.62)
  const heightZOffset = thicknessM + Math.max(viewDepthM * 0.055, 0.34)
  const heightXOffset = thicknessM + Math.max(viewFrontM * 0.03, 0.34)
  const dimensionZ = (input.view3d.frontDimensionSide === 'back' ? 1 : -1) * (viewDepthM / 2 + zOffset)
  const dimensionX = (input.view3d.depthDimensionSide === 'left' ? -1 : 1) * (viewFrontM / 2 + xOffset)
  const heightBack = input.view3d.heightDimensionCorner.startsWith('back-')
  const heightLeft = input.view3d.heightDimensionCorner.endsWith('-left')
  const heightZ = (heightBack ? 1 : -1) * (viewDepthM / 2 + heightZOffset)
  const heightX = (heightLeft ? -1 : 1) * (viewFrontM / 2 + heightXOffset)
  const y = 0.08

  if (input.view3d.frontDimensionVisible) {
    addDimensionLine(
      group,
      new THREE.Vector3(-viewFrontM / 2, y, dimensionZ),
      new THREE.Vector3(viewFrontM / 2, y, dimensionZ),
      new THREE.Vector3(0, 0, tick),
      formatMm(viewFrontMm),
      material
    )
  }

  if (input.view3d.depthDimensionVisible) {
    addDimensionLine(
      group,
      new THREE.Vector3(dimensionX, y, -viewDepthM / 2),
      new THREE.Vector3(dimensionX, y, viewDepthM / 2),
      new THREE.Vector3(tick, 0, 0),
      formatMm(viewDepthMm),
      material
    )
  }

  if (input.view3d.heightDimensionVisible) {
    addDimensionLine(
      group,
      new THREE.Vector3(heightX, 0, heightZ),
      new THREE.Vector3(heightX, metrics.totalHeightM, heightZ),
      new THREE.Vector3(tick, 0, 0),
      formatMm(input.heightMm),
      material
    )
  }

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

  if (input.view3d.floorCutDimensionVisible && runs.floor?.hasCut) {
    const cutM = runs.floor.remainderMm / 1000
    const endX = metrics.floorLengthM / 2
    const startX = endX - cutM
    const sideSign = input.view3d.floorCutLabelSide === 'back' ? 1 : -1
    const edgeZ = sideSign * (metrics.floorWidthM / 2 + surfaceOffset)
    const dimensionY = 0.08
    const dimensionZ = sideSign * (metrics.widthM / 2 + thicknessM + Math.max(metrics.widthM * 0.11, 0.62))
    const labelDistanceFactor = clamp(input.view3d.floorCutLabelDistancePercent / 100 || 1, 0.05, 2)
    const labelDistanceM = Math.max(metrics.widthM * 0.18, 0.8) * labelDistanceFactor

    anchors.push({
      end: new THREE.Vector3(endX, Math.max(thicknessM * 0.45, 0.025), edgeZ),
      kind: 'floor',
      label: `Пол · ${formatMm(runs.floor.remainderMm)}`,
      labelGuide: {
        start: new THREE.Vector3(startX, dimensionY, dimensionZ),
        end: new THREE.Vector3(endX, dimensionY, dimensionZ),
        position: new THREE.Vector3(endX, dimensionY, dimensionZ + sideSign * labelDistanceM)
      },
      normal: new THREE.Vector3(0, 1, 0),
      start: new THREE.Vector3(startX, Math.max(thicknessM * 0.45, 0.025), edgeZ),
      visibilityNormal: new THREE.Vector3(0, 0, sideSign)
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
  const chamberGroup = new THREE.Group()
  group.add(chamberGroup)
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
      chamberGroup,
      new THREE.Vector3(floorLengthM, thicknessM, floorWidthM),
      new THREE.Vector3(0, thicknessM / 2, 0),
      sidePanelMaterial,
      edgeMaterial
    )
  }

  addBox(
    chamberGroup,
    new THREE.Vector3(lengthM, thicknessM, widthM),
    new THREE.Vector3(0, wallHeightM + thicknessM / 2, 0),
    panelMaterial,
    edgeMaterial
  )

  addWallPanels(chamberGroup, metrics, thicknessM, panelMaterial, sidePanelMaterial, wallCutMaterial, seamMaterial, edgeMaterial)
  addDeckSeams(chamberGroup, metrics, thicknessM, input.hasPanelFloor, seamMaterial, cutMaterial)
  addDoor(chamberGroup, input, metrics, doorMaterial, frameMaterial, glassMaterial, railMaterial, railAccentMaterial, handleMaterial)

  const placement = normalizeDoorPlacement(input)
  const rotationY =
    placement.wall === 'back'
      ? Math.PI
      : placement.wall === 'left'
        ? -Math.PI / 2
        : placement.wall === 'right'
          ? Math.PI / 2
          : 0
  chamberGroup.rotation.y = rotationY
  const sideWallFront = placement.wall === 'left' || placement.wall === 'right'
  addDimensions(group, input, metrics, thicknessM, sideWallFront)

  const rotation = new THREE.Euler(0, rotationY, 0)
  const rotatePoint = (point: THREE.Vector3): THREE.Vector3 => point.clone().applyEuler(rotation)
  const cutDimensions = buildCutDimensionAnchors(input, metrics, thicknessM).map((anchor) => {
    const start = rotatePoint(anchor.start)
    const end = rotatePoint(anchor.end)

    return {
      ...anchor,
      start,
      end,
      normal: rotatePoint(anchor.normal).normalize(),
      visibilityNormal: anchor.visibilityNormal ? rotatePoint(anchor.visibilityNormal).normalize() : undefined,
      labelGuide: anchor.labelGuide
        ? {
            start: rotatePoint(anchor.labelGuide.start),
            end: rotatePoint(anchor.labelGuide.end),
            position: rotatePoint(anchor.labelGuide.position)
          }
        : undefined
    }
  })

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

function collectFramingPoints(
  group: THREE.Object3D,
  cutDimensions: CutDimensionAnchor[]
): THREE.Vector3[] {
  group.updateWorldMatrix(true, true)
  const bounds = new THREE.Box3().setFromObject(group)
  const points: THREE.Vector3[] = []

  if (!bounds.isEmpty()) {
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          points.push(new THREE.Vector3(x, y, z))
        }
      }
    }
  }

  for (const anchor of cutDimensions) {
    points.push(anchor.start, anchor.end)
    if (anchor.labelGuide) {
      points.push(anchor.labelGuide.start, anchor.labelGuide.end, anchor.labelGuide.position)
    }
  }

  return points
}

function calculateFramingRadius(
  points: THREE.Vector3[],
  target: THREE.Vector3,
  fallbackRadiusM: number
): number {
  const contentRadiusM = points.reduce(
    (radius, point) => Math.max(radius, point.distanceTo(target)),
    fallbackRadiusM
  )
  return contentRadiusM * 1.04
}

function getCameraDirection(cameraView: CameraView): THREE.Vector3 {
  const wall = cameraView.split('-')[0] as 'front' | 'right' | 'back' | 'left'
  const wallNormal =
    wall === 'front'
      ? new THREE.Vector3(0, 0, -1)
      : wall === 'right'
        ? new THREE.Vector3(1, 0, 0)
        : wall === 'back'
          ? new THREE.Vector3(0, 0, 1)
          : new THREE.Vector3(-1, 0, 0)
  const tangentRight = new THREE.Vector3(-wallNormal.z, 0, wallNormal.x)
  const horizontalDirection = wallNormal.addScaledVector(
    tangentRight,
    cameraView.endsWith('-left') ? -0.42 : 0.42
  )

  return new THREE.Vector3(horizontalDirection.x, 0.5, horizontalDirection.z).normalize()
}

function placeCamera(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  framingPoints: THREE.Vector3[],
  fallbackRadiusM: number,
  cameraView: CameraView,
  viewportWidth: number,
  viewportHeight: number,
  labelSizePercent: number,
  distanceFactor = CAMERA_DISTANCE_FACTOR
): void {
  const verticalFov = THREE.MathUtils.degToRad(camera.fov)
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect)
  const direction = getCameraDirection(cameraView)

  camera.position.copy(target).add(direction)
  camera.lookAt(target)
  camera.updateMatrixWorld(true)

  const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize()
  const cameraUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize()
  const safeLabelScale = clamp(labelSizePercent / 100 || 1, 0.5, 2) * LABEL_BASE_SCALE
  const horizontalMarginPx = Math.min(viewportWidth * 0.2, 52 + 28 * safeLabelScale)
  const verticalMarginPx = Math.min(viewportHeight * 0.2, 34 + 18 * safeLabelScale)
  const usableHorizontalTangent =
    Math.tan(horizontalFov / 2) * clamp(1 - (2 * horizontalMarginPx) / Math.max(viewportWidth, 1), 0.6, 0.94)
  const usableVerticalTangent =
    Math.tan(verticalFov / 2) * clamp(1 - (2 * verticalMarginPx) / Math.max(viewportHeight, 1), 0.6, 0.92)
  let fittedDistance = 0.5

  for (const point of framingPoints) {
    const relativePoint = point.clone().sub(target)
    const depthOffset = relativePoint.dot(direction)
    fittedDistance = Math.max(
      fittedDistance,
      depthOffset + Math.abs(relativePoint.dot(cameraRight)) / usableHorizontalTangent,
      depthOffset + Math.abs(relativePoint.dot(cameraUp)) / usableVerticalTangent
    )
  }

  if (framingPoints.length === 0) {
    const limitingHalfFov = Math.min(verticalFov, horizontalFov) / 2
    fittedDistance = Math.max(fittedDistance, fallbackRadiusM / Math.sin(limitingHalfFov))
  }

  const distance = fittedDistance * distanceFactor * AUTO_CAMERA_ZOOM_FACTOR
  camera.position.copy(target).add(direction.multiplyScalar(distance))
  camera.lookAt(target)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
}

export function renderChamber3DToDataUrl(
  input: ChamberInput,
  width = 1400,
  height = 760,
  cameraDistanceFactor = 1.06
): string {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xeef2f5)

  const { group, metrics, cutDimensions } = createChamberModel(input)
  scene.add(group)

  const maxSideM = Math.max(metrics.lengthM, metrics.widthM, metrics.totalHeightM)
  const modelRadiusM = Math.sqrt(metrics.lengthM ** 2 + metrics.widthM ** 2 + metrics.totalHeightM ** 2) / 2
  const target = new THREE.Vector3(0, metrics.totalHeightM * 0.48, 0)
  const framingPoints = collectFramingPoints(group, cutDimensions)
  const cameraDistanceScale = clamp(input.view3d.cameraDistancePercent / 100 || 1, 0.05, 1.8)
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, width / height, 0.03, Math.max(80, maxSideM * 12))
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })

  renderer.setPixelRatio(1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setSize(width, height, false)

  addSceneLights(scene, maxSideM)
  addGround(scene, maxSideM)
  configurePerspectiveCamera(camera, width, height)
  placeCamera(
    camera,
    target,
    framingPoints,
    modelRadiusM,
    input.view3d.cameraView,
    width,
    height,
    Math.max(input.view3d.dimensionLabelSizePercent, input.view3d.cutLabelSizePercent),
    cameraDistanceFactor * cameraDistanceScale
  )
  layoutDimensionLabels(scene, camera, width, height)
  renderer.render(scene, camera)

  const composite = document.createElement('canvas')
  composite.width = width
  composite.height = height
  const compositeContext = composite.getContext('2d')
  if (compositeContext) {
    compositeContext.drawImage(renderer.domElement, 0, 0, width, height)
    drawCutDimensionAnnotations(
      compositeContext,
      scene,
      cutDimensions,
      camera,
      width,
      height,
      input.view3d.dimensionLabelSizePercent,
      input.view3d.cutLabelSizePercent
    )
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

export function Chamber3DSettingsEditor({
  input,
  onClose,
  onViewSettingsChange,
  pdfCameraDistanceFactor = 1.06
}: Chamber3DSettingsEditorProps): JSX.Element {
  const [pdfPreview, setPdfPreview] = useState<string | null>(null)
  const [pdfPreviewError, setPdfPreviewError] = useState(false)
  const [fullscreenPreview, setFullscreenPreview] = useState<'interactive' | 'pdf' | null>(null)

  useEffect(() => {
    document.body.classList.add('view3d-editor-open')

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (fullscreenPreview) {
          setFullscreenPreview(null)
        } else {
          onClose()
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('view3d-editor-open')
    }
  }, [fullscreenPreview, onClose])

  useEffect(() => {
    let disposed = false
    const frameId = window.requestAnimationFrame(() => {
      try {
        const image = renderChamber3DToDataUrl(input, 1400, 760, pdfCameraDistanceFactor)
        if (!disposed) {
          setPdfPreview(image)
          setPdfPreviewError(false)
        }
      } catch {
        if (!disposed) {
          setPdfPreviewError(true)
        }
      }
    })

    return () => {
      disposed = true
      window.cancelAnimationFrame(frameId)
    }
  }, [input, pdfCameraDistanceFactor])

  return (
    <div className="chamber-3d-editor" role="dialog" aria-modal="true" aria-labelledby="chamber-3d-editor-title">
      <header className="chamber-3d-editor-header">
        <div className="chamber-3d-editor-title">
          <span className="chamber-3d-editor-title-icon" aria-hidden="true">
            <SlidersHorizontal size={20} />
          </span>
          <div>
            <h2 id="chamber-3d-editor-title">Настройка 3D-вида</h2>
            <p>{input.title} · изменения сразу сохраняются для изображения в КП</p>
          </div>
        </div>
        <button className="chamber-3d-editor-close" type="button" onClick={onClose}>
          <span>Готово</span>
          <X size={18} />
        </button>
      </header>

      <main className="chamber-3d-editor-content">
        <div className="chamber-3d-editor-settings">
          <Chamber3DSettingsPanel input={input} onViewSettingsChange={onViewSettingsChange} />
        </div>

        <div className="chamber-3d-editor-previews">
          <section
            className={`chamber-3d-editor-preview-card is-interactive${fullscreenPreview === 'interactive' ? ' is-fullscreen' : ''}`}
          >
            <div className="chamber-3d-editor-preview-heading">
              <div>
                <span className="chamber-3d-editor-preview-icon" aria-hidden="true">
                  <MousePointer2 size={16} />
                </span>
                <div>
                  <h3>Интерактивная модель</h3>
                  <p>Поворачивайте и приближайте модель мышью</p>
                </div>
              </div>
              <span className="chamber-3d-editor-preview-badge">Интерактивно</span>
            </div>
            <div className="chamber-3d-editor-live">
              <Chamber3DView
                input={input}
                showSettingsControl={false}
                allowFullscreen={false}
              />
              <button
                className="chamber-3d-preview-fullscreen-button is-interactive"
                type="button"
                title={fullscreenPreview === 'interactive' ? 'Свернуть интерактивную модель' : 'Развернуть интерактивную модель'}
                aria-label={fullscreenPreview === 'interactive' ? 'Свернуть интерактивную модель' : 'Развернуть интерактивную модель'}
                onClick={() => setFullscreenPreview((value) => (value === 'interactive' ? null : 'interactive'))}
              >
                {fullscreenPreview === 'interactive' ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </div>
          </section>

          <section className={`chamber-3d-editor-preview-card is-pdf${fullscreenPreview === 'pdf' ? ' is-fullscreen' : ''}`}>
            <div className="chamber-3d-editor-preview-heading">
              <div>
                <span className="chamber-3d-editor-preview-icon" aria-hidden="true">
                  <FileImage size={16} />
                </span>
                <div>
                  <h3>Изображение в КП</h3>
                  <p>Статичный PNG, который будет вставлен в PDF</p>
                </div>
              </div>
              <span className="chamber-3d-editor-preview-badge">1400 × 760</span>
            </div>
            <div className="chamber-3d-editor-pdf-image">
              {pdfPreview ? (
                <img src={pdfPreview} alt="Статичный 3D-вид для коммерческого предложения" />
              ) : pdfPreviewError ? (
                <p>Не удалось сформировать изображение</p>
              ) : (
                <p>Формируем изображение…</p>
              )}
              <button
                className="chamber-3d-preview-fullscreen-button"
                type="button"
                title={fullscreenPreview === 'pdf' ? 'Свернуть изображение в КП' : 'Развернуть изображение в КП'}
                aria-label={fullscreenPreview === 'pdf' ? 'Свернуть изображение в КП' : 'Развернуть изображение в КП'}
                onClick={() => setFullscreenPreview((value) => (value === 'pdf' ? null : 'pdf'))}
              >
                {fullscreenPreview === 'pdf' ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

export function Chamber3DView({
  input,
  settingsOpen = false,
  onSettingsToggle,
  showSettingsControl = true,
  allowFullscreen = true
}: Chamber3DViewProps): JSX.Element {
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
        ...Object.values(input.view3d),
        input.doorHeightMm,
        input.doorType,
        input.doorSlideSide,
        input.doorHasThreshold ? 'threshold' : 'nothreshold'
      ].join('-'),
    [
      input.doorHasThreshold,
      input.doorHeightMm,
      input.doorSlideSide,
      input.doorType,
      input.doorWidthMm,
      input.doorWall,
      input.doorOffsetMm,
      input.view3d,
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
    const framingPoints = collectFramingPoints(group, cutDimensions)
    const framingRadiusM = calculateFramingRadius(framingPoints, target, modelRadiusM)
    const cameraDistanceScale = clamp(input.view3d.cameraDistancePercent / 100 || 1, 0.05, 1.8)
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
    controls.minDistance = 0.5
    controls.maxDistance = Math.max(framingRadiusM * 12, 6)
    controls.maxPolarAngle = Math.PI * 0.92
    controls.minPolarAngle = Math.PI * 0.04
    controls.target.copy(target)

    const resetCamera = (): void => {
      const viewportWidth = renderer.domElement.clientWidth || container.clientWidth || 320
      const viewportHeight = renderer.domElement.clientHeight || container.clientHeight || 260
      placeCamera(
        camera,
        target,
        framingPoints,
        modelRadiusM,
        input.view3d.cameraView,
        viewportWidth,
        viewportHeight,
        Math.max(input.view3d.dimensionLabelSizePercent, input.view3d.cutLabelSizePercent),
        CAMERA_DISTANCE_FACTOR * cameraDistanceScale
      )
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
        drawCutDimensionAnnotations(
          annotationContext,
          scene,
          cutDimensions,
          camera,
          width,
          height,
          input.view3d.dimensionLabelSizePercent,
          input.view3d.cutLabelSizePercent,
          true
        )
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
    input.doorSlideSide,
    input.doorType,
    input.doorWidthMm,
    input.doorWall,
    input.doorOffsetMm,
    input.view3d,
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
      {showSettingsControl && onSettingsToggle ? (
        <div className="dimension-corner-control">
          <button
            className={`view-control-button dimension-corner-trigger${settingsOpen ? ' is-active' : ''}`}
            type="button"
            title="Настроить 3D-вид"
            aria-label="Настроить 3D-вид"
            aria-expanded={settingsOpen}
            onClick={onSettingsToggle}
          >
            <SlidersHorizontal size={16} />
            <span>Настройки 3D</span>
          </button>
        </div>
      ) : null}
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
        {allowFullscreen ? (
          <button
            className="view-control-button"
            type="button"
            title={fullscreen ? 'Свернуть 3D-вид' : 'Развернуть 3D-вид'}
            aria-label={fullscreen ? 'Свернуть 3D-вид' : 'Развернуть 3D-вид'}
            onClick={() => setFullscreen((value) => !value)}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        ) : null}
      </div>
    </div>
  )
}
