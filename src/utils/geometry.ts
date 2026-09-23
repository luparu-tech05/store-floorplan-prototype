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
