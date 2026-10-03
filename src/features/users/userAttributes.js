/**
 * Los atributos de un usuario como texto, una línea clave=valor por valor (el port de UserAttributes
 * del backoffice). Es lo que el editor enseña y lee.
 *
 * - Una clave repetida acumula valores: «turno=noche» y «turno=tarde» son turno: [noche, tarde].
 * - Las líneas en blanco no cuentan, pero sí el número de línea de un error.
 * - El valor es lo que hay tras el primer «=», así que puede llevar más «=» y puede ir vacío.
 */

// Lo mismo que \R en Java: cualquier salto de línea.
const LINE_BREAK = /\r\n|[\n\v\f\r\u0085\u2028\u2029]/

/**
 * Lee el texto del editor.
 *
 * @returns {{value: Object<string, string[]>|null, error: string|null}} el mapa, o el error de la
 *          primera línea que no se entiende
 */
export function readAttributes(text) {
    const attributes = new Map()
    const lines = String(text ?? '').split(LINE_BREAK)
    for (const [index, raw] of lines.entries()) {
        const line = raw.trim()
        if (!line) {
            continue
        }
        const separator = line.indexOf('=')
        const key = separator < 0 ? '' : line.slice(0, separator).trim()
        if (!key) {
            return {value: null, error: `Línea ${index + 1}: se esperaba clave=valor`}
        }
        const values = attributes.get(key) ?? []
        values.push(line.slice(separator + 1).trim())
        attributes.set(key, values)
    }
    return {value: Object.fromEntries(attributes), error: null}
}

/** El texto del editor, con las claves en orden para que sea el mismo cada vez que se abre. */
export function formatAttributes(attributes) {
    const lines = []
    for (const key of Object.keys(attributes ?? {}).sort()) {
        const values = Array.isArray(attributes[key]) && attributes[key].length > 0 ? attributes[key] : ['']
        for (const value of values) {
            lines.push(`${key}=${value ?? ''}`)
        }
    }
    return lines.join('\n')
}
