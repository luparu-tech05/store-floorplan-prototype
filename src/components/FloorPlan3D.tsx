import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useFloorPlanStore } from '../store/useFloorPlanStore'
import type {
  Area,
  AreaCategory,
  Fixture,
  FloorPlanDocument,
  Selection,
  SelectionRef,
  Wall,
} from '../types/floorplan'

const categoryColors: Record<AreaCategory, number> = {
  entrance: 0x10b981,
  checkout: 0xf59e0b,
  apparel: 0x6366f1,
  footwear: 0x0ea5e9,
  fittingRoom: 0xa855f7,
  circulation: 0x94a3b8,
  storage: 0x64748b,
  other: 0x2dd4bf,
}

const fixtureColors: Record<Fixture['kind'], number> = {
  shelf: 0x6366f1,
  rack: 0x0ea5e9,
  mannequin: 0xa855f7,
  table: 0x14b8a6,
  counter: 0xf59e0b,
  fittingBooth: 0xec4899,
}

const isSelected = (selection: Selection, type: SelectionRef['type'], id: string) =>
  selection.some((item) => item.type === type && item.id === id)

const makeHeatColor = (value: number) => {
  const clamped = Math.max(0, Math.min(100, value))
  const hue = (220 - clamped * 2.2) / 360
  return new THREE.Color().setHSL(hue, 0.88, 0.54)
}

const centeredX = (x: number, document: FloorPlanDocument) => x - document.widthM / 2
const centeredZ = (y: number, document: FloorPlanDocument) => document.heightM / 2 - y

const attachSelection = (object: THREE.Object3D, ref: SelectionRef) => {
  object.userData.selectionRef = ref
}

const makeStandardMaterial = (color: number | string | THREE.Color, selected = false) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.03,
    emissive: selected ? 0x2563eb : 0x000000,
    emissiveIntensity: selected ? 0.32 : 0,
  })

const makeArea = (
  area: Area,
  document: FloorPlanDocument,
  heatPreview: boolean,
  selected: boolean,
) => {
  if (area.points.length < 3) return null

  const shape = new THREE.Shape()
  area.points.forEach((point, index) => {
    // ShapeGeometry nace en XY. Al girarla -90° en X, Y se convierte en -Z.
    const x = centeredX(point.x, document)
    const y = point.y - document.heightM / 2
    if (index === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  })
  shape.closePath()

  const geometry = new THREE.ShapeGeometry(shape)
  const material = new THREE.MeshStandardMaterial({
    color: heatPreview ? makeHeatColor(area.heatValue) : categoryColors[area.category],
    transparent: true,
    opacity: selected ? 0.88 : 0.66,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
    emissive: selected ? 0x1d4ed8 : 0x000000,
    emissiveIntensity: selected ? 0.22 : 0,
    depthWrite: false,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.018
  mesh.receiveShadow = true
  mesh.renderOrder = 2
  attachSelection(mesh, { type: 'area', id: area.id })
  return mesh
}

const makeWall = (wall: Wall, document: FloorPlanDocument, selected: boolean) => {
  const dx = wall.end.x - wall.start.x
  const dy = wall.end.y - wall.start.y
  const length = Math.hypot(dx, dy)
  if (length < 0.01) return null

  const group = new THREE.Group()
  const height = Math.max(0.2, wall.heightM || 3)
  const thickness = Math.max(0.03, wall.thicknessM || 0.15)
  const geometry = new THREE.BoxGeometry(length, height, thickness)
  const material = makeStandardMaterial(selected ? 0xbfdbfe : 0xf8fafc, selected)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = height / 2
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)

  const edgeGeometry = new THREE.EdgesGeometry(geometry, 28)
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: selected ? 0x1d4ed8 : 0x94a3b8,
    transparent: true,
    opacity: selected ? 0.95 : 0.58,
  })
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial)
  edges.position.y = height / 2
  group.add(edges)

  group.position.set(
    centeredX((wall.start.x + wall.end.x) / 2, document),
    0,
    centeredZ((wall.start.y + wall.end.y) / 2, document),
  )
  // El SVG usa Y hacia abajo; al convertir Y→-Z, el mismo ángulo produce
  // la orientación visual equivalente vista desde arriba.
  group.rotation.y = Math.atan2(dy, dx)
  attachSelection(group, { type: 'wall', id: wall.id })
  return group
}

const addBox = (
  parent: THREE.Group,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.position.set(...position)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

const makeFixture = (fixture: Fixture, document: FloorPlanDocument, selected: boolean) => {
  const group = new THREE.Group()
  const width = Math.max(0.08, fixture.widthM)
  const length = Math.max(0.08, fixture.lengthM)
  const height = Math.max(0.08, fixture.heightM || 1)
  const material = makeStandardMaterial(fixtureColors[fixture.kind], selected)
  const darkMaterial = makeStandardMaterial(0x334155, selected)

  switch (fixture.kind) {
    case 'mannequin': {
      const radius = Math.min(width, length) * 0.24
      const bodyHeight = height * 0.58
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.62, radius, bodyHeight, 16),
        material,
      )
      body.position.y = height * 0.43
      body.castShadow = true
      group.add(body)

      const head = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.72, 16, 12), material)
      head.position.y = height * 0.82
      head.castShadow = true
      group.add(head)

      addBox(group, [radius * 0.36, height * 0.32, radius * 0.36], [0, height * 0.17, 0], darkMaterial)
      break
    }
    case 'rack': {
      const post = Math.max(0.035, Math.min(width, length) * 0.07)
      addBox(group, [width, 0.08, length], [0, 0.04, 0], darkMaterial)
      addBox(group, [post, height, post], [-width * 0.42, height / 2, 0], material)
      addBox(group, [post, height, post], [width * 0.42, height / 2, 0], material)
      addBox(group, [width * 0.88, post, post], [0, height * 0.9, 0], material)
      break
    }
    case 'table': {
      const topThickness = Math.min(0.12, height * 0.22)
      addBox(group, [width, topThickness, length], [0, height - topThickness / 2, 0], material)
      const leg = Math.max(0.04, Math.min(width, length) * 0.07)
      const legHeight = Math.max(0.08, height - topThickness)
      const x = Math.max(0, width / 2 - leg * 1.2)
      const z = Math.max(0, length / 2 - leg * 1.2)
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addBox(group, [leg, legHeight, leg], [sx * x, legHeight / 2, sz * z], darkMaterial)
        }
      }
      break
    }
    case 'fittingBooth': {
      const wall = Math.max(0.05, Math.min(width, length) * 0.055)
      addBox(group, [width, height, wall], [0, height / 2, -length / 2 + wall / 2], material)
      addBox(group, [wall, height, length], [-width / 2 + wall / 2, height / 2, 0], material)
      addBox(group, [wall, height, length], [width / 2 - wall / 2, height / 2, 0], material)
      break
    }
    case 'shelf': {
      addBox(group, [width, height, length], [0, height / 2, 0], material)
      // Tres baldas visuales para distinguirlo de un mostrador.
      for (const ratio of [0.28, 0.55, 0.82]) {
        addBox(group, [width * 1.01, 0.025, length * 1.02], [0, height * ratio, 0], darkMaterial)
      }
      break
    }
    case 'counter':
    default:
      addBox(group, [width, height, length], [0, height / 2, 0], material)
      break
  }

  group.position.set(
    centeredX(fixture.position.x, document),
    0,
    centeredZ(fixture.position.y, document),
  )
  group.rotation.y = THREE.MathUtils.degToRad(fixture.rotationDeg)
  attachSelection(group, { type: 'fixture', id: fixture.id })
  return group
}

const makeGrid = (document: FloorPlanDocument) => {
  const positions: number[] = []
  const maxLines = 180
  const safeGrid = Math.max(0.05, document.gridSizeM)
  const minStepForWidth = document.widthM / maxLines
  const minStepForHeight = document.heightM / maxLines
  const step = Math.max(safeGrid, minStepForWidth, minStepForHeight)
  const halfWidth = document.widthM / 2
  const halfHeight = document.heightM / 2

  for (let x = -halfWidth; x <= halfWidth + 1e-6; x += step) {
    positions.push(x, 0.007, -halfHeight, x, 0.007, halfHeight)
  }
  for (let z = -halfHeight; z <= halfHeight + 1e-6; z += step) {
    positions.push(-halfWidth, 0.007, z, halfWidth, 0.007, z)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const material = new THREE.LineBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.46 })
  return new THREE.LineSegments(geometry, material)
}

const makePlanBoundary = (document: FloorPlanDocument) => {
  const w = document.widthM / 2
  const h = document.heightM / 2
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-w, 0.025, h),
    new THREE.Vector3(w, 0.025, h),
    new THREE.Vector3(w, 0.025, -h),
    new THREE.Vector3(-w, 0.025, -h),
  ])
  return new THREE.LineLoop(
    geometry,
    new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.72 }),
  )
}

const buildPlanGroup = (
  document: FloorPlanDocument,
  heatPreview: boolean,
  selection: Selection,
) => {
  const root = new THREE.Group()
  root.name = 'semantic-floorplan'

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(document.widthM, document.heightM),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 1, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.018
  ground.receiveShadow = true
  root.add(ground)
  root.add(makeGrid(document))
  root.add(makePlanBoundary(document))

  document.areas.forEach((area) => {
    const object = makeArea(area, document, heatPreview, isSelected(selection, 'area', area.id))
    if (object) root.add(object)
  })

  document.walls.forEach((wall) => {
    const object = makeWall(wall, document, isSelected(selection, 'wall', wall.id))
    if (object) root.add(object)
  })

  document.fixtures.forEach((fixture) => {
    root.add(makeFixture(fixture, document, isSelected(selection, 'fixture', fixture.id)))
  })

  return root
}

const disposeMaterial = (material: THREE.Material) => {
  const withMaps = material as THREE.Material & Record<string, unknown>
  ;['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap'].forEach((key) => {
    const texture = withMaps[key]
    if (texture instanceof THREE.Texture) texture.dispose()
  })
  material.dispose()
}

const disposeObject3D = (object: THREE.Object3D) => {
  object.traverse((child) => {
    const meshLike = child as THREE.Mesh
    if (meshLike.geometry) meshLike.geometry.dispose()
    const material = meshLike.material
    if (Array.isArray(material)) material.forEach(disposeMaterial)
    else if (material) disposeMaterial(material)
  })
}

const findSelectionRef = (object: THREE.Object3D | null): SelectionRef | null => {
  let current = object
  while (current) {
    const ref = current.userData.selectionRef as SelectionRef | undefined
    if (ref) return ref
    current = current.parent
  }
  return null
}

export function FloorPlan3D() {
  const { t } = useTranslation()
  const document = useFloorPlanStore((state) => state.document)
  const heatPreview = useFloorPlanStore((state) => state.heatPreview)
  const selection = useFloorPlanStore((state) => state.selection)
  const setSelection = useFloorPlanStore((state) => state.setSelection)
  const clearSelection = useFloorPlanStore((state) => state.clearSelection)

  const mountRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const modelRef = useRef<THREE.Group | null>(null)
  const documentRef = useRef(document)
  const resetCameraRef = useRef<() => void>(() => undefined)
  const pointerDownRef = useRef({ x: 0, y: 0 })

  documentRef.current = document

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xe7edf5)

    const camera = new THREE.PerspectiveCamera(44, 1, 0.05, 1000)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.className = 'viewer3d-renderer'
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.075
    controls.screenSpacePanning = true
    controls.minDistance = 2
    controls.maxDistance = 240
    controls.maxPolarAngle = Math.PI / 2 - 0.025

    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x718096, 1.45)
    scene.add(hemisphere)

    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(18, 34, 16)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.near = 0.5
    key.shadow.camera.far = 140
    key.shadow.camera.left = -50
    key.shadow.camera.right = 50
    key.shadow.camera.top = 50
    key.shadow.camera.bottom = -50
    scene.add(key)

    const fill = new THREE.DirectionalLight(0xbfdbfe, 0.72)
    fill.position.set(-22, 16, -18)
    scene.add(fill)

    const fitCamera = () => {
      const current = documentRef.current
      const span = Math.max(current.widthM, current.heightM, 10)
      camera.position.set(span * 0.72, span * 0.82, span * 0.82)
      controls.target.set(0, Math.min(1.25, span * 0.05), 0)
      camera.near = Math.max(0.02, span / 1000)
      camera.far = Math.max(300, span * 18)
      camera.updateProjectionMatrix()
      controls.update()
    }
    resetCameraRef.current = fitCamera
    fitCamera()

    const resize = () => {
      const width = Math.max(1, mount.clientWidth)
      const height = Math.max(1, mount.clientHeight)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(mount)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()

    const onPointerDown = (event: PointerEvent) => {
      pointerDownRef.current = { x: event.clientX, y: event.clientY }
    }

    const onPointerUp = (event: PointerEvent) => {
      const moved = Math.hypot(
        event.clientX - pointerDownRef.current.x,
        event.clientY - pointerDownRef.current.y,
      )
      if (moved > 5) return

      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)

      const model = modelRef.current
      if (!model) return
      const hits = raycaster.intersectObject(model, true)
      const ref = hits.map((hit) => findSelectionRef(hit.object)).find(Boolean) ?? null
      if (ref) setSelection([ref])
      else clearSelection()
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    let animationFrame = 0
    const render = () => {
      controls.update()
      renderer.render(scene, camera)
      animationFrame = requestAnimationFrame(render)
    }
    render()

    sceneRef.current = scene
    cameraRef.current = camera
    rendererRef.current = renderer
    controlsRef.current = controls

    return () => {
      cancelAnimationFrame(animationFrame)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      controls.dispose()
      if (modelRef.current) disposeObject3D(modelRef.current)
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
      sceneRef.current = null
      cameraRef.current = null
      rendererRef.current = null
      controlsRef.current = null
      modelRef.current = null
    }
  }, [clearSelection, setSelection])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    if (modelRef.current) {
      scene.remove(modelRef.current)
      disposeObject3D(modelRef.current)
    }

    const model = buildPlanGroup(document, heatPreview, selection)
    modelRef.current = model
    scene.add(model)
  }, [document, heatPreview, selection])

  // Al abrir otro proyecto o crear uno nuevo, encuadra el nuevo tamaño.
  useEffect(() => {
    requestAnimationFrame(() => resetCameraRef.current())
  }, [document.id])

  return (
    <section className="viewer3d-shell" aria-label={t('viewer3d.aria')}>
      <div ref={mountRef} className="viewer3d-canvas" />

      <div className="viewer3d-meta">
        <span className="viewer3d-badge">3D</span>
        <span>{document.widthM} × {document.heightM} m</span>
        <span>{t('viewer3d.wallCount', { count: document.walls.length })}</span>
      </div>

      <button className="viewer3d-reset" onClick={() => resetCameraRef.current()}>
        ⌂ {t('viewer3d.reset')}
      </button>

      <div className="viewer3d-hint">
        <strong>{t('viewer3d.title')}</strong>
        <span>{t('viewer3d.help')}</span>
      </div>

      {!document.walls.length && !document.areas.length && !document.fixtures.length && (
        <div className="viewer3d-empty">
          <strong>{t('viewer3d.emptyTitle')}</strong>
          <span>{t('viewer3d.emptyHint')}</span>
        </div>
      )}
    </section>
  )
}
