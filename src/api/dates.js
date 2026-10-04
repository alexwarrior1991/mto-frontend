/**
 * Las fechas viajan en la query como texto, nunca como Date (http.js lo rechaza):
 * - LocalDate como YYYY-MM-DD (sin el, el servicio responde 400);
 * - YearMonth como YYYY-MM;
 * - Instant en ISO, en UTC (URLSearchParams codifica los dos puntos).
 *
 * Un filtro «desde/hasta» por dias cubre los dos extremos enteros, en la zona del navegador: desde el
 * comienzo del primer dia hasta el ultimo milisegundo del ultimo, como hacia el backoffice.
 */

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const YEAR_MONTH = /^(\d{4})-(\d{2})$/
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/

export function toLocalDateParam(value) {
    if (isEmpty(value)) {
        return undefined
    }
    if (typeof value === 'string' && LOCAL_DATE.test(value)) {
        return value
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
    }
    throw new Error(`Fecha no valida: ${value}`)
}

export function toYearMonthParam(value) {
    if (isEmpty(value)) {
        return undefined
    }
    if (typeof value === 'string' && YEAR_MONTH.test(value)) {
        return value
    }
    return toLocalDateParam(value).slice(0, 7)
}

export function toInstantParam(value) {
    if (isEmpty(value)) {
        return undefined
    }
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) {
        throw new Error(`Instante no valido: ${value}`)
    }
    return date.toISOString()
}

/**
 * Una fecha y hora escritas (YYYY-MM-DD HH:mm[:ss], como las deja un DateInput con hora) en la zona
 * del navegador, como Instant: cuándo ocurrió un movimiento o se hizo una reserva. Vacía no viaja, y
 * el servicio pone ahora.
 */
export function localDateTimeToInstant(value) {
    if (isEmpty(value)) {
        return undefined
    }
    const match = LOCAL_DATE_TIME.exec(String(value).trim())
    if (!match) {
        throw new Error(`Fecha y hora no validas: ${value}`)
    }
    const [year, month, day, hours, minutes, seconds] = match.slice(1).map((part) => Number(part ?? 0))
    const date = new Date(year, month - 1, day, hours, minutes, seconds)
    if (date.getMonth() !== month - 1 || date.getDate() !== day || hours > 23 || minutes > 59 || seconds > 59) {
        throw new Error(`Fecha y hora no validas: ${value}`)
    }
    return date.toISOString()
}

/** El comienzo de un dia (YYYY-MM-DD) en la zona del navegador, como Instant: el «desde» de un filtro. */
export function startOfDayInstant(localDate) {
    const [year, month, day] = parts(localDate)
    return new Date(year, month - 1, day).toISOString()
}

/** El ultimo milisegundo de un dia (YYYY-MM-DD), como Instant: el «hasta» inclusivo de un filtro. */
export function endOfDayInstant(localDate) {
    const [year, month, day] = parts(localDate)
    return new Date(new Date(year, month - 1, day + 1).getTime() - 1).toISOString()
}

function parts(localDate) {
    const match = LOCAL_DATE.exec(toLocalDateParam(localDate) ?? '')
    if (!match) {
        throw new Error(`Fecha no valida: ${localDate}`)
    }
    return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function isEmpty(value) {
    return value === null || value === undefined || value === ''
}

function pad(value) {
    return String(value).padStart(2, '0')
}
