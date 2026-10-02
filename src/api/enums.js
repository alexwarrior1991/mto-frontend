/**
 * Los enumerados que se leen de un servicio toleran lo desconocido (el port de ClientEnums del
 * backoffice). Un valor nuevo en el servicio se lee como UNKNOWN («Desconocido») en vez de romper la
 * pantalla, no se ofrece en los desplegables y no abre nada: una reserva UNKNOWN no es activa, un
 * trabajo en un estado UNKNOWN se da por terminado.
 *
 * parse sirve para decidir y label para pintar; el dato leido no se reescribe nunca, de modo que un
 * valor que nadie toco vuelve al servicio tal cual.
 */

export const UNKNOWN = 'UNKNOWN'
export const UNKNOWN_LABEL = 'Desconocido'

export function defineEnum(labels) {
    const values = Object.freeze(Object.keys(labels))
    const known = new Set(values)
    return Object.freeze({
        values,
        parse(value) {
            if (value === null || value === undefined) {
                return null
            }
            return known.has(value) ? value : UNKNOWN
        },
        label(value) {
            if (value === null || value === undefined) {
                return ''
            }
            return known.has(value) ? labels[value] : UNKNOWN_LABEL
        },
        isKnown(value) {
            return known.has(value)
        },
        /** Las opciones de un desplegable o un filtro: nunca «Desconocido». */
        selectable() {
            return values.map((value) => ({value, label: labels[value]}))
        },
    })
}
