import type { Point, Wall } from '../types/floorplan'
import { snapPoint } from './geometry'

/** Paso al que se redondea el largo cuando se arrastra en la misma dirección (m). */
export const LENGTH_STEP_M = 0.05
/** Distancia a la que el extremo "se engancha" a otro muro (m), igual que al dibujar. */
export const ENDPOINT_SNAP_M = 0.28
/** Largo mínimo que puede quedar al acortar (m). */
export const MIN_EDIT_LENGTH_M = 0.1

const round3 = (value: number) => Math.round(value * 1000) / 1000

/**
 * Nueva posición de un extremo del muro mientras se arrastra.
 *
 * - Por defecto conserva la DIRECCIÓN del muro: el extremo solo se desliza a lo
 *   largo de su propia recta, así alargar o acortar no lo tuerce. El largo se
 *   redondea a 5 cm, salvo que se enganche a otro muro: entonces llega justo
 *   hasta él (a su eje si lo cruza, o a la proyección de un extremo cercano).
 * - Con `free` (Shift) el extremo se mueve libremente con el mismo ajuste a
 *   rejilla y a extremos que la herramienta Muro, para poder cambiar el ángulo.
 */
export function dragWallEndpoint(
  pointer: Point,
  wall: Wall,
  end: 'start' | 'end',
  walls: Wall[],
  gridSizeM: number,
  free: boolean,
): Point {
  const fixed = end === 'start' ? wall.end : wall.start
  const others = walls.filter((candidate) => candidate.id !== wall.id)

  if (free) {
    const point = snapPoint(pointer, gridSizeM, others)
    return Math.hypot(point.x - fixed.x, point.y - fixed.y) < MIN_EDIT_LENGTH_M ? wall[end] : point
  }

  const moving = wall[end]
  const length = Math.hypot(moving.x - fixed.x, moving.y - fixed.y)
  if (length === 0) return moving
  const ux = (moving.x - fixed.x) / length
  const uy = (moving.y - fixed.y) / length
  const along = (p: Point) => (p.x - fixed.x) * ux + (p.y - fixed.y) * uy
  const at = (t: number): Point => ({ x: fixed.x + ux * t, y: fixed.y + uy * t })

  // Candidatos de enganche sobre la recta del muro: cruces con otros muros y
  // proyecciones de sus extremos. Gana el más cercano al puntero.
  let best: { t: number; d: number } | null = null
  const consider = (t: number) => {
    if (t < MIN_EDIT_LENGTH_M) return
    const p = at(t)
    const d = Math.hypot(p.x - pointer.x, p.y - pointer.y)
    if (d <= ENDPOINT_SNAP_M && (!best || d < best.d)) best = { t, d }
  }
  for (const other of others) {
    const cross = intersectLineWithSegment(fixed, ux, uy, other.start, other.end)
    if (cross !== null) consider(cross)
    for (const p of [other.start, other.end]) {
      // Solo extremos que caen (casi) sobre la recta: si no, el muro se desviaría.
      const t = along(p)
      const offLine = Math.abs((p.x - fixed.x) * uy - (p.y - fixed.y) * ux)
      if (offLine <= other.thicknessM) consider(t)
    }
  }

  const snapped = best as { t: number; d: number } | null
  const t = snapped
    ? snapped.t
    : Math.max(MIN_EDIT_LENGTH_M, Math.round(along(pointer) / LENGTH_STEP_M) * LENGTH_STEP_M)
  const p = at(t)
  return { x: round3(p.x), y: round3(p.y) }
}

/** Parámetro t donde la recta fixed + t·u cruza el segmento [a, b], o null si no lo cruza. */
function intersectLineWithSegment(fixed: Point, ux: number, uy: number, a: Point, b: Point): number | null {
  const sx = b.x - a.x
  const sy = b.y - a.y
  const denom = ux * sy - uy * sx
  if (Math.abs(denom) < 1e-9) return null // paralelos
  const qx = a.x - fixed.x
  const qy = a.y - fixed.y
  const t = (qx * sy - qy * sx) / denom
  const s = (qx * uy - qy * ux) / denom
  return s >= -1e-6 && s <= 1 + 1e-6 ? t : null
}
