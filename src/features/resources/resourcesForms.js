/**
 * Lo que exigen los formularios de recursos antes de llamar: lo evidente (lo obligatorio, la longitud
 * de columna, la empresa de una subcontrata) y nada más. Que un usuario no se repita o que una
 * categoría siga valiendo para lo que la persona dirige lo dice el servicio.
 */

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

export const PERSON_LENGTHS = Object.freeze({
    firstName: 100, lastName: 150, company: 150, employeeNumber: 40, username: 100, phone: 40,
})

/** Una persona de subcontrata dice su empresa. */
export function companyOfSubcontractor(value, values) {
    if (values.employer !== 'SUBCONTRACTOR') {
        return null
    }
    const text = String(value ?? '').trim()
    if (!text) {
        return 'Una persona de subcontrata dice su empresa'
    }
    return text.length > PERSON_LENGTHS.company ? `Como mucho ${PERSON_LENGTHS.company} caracteres` : null
}

export const UNIT_LENGTHS = Object.freeze({code: 16, name: 120})

export const VEHICLE_TYPE_LENGTHS = Object.freeze({code: 32, name: 150, make: 100})
export const PARKING_SITE_LENGTHS = Object.freeze({code: 32, name: 150, address: 255})

/**
 * Una cifra opcional de la flota con la columna del servicio (@Digits): nunca negativa, con sus
 * cifras enteras y sus decimales; con decimals 0, un entero con su mínimo. Lo que no es un número no
 * viaja: llegaría vacío y borraría la cifra guardada. Valen también +5, 5. y .5.
 */
export function optionalFigure({integers, decimals, min = 0}) {
    return (value) => {
        const text = String(value ?? '').trim()
        if (!text) {
            return null
        }
        if (decimals === 0) {
            if (!/^\+?\d+$/.test(text)) {
                return 'Un número entero, sin decimales'
            }
            return Number(text) < min ? (min > 0 ? `Como mínimo ${min}` : 'No puede ser negativo') : null
        }
        if (/^-/.test(text)) {
            return 'No puede ser negativo'
        }
        const match = /^\+?(\d*)(?:\.(\d*))?$/.exec(text)
        if (!match || (match[1] === '' && !match[2])) {
            return 'No es un número: escríbelo con cifras, como 12.5'
        }
        const digits = match[1].replace(/^0+/, '')
        if ((match[2] ?? '').length > decimals) {
            return `Como mucho ${decimals} decimales`
        }
        return digits.length > integers ? `Como mucho ${integers} cifras enteras` : null
    }
}

/** Un kp opcional de la flota: con signo, 9 enteros y 3 decimales, como el de mantenimiento. */
export function optionalFleetKp(value) {
    const text = String(value ?? '').trim()
    if (!text) {
        return null
    }
    return /^[-+]?(\d{1,9}(\.\d{0,3})?|\.\d{1,3})$/.test(text) ? null : 'Un kp con punto decimal y hasta tres decimales, como 12847.99'
}

/** Una coordenada opcional dentro de su rango (±90 la latitud, ±180 la longitud), con hasta seis decimales. */
export function optionalCoordinate(limit) {
    return (value) => {
        const text = String(value ?? '').trim()
        if (!text) {
            return null
        }
        if (!/^[-+]?(\d{1,3}(\.\d{0,6})?|\.\d{1,6})$/.test(text)) {
            return 'Un número con punto decimal y hasta seis decimales'
        }
        return Math.abs(Number(text)) <= limit ? null : `Entre -${limit} y ${limit}`
    }
}

export const QUALIFICATION_TYPE_LENGTHS = Object.freeze({code: 32, name: 120, description: 500})
export const INSTRUMENT_LENGTHS = Object.freeze({code: 32, name: 120, serialNumber: 60, notes: 500})
/** Una cualificación de una persona y un documento de un vehículo: su referencia y sus notas. */
export const EXPIRY_LENGTHS = Object.freeze({reference: 60, notes: 500})

/**
 * Una fecha (YYYY-MM-DD) que no puede ser anterior a otra del formulario: la caducidad, a la expedición
 * o a la calibración. Si falta alguna, nada que comparar; lo demás lo dice el servicio (400 VAL-001).
 */
export function dateNotBefore(startField, message) {
    return (value, values) => {
        const start = values[startField]
        return !value || !start || value >= start ? null : message
    }
}
