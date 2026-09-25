import type { Point, Wall } from '../types/floorplan'

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

export const snapToGrid = (point: Point, gridSize: number): Point => ({
  x: Math.round(point.x / gridSize) * gridSize,
  y: Math.round(point.y / gridSize) * gridSize,
})

export const snapPoint = (
  point: Point,
  gridSize: number,
  walls: Wall[],
  toleranceM = 0.28,
): Point => {
  const gridPoint = snapToGrid(point, gridSize)
  const candidates = walls.flatMap((wall) => [wall.start, wall.end])
  const nearest = candidates.reduce<Point | null>((best, candidate) => {
    if (distance(point, candidate) > toleranceM) return best
    if (!best || distance(point, candidate) < distance(point, best)) return candidate
    return best
  }, null)

  return nearest ?? gridPoint
}

export const polygonCentroid = (points: Point[]): Point => {
  if (!points.length) return { x: 0, y: 0 }
  const sum = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  )
  return { x: sum.x / points.length, y: sum.y / points.length }
}

export const polygonPoints = (points: Point[]) => points.map((p) => `${p.x},${p.y}`).join(' ')

export const heatColor = (value: number) => {
  const clamped = Math.max(0, Math.min(100, value))
  const hue = 220 - clamped * 2.2
  return `hsla(${hue}, 88%, 54%, 0.58)`
}

// ============================================================
// Selección por rectángulo (marquesina)
// ============================================================

export type Rect = { minX: number; minY: number; maxX: number; maxY: number }

export const rectFromPoints = (a: Point, b: Point): Rect => ({
  minX: Math.min(a.x, b.x),
  minY: Math.min(a.y, b.y),
  maxX: Math.max(a.x, b.x),
  maxY: Math.max(a.y, b.y),
})

export const rectIsTiny = (rect: Rect, minSizeM = 0.08) =>
  rect.maxX - rect.minX < minSizeM && rect.maxY - rect.minY < minSizeM

export const pointInRect = (point: Point, rect: Rect) =>
  point.x >= rect.minX && point.x <= rect.maxX && point.y >= rect.minY && point.y <= rect.maxY

const rectCorners = (rect: Rect): Point[] => [
  { x: rect.minX, y: rect.minY },
  { x: rect.maxX, y: rect.minY },
  { x: rect.maxX, y: rect.maxY },
  { x: rect.minX, y: rect.maxY },
]

/** ¿Se cruzan los segmentos ab y cd? (orientaciones opuestas en ambos sentidos) */
const segmentsIntersect = (a: Point, b: Point, c: Point, d: Point) => {
  const orientation = (p: Point, q: Point, r: Point) =>
    Math.sign((q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y))

  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)

  return o1 !== o2 && o3 !== o4
}

/** Un segmento toca el rectángulo si empieza dentro o cruza alguno de sus lados. */
export const segmentIntersectsRect = (a: Point, b: Point, rect: Rect) => {
  if (pointInRect(a, rect) || pointInRect(b, rect)) return true
  const corners = rectCorners(rect)
  return corners.some((corner, index) =>
    segmentsIntersect(a, b, corner, corners[(index + 1) % corners.length]),
  )
}

/** Punto dentro de un polígono, por lanzamiento de rayo horizontal. */
export const pointInPolygon = (point: Point, polygon: Point[]) => {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    const crosses = a.y > point.y !== b.y > point.y
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Un polígono toca el rectángulo si comparten área o se cruzan sus bordes.
 * Basta con rozarlo: es lo que hace cualquier editor al arrastrar la marquesina.
 */
export const polygonIntersectsRect = (polygon: Point[], rect: Rect) => {
  if (!polygon.length) return false
  if (polygon.some((point) => pointInRect(point, rect))) return true
  if (rectCorners(rect).some((corner) => pointInPolygon(corner, polygon))) return true
  return polygon.some((point, index) =>
    segmentIntersectsRect(point, polygon[(index + 1) % polygon.length], rect),
  )
}
