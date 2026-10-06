import type { FloorPlanDocument } from '../types/floorplan'

export const downloadJson = (document: FloorPlanDocument) => {
  const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = `${slugify(document.name || 'store-floorplan')}.floorplan.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export const readJsonFile = async (file: File): Promise<FloorPlanDocument> => {
  const text = await file.text()
  type ImportedDocument = Omit<Partial<FloorPlanDocument>, 'schemaVersion'> & { schemaVersion?: number }
  const value = JSON.parse(text) as ImportedDocument

  // v1 = editor 2D original. v2 = alturas necesarias para la vista 3D.
  // La normalización final vive en el store, donde se completan los defaults.
  if (
    (value.schemaVersion !== 1 && value.schemaVersion !== 2) ||
    !Array.isArray(value.walls) ||
    !Array.isArray(value.areas) ||
    typeof value.widthM !== 'number' ||
    typeof value.heightM !== 'number'
  ) {
    throw new Error('INVALID_PROJECT')
  }

  return { ...value, fixtures: value.fixtures ?? [] } as FloorPlanDocument
}

export const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
