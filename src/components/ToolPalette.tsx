import { useTranslation } from 'react-i18next'
import { useFloorPlanStore } from '../store/useFloorPlanStore'
import type { Tool } from '../types/floorplan'

const tools: Array<{ id: Tool; icon: string; labelKey: string }> = [
  { id: 'select', icon: '↖', labelKey: 'tools.select' },
  { id: 'pan', icon: '✋', labelKey: 'tools.pan' },
  { id: 'wall', icon: '╱', labelKey: 'tools.wall' },
  { id: 'area', icon: '⬠', labelKey: 'tools.area' },
]

export function ToolPalette() {
  const { t } = useTranslation()
  const tool = useFloorPlanStore((state) => state.tool)
  const setTool = useFloorPlanStore((state) => state.setTool)
  const past = useFloorPlanStore((state) => state.past)
  const future = useFloorPlanStore((state) => state.future)
  const undo = useFloorPlanStore((state) => state.undo)
  const redo = useFloorPlanStore((state) => state.redo)
  const selection = useFloorPlanStore((state) => state.selection)
  const deleteSelection = useFloorPlanStore((state) => state.deleteSelection)
  const catalogOpen = useFloorPlanStore((state) => state.catalogOpen)
  const toggleCatalog = useFloorPlanStore((state) => state.toggleCatalog)

  return (
    <aside className="tool-palette">
      {tools.map((item) => (
        <button
          key={item.id}
          className={tool === item.id ? 'active' : ''}
          onClick={() => setTool(item.id)}
          title={t(item.labelKey)}
          aria-label={t(item.labelKey)}
        >
          <span>{item.icon}</span>
          <small>{t(item.labelKey)}</small>
        </button>
      ))}

      {/* No es una herramienta: abre y cierra el panel del catálogo. */}
      <button
        className={catalogOpen ? 'active' : ''}
        onClick={toggleCatalog}
        title={t('tools.objects')}
        aria-label={t('tools.objects')}
        aria-expanded={catalogOpen}
      >
        <span>▦</span>
        <small>{t('tools.objects')}</small>
      </button>

      <div className="tool-divider" />
      <button onClick={undo} disabled={!past.length} title={t('tools.undo')}>
        <span>↶</span><small>{t('tools.undo')}</small>
      </button>
      <button onClick={redo} disabled={!future.length} title={t('tools.redo')}>
        <span>↷</span><small>{t('tools.redo')}</small>
      </button>
      <button onClick={deleteSelection} disabled={!selection.length} title={t('tools.delete')}>
        <span>⌫</span><small>{t('tools.delete')}</small>
      </button>
    </aside>
  )
}
