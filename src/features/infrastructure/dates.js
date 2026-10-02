/**
 * Las fechas de un editor: el servicio manda y recibe un LocalDate (YYYY-MM-DD) y la persona escribe
 * DD/MM/YYYY. El parser es propio para no depender de los plugins de dayjs: una fecha que no existe
 * (31/02) no se lee.
 */

export const DATE_FORMAT = 'DD/MM/YYYY'

const TYPED = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

/** «01/02/2026» → «2026-02-01»; lo que no es una fecha, null. */
export function parseTypedDate(text) {
    const match = TYPED.exec(String(text ?? '').trim())
    if (!match) {
        return null
    }
    const [, day, month, year] = match.map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        return null
    }
    return `${match[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
