import { produce } from 'immer'
import { create } from 'zustand'
import type {
  Area,
  AreaCategory,
  BackgroundPlan,
  FloorPlanDocument,
  Point,
  Selection,
  Tool,
  Wall,
} from '../types/floorplan'

const HISTORY_LIMIT = 60

export const createBlankDocument = (): FloorPlanDocument => {
  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name: 'Store layout',
    units: 'm',
    widthM: 30,
    heightM: 20,
    gridSizeM: 0.5,
    createdAt: now,
    updatedAt: now,
    walls: [],
    areas: [],
  }
}

type PlanPatch = Partial<Pick<FloorPlanDocument, 'name' | 'widthM' | 'heightM' | 'gridSizeM'>>
type AreaPatch = Partial<Pick<Area, 'name' | 'category' | 'walkable' | 'attractiveness' | 'heatValue'>>
type WallPatch = Partial<Pick<Wall, 'thicknessM'>>

type FloorPlanState = {
  document: FloorPlanDocument
  past: FloorPlanDocument[]
  future: FloorPlanDocument[]
  selection: Selection
  tool: Tool
  heatPreview: boolean
  zoom: number
  panX: number
  panY: number
  newDocument: () => void
  loadDocument: (document: FloorPlanDocument) => void
  updatePlan: (patch: PlanPatch) => void
  addWall: (start: Point, end: Point) => void
  addArea: (points: Point[]) => void
  updateArea: (id: string, patch: AreaPatch) => void
  updateWall: (id: string, patch: WallPatch) => void
  setBackground: (background: BackgroundPlan) => void
  updateBackgroundOpacity: (opacity: number) => void
  removeBackground: () => void
  setSelection: (selection: Selection) => void
  deleteSelection: () => void
  setTool: (tool: Tool) => void
  setHeatPreview: (enabled: boolean) => void
  setViewport: (viewport: Partial<Pick<FloorPlanState, 'zoom' | 'panX' | 'panY'>>) => void
  resetViewport: () => void
  undo: () => void
  redo: () => void
}

const commit = (
  state: FloorPlanState,
  recipe: (draft: FloorPlanDocument) => void,
): Partial<FloorPlanState> => {
  const next = produce(state.document, (draft) => {
    recipe(draft)
    draft.updatedAt = new Date().toISOString()
  })

  if (next === state.document) return {}

  return {
    document: next,
    past: [...state.past.slice(-(HISTORY_LIMIT - 1)), state.document],
    future: [],
  }
}

export const useFloorPlanStore = create<FloorPlanState>((set) => ({
  document: createBlankDocument(),
  past: [],
  future: [],
  selection: null,
  tool: 'select',
  heatPreview: false,
  zoom: 1,
  panX: 0,
  panY: 0,

  newDocument: () =>
    set({
      document: createBlankDocument(),
      past: [],
      future: [],
      selection: null,
      tool: 'select',
      heatPreview: false,
      zoom: 1,
      panX: 0,
      panY: 0,
    }),

  loadDocument: (document) =>
    set({
      document: structuredClone(document),
      past: [],
      future: [],
      selection: null,
      tool: 'select',
      zoom: 1,
      panX: 0,
      panY: 0,
    }),

  updatePlan: (patch) => set((state) => commit(state, (draft) => Object.assign(draft, patch))),

  addWall: (start, end) =>
    set((state) =>
      commit(state, (draft) => {
        draft.walls.push({
          id: crypto.randomUUID(),
          start,
          end,
          thicknessM: 0.15,
        })
      }),
    ),

  addArea: (points) =>
    set((state) => {
      const id = crypto.randomUUID()
      const nextState = commit(state, (draft) => {
        draft.areas.push({
          id,
          name: `Area ${draft.areas.length + 1}`,
          category: 'other' satisfies AreaCategory,
          points,
          walkable: true,
          attractiveness: 0.5,
          heatValue: 35,
        })
      })
      return { ...nextState, selection: { type: 'area', id }, tool: 'select' }
    }),

  updateArea: (id, patch) =>
    set((state) =>
      commit(state, (draft) => {
        const area = draft.areas.find((candidate) => candidate.id === id)
        if (area) Object.assign(area, patch)
      }),
    ),

  updateWall: (id, patch) =>
    set((state) =>
      commit(state, (draft) => {
        const wall = draft.walls.find((candidate) => candidate.id === id)
        if (wall) Object.assign(wall, patch)
      }),
    ),

  setBackground: (background) =>
    set((state) =>
      commit(state, (draft) => {
        draft.background = background
      }),
    ),

  updateBackgroundOpacity: (opacity) =>
    set((state) =>
      commit(state, (draft) => {
        if (draft.background) draft.background.opacity = opacity
      }),
    ),

  removeBackground: () =>
    set((state) =>
      commit(state, (draft) => {
        delete draft.background
      }),
    ),

  setSelection: (selection) => set({ selection }),

  deleteSelection: () =>
    set((state) => {
      if (!state.selection) return {}
      const next = commit(state, (draft) => {
        if (state.selection?.type === 'area') {
          draft.areas = draft.areas.filter((area) => area.id !== state.selection?.id)
        } else if (state.selection?.type === 'wall') {
          draft.walls = draft.walls.filter((wall) => wall.id !== state.selection?.id)
        }
      })
      return { ...next, selection: null }
    }),

  setTool: (tool) => set((state) => ({ tool, selection: tool === 'select' ? state.selection : null })),
  setHeatPreview: (heatPreview) => set({ heatPreview }),
  setViewport: (viewport) => set(viewport),
  resetViewport: () => set({ zoom: 1, panX: 0, panY: 0 }),

  undo: () =>
    set((state) => {
      const previous = state.past.at(-1)
      if (!previous) return {}
      return {
        document: previous,
        past: state.past.slice(0, -1),
        future: [state.document, ...state.future].slice(0, HISTORY_LIMIT),
        selection: null,
      }
    }),

  redo: () =>
    set((state) => {
      const next = state.future[0]
      if (!next) return {}
      return {
        document: next,
        past: [...state.past, state.document].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        selection: null,
      }
    }),
}))
