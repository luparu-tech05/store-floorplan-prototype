import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFloorPlanStore } from '../store/useFloorPlanStore'
import type { AreaCategory, Point, Wall } from '../types/floorplan'
import { distance, heatColor, polygonCentroid, polygonPoints, snapPoint } from '../utils/geometry'

const categoryColors: Record<AreaCategory, string> = {
  entrance: 'rgba(16, 185, 129, 0.26)',
  checkout: 'rgba(245, 158, 11, 0.28)',
  apparel: 'rgba(99, 102, 241, 0.24)',
  footwear: 'rgba(14, 165, 233, 0.25)',
  fittingRoom: 'rgba(168, 85, 247, 0.24)',
  circulation: 'rgba(148, 163, 184, 0.20)',
  storage: 'rgba(100, 116, 139, 0.28)',
  other: 'rgba(45, 212, 191, 0.20)',
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

// ============================================
// HELPER: Agrupa los muros en "recintos" según conectividad de sus vértices
// (vive FUERA del componente, a nivel de módulo — no dentro del JSX)
// ============================================
type WallCentroid = { cx: number; cy: number }
type WallGroupResult = {
  groups: Wall[][]
  centroidByWallId: Record<string, WallCentroid>
}

function groupWallsByRoom(walls: Wall[], tolerance = 0.05): WallGroupResult {
  const parent = walls.map((_, i) => i)

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }

  function union(i: number, j: number) {
    const ri = find(i)
    const rj = find(j)
    if (ri !== rj) parent[ri] = rj
  }

  function samePoint(a: Point, b: Point) {
    return Math.hypot(a.x - b.x, a.y - b.y) < tolerance
  }

  // Unimos muros que comparten un vértice (start-start, start-end, end-start, end-end)
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const w1 = walls[i]
      const w2 = walls[j]
      if (
        samePoint(w1.start, w2.start) ||
        samePoint(w1.start, w2.end) ||
        samePoint(w1.end, w2.start) ||
        samePoint(w1.end, w2.end)
      ) {
        union(i, j)
      }
    }
  }

  // Agrupamos por raíz del union-find
  const groupsByRoot: Record<number, Wall[]> = {}
  walls.forEach((wall, i) => {
    const root = find(i)
    if (!groupsByRoot[root]) groupsByRoot[root] = []
    groupsByRoot[root].push(wall)
  })

  const groups = Object.values(groupsByRoot)

  // Calculamos el centroide de cada grupo y lo asociamos a cada wall.id
  const centroidByWallId: Record<string, WallCentroid> = {}
  groups.forEach((groupWalls) => {
    const c = groupWalls.reduce(
      (acc, w) => {
        acc.x += w.start.x + w.end.x
        acc.y += w.start.y + w.end.y
        acc.n += 2
        return acc
      },
      { x: 0, y: 0, n: 0 }
    )
    const cx = c.x / c.n
    const cy = c.y / c.n
    groupWalls.forEach((w) => {
      centroidByWallId[w.id] = { cx, cy }
    })
  })

  return { groups, centroidByWallId }
}

export function FloorPlanCanvas() {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const document = useFloorPlanStore((state) => state.document)
  const tool = useFloorPlanStore((state) => state.tool)
  const selection = useFloorPlanStore((state) => state.selection)
  const heatPreview = useFloorPlanStore((state) => state.heatPreview)
  const zoom = useFloorPlanStore((state) => state.zoom)
  const panX = useFloorPlanStore((state) => state.panX)
  const panY = useFloorPlanStore((state) => state.panY)
  const addWall = useFloorPlanStore((state) => state.addWall)
  const addArea = useFloorPlanStore((state) => state.addArea)
  const setSelection = useFloorPlanStore((state) => state.setSelection)
  const setViewport = useFloorPlanStore((state) => state.setViewport)
  const resetViewport = useFloorPlanStore((state) => state.resetViewport)
  const undo = useFloorPlanStore((state) => state.undo)
  const redo = useFloorPlanStore((state) => state.redo)
  const deleteSelection = useFloorPlanStore((state) => state.deleteSelection)

  const [wallStart, setWallStart] = useState<Point | null>(null)
  const [areaPoints, setAreaPoints] = useState<Point[]>([])
  const [pointer, setPointer] = useState<Point | null>(null)
  const [panning, setPanning] = useState<{ x: number; y: number } | null>(null)

  const viewWidth = document.widthM / zoom
  const viewHeight = document.heightM / zoom
  const viewBox = `${panX} ${panY} ${viewWidth} ${viewHeight}`

  useEffect(() => {
    setWallStart(null)
    setAreaPoints([])
    setPointer(null)
  }, [tool])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return

      if (event.key === 'Escape') {
        setWallStart(null)
        setAreaPoints([])
      }

      if (event.key === 'Enter' && areaPoints.length >= 3) {
        addArea(areaPoints)
        setAreaPoints([])
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selection) {
        event.preventDefault()
        deleteSelection()
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [addArea, areaPoints, deleteSelection, redo, selection, undo])

  const screenToWorld = (clientX: number, clientY: number): Point | null => {
    const svg = svgRef.current
    if (!svg) return null
    const matrix = svg.getScreenCTM()
    if (!matrix) return null
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
    return { x: point.x, y: point.y }
  }

  const snappedPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const raw = screenToWorld(event.clientX, event.clientY)
    if (!raw) return null
    return snapPoint(raw, document.gridSizeM, document.walls)
  }

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return

    if (tool === 'pan' || event.altKey) {
      setPanning({ x: event.clientX, y: event.clientY })
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }

    if (tool === 'select') {
      setSelection(null)
      return
    }

    const point = snappedPointer(event)
    if (!point) return

    if (tool === 'wall') {
      if (!wallStart) {
        setWallStart(point)
      } else if (distance(wallStart, point) > 0.05) {
        addWall(wallStart, point)
        setWallStart(null)
      }
      return
    }

    if (tool === 'area') {
      const first = areaPoints[0]
      const closeTolerance = Math.max(document.gridSizeM * 0.8, 0.2)
      if (first && areaPoints.length >= 3 && distance(point, first) <= closeTolerance) {
        addArea(areaPoints)
        setAreaPoints([])
      } else {
        setAreaPoints((current) => [...current, point])
      }
    }
  }

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (panning) {
      const rect = event.currentTarget.getBoundingClientRect()
      const dx = event.clientX - panning.x
      const dy = event.clientY - panning.y
      setViewport({
        panX: panX - (dx / rect.width) * viewWidth,
        panY: panY - (dy / rect.height) * viewHeight,
      })
      setPanning({ x: event.clientX, y: event.clientY })
      return
    }

    if (tool === 'wall' || tool === 'area') {
      setPointer(snappedPointer(event))
    }
  }

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (panning) {
      setPanning(null)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    }
  }

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault()
    const factor = event.deltaY > 0 ? 0.9 : 1.1
    setViewport({ zoom: clamp(zoom * factor, 0.55, 7) })
  }

  const helpText = useMemo(() => {
    if (tool === 'area') return t('canvas.areaHelp')
    if (tool === 'wall') return t('canvas.wallHelp')
    return t('canvas.escape')
  }, [t, tool])

  const draftAreaPoints = pointer && areaPoints.length
    ? [...areaPoints, pointer]
    : areaPoints

  return (
    <section className={`canvas-shell cursor-${tool}`}>
      <div className="canvas-meta">
        <span>{document.widthM} × {document.heightM} m</span>
        <span>grid {document.gridSizeM} m</span>
      </div>

      <div className="zoom-controls">
        <button onClick={() => setViewport({ zoom: clamp(zoom * 1.2, 0.55, 7) })}>＋</button>
        <button onClick={() => setViewport({ zoom: clamp(zoom / 1.2, 0.55, 7) })}>−</button>
        <button onClick={resetViewport}>Fit</button>
      </div>

      <svg
        ref={svgRef}
        className="floorplan-svg"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => !panning && setPointer(null)}
        onWheel={handleWheel}
        role="application"
        aria-label="Floor plan editor"
      >
        <defs>
          <pattern
            id="small-grid"
            width={document.gridSizeM}
            height={document.gridSizeM}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${document.gridSizeM} 0 L 0 0 0 ${document.gridSizeM}`}
              fill="none"
              stroke="rgba(100, 116, 139, 0.5)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </pattern>
        </defs>

        <rect x="0" y="0" width={document.widthM} height={document.heightM} fill="#f8fafc" />

        {document.background && (
          <image
            href={document.background.dataUrl}
            x="0"
            y="0"
            width={document.widthM}
            height={document.heightM}
            preserveAspectRatio="xMidYMid meet"
            opacity={document.background.opacity}
            pointerEvents="none"
          />
        )}

        <rect
          x="0"
          y="0"
          width={document.widthM}
          height={document.heightM}
          fill="url(#small-grid)"
          pointerEvents="none"
        />

        {document.areas.map((area) => {
          const selected = selection?.type === 'area' && selection.id === area.id
          const centroid = polygonCentroid(area.points)
          return (
            <g key={area.id}>
              <polygon
                points={polygonPoints(area.points)}
                fill={heatPreview ? heatColor(area.heatValue) : categoryColors[area.category]}
                stroke={selected ? '#111827' : '#475569'}
                strokeWidth={selected ? 3 : 1.5}
                vectorEffect="non-scaling-stroke"
                className="area-shape"
                onPointerDown={(event) => {
                  if (tool !== 'select') return
                  event.stopPropagation()
                  setSelection({ type: 'area', id: area.id })
                }}
              />
              <text
                x={centroid.x}
                y={centroid.y - 0.14}
                textAnchor="middle"
                dominantBaseline="middle"
                className="area-label"
                pointerEvents="none"
              >
                {area.name}
              </text>
              <text
                x={centroid.x}
                y={centroid.y + 0.34}
                textAnchor="middle"
                dominantBaseline="middle"
                className="area-sublabel"
                pointerEvents="none"
              >
                {t(`categories.${area.category}`)}{heatPreview ? ` · ${area.heatValue}%` : ''}
              </text>
            </g>
          )
        })}

        {/* 1. MUROS GUARDADOS */}
        {(() => {
          // Centroide por cada recinto/grupo de muros conectados
          const { centroidByWallId } = groupWallsByRoom(document.walls)

          return document.walls.map((wall) => {
            const selected = selection?.type === 'wall' && selection.id === wall.id
            const dx = wall.end.x - wall.start.x
            const dy = wall.end.y - wall.start.y
            const len = Math.hypot(dx, dy)

            if (len < 0.1) return null

            // Punto medio del muro
            const midX = (wall.start.x + wall.end.x) / 2
            const midY = (wall.start.y + wall.end.y) / 2

            // Ángulo de inclinación del muro en grados
            let angle = (Math.atan2(dy, dx) * 180) / Math.PI
            if (angle > 90) angle -= 180
            if (angle <= -90) angle += 180

            // Vector perpendicular al muro (una de las dos direcciones posibles)
            let nx = -dy / len
            let ny = dx / len

            // Centroide DEL GRUPO al que pertenece este muro (no global)
            const group = centroidByWallId[wall.id]
            const toCenterX = group.cx - midX
            const toCenterY = group.cy - midY

            // Si la normal apunta HACIA el centro del recinto (adentro), la invertimos
            if (nx * toCenterX + ny * toCenterY > 0) {
              nx = -nx
              ny = -ny
            }

            // Separación respecto al centro del muro (en metros)
            const offset = (wall.thicknessM || 0.15) / 2 + 0.35
            const labelX = midX + nx * offset
            const labelY = midY + ny * offset

            return (
              <g key={wall.id}>
                {/* Línea del muro */}
                <line
                  x1={wall.start.x}
                  y1={wall.start.y}
                  x2={wall.end.x}
                  y2={wall.end.y}
                  stroke={selected ? '#2563eb' : '#0f172a'}
                  strokeWidth={wall.thicknessM}
                  strokeLinecap="round"
                  className="wall-shape"
                  onPointerDown={(event) => {
                    if (tool !== 'select') return
                    event.stopPropagation()
                    setSelection({ type: 'wall', id: wall.id })
                  }}
                />

                {/* Cota/Etiqueta de medida alineada al lado */}
                <g
                  transform={`translate(${labelX}, ${labelY}) rotate(${angle})`}
                  pointerEvents="none"
                >
                  <text
                    x="0"
                    y="0"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="0.28"
                    fontWeight="700"
                    fill={selected ? '#2563eb' : '#1e293b'}
                  >
                    {len.toFixed(2)} m
                  </text>
                </g>
              </g>
            )
          })
        })()}

        {/* 2. BORRADOR MIENTRAS TRAZAS EL MURO */}
        {wallStart && pointer && (() => {
          const dx = pointer.x - wallStart.x
          const dy = pointer.y - wallStart.y
          const len = Math.hypot(dx, dy)

          if (len < 0.05) return null

          const midX = (wallStart.x + pointer.x) / 2
          const midY = (wallStart.y + pointer.y) / 2

          let angle = (Math.atan2(dy, dx) * 180) / Math.PI
          if (angle > 90) angle -= 180
          if (angle <= -90) angle += 180

          let nx = -dy / len
          let ny = dx / len

          if (document.walls.length > 0) {
            // Reutilizamos la misma agrupación por recinto que los muros guardados
            const { groups } = groupWallsByRoom(document.walls)

            // Centroide de cada grupo (recinto)
            const groupCentroids: WallCentroid[] = groups.map((groupWalls) => {
              const c = groupWalls.reduce(
                (acc, w) => {
                  acc.x += w.start.x + w.end.x
                  acc.y += w.start.y + w.end.y
                  acc.n += 2
                  return acc
                },
                { x: 0, y: 0, n: 0 }
              )
              return { cx: c.x / c.n, cy: c.y / c.n }
            })

            // Buscamos el centroide de grupo más cercano al punto medio del trazo actual
            // (forma funcional para evitar el problema de TS con 'let' reasignado dentro de un closure)
            const closestCentroid = groupCentroids.reduce<WallCentroid | null>((closest, gc) => {
              if (!closest) return gc
              const distGc = Math.hypot(gc.cx - midX, gc.cy - midY)
              const distClosest = Math.hypot(closest.cx - midX, closest.cy - midY)
              return distGc < distClosest ? gc : closest
            }, null)

            if (closestCentroid) {
              const toCenterX = closestCentroid.cx - midX
              const toCenterY = closestCentroid.cy - midY

              if (nx * toCenterX + ny * toCenterY > 0) {
                nx = -nx
                ny = -ny
              }
            }
          } else {
            // Sin muros previos, mantenemos la regla original como plan B
            if (ny > 0 || (ny === 0 && nx < 0)) {
              nx = -nx
              ny = -ny
            }
          }

          const labelX = midX + nx * 0.4
          const labelY = midY + ny * 0.4

          return (
            <g pointerEvents="none">
              <line
                x1={wallStart.x}
                y1={wallStart.y}
                x2={pointer.x}
                y2={pointer.y}
                stroke="#2563eb"
                strokeWidth={0.08}
                strokeDasharray="0.18 0.12"
              />
              <g transform={`translate(${labelX}, ${labelY}) rotate(${angle})`}>
                <text
                  x="0"
                  y="0"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="0.28"
                  fontWeight="700"
                  fill="#2563eb"
                >
                  {len.toFixed(2)} m
                </text>
              </g>
            </g>
          )
        })()}

        {draftAreaPoints.length > 0 && (
          <>
            <polyline
              points={polygonPoints(draftAreaPoints)}
              fill="rgba(37, 99, 235, 0.08)"
              stroke="#2563eb"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              strokeDasharray="6 4"
              pointerEvents="none"
            />
            {areaPoints.map((point, index) => (
              <circle
                key={`${point.x}-${point.y}-${index}`}
                cx={point.x}
                cy={point.y}
                r={index === 0 ? 0.16 : 0.11}
                fill={index === 0 ? '#2563eb' : '#ffffff'}
                stroke="#2563eb"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ))}
          </>
        )}

        {pointer && (tool === 'wall' || tool === 'area') && (
          <g pointerEvents="none">
            <circle cx={pointer.x} cy={pointer.y} r="0.09" fill="#ef4444" />
            <line x1={pointer.x - 0.25} y1={pointer.y} x2={pointer.x + 0.25} y2={pointer.y} stroke="#ef4444" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1={pointer.x} y1={pointer.y - 0.25} x2={pointer.x} y2={pointer.y + 0.25} stroke="#ef4444" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </g>
        )}

        <rect
          x="0"
          y="0"
          width={document.widthM}
          height={document.heightM}
          fill="none"
          stroke="#94a3b8"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      </svg>

      {!document.walls.length && !document.areas.length && !document.background && (
        <div className="canvas-empty-state">
          <strong>{t('canvas.empty')}</strong>
          <span>Wall · Area · JSON · i18n</span>
        </div>
      )}

      <div className="canvas-hint">{helpText}</div>
    </section>
  )
}