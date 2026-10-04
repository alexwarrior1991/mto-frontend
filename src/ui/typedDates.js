/**
 * Las fechas que se escriben en un campo (un DateInput de Mantine). La persona escribe DD/MM/YYYY, o
 * DD/MM/YYYY HH:mm si el campo lleva hora, y el campo guarda YYYY-MM-DD o YYYY-MM-DD HH:mm:ss, que es
 * lo que leen api/dates.js y el servicio. El parser es propio para no depender de los plugins de dayjs:
 * una fecha que no existe (31/02) o una hora imposible (25:00) no se leen.
 */

export const DATE_FORMAT = 'DD/MM/YYYY'

export const DATE_TIME_FORMAT = 'DD/MM/YYYY HH:mm'

const TYPED = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
const TYPED_WITH_TIME = /^(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}):(\d{2})$/

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

/** «01/02/2026 08:30» → «2026-02-01 08:30:00»; lo que no es una fecha y hora, null. */
export function parseTypedDateTime(text) {
    const match = TYPED_WITH_TIME.exec(String(text ?? '').trim())
    if (!match) {
        return null
    }
    const date = parseTypedDate(match[1])
    const hours = Number(match[2])
    const minutes = Number(match[3])
    if (date === null || hours > 23 || minutes > 59) {
        return null
    }
    return `${date} ${String(hours).padStart(2, '0')}:${match[3]}:00`
}
