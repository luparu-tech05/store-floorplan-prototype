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
  name: string
  category: AreaCategory
  points: Point[]
  walkable: boolean
  attractiveness: number
  heatValue: number
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
  background?: BackgroundPlan
}

export type Selection =
  | { type: 'area'; id: string }
  | { type: 'wall'; id: string }
  | null
