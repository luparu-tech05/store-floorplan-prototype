import { useTranslation } from 'react-i18next'

type Props = {
  hasDraft: boolean
  onNew: () => void
  onOpenProject: () => void
  onBackground: () => void
  onResume: () => void
}

export function StartScreen({ hasDraft, onNew, onOpenProject, onBackground, onResume }: Props) {
  const { t, i18n } = useTranslation()

  const changeLanguage = (language: 'es' | 'en') => {
    void i18n.changeLanguage(language)
    localStorage.setItem('floorplan-language', language)
  }

  return (
    <main className="start-shell">
      <div className="start-header">
        <div>
          <span className="eyebrow">STORE FLOW LAB · MVP</span>
          <h1>{t('app.title')}</h1>
          <p>{t('app.subtitle')}</p>
        </div>
        <div className="language-switch" aria-label="Language">
          <button className={i18n.language.startsWith('es') ? 'active' : ''} onClick={() => changeLanguage('es')}>
            ES
          </button>
          <button className={i18n.language.startsWith('en') ? 'active' : ''} onClick={() => changeLanguage('en')}>
            EN
          </button>
        </div>
      </div>

      <section className="start-card">
        <div className="start-card-copy">
          <span className="step-chip">01</span>
          <h2>{t('start.title')}</h2>
          <p className="start-note">
            {t('start.note')}
          </p>
        </div>

        <div className="start-options">
          <button className="start-option primary" onClick={onNew}>
            <span className="option-icon">＋</span>
            <span>
              <strong>{t('start.newPlan')}</strong>
              <small>{t('start.newPlanHint')}</small>
            </span>
          </button>

          <button className="start-option" onClick={onOpenProject}>
            <span className="option-icon">↥</span>
            <span>
              <strong>{t('start.openProject')}</strong>
              <small>{t('start.openProjectHint')}</small>
            </span>
          </button>

          <button className="start-option" onClick={onBackground}>
            <span className="option-icon">▧</span>
            <span>
              <strong>{t('start.background')}</strong>
              <small>{t('start.backgroundHint')}</small>
            </span>
          </button>

          {hasDraft && (
            <button className="start-option draft" onClick={onResume}>
              <span className="option-icon">↺</span>
              <span>
                <strong>{t('start.resume')}</strong>
                <small>{t('start.resumeHint')}</small>
              </span>
            </button>
          )}
        </div>
      </section>
    </main>
  )
}
