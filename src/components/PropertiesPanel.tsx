import { useTranslation } from 'react-i18next'
import { useFloorPlanStore } from '../store/useFloorPlanStore'
import type { AreaCategory } from '../types/floorplan'

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
  const updateBackgroundOpacity = useFloorPlanStore((state) => state.updateBackgroundOpacity)
  const removeBackground = useFloorPlanStore((state) => state.removeBackground)

  const selectedArea = selection?.type === 'area'
    ? document.areas.find((area) => area.id === selection.id)
    : undefined

  const selectedWall = selection?.type === 'wall'
    ? document.walls.find((wall) => wall.id === selection.id)
    : undefined

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
        {!selectedArea && !selectedWall && (
          <p className="empty-properties">{t('properties.noSelection')}</p>
        )}

        {selectedArea && (
          <>
            <div className="selection-badge">AREA · {selectedArea.id.slice(0, 8)}</div>
            <label>
              <span>{t('properties.name')}</span>
              <input
                value={selectedArea.name}
                onChange={(event) => updateArea(selectedArea.id, { name: event.target.value })}
              />
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
          </>
        )}
      </section>
    </aside>
  )
}
