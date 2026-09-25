import type { Tool } from '../types/floorplan'

/**
 * Qué significa un botón pulsado sobre el lienzo.
 *
 * Vive aparte del componente porque es una decisión pura —entra un evento,
 * sale una intención— y porque aquí es donde se resuelve el conflicto entre
 * seleccionar y mover la vista, que conviene poder leer de un vistazo.
 */
export type PointerGesture = 'pan' | 'placeFixture' | 'marquee' | 'draw' | 'ignore'

export type PointerGestureInput = {
  tool: Tool
  /** event.button: 0 izquierdo, 1 central. */
  button: number
  altKey: boolean
  panKeyHeld: boolean
  hasPendingFixture: boolean
}

export const resolvePointerGesture = ({
  tool,
  button,
  altKey,
  panKeyHeld,
  hasPendingFixture,
}: PointerGestureInput): PointerGesture => {
  const leftButton = button === 0
  const middleButton = button === 1
  if (!leftButton && !middleButton) return 'ignore'

  // El paneo gana siempre: botón central, Alt, barra espaciadora o la propia
  // herramienta Mover vista. El izquierdo solo, sin modificador, NO panea,
  // porque ese gesto dibuja el rectángulo de selección.
  if (middleButton || altKey || panKeyHeld || tool === 'pan') return 'pan'

  if (tool === 'select') return hasPendingFixture ? 'placeFixture' : 'marquee'

  return 'draw'
}

/**
 * ¿Un clic sobre un elemento debe seleccionarlo o arrastrarlo?
 * No, si ese clic en realidad iba a mover la vista o a dibujar.
 */
export const isSelectionPointer = (
  input: Pick<PointerGestureInput, 'tool' | 'button' | 'altKey' | 'panKeyHeld'>,
) =>
  input.button === 0 &&
  input.tool === 'select' &&
  !input.altKey &&
  !input.panKeyHeld
