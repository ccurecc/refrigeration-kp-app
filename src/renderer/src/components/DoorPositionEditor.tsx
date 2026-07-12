import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { MoveHorizontal, RotateCcw, X } from 'lucide-react'
import type { ChamberInput, DoorWall } from '@renderer/domain/calculator'
import { normalizeDoorPlacement } from '@renderer/domain/chamberGeometry'

interface DoorPositionEditorProps {
  open: boolean
  input: ChamberInput
  onClose: () => void
  onApply: (wall: DoorWall, offsetMm: number) => void
}

const WALL_LABELS: Record<DoorWall, string> = {
  front: 'Передняя',
  right: 'Правая',
  back: 'Задняя',
  left: 'Левая'
}

const WALLS: DoorWall[] = ['front', 'right', 'back', 'left']

const formatMm = (value: number): string => `${Math.round(value).toLocaleString('ru-RU')} мм`

export function DoorPositionEditor({ open, input, onClose, onApply }: DoorPositionEditorProps): JSX.Element | null {
  const [wall, setWall] = useState<DoorWall>(input.doorWall)
  const [offsetMm, setOffsetMm] = useState(input.doorOffsetMm)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!open) {
      return undefined
    }

    setWall(input.doorWall)
    setOffsetMm(input.doorOffsetMm)
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [input.doorOffsetMm, input.doorWall, onClose, open])

  const placement = useMemo(
    () => normalizeDoorPlacement({ ...input, doorWall: wall, doorOffsetMm: offsetMm }),
    [input, offsetMm, wall]
  )

  if (!open) {
    return null
  }

  const longMm = Math.max(input.lengthMm, input.widthMm)
  const shortMm = Math.min(input.lengthMm, input.widthMm)
  const canvas = { width: 900, height: 520 }
  const scale = Math.min(650 / Math.max(longMm, 1), 300 / Math.max(shortMm, 1))
  const chamberW = longMm * scale
  const chamberH = shortMm * scale
  const x0 = (canvas.width - chamberW) / 2
  const y0 = 92 + (300 - chamberH) / 2
  const x1 = x0 + chamberW
  const y1 = y0 + chamberH
  const wallPx = Math.min(Math.max(input.thicknessMm * scale, 12), 28)
  const sideWallHeight = Math.max(chamberH - 2 * wallPx, 0)
  const roomRect = {
    x: x0 + wallPx,
    y: y0 + wallPx,
    width: Math.max(chamberW - 2 * wallPx, 0),
    height: sideWallHeight
  }
  const topWallRect = { x: x0, y: y0, width: chamberW, height: wallPx }
  const bottomWallRect = { x: x0, y: y1 - wallPx, width: chamberW, height: wallPx }
  const leftWallRect = { x: x0, y: y0 + wallPx, width: wallPx, height: sideWallHeight }
  const rightWallRect = { x: x1 - wallPx, y: y0 + wallPx, width: wallPx, height: sideWallHeight }
  const doorPx = placement.widthMm * scale
  const doorAlongPx = placement.leftMm * scale
  const verticalDoorScale = placement.availableSpanMm > 0 ? sideWallHeight / placement.availableSpanMm : 0
  const verticalDoorOffsetPx = Math.max(placement.leftMm - placement.availableStartMm, 0) * verticalDoorScale
  const verticalDoorPx = placement.widthMm * verticalDoorScale
  const doorRect =
    wall === 'front'
      ? { x: x0 + doorAlongPx, y: bottomWallRect.y, width: doorPx, height: bottomWallRect.height }
      : wall === 'back'
        ? { x: x0 + doorAlongPx, y: topWallRect.y, width: doorPx, height: topWallRect.height }
        : wall === 'left'
          ? { x: leftWallRect.x, y: leftWallRect.y + verticalDoorOffsetPx, width: leftWallRect.width, height: verticalDoorPx }
          : { x: rightWallRect.x, y: rightWallRect.y + verticalDoorOffsetPx, width: rightWallRect.width, height: verticalDoorPx }

  const updateFromPointer = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    const px = ((event.clientX - rect.left) / rect.width) * canvas.width
    const py = ((event.clientY - rect.top) / rect.height) * canvas.height
    const distances: Array<[DoorWall, number]> = [
      ['back', Math.abs(py - y0)],
      ['front', Math.abs(py - y1)],
      ['left', Math.abs(px - x0)],
      ['right', Math.abs(px - x1)]
    ]
    distances.sort((a, b) => a[1] - b[1])
    const nextWall = distances[0][0]
    const wallSpanMm = nextWall === 'front' || nextWall === 'back' ? longMm : shortMm
    const alongMm =
      nextWall === 'front' || nextWall === 'back'
        ? (px - x0) / scale
        : (py - y0) / scale
    const next = normalizeDoorPlacement({
      ...input,
      doorWall: nextWall,
      doorOffsetMm: alongMm - wallSpanMm / 2
    })
    setWall(next.wall)
    setOffsetMm(next.offsetMm)
  }

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
    updateFromPointer(event)
  }

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (dragging) {
      updateFromPointer(event)
    }
  }

  const finishDrag = (event: ReactPointerEvent<SVGSVGElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragging(false)
  }

  return (
    <div className="modal-overlay door-editor-overlay" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-window door-editor-modal" role="dialog" aria-modal="true" aria-labelledby="door-editor-title">
        <header className="modal-header">
          <div>
            <h2 id="door-editor-title">Положение двери</h2>
            <p>Перетащите дверь на нужную стену или кликните по стене.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Закрыть редактор" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="door-editor-body">
          <div className="door-editor-wall-tabs" role="group" aria-label="Стена с дверью">
            {WALLS.map((item) => (
              <button
                key={item}
                type="button"
                className={wall === item ? 'active' : undefined}
                onClick={() => {
                  setWall(item)
                  setOffsetMm(0)
                }}
              >
                {WALL_LABELS[item]}
              </button>
            ))}
          </div>

          <div className="door-editor-canvas-wrap">
            <svg
              className={`door-editor-canvas${dragging ? ' dragging' : ''}`}
              viewBox={`0 0 ${canvas.width} ${canvas.height}`}
              role="img"
              aria-label={`План камеры. Дверь на стене: ${WALL_LABELS[wall].toLowerCase()}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
            >
              <rect width={canvas.width} height={canvas.height} fill="#f4f6f8" />
              <text x={canvas.width / 2} y={38} textAnchor="middle" className="door-editor-title-text">
                Вид сверху · {formatMm(longMm)} × {formatMm(shortMm)}
              </text>
              <text x={canvas.width / 2} y={y0 - 18} textAnchor="middle" className="door-editor-wall-label">Задняя стена</text>
              <text x={canvas.width / 2} y={y1 + 35} textAnchor="middle" className="door-editor-wall-label">Передняя стена</text>
              <text x={x0 - 24} y={(y0 + y1) / 2} textAnchor="middle" className="door-editor-wall-label" transform={`rotate(-90 ${x0 - 24} ${(y0 + y1) / 2})`}>Левая стена</text>
              <text x={x1 + 24} y={(y0 + y1) / 2} textAnchor="middle" className="door-editor-wall-label" transform={`rotate(90 ${x1 + 24} ${(y0 + y1) / 2})`}>Правая стена</text>
              <rect {...roomRect} className="door-editor-room" />
              <rect {...topWallRect} className="door-editor-wall" />
              <rect {...bottomWallRect} className="door-editor-wall" />
              <rect {...leftWallRect} className="door-editor-wall" />
              <rect {...rightWallRect} className="door-editor-wall" />
              <rect {...doorRect} rx="3" className="door-editor-door" />
              <g className="door-editor-grip" transform={`translate(${doorRect.x + doorRect.width / 2} ${doorRect.y + doorRect.height / 2})`}>
                <line x1="-11" y1="0" x2="11" y2="0" />
                <path d="M-11 0 L-5 -5 M-11 0 L-5 5 M11 0 L5 -5 M11 0 L5 5" />
              </g>
              <text x={canvas.width / 2} y={482} textAnchor="middle" className="door-editor-help-text">
                Толщина панелей {formatMm(input.thicknessMm)} · проём {formatMm(placement.widthMm)}
              </text>
            </svg>
          </div>

          <div className="door-editor-measurements">
            <div><span>Выбранная стена</span><strong>{WALL_LABELS[wall]}</strong></div>
            <div><span>До начала проёма</span><strong>{formatMm(placement.startDistanceMm)}</strong></div>
            <div><span>После проёма</span><strong>{formatMm(placement.endDistanceMm)}</strong></div>
            <div><span>Смещение от центра</span><strong>{formatMm(Math.abs(placement.offsetMm))}</strong></div>
          </div>
        </div>

        <footer className="modal-footer door-editor-footer">
          <button className="ghost-button" type="button" onClick={() => setOffsetMm(0)}>
            <RotateCcw size={15} /> Вернуть в центр
          </button>
          <span className="door-editor-drag-note"><MoveHorizontal size={16} /> Дверь не выйдет за границы стены</span>
          <button className="ghost-button" type="button" onClick={onClose}>Отмена</button>
          <button className="primary-button" type="button" onClick={() => onApply(placement.wall, placement.offsetMm)}>Применить</button>
        </footer>
      </section>
    </div>
  )
}
