import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFloorPlanStore } from '../store/useFloorPlanStore'
import type { AreaCategory, FixtureKind, Point, SelectionRef, Wall } from '../types/floorplan'
import {
  distance,
  heatColor,
  polygonCentroid,
  polygonIntersectsRect,
  polygonPoints,
  rectFromPoints,
  rectIsTiny,
  segmentIntersectsRect,
  snapPoint,
  snapToGrid,
} from '../utils/geometry'
import {
  FIXTURE_DRAG_TYPE,
  fixtureBlueprints,
  fixtureCorners,
  isFixtureKind,
} from '../utils/fixtures'
import { areaDisplayName, fixtureDisplayName } from '../utils/labels'
import { useShortcuts } from '../shortcuts/useShortcuts'
import { isSelectionPointer, resolvePointerGesture } from '../shortcuts/pointerGestures'

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
  const addFixture = useFloorPlanStore((state) => state.addFixture)
  const moveFixture = useFloorPlanStore((state) => state.moveFixture)
  const moveFixtures = useFloorPlanStore((state) => state.moveFixtures)
  const pendingFixtureKind = useFloorPlanStore((state) => state.pendingFixtureKind)
  const catalogOpen = useFloorPlanStore((state) => state.catalogOpen)
  const draggingFixtureKind = useFloorPlanStore((state) => state.draggingFixtureKind)
  const setPendingFixtureKind = useFloorPlanStore((state) => state.setPendingFixtureKind)
  const setSelection = useFloorPlanStore((state) => state.setSelection)
  const toggleSelection = useFloorPlanStore((state) => state.toggleSelection)
  const clearSelection = useFloorPlanStore((state) => state.clearSelection)
  const setViewport = useFloorPlanStore((state) => state.setViewport)
  const resetViewport = useFloorPlanStore((state) => state.resetViewport)
  const undo = useFloorPlanStore((state) => state.undo)
  const redo = useFloorPlanStore((state) => state.redo)
  const deleteSelection = useFloorPlanStore((state) => state.deleteSelection)

  const [wallStart, setWallStart] = useState<Point | null>(null)
  const [areaPoints, setAreaPoints] = useState<Point[]>([])
  const [pointer, setPointer] = useState<Point | null>(null)
  const [panning, setPanning] = useState<{ x: number; y: number } | null>(null)
  /**
   * Arrastre de un objeto ya colocado. Vive aquí, en estado local, y solo se
   * escribe en el store al soltar: así el historial recibe UN registro por
   * movimiento, no sesenta por segundo.
   */
  const [fixtureDrag, setFixtureDrag] = useState<{
    /** Objeto bajo el puntero; arrastra a todos los seleccionados con él. */
    ids: string[]
    origins: Record<string, Point>
    grabbed: string
    offset: Point
    position: Point
  } | null>(null)
  /** Rectángulo de selección mientras se arrastra sobre zona vacía. */
  const [marquee, setMarquee] = useState<{ start: Point; current: Point } | null>(null)
  /** Barra espaciadora mantenida: convierte el arrastre en paneo, como en cualquier editor. */
  /** Tecla de paneo mantenida: convierte el arrastre en mover la vista. */
  const [panKeyHeld, setPanKeyHeld] = useState(false)
  const [dropPreview, setDropPreview] = useState<{ kind: FixtureKind; position: Point } | null>(null)

  const viewWidth = document.widthM / zoom
  const viewHeight = document.heightM / zoom
  const viewBox = `${panX} ${panY} ${viewWidth} ${viewHeight}`

  useEffect(() => {
    setWallStart(null)
    setAreaPoints([])
    setPointer(null)
  }, [tool])

  useShortcuts({
    cancel: () => {
      setWallStart(null)
      setAreaPoints([])
      setMarquee(null)
      setPendingFixtureKind(null)
      clearSelection()
    },
    commitArea: () => {
      if (areaPoints.length < 3) return
      addArea(areaPoints)
      setAreaPoints([])
    },
    deleteSelection: () => {
      if (selection.length) deleteSelection()
    },
    selectAll: () => {
      setSelection([
        ...document.areas.map((area) => ({ type: 'area', id: area.id }) as SelectionRef),
        ...document.walls.map((wall) => ({ type: 'wall', id: wall.id }) as SelectionRef),
        ...document.fixtures.map((fixture) => ({ type: 'fixture', id: fixture.id }) as SelectionRef),
      ])
    },
    undo,
    redo,
    onPanKeyChange: setPanKeyHeld,
  })

  const isSelected = (type: SelectionRef['type'], id: string) =>
    selection.some((item) => item.type === type && item.id === id)

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

  /** Punto del mundo, ajustado a la rejilla, a partir de un evento de arrastre HTML5. */
  const snappedFromClient = (clientX: number, clientY: number): Point | null => {
    const raw = screenToWorld(clientX, clientY)
    if (!raw) return null
    return snapPoint(raw, document.gridSizeM, document.walls)
  }

  const handleDragOver = (event: React.DragEvent<SVGSVGElement>) => {
    if (!event.dataTransfer.types.includes(FIXTURE_DRAG_TYPE)) return
    // Sin este preventDefault el navegador rechaza el drop y no se dispara onDrop.
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'

    const position = snappedFromClient(event.clientX, event.clientY)
    if (position && draggingFixtureKind) {
      setDropPreview({ kind: draggingFixtureKind, position })
    }
  }

  const handleDragLeave = (event: React.DragEvent<SVGSVGElement>) => {
    // dragleave también salta al pasar de un hijo del SVG a otro: solo se
    // limpia la vista previa si el puntero sale de verdad del lienzo.
    const next = event.relatedTarget as Node | null
    if (next && event.currentTarget.contains(next)) return
    setDropPreview(null)
  }

  const handleDrop = (event: React.DragEvent<SVGSVGElement>) => {
    event.preventDefault()
    setDropPreview(null)

    // En el drop sí se puede leer el dataTransfer; draggingFixtureKind es el plan B.
    const raw = event.dataTransfer.getData(FIXTURE_DRAG_TYPE)
    const kind = isFixtureKind(raw) ? raw : draggingFixtureKind
    if (!kind) return

    const position = snappedFromClient(event.clientX, event.clientY)
    if (!position) return

    addFixture(kind, position)
  }

  const startFixtureDrag = (
    event: React.PointerEvent<SVGGElement>,
    id: string,
    position: Point,
  ) => {
    if (!isSelectionPointer({ tool, button: event.button, altKey: event.altKey, panKeyHeld })) {
      return
    }
    event.stopPropagation()

    // Shift alterna la pertenencia a la selección y no inicia arrastre.
    if (event.shiftKey) {
      toggleSelection({ type: 'fixture', id })
      return
    }

    // Arrastrar un objeto que ya estaba seleccionado mueve todo el grupo;
    // arrastrar uno suelto lo convierte en la única selección.
    const alreadySelected = isSelected('fixture', id)
    if (!alreadySelected) setSelection([{ type: 'fixture', id }])

    const groupIds = alreadySelected
      ? selection.filter((item) => item.type === 'fixture').map((item) => item.id)
      : [id]

    const origins: Record<string, Point> = {}
    document.fixtures
      .filter((fixture) => groupIds.includes(fixture.id))
      .forEach((fixture) => {
        origins[fixture.id] = fixture.position
      })

    const raw = screenToWorld(event.clientX, event.clientY)
    if (!raw) return

    setFixtureDrag({
      ids: groupIds,
      origins,
      grabbed: id,
      offset: { x: position.x - raw.x, y: position.y - raw.y },
      position,
    })
    svgRef.current?.setPointerCapture(event.pointerId)
  }

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const gesture = resolvePointerGesture({
      tool,
      button: event.button,
      altKey: event.altKey,
      panKeyHeld,
      hasPendingFixture: Boolean(pendingFixtureKind),
    })

    if (gesture === 'ignore') return

    if (gesture === 'pan') {
      event.preventDefault()
      setPanning({ x: event.clientX, y: event.clientY })
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }

    if (gesture === 'placeFixture') {
      const point = snappedPointer(event)
      if (point && pendingFixtureKind) addFixture(pendingFixtureKind, point)
      return
    }

    if (gesture === 'marquee') {
      const raw = screenToWorld(event.clientX, event.clientY)
      if (raw) {
        setMarquee({ start: raw, current: raw })
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      if (!event.shiftKey) clearSelection()
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
    if (fixtureDrag) {
      const raw = screenToWorld(event.clientX, event.clientY)
      if (!raw) return
      const moved = {
        x: raw.x + fixtureDrag.offset.x,
        y: raw.y + fixtureDrag.offset.y,
      }
      setFixtureDrag({
        ...fixtureDrag,
        position: event.shiftKey ? moved : snapToGrid(moved, document.gridSizeM),
      })
      return
    }

    if (marquee) {
      const raw = screenToWorld(event.clientX, event.clientY)
      if (raw) setMarquee({ ...marquee, current: raw })
      return
    }

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

    if (tool === 'wall' || tool === 'area' || pendingFixtureKind) {
      setPointer(snappedPointer(event))
    }
  }

  /** Qué elementos toca el rectángulo. Basta con rozarlos, no hace falta rodearlos. */
  const selectInsideMarquee = (start: Point, current: Point, additive: boolean) => {
    const rect = rectFromPoints(start, current)

    const hits: SelectionRef[] = [
      ...document.areas
        .filter((area) => polygonIntersectsRect(area.points, rect))
        .map((area) => ({ type: 'area', id: area.id }) as SelectionRef),
      ...document.walls
        .filter((wall) => segmentIntersectsRect(wall.start, wall.end, rect))
        .map((wall) => ({ type: 'wall', id: wall.id }) as SelectionRef),
      ...document.fixtures
        .filter((fixture) => polygonIntersectsRect(fixtureCorners(fixture), rect))
        .map((fixture) => ({ type: 'fixture', id: fixture.id }) as SelectionRef),
    ]

    if (!additive) {
      setSelection(hits)
      return
    }

    // Con Shift el rectángulo suma a lo que ya estaba seleccionado.
    const merged = [...selection]
    hits.forEach((hit) => {
      if (!merged.some((item) => item.type === hit.type && item.id === hit.id)) merged.push(hit)
    })
    setSelection(merged)
  }

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (fixtureDrag) {
      const delta = {
        x: fixtureDrag.position.x - fixtureDrag.origins[fixtureDrag.grabbed].x,
        y: fixtureDrag.position.y - fixtureDrag.origins[fixtureDrag.grabbed].y,
      }
      moveFixtures(
        fixtureDrag.ids.map((id) => ({
          id,
          position: {
            x: fixtureDrag.origins[id].x + delta.x,
            y: fixtureDrag.origins[id].y + delta.y,
          },
        })),
      )
      setFixtureDrag(null)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      return
    }

    if (marquee) {
      // Un clic suelto no es un rectángulo: sin esto, cada clic en vacío
      // seleccionaría lo que estuviera justo debajo del puntero.
      if (!rectIsTiny(rectFromPoints(marquee.start, marquee.current))) {
        selectInsideMarquee(marquee.start, marquee.current, event.shiftKey)
      }
      setMarquee(null)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      return
    }

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
    if (pendingFixtureKind) return t('canvas.placeHelp')
    if (tool === 'area') return t('canvas.areaHelp')
    if (tool === 'wall') return t('canvas.wallHelp')
    if (tool === 'select') {
      if (selection.length > 1) return t('canvas.multiHelp', { count: selection.length })
      return catalogOpen ? t('canvas.fixtureHelp') : t('canvas.selectHelp')
    }
    return t('canvas.escape')
  }, [catalogOpen, pendingFixtureKind, selection.length, t, tool])

  const draftAreaPoints = pointer && areaPoints.length
    ? [...areaPoints, pointer]
    : areaPoints

  return (
    <section
      className={`canvas-shell cursor-${tool}${panKeyHeld || panning ? ' is-panning' : ''}`}
    >
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
        onPointerLeave={() => !panning && !fixtureDrag && !marquee && setPointer(null)}
        onContextMenu={(event) => event.preventDefault()}
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
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
          const selected = isSelected('area', area.id)
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
                  const args = { tool, button: event.button, altKey: event.altKey, panKeyHeld }
                  if (!isSelectionPointer(args)) return
                  event.stopPropagation()
                  if (event.shiftKey) toggleSelection({ type: 'area', id: area.id })
                  else setSelection([{ type: 'area', id: area.id }])
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
                {areaDisplayName(area, t)}
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
            const selected = isSelected('wall', wall.id)
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
                    const args = { tool, button: event.button, altKey: event.altKey, panKeyHeld }
                    if (!isSelectionPointer(args)) return
                    event.stopPropagation()
                    if (event.shiftKey) toggleSelection({ type: 'wall', id: wall.id })
                    else setSelection([{ type: 'wall', id: wall.id }])
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

        {/* 1b. OBJETOS COLOCADOS (estanterías, maniquíes, mostradores...) */}
        {document.fixtures.map((fixture) => {
          const blueprint = fixtureBlueprints[fixture.kind]
          const selected = isSelected('fixture', fixture.id)
          const dragging = fixtureDrag?.ids.includes(fixture.id) ?? false
          const position =
            dragging && fixtureDrag
              ? {
                  x:
                    fixtureDrag.origins[fixture.id].x +
                    (fixtureDrag.position.x - fixtureDrag.origins[fixtureDrag.grabbed].x),
                  y:
                    fixtureDrag.origins[fixture.id].y +
                    (fixtureDrag.position.y - fixtureDrag.origins[fixtureDrag.grabbed].y),
                }
              : fixture.position
          const glyphSize = Math.max(0.2, Math.min(fixture.widthM, fixture.lengthM) * 0.52)
          // La etiqueta baja solo lo que el objeto ocupa EN VERTICAL. Usar la
          // diagonal la alejaba también al ensancharlo, que no tiene sentido:
          // ensanchar no lo hace más alto en pantalla.
          const radians = (fixture.rotationDeg * Math.PI) / 180
          const halfHeight =
            (Math.abs(fixture.widthM * Math.sin(radians)) +
              Math.abs(fixture.lengthM * Math.cos(radians))) /
            2
          const labelOffset = halfHeight + 0.26

          return (
            <g
              key={fixture.id}
              className="fixture-shape"
              transform={`translate(${position.x} ${position.y}) rotate(${fixture.rotationDeg})`}
              opacity={dragging ? 0.8 : 1}
              onPointerDown={(event) => startFixtureDrag(event, fixture.id, fixture.position)}
            >
              <rect
                x={-fixture.widthM / 2}
                y={-fixture.lengthM / 2}
                width={fixture.widthM}
                height={fixture.lengthM}
                rx={0.06}
                fill={blueprint.color}
                fillOpacity={selected ? 0.45 : 0.3}
                stroke={selected ? '#111827' : blueprint.color}
                strokeWidth={selected ? 3 : 1.5}
                // Discontinuo = el agente puede atravesarlo (no bloquea el paso).
                strokeDasharray={fixture.blocksMovement ? undefined : '5 4'}
                vectorEffect="non-scaling-stroke"
              />

              {/* Contra-rotación: el texto se lee horizontal aunque el objeto gire. */}
              <g transform={`rotate(${-fixture.rotationDeg})`} pointerEvents="none">
                <text
                  x="0"
                  y="0"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={glyphSize}
                  fill={blueprint.color}
                  opacity="0.95"
                >
                  {blueprint.icon}
                </text>
                <text
                  x="0"
                  y={labelOffset}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fixture-label"
                >
                  {fixtureDisplayName(fixture, t)}
                </text>
              </g>
            </g>
          )
        })}

        {/* 1c. FANTASMA DE COLOCACIÓN (arrastre desde el catálogo o clic armado) */}
        {(() => {
          const ghostKind = dropPreview?.kind ?? (pendingFixtureKind || null)
          const ghostPosition = dropPreview?.position ?? (pendingFixtureKind ? pointer : null)
          if (!ghostKind || !ghostPosition) return null

          const blueprint = fixtureBlueprints[ghostKind]
          return (
            <g
              pointerEvents="none"
              transform={`translate(${ghostPosition.x} ${ghostPosition.y})`}
            >
              <rect
                x={-blueprint.widthM / 2}
                y={-blueprint.lengthM / 2}
                width={blueprint.widthM}
                height={blueprint.lengthM}
                rx={0.06}
                fill={blueprint.color}
                fillOpacity={0.18}
                stroke={blueprint.color}
                strokeWidth={2}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )
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

        {marquee && (() => {
          const rect = rectFromPoints(marquee.start, marquee.current)
          return (
            <rect
              className="marquee"
              x={rect.minX}
              y={rect.minY}
              width={rect.maxX - rect.minX}
              height={rect.maxY - rect.minY}
              pointerEvents="none"
            />
          )
        })()}

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

      {!document.walls.length && !document.areas.length && !document.fixtures.length && !document.background && (
        <div className="canvas-empty-state">
          <strong>{t('canvas.empty')}</strong>
          <span>Wall · Area · Objects · JSON · i18n</span>
        </div>
      )}

      <div className="canvas-hint">{helpText}</div>
    </section>
  )
}