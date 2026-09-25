/**
 * Tabla de atajos de teclado del editor.
 *
 * Está declarada como datos, no repartida en `if`s dentro del lienzo, para que
 * añadir un atajo sea añadir una fila y para poder listarlos en pantalla más
 * adelante sin duplicar la información.
 */
export type ShortcutAction =
  | 'cancel'
  | 'commitArea'
  | 'deleteSelection'
  | 'selectAll'
  | 'undo'
  | 'redo'

export type ShortcutBinding = {
  action: ShortcutAction
  /** Cómo se escribe el atajo en la ayuda. No se traduce: son teclas. */
  label: string
  /** Teclas que lo disparan, comparadas contra `event.key` en minúsculas. */
  keys: string[]
  /** Ctrl en Windows y Linux, Cmd en Mac. */
  mod?: boolean
  /** true = exige Shift; false = exige que NO esté; sin definir = da igual. */
  shift?: boolean
}

export const keymap: ShortcutBinding[] = [
  { action: 'cancel', label: 'Esc', keys: ['escape'] },
  { action: 'commitArea', label: 'Enter', keys: ['enter'] },
  { action: 'deleteSelection', label: 'Supr · ⌫', keys: ['delete', 'backspace'] },
  { action: 'selectAll', label: 'Ctrl + A', keys: ['a'], mod: true },
  // El redo va ANTES que el undo: Ctrl+Shift+Z cumple las dos reglas y gana
  // la primera que coincide.
  { action: 'redo', label: 'Ctrl + Shift + Z', keys: ['z'], mod: true, shift: true },
  { action: 'redo', label: 'Ctrl + Y', keys: ['y'], mod: true },
  { action: 'undo', label: 'Ctrl + Z', keys: ['z'], mod: true, shift: false },
]

/** Tecla física que activa el paneo temporal mientras se mantiene pulsada. */
export const PAN_KEY_CODE = 'Space'

/** El usuario está escribiendo: los atajos no deben robarle las teclas. */
export const isTypingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null
  if (!element) return false
  if (element.isContentEditable) return true
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)
}

export const matchShortcut = (event: KeyboardEvent): ShortcutBinding | undefined => {
  const key = event.key.toLowerCase()
  const mod = event.ctrlKey || event.metaKey

  return keymap.find((binding) => {
    if (!binding.keys.includes(key)) return false
    if (Boolean(binding.mod) !== mod) return false
    if (binding.shift !== undefined && binding.shift !== event.shiftKey) return false
    return true
  })
}
