import { useTranslation } from 'react-i18next'
import { useFloorPlanStore } from '../store/useFloorPlanStore'
import type { FixtureKind } from '../types/floorplan'
import { FIXTURE_DRAG_TYPE, fixtureBlueprints, fixtureKinds } from '../utils/fixtures'

export function ObjectCatalog() {
  const { t } = useTranslation()
  const pendingFixtureKind = useFloorPlanStore((state) => state.pendingFixtureKind)
  const setPendingFixtureKind = useFloorPlanStore((state) => state.setPendingFixtureKind)
  const setDraggingFixtureKind = useFloorPlanStore((state) => state.setDraggingFixtureKind)
  const setCatalogOpen = useFloorPlanStore((state) => state.setCatalogOpen)

  const toggle = (kind: FixtureKind) => {
    setPendingFixtureKind(pendingFixtureKind === kind ? null : kind)
  }

  return (
    <aside className="object-catalog">
      <div className="catalog-heading">
        <div className="catalog-heading-row">
          <span className="eyebrow">01 · {t('catalog.eyebrow')}</span>
          <button
            className="catalog-close"
            onClick={() => setCatalogOpen(false)}
            title={t('catalog.close')}
            aria-label={t('catalog.close')}
          >
            ×
          </button>
        </div>
        <h2>{t('catalog.title')}</h2>
      </div>

      <p className="catalog-hint">{t('catalog.hint')}</p>

      <div className="catalog-list">
        {fixtureKinds.map((kind) => {
          const blueprint = fixtureBlueprints[kind]
          const armed = pendingFixtureKind === kind

          return (
            <div
              key={kind}
              className={`catalog-item${armed ? ' armed' : ''}`}
              draggable
              role="button"
              tabIndex={0}
              aria-pressed={armed}
              title={`${t(`fixtures.${kind}`)} — ${t('catalog.itemTitle')}`}
              onDragStart={(event) => {
                event.dataTransfer.setData(FIXTURE_DRAG_TYPE, kind)
                event.dataTransfer.effectAllowed = 'copy'
                setPendingFixtureKind(null)
                setDraggingFixtureKind(kind)
              }}
              onDragEnd={() => setDraggingFixtureKind(null)}
              onClick={() => toggle(kind)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  toggle(kind)
                }
              }}
            >
              <span className="catalog-icon" style={{ background: blueprint.color }}>
                {blueprint.icon}
              </span>
              <span className="catalog-text">
                <strong>{t(`fixtures.${kind}`)}</strong>
                <small>
                  {blueprint.widthM.toFixed(2)} × {blueprint.lengthM.toFixed(2)} m
                </small>
              </span>
            </div>
          )
        })}
      </div>

      {pendingFixtureKind && (
        <p className="catalog-armed-hint">
          {t('catalog.armed', { name: t(`fixtures.${pendingFixtureKind}`) })}
        </p>
      )}
    </aside>
  )
}
