import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BackgroundPlan, FloorPlanDocument } from '../types/floorplan'
import { fileToDataUrl } from '../utils/files'
import {
  detectWalls,
  WallDetectionError,
  type DetectionResult,
  type GrayImage,
} from '../utils/wallDetection'

/** La imagen se normaliza a este lado mayor: los umbrales en píxeles dependen de ello. */
const MAX_SIDE_PX = 2400
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

type Props = {
  onClose: () => void
  onConfirm: (document: FloorPlanDocument) => void
}

type Loaded = {
  file: File
  dataUrl: string
  gray: GrayImage
  /** Imagen ya escalada a MAX_SIDE_PX, reutilizada para la vista previa. */
  canvas: HTMLCanvasElement
}

type Status =
  | { kind: 'idle' }
  | { kind: 'processing' }
  | { kind: 'done'; result: DetectionResult }
  | { kind: 'error'; messageKey: string }

const parsePositive = (value: string) => {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export function WallDetectionDialog({ onClose, onConfirm }: Props) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const previewRef = useRef<HTMLCanvasElement | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [area, setArea] = useState('')
  const [usable, setUsable] = useState(false)
  const [showDims, setShowDims] = useState(false)
  const [width, setWidth] = useState('')
  const [length, setLength] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Vista previa: imagen + huella (verde) + muros detectados (rojo)
  useEffect(() => {
    const target = previewRef.current
    if (!target || !loaded) return
    const { canvas } = loaded
    target.width = canvas.width
    target.height = canvas.height
    const ctx = target.getContext('2d')!
    ctx.drawImage(canvas, 0, 0)
    if (status.kind !== 'done') return

    const { result } = status
    const pixels = ctx.getImageData(0, 0, target.width, target.height)
    for (let i = 0; i < result.footprintMask.length; i++) {
      if (!result.footprintMask[i]) continue
      const p = i * 4
      pixels.data[p] = pixels.data[p] * 0.7 + 34 * 0.3
      pixels.data[p + 1] = pixels.data[p + 1] * 0.7 + 197 * 0.3
      pixels.data[p + 2] = pixels.data[p + 2] * 0.7 + 94 * 0.3
    }
    ctx.putImageData(pixels, 0, 0)

    const scale = target.width / 1000
    ctx.strokeStyle = '#dc2626'
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(3, 4 * scale)
    for (const s of result.segmentsPx) {
      ctx.beginPath()
      ctx.moveTo(s.x1, s.y1)
      ctx.lineTo(s.x2, s.y2)
      ctx.stroke()
    }

    const box = result.footprintBox
    ctx.strokeStyle = '#2563eb'
    ctx.lineWidth = Math.max(2, 2 * scale)
    ctx.setLineDash([12 * scale, 8 * scale])
    ctx.strokeRect(box.x, box.y, box.width, box.height)
    ctx.setLineDash([])
    ctx.fillStyle = '#1d4ed8'
    ctx.font = `700 ${Math.round(22 * scale)}px Inter, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(`${result.footprintWidthM.toFixed(2)} m`, box.x + box.width / 2, Math.max(24 * scale, box.y - 10 * scale))
    ctx.save()
    ctx.translate(Math.min(target.width - 14 * scale, box.x + box.width + 26 * scale), box.y + box.height / 2)
    ctx.rotate(Math.PI / 2)
    ctx.fillText(`${result.footprintHeightM.toFixed(2)} m`, 0, 0)
    ctx.restore()
  }, [loaded, status])

  const handleFile = async (file?: File) => {
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!file) return
    if (!ALLOWED_TYPES.includes(file.type)) {
      setStatus({ kind: 'error', messageKey: 'detect.errors.imageType' })
      return
    }
    try {
      const dataUrl = await fileToDataUrl(file)
      const { gray, canvas } = await decodeImage(dataUrl)
      setLoaded({ file, dataUrl, gray, canvas })
      setStatus({ kind: 'idle' })
    } catch {
      setStatus({ kind: 'error', messageKey: 'detect.errors.imageRead' })
    }
  }

  const areaM2 = parsePositive(area)
  const widthM = showDims ? parsePositive(width) : undefined
  const lengthM = showDims ? parsePositive(length) : undefined
  const hasScale = !!areaM2 || (!!widthM && !!lengthM)

  const runDetection = () => {
    if (!loaded || !hasScale) return
    setStatus({ kind: 'processing' })
    // Deja pintar el estado "Procesando…" antes del cálculo (bloquea ~1 s).
    window.setTimeout(() => {
      try {
        const result = detectWalls(loaded.gray, { areaM2, areaIsUsable: usable, widthM, lengthM })
        setStatus({ kind: 'done', result })
      } catch (error) {
        const code = error instanceof WallDetectionError ? error.code : 'unknown'
        setStatus({ kind: 'error', messageKey: `detect.errors.${code}` })
      }
    }, 30)
  }

  const confirm = () => {
    if (!loaded || status.kind !== 'done') return
    onConfirm(buildDocument(status.result, loaded))
  }

  const result = status.kind === 'done' ? status.result : null

  return (
    <div className="detect-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="detect-dialog" role="dialog" aria-modal="true" aria-labelledby="detect-title">
        <header className="detect-header">
          <div>
            <span className="eyebrow">{t('detect.eyebrow')}</span>
            <h2 id="detect-title">{t('detect.title')}</h2>
          </div>
          <button className="detect-close" onClick={onClose} aria-label={t('detect.cancel')}>×</button>
        </header>

        <div className="detect-body">
          <div className="detect-form property-section">
            <p className="detect-intro">{t('detect.intro')}</p>

            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept={ALLOWED_TYPES.join(',')}
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <button className="detect-file" onClick={() => fileInputRef.current?.click()}>
              <strong>{loaded ? t('detect.changeImage') : t('detect.chooseImage')}</strong>
              <small>{loaded ? loaded.file.name : t('detect.imageHint')}</small>
            </button>

            <label>
              {t('detect.area')}
              <input
                type="number"
                min="1"
                step="any"
                inputMode="decimal"
                value={area}
                placeholder="185"
                onChange={(event) => setArea(event.target.value)}
              />
              <small>{t('detect.areaHint')}</small>
            </label>

            <label className="check-row">
              <input type="checkbox" checked={usable} onChange={(event) => setUsable(event.target.checked)} />
              <span>{t('detect.usable')}</span>
            </label>

            <label className="check-row">
              <input type="checkbox" checked={showDims} onChange={(event) => setShowDims(event.target.checked)} />
              <span>{t('detect.dimsToggle')}</span>
            </label>

            {showDims && (
              <>
                <div className="two-columns">
                  <label>
                    {t('detect.width')}
                    <input type="number" min="0.1" step="any" value={width} onChange={(event) => setWidth(event.target.value)} />
                  </label>
                  <label>
                    {t('detect.length')}
                    <input type="number" min="0.1" step="any" value={length} onChange={(event) => setLength(event.target.value)} />
                  </label>
                </div>
                <small className="detect-small">{t('detect.dimsHint')}</small>
              </>
            )}

            <button className="detect-run" onClick={runDetection} disabled={!loaded || !hasScale || status.kind === 'processing'}>
              {status.kind === 'processing' ? t('detect.processing') : t('detect.run')}
            </button>
            {loaded && !hasScale && <p className="detect-small">{t('detect.needScale')}</p>}

            {status.kind === 'error' && <p className="detect-message error">{t(status.messageKey)}</p>}

            {result && (
              <div className="detect-summary">
                <h3>{t('detect.resultTitle')}</h3>
                <ul>
                  <li>{t('detect.footprint', { w: result.footprintWidthM.toFixed(2), h: result.footprintHeightM.toFixed(2) })}</li>
                  <li>{t('detect.areaResult', { a: result.footprintAreaM2.toFixed(1) })}</li>
                  <li>{t('detect.walls', { count: result.walls.length })}</li>
                  <li>{t('detect.scale', { cm: (result.metersPerPixel * 100).toFixed(2) })}</li>
                </ul>
                {result.warnings.map((warning) => (
                  <p key={warning.code} className="detect-message warning">
                    {t(`detect.warnings.${warning.code}`, 'percent' in warning ? { pct: warning.percent } : {})}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="detect-preview">
            {loaded ? (
              <canvas ref={previewRef} />
            ) : (
              <div className="detect-preview-empty">{t('detect.previewEmpty')}</div>
            )}
            {result && <p className="detect-legend">{t('detect.legend')}</p>}
          </div>
        </div>

        <footer className="detect-footer">
          <button onClick={onClose}>{t('detect.cancel')}</button>
          <button className="accent" onClick={confirm} disabled={!result}>{t('detect.confirm')}</button>
        </footer>
      </section>
    </div>
  )
}

/** Decodifica la imagen, la escala a MAX_SIDE_PX y la pasa a grises. */
async function decodeImage(dataUrl: string): Promise<{ gray: GrayImage; canvas: HTMLCanvasElement }> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const factor = MAX_SIDE_PX / Math.max(img.naturalWidth, img.naturalHeight)
  const width = Math.round(img.naturalWidth * factor)
  const height = Math.round(img.naturalHeight * factor)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  // Las transparencias (PNG) se tratan como fondo blanco.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  const rgba = ctx.getImageData(0, 0, width, height).data
  const data = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    data[i] = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000
  }
  return { gray: { width, height, data }, canvas }
}

/**
 * El plano del editor ocupa exactamente la imagen (en metros), así el fondo
 * —que el lienzo dibuja con "meet" sobre widthM × heightM— queda alineado
 * con los muros detectados y el usuario puede corregirlos calcando encima.
 */
function buildDocument(result: DetectionResult, loaded: Loaded): FloorPlanDocument {
  const now = new Date().toISOString()
  const background: BackgroundPlan = {
    id: crypto.randomUUID(),
    fileName: loaded.file.name,
    mimeType: loaded.file.type,
    dataUrl: loaded.dataUrl,
    opacity: 0.4,
  }
  return {
    schemaVersion: 2,
    id: crypto.randomUUID(),
    name: loaded.file.name.replace(/\.[^.]+$/, '') || 'Store layout',
    units: 'm',
    widthM: Math.round(result.imageWidthPx * result.metersPerPixel * 100) / 100,
    heightM: Math.round(result.imageHeightPx * result.metersPerPixel * 100) / 100,
    gridSizeM: 0.5,
    createdAt: now,
    updatedAt: now,
    walls: result.walls.map((wall) => ({
      id: crypto.randomUUID(),
      start: wall.start,
      end: wall.end,
      thicknessM: wall.thicknessM,
      heightM: 3,
    })),
    areas: [],
    fixtures: [],
    openings: [],
    background,
  }
}
