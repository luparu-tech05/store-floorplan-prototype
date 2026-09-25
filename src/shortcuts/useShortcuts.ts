import { useEffect, useRef } from 'react'
import { PAN_KEY_CODE, isTypingTarget, matchShortcut } from './keymap'
import type { ShortcutAction } from './keymap'

export type ShortcutHandlers = Record<ShortcutAction, () => void> & {
  /** Se llama al pulsar y al soltar la tecla de paneo temporal. */
  onPanKeyChange: (held: boolean) => void
}

/**
 * Conecta los atajos del teclado a las acciones del editor.
 *
 * Los manejadores viajan en una ref para que el listener se registre UNA vez
 * en toda la vida del componente. Si dependiera de ellos, cada cambio de
 * selección volvería a suscribir y desuscribir el evento.
 */
export function useShortcuts(handlers: ShortcutHandlers) {
  const latest = useRef(handlers)
  latest.current = handlers

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return

      if (event.code === PAN_KEY_CODE) {
        // Sin esto la barra espaciadora hace scroll de la página.
        event.preventDefault()
        if (!event.repeat) latest.current.onPanKeyChange(true)
        return
      }

      const binding = matchShortcut(event)
      if (!binding) return

      event.preventDefault()
      latest.current[binding.action]()
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === PAN_KEY_CODE) latest.current.onPanKeyChange(false)
    }

    // Si la ventana pierde el foco con la tecla pulsada nunca llega el keyup,
    // y el editor se quedaría paneando para siempre.
    const handleBlur = () => latest.current.onPanKeyChange(false)

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])
}
