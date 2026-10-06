import { useTranslation } from 'react-i18next'
import { useFloorPlanStore } from '../store/useFloorPlanStore'
import type { AreaCategory } from '../types/floorplan'
import { fixtureBlueprints } from '../utils/fixtures'
import { areaDisplayName, fixtureDisplayName } from '../utils/labels'

const categories: AreaCategory[] = [
  'entrance',
  'checkout',
  'apparel',
  'footwear',
  'fittingRoom',
  'circulation',
  'storage',
  'other',
]

export function PropertiesPanel() {
  const { t } = useTranslation()
  const document = useFloorPlanStore((state) => state.document)
  const selection = useFloorPlanStore((state) => state.selection)
  const updatePlan = useFloorPlanStore((state) => state.updatePlan)
  const updateArea = useFloorPlanStore((state) => state.updateArea)
  const updateWall = useFloorPlanStore((state) => state.updateWall)
  const updateFixture = useFloorPlanStore((state) => state.updateFixture)
  const deleteSelection = useFloorPlanStore((state) => state.deleteSelection)
  const updateBackgroundOpacity = useFloorPlanStore((state) => state.updateBackgroundOpacity)
  const removeBackground = useFloorPlanStore((state) => state.removeBackground)

  // El panel de detalle solo tiene sentido con UN elemento seleccionado.
  // Con varios se muestra un resumen: editar diez cosas a la vez es otra
  // funcionalidad (edición masiva) y no entra en este prototipo.
  const only = selection.length === 1 ? selection[0] : undefined

  const selectedArea = only?.type === 'area'
    ? document.areas.find((area) => area.id === only.id)
    : undefined

  const selectedWall = only?.type === 'wall'
    ? document.walls.find((wall) => wall.id === only.id)
    : undefined

  const selectedFixture = only?.type === 'fixture'
    ? document.fixtures.find((fixture) => fixture.id === only.id)
    : undefined

  const countOf = (type: string) => selection.filter((item) => item.type === type).length

  return (
    <aside className="properties-panel">
      <div className="panel-heading">
        <span className="eyebrow">02 · DATA</span>
        <h2>{t('properties.title')}</h2>
      </div>

      <section className="property-section">
        <h3>{t('properties.plan')}</h3>
        <label>
          <span>{t('properties.name')}</span>
          <input
            value={document.name}
            onChange={(event) => updatePlan({ name: event.target.value })}
          />
        </label>
        <div className="two-columns">
          <label>
            <span>{t('properties.width')}</span>
            <input
              type="number"
              min="5"
              max="200"
              step="1"
              value={document.widthM}
              onChange={(event) => updatePlan({ widthM: Math.max(5, Number(event.target.value) || 5) })}
            />
          </label>
          <label>
            <span>{t('properties.height')}</span>
            <input
              type="number"
              min="5"
              max="200"
              step="1"
              value={document.heightM}
              onChange={(event) => updatePlan({ heightM: Math.max(5, Number(event.target.value) || 5) })}
            />
          </label>
        </div>
        <label>
          <span>{t('properties.grid')}</span>
          <select
            value={document.gridSizeM}
            onChange={(event) => updatePlan({ gridSizeM: Number(event.target.value) })}
          >
            <option value={0.1}>0.10</option>
            <option value={0.25}>0.25</option>
            <option value={0.5}>0.50</option>
            <option value={1}>1.00</option>
          </select>
        </label>
      </section>

      {document.background && (
        <section className="property-section">
          <h3>{t('properties.background')}</h3>
          <div className="background-file">{document.background.fileName}</div>
          <label>
            <span>{t('properties.backgroundOpacity')} · {Math.round(document.background.opacity * 100)}%</span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={document.background.opacity}
              onChange={(event) => updateBackgroundOpacity(Number(event.target.value))}
            />
          </label>
          <button className="text-danger" onClick={removeBackground}>{t('properties.removeBackground')}</button>
        </section>
      )}

      <section className="property-section selected-section">
        <h3>{t('properties.selection')}</h3>
        {!selection.length && (
          <p className="empty-properties">{t('properties.noSelection')}</p>
        )}

        {selection.length > 1 && (
          <div className="multi-selection">
            <div className="selection-badge">
              {t('properties.multiCount', { count: selection.length })}
            </div>
            <ul className="multi-breakdown">
              {countOf('area') > 0 && <li>{t('status.areas', { count: countOf('area') })}</li>}
              {countOf('wall') > 0 && <li>{t('status.walls', { count: countOf('wall') })}</li>}
              {countOf('fixture') > 0 && (
                <li>{t('status.fixtures', { count: countOf('fixture') })}</li>
              )}
            </ul>
            <button className="text-danger" onClick={deleteSelection}>
              {t('properties.deleteSelection')}
            </button>
            <p className="multi-hint">{t('properties.multiHint')}</p>
          </div>
        )}

        {selectedArea && (
          <>
            <div className="selection-badge">AREA · {selectedArea.id.slice(0, 8)}</div>
            <label>
              <span>{t('properties.name')}</span>
              <input
                value={selectedArea.name}
                placeholder={areaDisplayName(selectedArea, t)}
                onChange={(event) => updateArea(selectedArea.id, { name: event.target.value })}
              />
              <small>{t('properties.nameHint')}</small>
            </label>
            <label>
              <span>{t('properties.category')}</span>
              <select
                value={selectedArea.category}
                onChange={(event) => updateArea(selectedArea.id, { category: event.target.value as AreaCategory })}
              >
                {categories.map((category) => (
                  <option key={category} value={category}>{t(`categories.${category}`)}</option>
                ))}
              </select>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={selectedArea.walkable}
                onChange={(event) => updateArea(selectedArea.id, { walkable: event.target.checked })}
              />
              <span>{t('properties.walkable')}</span>
            </label>
            <label>
              <span>{t('properties.attractiveness')} · {selectedArea.attractiveness.toFixed(2)}</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={selectedArea.attractiveness}
                onChange={(event) => updateArea(selectedArea.id, { attractiveness: Number(event.target.value) })}
              />
            </label>
            <label>
              <span>{t('properties.heatValue')} · {selectedArea.heatValue}%</span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={selectedArea.heatValue}
                onChange={(event) => updateArea(selectedArea.id, { heatValue: Number(event.target.value) })}
              />
              <small>{t('properties.heatHint')}</small>
            </label>
          </>
        )}

        {selectedFixture && (
          <>
            <div
              className="selection-badge"
              style={{
                color: fixtureBlueprints[selectedFixture.kind].color,
                background: `${fixtureBlueprints[selectedFixture.kind].color}1a`,
              }}
            >
              {fixtureBlueprints[selectedFixture.kind].icon} {t(`fixtures.${selectedFixture.kind}`).toUpperCase()}
            </div>
            <label>
              <span>{t('properties.name')}</span>
              <input
                value={selectedFixture.name}
                placeholder={fixtureDisplayName(selectedFixture, t)}
                onChange={(event) => updateFixture(selectedFixture.id, { name: event.target.value })}
              />
              <small>{t('properties.nameHint')}</small>
            </label>
            <div className="two-columns">
              <label>
                <span>{t('properties.fixtureWidth')}</span>
                <input
                  type="number"
                  min="0.1"
                  max="20"
                  step="0.1"
                  value={selectedFixture.widthM}
                  onChange={(event) =>
                    updateFixture(selectedFixture.id, {
                      widthM: Math.max(0.1, Number(event.target.value) || 0.1),
                    })
                  }
                />
              </label>
              <label>
                <span>{t('properties.fixtureLength')}</span>
                <input
                  type="number"
                  min="0.1"
                  max="20"
                  step="0.1"
                  value={selectedFixture.lengthM}
                  onChange={(event) =>
                    updateFixture(selectedFixture.id, {
                      lengthM: Math.max(0.1, Number(event.target.value) || 0.1),
                    })
                  }
                />
              </label>
            </div>
            <label>
              <span>{t('properties.fixtureHeight')}</span>
              <input
                type="number"
                min="0.05"
                max="8"
                step="0.05"
                value={selectedFixture.heightM}
                onChange={(event) =>
                  updateFixture(selectedFixture.id, {
                    heightM: Math.max(0.05, Number(event.target.value) || 0.05),
                  })
                }
              />
            </label>
            <label>
              <span>{t('properties.rotation')} · {selectedFixture.rotationDeg}°</span>
              <input
                type="range"
                min="0"
                max="345"
                step="15"
                value={selectedFixture.rotationDeg}
                onChange={(event) =>
                  updateFixture(selectedFixture.id, { rotationDeg: Number(event.target.value) })
                }
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={selectedFixture.blocksMovement}
                onChange={(event) =>
                  updateFixture(selectedFixture.id, { blocksMovement: event.target.checked })
                }
              />
              <span>{t('properties.blocksMovement')}</span>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={selectedFixture.blocksVision}
                onChange={(event) =>
                  updateFixture(selectedFixture.id, { blocksVision: event.target.checked })
                }
              />
              <span>{t('properties.blocksVision')}</span>
            </label>
            <label>
              <span>{t('properties.attractiveness')} · {selectedFixture.attractiveness.toFixed(2)}</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={selectedFixture.attractiveness}
                onChange={(event) =>
                  updateFixture(selectedFixture.id, { attractiveness: Number(event.target.value) })
                }
              />
              <small>{t('properties.fixtureHint')}</small>
            </label>
          </>
        )}

        {selectedWall && (
          <>
            <div className="selection-badge">WALL · {selectedWall.id.slice(0, 8)}</div>
            <label>
              <span>{t('properties.thickness')}</span>
              <input
                type="number"
                min="0.05"
                max="1"
                step="0.05"
                value={selectedWall.thicknessM}
                onChange={(event) => updateWall(selectedWall.id, { thicknessM: Number(event.target.value) || 0.15 })}
              />
            </label>
            <label>
              <span>{t('properties.wallHeight')}</span>
              <input
                type="number"
                min="0.2"
                max="12"
                step="0.1"
                value={selectedWall.heightM}
                onChange={(event) =>
                  updateWall(selectedWall.id, { heightM: Math.max(0.2, Number(event.target.value) || 3) })
                }
              />
            </label>
          </>
        )}
      </section>
    </aside>
  )
}
