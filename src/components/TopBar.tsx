import { useTranslation } from 'react-i18next'
import { useFloorPlanStore } from '../store/useFloorPlanStore'

type Props = {
  onHome: () => void
  onNew: () => void
  onImport: () => void
  onBackground: () => void
  onExport: () => void
}

export function TopBar({ onHome, onNew, onImport, onBackground, onExport }: Props) {
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
          <small>Floorplan prototype · v0.1</small>
        </span>
      </div>

      <nav className="topbar-actions" aria-label="Project actions">
        <button onClick={onNew}>{t('topbar.new')}</button>
        <button onClick={onImport}>{t('topbar.import')}</button>
        <button onClick={onBackground}>{t('topbar.background')}</button>
        <button className="accent" onClick={onExport}>{t('topbar.export')}</button>
      </nav>

      <div className="topbar-right">
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
