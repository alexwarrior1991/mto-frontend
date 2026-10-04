/**
 * Lo que exigen los formularios del almacén antes de llamar: lo evidente (lo obligatorio, la longitud
 * de columna, una cantidad mayor que cero) y nada más. Que haya stock, que lo elegido siga activo o que
 * una reserva siga activa lo dice el servicio.
 *
 * Las cantidades se escriben como texto, con punto decimal y como mucho seis decimales, que es lo que
 * guarda el servicio (numeric(19,6)).
 */

export const CODE_MAX_LENGTH = 64
export const NAME_MAX_LENGTH = 255
export const UNIT_MAX_LENGTH = 32
export const REFERENCE_MAX_LENGTH = 128

const DECIMAL = /^\d{1,13}(\.\d{1,6})?$/
const DECIMAL_MESSAGE = 'Un número con punto decimal y hasta seis decimales, como 12.5'

/** Obligatorio y con su longitud de columna. */
export function requiredText(message, maxLength) {
    return (value) => {
        const text = String(value ?? '').trim()
        if (!text) {
            return message
        }
        return text.length > maxLength ? `Como mucho ${maxLength} caracteres` : null
    }
}

export function maxLength(length) {
    return (value) => (String(value ?? '').trim().length > length ? `Como mucho ${length} caracteres` : null)
}

export function required(message) {
    return (value) => (value === null || value === undefined || value === '' ? message : null)
}

/** Una cantidad de un movimiento, una reserva o una línea de material: obligatoria y mayor que cero. */
export function positiveQuantity(value) {
    const text = String(value ?? '').trim()
    if (!text) {
        return 'La cantidad es obligatoria'
    }
    if (!DECIMAL.test(text)) {
        return text.startsWith('-') ? 'Tiene que ser mayor que cero' : DECIMAL_MESSAGE
    }
    return Number(text) > 0 ? null : 'Tiene que ser mayor que cero'
}

/** El stock mínimo de un material: obligatorio, y cero o más. */
export function minimumStock(value) {
    const text = String(value ?? '').trim()
    if (!text) {
        return 'El stock mínimo es obligatorio'
    }
    if (text.startsWith('-')) {
        return 'No puede ser negativo'
    }
    return DECIMAL.test(text) ? null : DECIMAL_MESSAGE
}

/** Una cifra del servicio como texto de un campo. */
export function toQuantityText(value) {
    return value === null || value === undefined ? '' : String(value)
}
