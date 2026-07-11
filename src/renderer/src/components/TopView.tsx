import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Maximize2, Minimize2, Minus, Plus, RotateCcw } from 'lucide-react'
import { ChamberInput, type ChamberResult } from '@renderer/domain/calculator'
import { buildTopView, type TopShape } from '@renderer/domain/topView'

interface TopViewProps {
  input: ChamberInput
  result: ChamberResult
}

const MIN_ZOOM = 1
const MAX_ZOOM = 6

function renderShape(shape: TopShape, index: number): JSX.Element | null {
  if (shape.k === 'rect') {
    return (
      <rect
        key={index}
        x={shape.x}
        y={shape.y}
        width={shape.w}
        height={shape.h}
        fill={shape.fill ?? 'none'}
        stroke={shape.stroke}
        strokeWidth={shape.sw}
      />
    )
  }

  if (shape.k === 'line') {
    return (
      <line
        key={index}
        x1={shape.x1}
        y1={shape.y1}
        x2={shape.x2}
        y2={shape.y2}
        stroke={shape.stroke}
        strokeWidth={shape.sw}
        strokeDasharray={shape.dash}
      />
    )
  }

  if (shape.k === 'path') {
    return (
      <path
        key={index}
        d={shape.d}
        fill={shape.fill ?? 'none'}
        stroke={shape.stroke}
        strokeWidth={shape.sw}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    )
  }

  if (shape.k === 'poly') {
    return <polygon key={index} points={shape.points} fill={shape.fill} />
  }

  return (
    <text
      key={index}
      x={shape.x}
      y={shape.y}
      textAnchor={shape.anchor}
      fontSize={shape.size}
      fontWeight={shape.weight}
      fill={shape.fill}
      transform={shape.rotate ? `rotate(${shape.rotate} ${shape.x} ${shape.y})` : undefined}
    >
      {shape.text}
    </text>
  )
}

export function TopView({ input, result }: TopViewProps): JSX.Element {
  const model = buildTopView({
    longMm: result.longSideMm,
    shortMm: result.shortSideMm,
    thicknessMm: input.thicknessMm,
    hasPanelFloor: input.hasPanelFloor,
    doorWidthMm: input.doorWidthMm
  })

  const svgRef = useRef<SVGSVGElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  // Pan offset as a fraction (0..1) of the full view, centred at 0.5/0.5.
  const [cx, setCx] = useState(0.5)
  const [cy, setCy] = useState(0.5)
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)

  const reset = (): void => {
    setZoom(1)
    setCx(0.5)
    setCy(0.5)
  }

  const clampCenter = (value: number, z: number): number => {
    const half = 1 / (2 * z)
    return Math.min(Math.max(value, half), 1 - half)
  }

  const applyZoom = (next: number, anchorX = 0.5, anchorY = 0.5): void => {
    const z = Math.min(Math.max(next, MIN_ZOOM), MAX_ZOOM)
    setZoom(z)
    setCx((prev) => clampCenter(prev + (anchorX - 0.5) * (1 / zoom - 1 / z), z))
    setCy((prev) => clampCenter(prev + (anchorY - 0.5) * (1 / zoom - 1 / z), z))
  }

  // Native non-passive wheel listener so we can prevent page scroll while zooming.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) {
      return undefined
    }

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const rect = svg.getBoundingClientRect()
      const ax = (event.clientX - rect.left) / rect.width
      const ay = (event.clientY - rect.top) / rect.height
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15
      applyZoom(zoom * factor, ax, ay)
    }

    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [zoom])

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

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (zoom <= 1) {
      return
    }
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, cx, cy }
  }

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (!drag.current || !svgRef.current) {
      return
    }
    const rect = svgRef.current.getBoundingClientRect()
    const dx = (event.clientX - drag.current.x) / rect.width / zoom
    const dy = (event.clientY - drag.current.y) / rect.height / zoom
    setCx(clampCenter(drag.current.cx - dx, zoom))
    setCy(clampCenter(drag.current.cy - dy, zoom))
  }

  const onPointerUp = (): void => {
    drag.current = null
  }

  const vw = model.width / zoom
  const vh = model.height / zoom
  const vx = cx * model.width - vw / 2
  const vy = cy * model.height - vh / 2

  return (
    <div className={`top-view-wrapper${fullscreen ? ' view-fullscreen' : ''}`}>
      <svg
        ref={svgRef}
        className={`top-view${zoom > 1 ? ' zoomed' : ''}`}
        viewBox={`${vx} ${vy} ${vw} ${vh}`}
        role="img"
        aria-label="Вид сверху, раскладка панелей и стыковка углов"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {model.shapes.map((shape, index) => renderShape(shape, index))}
      </svg>
      <div className="top-view-controls">
        <button type="button" aria-label="Приблизить" onClick={() => applyZoom(zoom * 1.3)}>
          <Plus size={16} />
        </button>
        <button type="button" aria-label="Отдалить" onClick={() => applyZoom(zoom / 1.3)}>
          <Minus size={16} />
        </button>
        <button type="button" aria-label="Сбросить масштаб" onClick={reset}>
          <RotateCcw size={15} />
        </button>
        <button
          type="button"
          title={fullscreen ? 'Свернуть вид сверху' : 'Развернуть вид сверху'}
          aria-label={fullscreen ? 'Свернуть вид сверху' : 'Развернуть вид сверху'}
          onClick={() => setFullscreen((value) => !value)}
        >
          {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>
      {zoom > 1 ? <div className="top-view-hint">Перетаскивайте для перемещения</div> : null}
    </div>
  )
}
