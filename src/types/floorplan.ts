export type Point = {
  x: number
  y: number
}

export type Tool = 'select' | 'pan' | 'wall' | 'area'

export type AreaCategory =
  | 'entrance'
  | 'checkout'
  | 'apparel'
  | 'footwear'
  | 'fittingRoom'
  | 'circulation'
  | 'storage'
  | 'other'

export type Wall = {
  id: string
  start: Point
  end: Point
  thicknessM: number
}

export type Area = {
  id: string
  /** Nombre escrito por el usuario. Vacío = se muestra el nombre automático. */
  name: string
  /** Número correlativo del nombre automático ("Área 3"), sin idioma. */
  labelIndex: number
  category: AreaCategory
  points: Point[]
  walkable: boolean
  attractiveness: number
  heatValue: number
}

export type FixtureKind =
  | 'shelf'
  | 'rack'
  | 'mannequin'
  | 'table'
  | 'counter'
  | 'fittingBooth'

/**
 * Objeto colocado dentro de la tienda (estantería, maniquí, mostrador...).
 * `position` es el CENTRO del objeto en metros, no su esquina: así rotarlo
 * no lo desplaza y el agente puede usarlo directamente como punto destino.
 */
export type Fixture = {
  id: string
  kind: FixtureKind
  /**
   * Nombre escrito por el usuario. Vacío = se muestra el nombre automático,
   * que se traduce al dibujar. El documento NUNCA guarda texto traducido:
   * si lo guardara, un plano hecho en inglés seguiría en inglés al cambiar
   * la interfaz a español.
   */
  name: string
  /** Número correlativo del nombre automático ("Maniquí 2"), sin idioma. */
  labelIndex: number
  position: Point
  /** Medida horizontal del objeto sin rotar, en metros. */
  widthM: number
  /**
   * Medida vertical del objeto sin rotar, en metros.
   * En un plano visto desde arriba las dos dimensiones son ancho y largo:
   * "fondo" o "alto" serían vocabulario de mueble en 3D, no de planta.
   */
  lengthM: number
  /** Giro en grados. Al rotar 90° el ancho pasa a verse en vertical. */
  rotationDeg: number
  /** Bloquea el paso del agente. Un expositor bajo puede no bloquearlo. */
  blocksMovement: boolean
  /** Bloquea la línea de visión. Un mostrador alto sí, una mesa no. */
  blocksVision: boolean
  /** 0..1 — cuánto atrae al agente como destino. */
  attractiveness: number
}

export type BackgroundPlan = {
  id: string
  fileName: string
  mimeType: string
  dataUrl: string
  opacity: number
}

export type FloorPlanDocument = {
  schemaVersion: 1
  id: string
  name: string
  units: 'm'
  widthM: number
  heightM: number
  gridSizeM: number
  createdAt: string
  updatedAt: string
  walls: Wall[]
  areas: Area[]
  fixtures: Fixture[]
  background?: BackgroundPlan
}

/** Referencia a un elemento seleccionado del plano. */
export type SelectionRef =
  | { type: 'area'; id: string }
  | { type: 'wall'; id: string }
  | { type: 'fixture'; id: string }

/** La selección es múltiple: lista vacía = nada seleccionado. */
export type Selection = SelectionRef[]
