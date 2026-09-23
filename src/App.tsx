import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FloorPlanCanvas } from './components/FloorPlanCanvas'
import { PropertiesPanel } from './components/PropertiesPanel'
import { StartScreen } from './components/StartScreen'
import { StatusBar } from './components/StatusBar'
import { ToolPalette } from './components/ToolPalette'
import { TopBar } from './components/TopBar'
import { useFloorPlanStore } from './store/useFloorPlanStore'
import type { BackgroundPlan, FloorPlanDocument } from './types/floorplan'
import { downloadJson, fileToDataUrl, readJsonFile } from './utils/files'

const DRAFT_KEY = 'store-floorplan-prototype:draft:v1'

type Screen = 'start' | 'editor'

export default function App() {
  const { t } = useTranslation()
  const [screen, setScreen] = useState<Screen>('start')
  const [hasDraft, setHasDraft] = useState(() => Boolean(localStorage.getItem(DRAFT_KEY)))
  const document = useFloorPlanStore((state) => state.document)
  const newDocument = useFloorPlanStore((state) => state.newDocument)
  const loadDocument = useFloorPlanStore((state) => state.loadDocument)
  const setBackground = useFloorPlanStore((state) => state.setBackground)
  const projectInputRef = useRef<HTMLInputElement | null>(null)
  const backgroundInputRef = useRef<HTMLInputElement | null>(null)
  const backgroundStartsFreshRef = useRef(false)

  useEffect(() => {
    if (screen !== 'editor') return
    localStorage.setItem(DRAFT_KEY, JSON.stringify(document))
    setHasDraft(true)
  }, [document, screen])

  const openNew = () => {
    newDocument()
    setScreen('editor')
  }

  const confirmNew = () => {
    if (!window.confirm(t('dialogs.newConfirm'))) return
    newDocument()
  }

  const triggerOpenProject = () => projectInputRef.current?.click()

  const triggerBackground = (startsFresh = false) => {
    backgroundStartsFreshRef.current = startsFresh
    backgroundInputRef.current?.click()
  }

  const handleProjectFile = async (file?: File) => {
    if (!file) return
    try {
      const loaded = await readJsonFile(file)
      loadDocument(loaded)
      setScreen('editor')
    } catch {
      window.alert(t('errors.invalidProject'))
    } finally {
      if (projectInputRef.current) projectInputRef.current.value = ''
    }
  }

  const handleBackgroundFile = async (file?: File) => {
    if (!file) return
    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml']
    if (!allowed.includes(file.type)) {
      backgroundStartsFreshRef.current = false
      window.alert(t('errors.imageType'))
      return
    }

    const dataUrl = await fileToDataUrl(file)
    if (backgroundStartsFreshRef.current) newDocument()

    const background: BackgroundPlan = {
      id: crypto.randomUUID(),
      fileName: file.name,
      mimeType: file.type,
      dataUrl,
      opacity: 0.55,
    }
    setBackground(background)
    setScreen('editor')
    backgroundStartsFreshRef.current = false
    if (backgroundInputRef.current) backgroundInputRef.current.value = ''
  }

  const resumeDraft = () => {
    const stored = localStorage.getItem(DRAFT_KEY)
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as FloorPlanDocument
      loadDocument(parsed)
      setScreen('editor')
    } catch {
      localStorage.removeItem(DRAFT_KEY)
      setHasDraft(false)
    }
  }

  return (
    <>
      <input
        ref={projectInputRef}
        className="sr-only"
        type="file"
        accept="application/json,.json"
        onChange={(event) => void handleProjectFile(event.target.files?.[0])}
      />
      <input
        ref={backgroundInputRef}
        className="sr-only"
        type="file"
        accept="image/png,image/jpeg,image/svg+xml"
        onChange={(event) => void handleBackgroundFile(event.target.files?.[0])}
      />

      {screen === 'start' ? (
        <StartScreen
          hasDraft={hasDraft}
          onNew={openNew}
          onOpenProject={triggerOpenProject}
          onBackground={() => triggerBackground(true)}
          onResume={resumeDraft}
        />
      ) : (
        <div className="app-shell">
          <TopBar
            onHome={() => setScreen('start')}
            onNew={confirmNew}
            onImport={triggerOpenProject}
            onBackground={() => triggerBackground(false)}
            onExport={() => downloadJson(document)}
          />
          <div className="editor-grid">
            <ToolPalette />
            <FloorPlanCanvas />
            <PropertiesPanel />
          </div>
          <StatusBar />
        </div>
      )}
    </>
  )
}
