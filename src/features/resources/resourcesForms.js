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
