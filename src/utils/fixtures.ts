import type { Fixture, FixtureKind, Point } from '../types/floorplan'

/**
 * Plantilla de cada tipo de objeto: medidas por defecto en metros, color y
 * semántica para la simulación. Añadir un objeto nuevo = añadir una entrada aquí
 * (y su texto en i18n). Nada más hay que tocar.
 */
export type FixtureBlueprint = {
  kind: FixtureKind
  icon: string
  color: string
  widthM: number
  lengthM: number
  blocksMovement: boolean
  blocksVision: boolean
  attractiveness: number
}

export const fixtureBlueprints: Record<FixtureKind, FixtureBlueprint> = {
  shelf: {
    kind: 'shelf',
    icon: '▤',
    color: '#6366f1',
    widthM: 1.2,
    lengthM: 0.5,
    blocksMovement: true,
    blocksVision: false,
    attractiveness: 0.6,
  },
  rack: {
    kind: 'rack',
    icon: '☰',
    color: '#0ea5e9',
    widthM: 1.4,
    lengthM: 0.6,
    blocksMovement: true,
    blocksVision: false,
    attractiveness: 0.65,
  },
  mannequin: {
    kind: 'mannequin',
    icon: '♟',
    color: '#a855f7',
    widthM: 0.5,
    lengthM: 0.5,
    blocksMovement: true,
    blocksVision: false,
    attractiveness: 0.85,
  },
  table: {
    kind: 'table',
    icon: '▭',
    color: '#14b8a6',
    widthM: 1.2,
    lengthM: 0.8,
    blocksMovement: true,
    blocksVision: false,
    attractiveness: 0.55,
  },
  counter: {
    kind: 'counter',
    icon: '▥',
    color: '#f59e0b',
    widthM: 2,
    lengthM: 0.7,
    blocksMovement: true,
    blocksVision: true,
    attractiveness: 0.9,
  },
  fittingBooth: {
    kind: 'fittingBooth',
    icon: '◫',
    color: '#ec4899',
    widthM: 1.2,
    lengthM: 1.2,
    blocksMovement: true,
    blocksVision: true,
    attractiveness: 0.75,
  },
}

export const fixtureKinds: FixtureKind[] = [
  'shelf',
  'rack',
  'mannequin',
  'table',
  'counter',
  'fittingBooth',
]

/** Tipo MIME propio para el arrastre HTML5: evita aceptar cualquier texto soltado. */
export const FIXTURE_DRAG_TYPE = 'application/x-floorplan-fixture'

export const isFixtureKind = (value: string): value is FixtureKind =>
  (fixtureKinds as string[]).includes(value)

export const createFixture = (
  kind: FixtureKind,
  position: Point,
  labelIndex: number,
): Fixture => {
  const blueprint = fixtureBlueprints[kind]
  return {
    id: crypto.randomUUID(),
    kind,
    // Sin nombre propio: la etiqueta se compone y se traduce al dibujar.
    name: '',
    labelIndex,
    position,
    widthM: blueprint.widthM,
    lengthM: blueprint.lengthM,
    rotationDeg: 0,
    blocksMovement: blueprint.blocksMovement,
    blocksVision: blueprint.blocksVision,
    attractiveness: blueprint.attractiveness,
  }
}

/**
 * Las cuatro esquinas del objeto ya rotadas, en metros.
 * Todavía no se usa en el editor: es lo que necesitará el motor de simulación
 * para marcar celdas ocupadas en la rejilla de navegación.
 */
export const fixtureCorners = (fixture: Fixture): Point[] => {
  const radians = (fixture.rotationDeg * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const halfWidth = fixture.widthM / 2
  const halfDepth = fixture.lengthM / 2

  return [
    { x: -halfWidth, y: -halfDepth },
    { x: halfWidth, y: -halfDepth },
    { x: halfWidth, y: halfDepth },
    { x: -halfWidth, y: halfDepth },
  ].map((corner) => ({
    x: fixture.position.x + corner.x * cos - corner.y * sin,
    y: fixture.position.y + corner.x * sin + corner.y * cos,
  }))
}
