import type { Point } from '../types/floorplan'

/**
 * Detección de muros sobre una imagen de plano 2D, sin dependencias externas.
 *
 * Idea: en un plano típico los muros son trazos NEGROS y GRUESOS, mientras que
 * texto, muebles, cotas y arcos de puerta son trazos finos. Una "apertura"
 * morfológica (erosionar y luego dilatar) borra lo fino y deja los muros.
 *
 * La escala NO se adivina de la imagen: la indica el usuario (área o medidas).
 * Todo trabaja sobre una imagen en escala de grises ya normalizada de tamaño
 * (ver `MAX_SIDE_PX` en el diálogo), para que los umbrales en píxeles sean estables.
 */

export type GrayImage = {
  width: number
  height: number
  /** Un byte por píxel, 0 = negro, 255 = blanco. */
  data: Uint8Array
}

export type ScaleInput = {
  /** Área del local en m². */
  areaM2?: number
  /** true = el área indicada es útil (no incluye muros). */
  areaIsUsable?: boolean
  /** Ancho total en metros (eje horizontal de la imagen). */
  widthM?: number
  /** Largo total en metros (eje vertical de la imagen). */
  lengthM?: number
}

export type DetectionOptions = {
  /** Por debajo de este valor (gris) un píxel cuenta como "negro de muro". */
  wallThreshold?: number
  /** Por debajo de este valor un píxel cuenta como "dibujo" (para la huella). */
  inkThreshold?: number
  /** Grosor mínimo de muro en píxeles; lo más fino se considera texto/mobiliario. */
  minWallPx?: number
  /** Largo mínimo de un tramo de muro en píxeles. */
  minSegmentPx?: number
}

export type DetectionWarning =
  | { code: 'aspectMismatch'; percent: number }
  | { code: 'scaleMismatch'; percent: number }
  | { code: 'footprintFillsImage' }
  | { code: 'fewWalls' }

export type PixelSegment = { x1: number; y1: number; x2: number; y2: number; thickness: number }

export type DetectedWall = { start: Point; end: Point; thicknessM: number }

export type DetectionResult = {
  imageWidthPx: number
  imageHeightPx: number
  metersPerPixel: number
  /** Huella del local (máscara 0/1 del tamaño de la imagen) para la vista previa. */
  footprintMask: Uint8Array
  footprintBox: { x: number; y: number; width: number; height: number }
  footprintWidthM: number
  footprintHeightM: number
  footprintAreaM2: number
  segmentsPx: PixelSegment[]
  /** Muros en metros, con origen en la esquina superior izquierda de la imagen. */
  walls: DetectedWall[]
  warnings: DetectionWarning[]
}

export class WallDetectionError extends Error {
  constructor(public code: 'noFootprint' | 'noScale') {
    super(code)
  }
}

const DEFAULTS: Required<DetectionOptions> = {
  wallThreshold: 80,
  inkThreshold: 200,
  minWallPx: 7,
  minSegmentPx: 25,
}

const MISMATCH_TOLERANCE = 0.05

export function detectWalls(
  image: GrayImage,
  scale: ScaleInput,
  options: DetectionOptions = {},
): DetectionResult {
  const opts = { ...DEFAULTS, ...options }
  const { width: w, height: h, data } = image
  const hasArea = !!scale.areaM2 && scale.areaM2 > 0
  const hasDims = !!scale.widthM && scale.widthM > 0 && !!scale.lengthM && scale.lengthM > 0
  if (!hasArea && !hasDims) throw new WallDetectionError('noScale')

  // 1. Muros: negro + grueso
  const black = threshold(data, opts.wallThreshold)
  const half = Math.floor(opts.minWallPx / 2)
  const walls = open(black, w, h, half, half)

  // 2. Huella: todo el dibujo, con huecos pequeños cerrados y el interior relleno
  const ink = close(threshold(data, opts.inkThreshold), w, h, 2, 2)
  const filled = fillHoles(ink, w, h)
  const footprint = largestComponent(filled, w, h)
  if (!footprint) throw new WallDetectionError('noFootprint')
  const { mask: footprintMask, box, area: footprintPx } = footprint
  if (footprintPx < w * h * 0.01) throw new WallDetectionError('noFootprint')

  // 3. Escala a partir de lo que indicó el usuario
  const warnings: DetectionWarning[] = []
  const estimates: number[] = []
  if (hasArea) {
    let px = footprintPx
    if (scale.areaIsUsable) {
      for (let i = 0; i < footprintMask.length; i++) if (footprintMask[i] && walls[i]) px--
    }
    estimates.push(Math.sqrt(scale.areaM2! / Math.max(px, 1)))
  }
  if (hasDims) {
    const sx = scale.widthM! / box.width
    const sy = scale.lengthM! / box.height
    const mean = (sx + sy) / 2
    const diff = Math.abs(sx - sy) / mean
    if (diff > MISMATCH_TOLERANCE) warnings.push({ code: 'aspectMismatch', percent: Math.round(diff * 100) })
    estimates.push(mean)
  }
  if (estimates.length === 2) {
    const mean = (estimates[0] + estimates[1]) / 2
    const diff = Math.abs(estimates[0] - estimates[1]) / mean
    if (diff > MISMATCH_TOLERANCE) warnings.push({ code: 'scaleMismatch', percent: Math.round(diff * 100) })
  }
  const mpp = estimates.reduce((sum, value) => sum + value, 0) / estimates.length

  if (box.width * box.height > w * h * 0.95) warnings.push({ code: 'footprintFillsImage' })

  // 4. Tramos de muro horizontales y verticales
  const segRadius = Math.floor(opts.minSegmentPx / 2)
  const raw: AxisSegment[] = []
  const horizontal = open(walls, w, h, segRadius, 0)
  for (const c of components(horizontal, w, h)) {
    const cw = c.maxX - c.minX + 1
    const ch = c.maxY - c.minY + 1
    if (cw > ch) raw.push({ dir: 'h', c: c.minY + ch / 2, a: c.minX, b: c.maxX + 1, t: ch })
  }
  const vertical = open(walls, w, h, 0, segRadius)
  for (const c of components(vertical, w, h)) {
    const cw = c.maxX - c.minX + 1
    const ch = c.maxY - c.minY + 1
    if (ch > cw) raw.push({ dir: 'v', c: c.minX + cw / 2, a: c.minY, b: c.maxY + 1, t: cw })
  }

  // 5. Limpieza para que el editor los trate como muros dibujados a mano
  const inkRaw = threshold(data, opts.inkThreshold)
  const refined = refineSegments(raw, inkRaw, w, mpp)
  const segmentsPx: PixelSegment[] = refined.map((s) =>
    s.dir === 'h'
      ? { x1: s.a, y1: s.c, x2: s.b, y2: s.c, thickness: s.t }
      : { x1: s.c, y1: s.a, x2: s.c, y2: s.b, thickness: s.t },
  )
  if (segmentsPx.length < 4) warnings.push({ code: 'fewWalls' })

  const round = (value: number) => Math.round(value * 1000) / 1000
  const wallsM: DetectedWall[] = segmentsPx.map((s) => ({
    start: { x: round(s.x1 * mpp), y: round(s.y1 * mpp) },
    end: { x: round(s.x2 * mpp), y: round(s.y2 * mpp) },
    thicknessM: Math.max(0.05, round(s.thickness * mpp)),
  }))

  return {
    imageWidthPx: w,
    imageHeightPx: h,
    metersPerPixel: mpp,
    footprintMask,
    footprintBox: box,
    footprintWidthM: box.width * mpp,
    footprintHeightM: box.height * mpp,
    footprintAreaM2: footprintPx * mpp * mpp,
    segmentsPx,
    walls: wallsM,
    warnings,
  }
}

// ---------------------------------------------------------------- limpieza de tramos

/** Tramo alineado a un eje: `c` = coordenada del eje central, [a, b] = extensión a lo largo. */
type AxisSegment = { dir: 'h' | 'v'; c: number; a: number; b: number; t: number }

/** Huecos más largos que esto nunca se consideran ventana (m). */
const MAX_WINDOW_M = 3
/** Fracción del hueco que debe tener trazos dentro de la banda del muro para ser ventana. */
const WINDOW_INK_RATIO = 0.85
/** Tramos más cortos que esto (m) se descartan como ruido. */
const MIN_WALL_M = 0.15

/**
 * Convierte los tramos crudos en muros "como los dibujaría una persona":
 *  1. Une tramos alineados separados por una VENTANA (el hueco tiene las líneas
 *     finas de la ventana dentro del grosor del muro). Las PUERTAS quedan abiertas.
 *  2. Lleva cada extremo al EJE del muro perpendicular que toca: así las esquinas
 *     comparten exactamente el mismo punto y no sobresalen.
 *  3. Los extremos libres (jambas de puerta) se recortan medio grosor, porque el
 *     editor dibuja los muros con punta redondeada que añade ese medio grosor.
 *  4. Descarta restos más cortos que su propio grosor (ruido de las uniones).
 *
 * Los muros NO se parten en las uniones en "T": así hay menos tramos y menos
 * cotas, y cada cota mide el muro completo.
 */
function refineSegments(segments: AxisSegment[], ink: Uint8Array, w: number, mpp: number): AxisSegment[] {
  const tol = 3
  const at = (dir: 'h' | 'v', along: number, across: number) =>
    dir === 'h' ? ink[Math.round(across) * w + Math.round(along)] : ink[Math.round(along) * w + Math.round(across)]

  // 1. Unir tramos alineados separados por ventanas (o por huecos de 1–2 px)
  const merged: AxisSegment[] = []
  for (const dir of ['h', 'v'] as const) {
    const list = segments.filter((s) => s.dir === dir).sort((p, q) => p.c - q.c || p.a - q.a)
    const used = new Set<AxisSegment>()
    for (const seg of list) {
      if (used.has(seg)) continue
      used.add(seg)
      const current = { ...seg }
      let extended = true
      while (extended) {
        extended = false
        for (const other of list) {
          if (used.has(other)) continue
          if (Math.abs(other.c - current.c) > Math.max(current.t, other.t) / 2) continue
          const gapStart = Math.min(current.b, other.b)
          const gapEnd = Math.max(current.a, other.a)
          const gap = gapEnd - gapStart
          if (gap > MAX_WINDOW_M / mpp) continue
          if (gap > tol) {
            // ¿Es una ventana? Casi todas las posiciones del hueco tienen trazo dentro de la banda.
            const half = Math.min(current.t, other.t) / 2
            let withInk = 0
            for (let p = Math.ceil(gapStart); p < gapEnd; p++) {
              for (let q = Math.ceil(current.c - half); q <= current.c + half; q++) {
                if (at(dir, p, q)) {
                  withInk++
                  break
                }
              }
            }
            if (withInk / gap < WINDOW_INK_RATIO) continue
          }
          const total = current.b - current.a + (other.b - other.a)
          current.c = (current.c * (current.b - current.a) + other.c * (other.b - other.a)) / total
          current.t = Math.max(current.t, other.t)
          current.a = Math.min(current.a, other.a)
          current.b = Math.max(current.b, other.b)
          used.add(other)
          extended = true
        }
      }
      merged.push(current)
    }
  }

  // 2 y 3. Extremos al eje del muro perpendicular, o recorte de medio grosor si quedan libres
  const result: AxisSegment[] = []
  for (const seg of merged) {
    const out = { ...seg }
    for (const end of ['a', 'b'] as const) {
      const pos = seg[end]
      const hit = merged.find(
        (other) =>
          other.dir !== seg.dir &&
          seg.c >= other.a - tol &&
          seg.c <= other.b + tol &&
          Math.abs(pos - other.c) <= other.t / 2 + tol,
      )
      if (hit) out[end] = hit.c
      else out[end] = end === 'a' ? pos + seg.t / 2 : pos - seg.t / 2
    }
    // 4. Restos demasiado cortos
    if ((out.b - out.a) * mpp >= Math.max(MIN_WALL_M, out.t * mpp)) result.push(out)
  }
  return result
}

// ---------------------------------------------------------------- morfología

const threshold = (data: Uint8Array, limit: number) => {
  const out = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) out[i] = data[i] < limit ? 1 : 0
  return out
}

/**
 * Erosión o dilatación binaria con un rectángulo de (2rx+1) × (2ry+1),
 * separable en una pasada horizontal y otra vertical con sumas acumuladas: O(n).
 */
function rectFilter(src: Uint8Array, w: number, h: number, rx: number, ry: number, erode: boolean) {
  let current = src
  if (rx > 0) {
    const out = new Uint8Array(src.length)
    const prefix = new Int32Array(w + 1)
    const full = 2 * rx + 1
    for (let y = 0; y < h; y++) {
      const row = y * w
      for (let x = 0; x < w; x++) prefix[x + 1] = prefix[x] + current[row + x]
      for (let x = 0; x < w; x++) {
        const sum = prefix[Math.min(w, x + rx + 1)] - prefix[Math.max(0, x - rx)]
        out[row + x] = erode ? (sum === full ? 1 : 0) : sum > 0 ? 1 : 0
      }
    }
    current = out
  }
  if (ry > 0) {
    const out = new Uint8Array(src.length)
    const prefix = new Int32Array(h + 1)
    const full = 2 * ry + 1
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) prefix[y + 1] = prefix[y] + current[y * w + x]
      for (let y = 0; y < h; y++) {
        const sum = prefix[Math.min(h, y + ry + 1)] - prefix[Math.max(0, y - ry)]
        out[y * w + x] = erode ? (sum === full ? 1 : 0) : sum > 0 ? 1 : 0
      }
    }
    current = out
  }
  return current === src ? src.slice() : current
}

/** Apertura: borra lo que no cabe en el rectángulo (trazos finos). */
const open = (src: Uint8Array, w: number, h: number, rx: number, ry: number) =>
  rectFilter(rectFilter(src, w, h, rx, ry, true), w, h, rx, ry, false)

/** Cierre: tapa huecos pequeños. */
const close = (src: Uint8Array, w: number, h: number, rx: number, ry: number) =>
  rectFilter(rectFilter(src, w, h, rx, ry, false), w, h, rx, ry, true)

/** Rellena todo lo que no se alcanza desde el borde de la imagen. */
function fillHoles(src: Uint8Array, w: number, h: number) {
  const outside = new Uint8Array(src.length)
  const stack = new Int32Array(src.length)
  let top = 0
  const push = (i: number) => {
    if (!src[i] && !outside[i]) {
      outside[i] = 1
      stack[top++] = i
    }
  }
  for (let x = 0; x < w; x++) {
    push(x)
    push((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    push(y * w)
    push(y * w + w - 1)
  }
  while (top > 0) {
    const i = stack[--top]
    const x = i % w
    if (x > 0) push(i - 1)
    if (x < w - 1) push(i + 1)
    if (i >= w) push(i - w)
    if (i < w * (h - 1)) push(i + w)
  }
  const out = new Uint8Array(src.length)
  for (let i = 0; i < src.length; i++) out[i] = outside[i] ? 0 : 1
  return out
}

type Component = { minX: number; minY: number; maxX: number; maxY: number; area: number; label: number }

/** Componentes conexos (8 vecinos). Devuelve las cajas; `labels` queda con su número. */
function components(src: Uint8Array, w: number, h: number, labels?: Int32Array): Component[] {
  const lab = labels ?? new Int32Array(src.length)
  const stack = new Int32Array(src.length)
  const result: Component[] = []
  let next = 0
  for (let start = 0; start < src.length; start++) {
    if (!src[start] || lab[start]) continue
    next++
    const c: Component = { minX: w, minY: h, maxX: 0, maxY: 0, area: 0, label: next }
    let top = 0
    stack[top++] = start
    lab[start] = next
    while (top > 0) {
      const i = stack[--top]
      const x = i % w
      const y = (i - x) / w
      c.area++
      if (x < c.minX) c.minX = x
      if (x > c.maxX) c.maxX = x
      if (y < c.minY) c.minY = y
      if (y > c.maxY) c.maxY = y
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= w) continue
          const j = ny * w + nx
          if (src[j] && !lab[j]) {
            lab[j] = next
            stack[top++] = j
          }
        }
      }
    }
    result.push(c)
  }
  return result
}

function largestComponent(src: Uint8Array, w: number, h: number) {
  const labels = new Int32Array(src.length)
  const all = components(src, w, h, labels)
  if (!all.length) return null
  const best = all.reduce((a, b) => (b.area > a.area ? b : a))
  const mask = new Uint8Array(src.length)
  for (let i = 0; i < labels.length; i++) if (labels[i] === best.label) mask[i] = 1
  return {
    mask,
    area: best.area,
    box: { x: best.minX, y: best.minY, width: best.maxX - best.minX + 1, height: best.maxY - best.minY + 1 },
  }
}
