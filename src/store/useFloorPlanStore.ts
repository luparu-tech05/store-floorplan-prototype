import { produce } from 'immer'
import { create } from 'zustand'
import type {
  Area,
  AreaCategory,
  BackgroundPlan,
  Fixture,
  FixtureKind,
  FloorPlanDocument,
  Point,
  Selection,
  SelectionRef,
  Tool,
  Wall,
} from '../types/floorplan'
import { createFixture, fixtureBlueprints } from '../utils/fixtures'
import { nextLabelIndex } from '../utils/labels'

const HISTORY_LIMIT = 60

/**
 * Los JSON guardados antes de que existieran los objetos no traen `fixtures`.
 * Sin esto, abrirlos rompe el editor al primer `.map()`.
 */
const normalizeDocument = (document: FloorPlanDocument): FloorPlanDocument => {
  const clone = structuredClone(document)
  const counters: Record<string, number> = {}

  const withLabel = <T extends { name?: string; labelIndex?: number }>(item: T, group: string) => {
    counters[group] = (counters[group] ?? 0) + 1
    return {
      ...item,
      name: item.name ?? '',
      // Planos guardados antes de este cambio no traen labelIndex: se numeran
      // por orden de aparición. Su `name` se respeta tal cual quedó escrito;
      // borrarlo en el panel devuelve el nombre automático ya traducido.
      labelIndex: item.labelIndex ?? counters[group],
    }
  }

  return {
    ...clone,
    schemaVersion: 2,
    walls: (clone.walls ?? []).map((wall) => ({
      ...wall,
      heightM: wall.heightM ?? 3,
    })),
    areas: (clone.areas ?? []).map((area) => withLabel(area, 'area')),
    fixtures: (clone.fixtures ?? []).map((fixture) => ({
      ...withLabel(fixture, fixture.kind),
      // Los planos guardados antes del renombrado traen `depthM`.
      lengthM:
        fixture.lengthM ?? (fixture as unknown as { depthM?: number }).depthM ?? 0.5,
      heightM: fixture.heightM ?? fixtureBlueprints[fixture.kind]?.heightM ?? 1,
    })),
  }
}

export const createBlankDocument = (): FloorPlanDocument => {
  const now = new Date().toISOString()
  return {
    schemaVersion: 2,
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
    fixtures: [],
  }
}

type PlanPatch = Partial<Pick<FloorPlanDocument, 'name' | 'widthM' | 'heightM' | 'gridSizeM'>>
type AreaPatch = Partial<Pick<Area, 'name' | 'category' | 'walkable' | 'attractiveness' | 'heatValue'>>
type WallPatch = Partial<Pick<Wall, 'thicknessM' | 'heightM'>>
type FixturePatch = Partial<
  Pick<
    Fixture,
    | 'name'
    | 'widthM'
    | 'lengthM'
    | 'heightM'
    | 'rotationDeg'
    | 'blocksMovement'
    | 'blocksVision'
    | 'attractiveness'
  >
>

type FloorPlanState = {
  document: FloorPlanDocument
  past: FloorPlanDocument[]
  future: FloorPlanDocument[]
  selection: Selection
  tool: Tool
  /** Objeto del catálogo "armado" a la espera de un clic en el lienzo. */
  pendingFixtureKind: FixtureKind | null
  /** El catálogo de objetos es un panel desplegable: por defecto va cerrado. */
  catalogOpen: boolean
  /**
   * Objeto que se está arrastrando ahora mismo desde el catálogo.
   * Durante dragover el navegador oculta el contenido del dataTransfer, así que
   * esta es la única forma de saber qué dibujar como vista previa.
   */
  draggingFixtureKind: FixtureKind | null
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
  addFixture: (kind: FixtureKind, position: Point) => void
  moveFixture: (id: string, position: Point) => void
  /** Mueve varios objetos a la vez, con UN solo registro en el historial. */
  moveFixtures: (deltas: Array<{ id: string; position: Point }>) => void
  updateFixture: (id: string, patch: FixturePatch) => void
  setPendingFixtureKind: (kind: FixtureKind | null) => void
  setDraggingFixtureKind: (kind: FixtureKind | null) => void
  toggleCatalog: () => void
  setCatalogOpen: (open: boolean) => void
  setBackground: (background: BackgroundPlan) => void
  updateBackgroundOpacity: (opacity: number) => void
  removeBackground: () => void
  setSelection: (selection: Selection) => void
  /** Shift+clic: añade o quita un elemento sin perder el resto. */
  toggleSelection: (ref: SelectionRef) => void
  clearSelection: () => void
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
  selection: [],
  tool: 'select',
  pendingFixtureKind: null,
  draggingFixtureKind: null,
  catalogOpen: false,
  heatPreview: false,
  zoom: 1,
  panX: 0,
  panY: 0,

  newDocument: () =>
    set({
      document: createBlankDocument(),
      past: [],
      future: [],
      selection: [],
      tool: 'select',
      pendingFixtureKind: null,
      draggingFixtureKind: null,
      heatPreview: false,
      zoom: 1,
      panX: 0,
      panY: 0,
    }),

  loadDocument: (document) =>
    set({
      document: normalizeDocument(document),
      past: [],
      future: [],
      selection: [],
      tool: 'select',
      pendingFixtureKind: null,
      draggingFixtureKind: null,
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
          heightM: 3,
        })
      }),
    ),

  addArea: (points) =>
    set((state) => {
      const id = crypto.randomUUID()
      const nextState = commit(state, (draft) => {
        draft.areas.push({
          id,
          name: '',
          labelIndex: nextLabelIndex(draft.areas.map((area) => area.labelIndex)),
          category: 'other' satisfies AreaCategory,
          points,
          walkable: true,
          attractiveness: 0.5,
          heatValue: 35,
        })
      })
      return { ...nextState, selection: [{ type: 'area', id }], tool: 'select' }
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

  addFixture: (kind, position) =>
    set((state) => {
      const labelIndex = nextLabelIndex(
        state.document.fixtures
          .filter((candidate) => candidate.kind === kind)
          .map((candidate) => candidate.labelIndex),
      )
      const fixture = createFixture(kind, position, labelIndex)
      const nextState = commit(state, (draft) => {
        draft.fixtures.push(fixture)
      })
      return {
        ...nextState,
        selection: [{ type: 'fixture', id: fixture.id }],
        tool: 'select',
        pendingFixtureKind: null,
        draggingFixtureKind: null,
      }
    }),

  /**
   * Se llama UNA vez, al soltar. Durante el arrastre la posición vive en el
   * estado local del lienzo, para no llenar el historial de deshacer con un
   * registro por cada pixel movido.
   */
  moveFixture: (id, position) =>
    set((state) =>
      commit(state, (draft) => {
        const fixture = draft.fixtures.find((candidate) => candidate.id === id)
        if (fixture) fixture.position = position
      }),
    ),

  moveFixtures: (deltas) =>
    set((state) =>
      commit(state, (draft) => {
        deltas.forEach(({ id, position }) => {
          const fixture = draft.fixtures.find((candidate) => candidate.id === id)
          if (fixture) fixture.position = position
        })
      }),
    ),

  updateFixture: (id, patch) =>
    set((state) =>
      commit(state, (draft) => {
        const fixture = draft.fixtures.find((candidate) => candidate.id === id)
        if (fixture) Object.assign(fixture, patch)
      }),
    ),

  setPendingFixtureKind: (pendingFixtureKind) =>
    set((state) => ({
      pendingFixtureKind,
      tool: pendingFixtureKind ? 'select' : state.tool,
    })),

  setDraggingFixtureKind: (draggingFixtureKind) => set({ draggingFixtureKind }),

  /** Al cerrar el catálogo se desarma cualquier objeto pendiente de colocar:
   *  si no, quedaría un clic "cargado" sin nada visible que lo explique. */
  toggleCatalog: () =>
    set((state) => ({
      catalogOpen: !state.catalogOpen,
      pendingFixtureKind: state.catalogOpen ? null : state.pendingFixtureKind,
    })),

  setCatalogOpen: (catalogOpen) =>
    set((state) => ({
      catalogOpen,
      pendingFixtureKind: catalogOpen ? state.pendingFixtureKind : null,
    })),

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

  toggleSelection: (ref) =>
    set((state) => {
      const already = state.selection.some(
        (item) => item.type === ref.type && item.id === ref.id,
      )
      return {
        selection: already
          ? state.selection.filter((item) => !(item.type === ref.type && item.id === ref.id))
          : [...state.selection, ref],
      }
    }),

  clearSelection: () => set({ selection: [] }),

  deleteSelection: () =>
    set((state) => {
      if (!state.selection.length) return {}

      const idsOf = (type: SelectionRef['type']) =>
        new Set(state.selection.filter((item) => item.type === type).map((item) => item.id))

      const areaIds = idsOf('area')
      const wallIds = idsOf('wall')
      const fixtureIds = idsOf('fixture')

      // Todo lo seleccionado se borra en UNA sola operación: un Ctrl+Z lo devuelve.
      const next = commit(state, (draft) => {
        if (areaIds.size) draft.areas = draft.areas.filter((area) => !areaIds.has(area.id))
        if (wallIds.size) draft.walls = draft.walls.filter((wall) => !wallIds.has(wall.id))
        if (fixtureIds.size) {
          draft.fixtures = draft.fixtures.filter((fixture) => !fixtureIds.has(fixture.id))
        }
      })
      return { ...next, selection: [] }
    }),

  setTool: (tool) =>
    set((state) => ({
      tool,
      selection: tool === 'select' ? state.selection : [],
      pendingFixtureKind: null,
    })),
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
        selection: [],
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
        selection: [],
      }
    }),
}))
