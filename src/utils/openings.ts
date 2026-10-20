import type { Opening, OpeningKind, Point, Wall } from '../types/floorplan'

export type OpeningBlueprint = {
  kind: OpeningKind
  icon: string
  color: string
  widthM: number
}

export const openingBlueprints: Record<OpeningKind, OpeningBlueprint> = {
  door: { kind: 'door', icon: '◜', color: '#b45309', widthM: 0.9 },
  window: { kind: 'window', icon: '▯', color: '#0284c7', widthM: 1.2 },
}

export const openingKinds: OpeningKind[] = ['door', 'window']

/** Tipo MIME propio para arrastrar puertas/ventanas desde el catálogo. */
export const OPENING_DRAG_TYPE = 'application/x-floorplan-opening'

export const isOpeningKind = (value: string): value is OpeningKind =>
  (openingKinds as string[]).includes(value)

export const MIN_OPENING_WIDTH_M = 0.3
/** Paso al que se ajusta la posición a lo largo del muro (m). */
const OFFSET_STEP_M = 0.05
/** Distancia máxima del puntero a un muro para colocar sobre él (m). */
const WALL_PICK_M = 0.6

const wallLength = (wall: Wall) => Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)

/** Mantiene la abertura completa dentro del muro. */
export const clampOffset = (offsetM: number, widthM: number, lengthM: number) =>
  Math.min(Math.max(offsetM, widthM / 2), Math.max(widthM / 2, lengthM - widthM / 2))

/**
 * Muro más cercano al puntero y posición sobre él, para colocar o arrastrar
 * una abertura. Devuelve null si no hay un muro cerca o es más corto que la abertura.
 */
export function locateOnWall(
  pointer: Point,
  walls: Wall[],
  widthM: number,
): { wallId: string; offsetM: number } | null {
  let best: { wallId: string; offsetM: number; d: number } | null = null
  for (const wall of walls) {
    const length = wallLength(wall)
    if (length < widthM + 0.05) continue
    const ux = (wall.end.x - wall.start.x) / length
    const uy = (wall.end.y - wall.start.y) / length
    const along = (pointer.x - wall.start.x) * ux + (pointer.y - wall.start.y) * uy
    if (along < -WALL_PICK_M || along > length + WALL_PICK_M) continue
    const d = Math.abs((pointer.x - wall.start.x) * uy - (pointer.y - wall.start.y) * ux)
    if (d > Math.max(WALL_PICK_M, wall.thicknessM)) continue
    if (!best || d < best.d) {
      const snapped = Math.round(along / OFFSET_STEP_M) * OFFSET_STEP_M
      best = { wallId: wall.id, offsetM: clampOffset(snapped, widthM, length), d }
    }
  }
  return best && { wallId: best.wallId, offsetM: best.offsetM }
}

export type OpeningGeometry = {
  /** Extremos de la abertura sobre el eje del muro. */
  a: Point
  b: Point
  /** Dirección del muro (unitaria) y su normal. */
  ux: number
  uy: number
  nx: number
  ny: number
  thicknessM: number
}

/** Posición real de una abertura a partir de su muro. */
export function openingGeometry(
  opening: Pick<Opening, 'offsetM' | 'widthM'>,
  wall: Wall,
): OpeningGeometry | null {
  const length = wallLength(wall)
  if (length < 0.01) return null
  const ux = (wall.end.x - wall.start.x) / length
  const uy = (wall.end.y - wall.start.y) / length
  const width = Math.min(opening.widthM, length)
  const center = clampOffset(opening.offsetM, width, length)
  const half = width / 2
  return {
    a: { x: wall.start.x + ux * (center - half), y: wall.start.y + uy * (center - half) },
    b: { x: wall.start.x + ux * (center + half), y: wall.start.y + uy * (center + half) },
    ux,
    uy,
    nx: -uy,
    ny: ux,
    thicknessM: wall.thicknessM,
  }
}

/**
 * Al mover un extremo del muro, las aberturas conservan su posición REAL:
 * se proyecta su centro antiguo sobre el muro nuevo.
 */
export function reanchorOffset(opening: Opening, before: Wall, after: Wall): number {
  const oldLength = wallLength(before)
  const newLength = wallLength(after)
  if (oldLength < 0.01 || newLength < 0.01) return opening.offsetM
  const center = {
    x: before.start.x + ((before.end.x - before.start.x) / oldLength) * opening.offsetM,
    y: before.start.y + ((before.end.y - before.start.y) / oldLength) * opening.offsetM,
  }
  const ux = (after.end.x - after.start.x) / newLength
  const uy = (after.end.y - after.start.y) / newLength
  const along = (center.x - after.start.x) * ux + (center.y - after.start.y) * uy
  return Math.round(clampOffset(along, Math.min(opening.widthM, newLength), newLength) * 1000) / 1000
}
