import { useTranslation } from 'react-i18next'
import { useFloorPlanStore } from '../store/useFloorPlanStore'
import type { FixtureKind, OpeningKind } from '../types/floorplan'
import { FIXTURE_DRAG_TYPE, fixtureBlueprints, fixtureKinds } from '../utils/fixtures'
import { OPENING_DRAG_TYPE, openingBlueprints, openingKinds } from '../utils/openings'

export function ObjectCatalog() {
  const { t } = useTranslation()
  const pendingFixtureKind = useFloorPlanStore((state) => state.pendingFixtureKind)
  const setPendingFixtureKind = useFloorPlanStore((state) => state.setPendingFixtureKind)
  const setDraggingFixtureKind = useFloorPlanStore((state) => state.setDraggingFixtureKind)
  const setCatalogOpen = useFloorPlanStore((state) => state.setCatalogOpen)
  const pendingOpeningKind = useFloorPlanStore((state) => state.pendingOpeningKind)
  const setPendingOpeningKind = useFloorPlanStore((state) => state.setPendingOpeningKind)
  const setDraggingOpeningKind = useFloorPlanStore((state) => state.setDraggingOpeningKind)

  const toggle = (kind: FixtureKind) => {
    setPendingFixtureKind(pendingFixtureKind === kind ? null : kind)
  }

  const toggleOpening = (kind: OpeningKind) => {
    setPendingOpeningKind(pendingOpeningKind === kind ? null : kind)
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

      {/* Puertas y ventanas: se sueltan SOBRE un muro y quedan ancladas a él. */}
      <h3 className="catalog-section">{t('catalog.openingsTitle')}</h3>
      <div className="catalog-list">
        {openingKinds.map((kind) => {
          const blueprint = openingBlueprints[kind]
          const armed = pendingOpeningKind === kind

          return (
            <div
              key={kind}
              className={`catalog-item${armed ? ' armed' : ''}`}
              draggable
              role="button"
              tabIndex={0}
              aria-pressed={armed}
              title={`${t(`openings.${kind}`)} — ${t('catalog.openingItemTitle')}`}
              onDragStart={(event) => {
                event.dataTransfer.setData(OPENING_DRAG_TYPE, kind)
                event.dataTransfer.effectAllowed = 'copy'
                setPendingOpeningKind(null)
                setDraggingOpeningKind(kind)
              }}
              onDragEnd={() => setDraggingOpeningKind(null)}
              onClick={() => toggleOpening(kind)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  toggleOpening(kind)
                }
              }}
            >
              <span className="catalog-icon" style={{ background: blueprint.color }}>
                {blueprint.icon}
              </span>
              <span className="catalog-text">
                <strong>{t(`openings.${kind}`)}</strong>
                <small>{t('catalog.openingSize', { width: blueprint.widthM.toFixed(2) })}</small>
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
      {pendingOpeningKind && (
        <p className="catalog-armed-hint">
          {t('catalog.openingArmed', { name: t(`openings.${pendingOpeningKind}`) })}
        </p>
      )}
    </aside>
  )
}
