import { useTranslation } from 'react-i18next'
import { useFloorPlanStore } from '../store/useFloorPlanStore'
import type { ViewMode } from '../types/floorplan'

type Props = {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onHome: () => void
  onNew: () => void
  onImport: () => void
  onBackground: () => void
  onExport: () => void
}

export function TopBar({
  viewMode,
  onViewModeChange,
  onHome,
  onNew,
  onImport,
  onBackground,
  onExport,
}: Props) {
  const { t, i18n } = useTranslation()
  const document = useFloorPlanStore((state) => state.document)
  const heatPreview = useFloorPlanStore((state) => state.heatPreview)
  const setHeatPreview = useFloorPlanStore((state) => state.setHeatPreview)

  const changeLanguage = (language: 'es' | 'en') => {
    void i18n.changeLanguage(language)
    localStorage.setItem('floorplan-language', language)
  }

  return (
    <header className="topbar">
      <div className="brand" onClick={onHome} role="button" tabIndex={0}>
        <span className="brand-mark">SF</span>
        <span>
          <strong>{document.name}</strong>
          <small>Floorplan prototype · v0.2 · 2D/3D</small>
        </span>
      </div>

      <nav className="topbar-actions" aria-label="Project actions">
        <button onClick={onNew}>{t('topbar.new')}</button>
        <button onClick={onImport}>{t('topbar.import')}</button>
        <button onClick={onBackground}>{t('topbar.background')}</button>
        <button className="accent" onClick={onExport}>{t('topbar.export')}</button>
      </nav>

      <div className="topbar-right">
        <div className="view-switch" aria-label={t('topbar.viewMode')}>
          <button
            className={viewMode === '2d' ? 'active' : ''}
            onClick={() => onViewModeChange('2d')}
            aria-pressed={viewMode === '2d'}
          >
            {t('topbar.view2d')}
          </button>
          <button
            className={viewMode === '3d' ? 'active' : ''}
            onClick={() => onViewModeChange('3d')}
            aria-pressed={viewMode === '3d'}
          >
            {t('topbar.view3d')}
          </button>
        </div>

        <label className="heat-toggle">
          <input
            type="checkbox"
            checked={heatPreview}
            onChange={(event) => setHeatPreview(event.target.checked)}
          />
          <span>{t('topbar.heat')}</span>
        </label>
        <div className="language-switch compact">
          <button className={i18n.language.startsWith('es') ? 'active' : ''} onClick={() => changeLanguage('es')}>ES</button>
          <button className={i18n.language.startsWith('en') ? 'active' : ''} onClick={() => changeLanguage('en')}>EN</button>
        </div>
      </div>
    </header>
  )
}
