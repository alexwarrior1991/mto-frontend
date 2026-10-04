/**
 * Lo que exigen los formularios de mantenimiento antes de llamar: lo evidente (lo obligatorio, la
 * longitud de columna, un kp final mayor que el inicial, un número mayor que cero) y nada más. Que una
 * transición valga, que el activo siga activo o que un turno cubra la vía lo dice el servicio.
 */

const KP = /^-?\d{1,9}(\.\d{1,3})?$/
const DECIMAL = /^\d{1,13}(\.\d{1,6})?$/

/** Obligatorio y con su longitud de columna. */
export function requiredText(message, length) {
    return (value) => {
        const text = String(value ?? '').trim()
        if (!text) {
            return message
        }
        return text.length > length ? `Como mucho ${length} caracteres` : null
    }
}

export function maxLength(length) {
    return (value) => (String(value ?? '').trim().length > length ? `Como mucho ${length} caracteres` : null)
}

export function required(message) {
    return (value) => (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0) ? message : null)
}

/** Un kp: un número con punto decimal y hasta tres decimales, como lo guarda el servicio. */
export function kpValue(message) {
    return (value) => {
        const text = String(value ?? '').trim()
        if (!text) {
            return message
        }
        return KP.test(text) ? null : 'Un kp con punto decimal y hasta tres decimales, como 12847.99'
    }
}

/** Un kp opcional: vacío vale. */
export function optionalKp(value) {
    return String(value ?? '').trim() === '' ? null : kpValue('')(value)
}

/** El kp final de un tramo: mayor que el inicial, si los dos son números. */
export function kpAfter(startField, message = 'El kp final tiene que ser mayor que el inicial') {
    return (value, values) => {
        const end = String(value ?? '').trim()
        const start = String(values[startField] ?? '').trim()
        if (!end || !start || !KP.test(end) || !KP.test(start)) {
            return null
        }
        return Number(end) > Number(start) ? null : message
    }
}

/** Un entero opcional mayor que cero: los días entre dos preventivos, los minutos netos. */
export function optionalPositiveInteger(value) {
    if (value === null || value === undefined || value === '') {
        return null
    }
    return Number.isInteger(Number(value)) && Number(value) > 0 ? null : 'Tiene que ser un entero mayor que cero'
}

/** Una cantidad obligatoria y mayor que cero, con hasta seis decimales, como la guarda el servicio. */
export function positiveQuantity(value) {
    const text = String(value ?? '').trim()
    if (!text) {
        return 'La cantidad es obligatoria'
    }
    if (!DECIMAL.test(text)) {
        return text.startsWith('-') ? 'Tiene que ser mayor que cero' : 'Un número con punto decimal y hasta seis decimales, como 12.5'
    }
    return Number(text) > 0 ? null : 'Tiene que ser mayor que cero'
}

/** Una cifra del servicio como texto de un campo. */
export function toText(value) {
    return value === null || value === undefined ? '' : String(value)
}
