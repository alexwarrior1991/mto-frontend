import {CLEARED_LOV_REF, lovRef} from '../../api/configuration/masters.js'
import {describeEntry, parentOptions} from '../catalogues/catalogueRows.js'

/**
 * Lo que comparten los editores de maestros: cómo pasa cada valor del DTO al formulario y de vuelta.
 * Las cifras se escriben como texto y se validan con su forma (punto decimal, sin separador de
 * miles), igual que el KP del backoffice. El servicio comprueba lo demás.
 */

export const KP_PATTERN = /^\d+(\.\d+)?$/
// Además de 47.970, lo que también admite el campo numérico del backoffice, que es el mismo número:
// +47.970, 47. y .970.
const DECIMAL = /^\+?(\d+\.?\d*|\.\d+)$/
const SIGNED_DECIMAL = /^[-+]?(\d+\.?\d*|\.\d+)$/
const INTEGER = /^\+?\d+$/
const SIGNED_INTEGER = /^[-+]?\d+$/

export const KP_MESSAGE = 'Número con punto decimal, como 10.500'

/** Obligatorio y con su longitud de columna. */
export function requiredText(message, maxLength) {
    return (value) => {
        const text = String(value ?? '').trim()
        if (!text) {
            return message
        }
        return maxLength && text.length > maxLength ? `Como mucho ${maxLength} caracteres` : null
    }
}

export function required(message) {
    return (value) => (value === null || value === undefined || value === '' ? message : null)
}

/** Un número opcional con su forma: decimal o entero, y con signo si la medida lo admite. */
export function optionalNumber({integer = false, signed = false} = {}) {
    const pattern = integer ? (signed ? SIGNED_INTEGER : INTEGER) : (signed ? SIGNED_DECIMAL : DECIMAL)
    const message = integer
        ? `Un número entero${signed ? ', con signo si hace falta' : ''}`
        : `Un número con punto decimal${signed ? ' y signo si hace falta' : ''}, como 47.970`
    return (value) => {
        const text = String(value ?? '').trim()
        return !text || pattern.test(text) ? null : message
    }
}

/** De un número del DTO al campo de texto. */
export function toText(value) {
    return value === null || value === undefined ? '' : String(value)
}

/** Del campo de texto al DTO: vacío es null. */
export function toNumber(text) {
    const value = String(text ?? '').trim()
    return value ? Number(value) : null
}

/** Un id del DTO como valor de un desplegable (que trabaja con texto). */
export function toOption(id) {
    return id === null || id === undefined ? null : String(id)
}

/** El valor de un desplegable de vuelta a id. */
export function toId(value) {
    return value === null || value === undefined || value === '' ? null : Number(value)
}

/** Las entradas de un catálogo en un desplegable, con la que tiene la fila aunque ya no esté. */
export function lovOptions(entries, current) {
    return parentOptions(Array.isArray(entries) ? entries : [], current)
}

/** Las de un desplegable múltiple, con las que tiene la fila aunque ya no estén. */
export function lovListOptions(entries, currentList) {
    const options = lovOptions(entries, null)
    const missing = (currentList ?? [])
        .filter((current) => hasId(current) && !options.some((option) => option.value === String(current.id)))
        .map((current) => ({value: String(current.id), label: describeEntry(current)}))
    return [...missing, ...options]
}

/**
 * La referencia a catálogo que viaja de vuelta. La misma que se leyó vuelve tal cual; otra va como
 * {id, code}; y vaciar una que tenía valor es {} (README_API.md §3 de mto-configuration: en un perfil,
 * null es «no la toques»).
 */
export function lovChange(read, selected, entries) {
    if (selected === null || selected === undefined || selected === '') {
        return read ? CLEARED_LOV_REF : null
    }
    if (read && String(read.id) === String(selected)) {
        return read
    }
    const entry = (entries ?? []).find((item) => String(item.id) === String(selected))
    return lovRef(entry ?? read)
}

/** Un catálogo múltiple va entero: la lista que llega es el estado final (sectionings, anclajes...). */
export function lovListChange(readList, selected, entries) {
    return (selected ?? []).map((value) => {
        const read = (readList ?? []).find((item) => String(item.id) === String(value))
        return read ?? lovRef((entries ?? []).find((item) => String(item.id) === String(value)))
    }).filter(Boolean)
}

export function lovValue(ref) {
    return hasId(ref) ? String(ref.id) : null
}

export function lovValues(refs) {
    return (refs ?? []).filter(hasId).map((ref) => String(ref.id))
}

function hasId(ref) {
    return ref?.id !== null && ref?.id !== undefined
}

/** Una referencia a catálogo en una celda: su código. */
export function codeOf(ref) {
    return ref?.code ?? ''
}
