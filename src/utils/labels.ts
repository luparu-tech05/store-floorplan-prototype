import type { Area, Fixture } from '../types/floorplan'

type Translate = (key: string) => string

/**
 * Nombre que se muestra de un objeto o un área.
 *
 * El documento guarda un número (`labelIndex`), nunca el texto traducido.
 * Así, un plano creado con la interfaz en inglés muestra sus nombres en
 * español en cuanto se cambia el idioma. Si el usuario escribió un nombre
 * propio, ese manda y no se traduce: es suyo.
 */
export const fixtureDisplayName = (fixture: Fixture, t: Translate): string =>
  fixture.name.trim() || `${t(`fixtures.${fixture.kind}`)} ${fixture.labelIndex}`

export const areaDisplayName = (area: Area, t: Translate): string =>
  area.name.trim() || `${t('properties.areaDefaultName')} ${area.labelIndex}`

/** Siguiente número libre: max + 1, para que borrar uno no genere duplicados. */
export const nextLabelIndex = (indexes: number[]): number =>
  indexes.reduce((highest, index) => Math.max(highest, index), 0) + 1
