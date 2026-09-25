import { useTranslation } from 'react-i18next'
import { useFloorPlanStore } from '../store/useFloorPlanStore'

export function StatusBar() {
  const { t } = useTranslation()
  const document = useFloorPlanStore((state) => state.document)
  const zoom = useFloorPlanStore((state) => state.zoom)
  const tool = useFloorPlanStore((state) => state.tool)
  const selection = useFloorPlanStore((state) => state.selection)

  return (
    <footer className="statusbar">
      <span className="status-tool">{t(`tools.${tool}`)}</span>
      <span>{t('status.areas', { count: document.areas.length })}</span>
      <span>{t('status.walls', { count: document.walls.length })}</span>
      <span>{t('status.fixtures', { count: document.fixtures.length })}</span>
      <span>{t('status.zoom', { value: Math.round(zoom * 100) })}</span>
      {selection.length > 0 && (
        <span className="status-selection">
          {t('status.selected', { count: selection.length })}
        </span>
      )}
      <span className="status-spacer" />
      <span className="status-saved">● {t('status.autosaved')}</span>
    </footer>
  )
}
