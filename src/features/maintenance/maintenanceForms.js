/**
 * Lo que exigen los formularios de mantenimiento antes de llamar: lo evidente (lo obligatorio, la
 * longitud de columna, un kp final mayor que el inicial, un número mayor que cero) y nada más. Que una
 * transición valga, que el activo siga activo o que un turno cubra la vía lo dice el servicio.
 */

// Con las cifras de la columna del servicio, y también +5, 5. y .5, que el campo numérico del
// backoffice admite y son el mismo número.
const KP = /^[-+]?(\d{1,9}(\.\d{0,3})?|\.\d{1,3})$/
const DECIMAL = /^\+?(\d{1,13}(\.\d{0,6})?|\.\d{1,6})$/

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

/**
 * Un valor medido de un checklist (la medida y lo que quedó tras el ajuste): opcional, con signo y con
 * las cifras de un kp, como lo guarda el servicio. Lo que no es un número no viaja: llegaría vacío y
 * borraría la medida guardada.
 */
export function optionalMeasure(value) {
    const text = String(value ?? '').trim()
    if (!text) {
        return null
    }
    return KP.test(text) ? null : 'Un número con punto decimal y hasta tres decimales, como 5250.5'
}

/**
 * Lo que una versión nueva de una plantilla de inspección exige antes de llamar, con las reglas del
 * servicio: el nombre, al menos un punto y cien como mucho, y de cada punto su código (con su forma y
 * sin repetir: se marca el repetido, no el primero), su texto, y un mínimo y un máximo que sean medidas
 * (con signo, 9 enteros y 3 decimales) y no estén al revés. El código no se pasa a mayúsculas solo.
 *
 * @param {{maxItems: number, codePattern: RegExp}} rules los topes del servicio (api/maintenance/catalogs.js)
 * @returns {{name: string|null, list: string|null, items: Array<object>, valid: boolean}} un objeto de
 *          errores por punto, en su orden: {code, label, minValue, maxValue}
 */
export function templateVersionErrors({name, items}, {maxItems, codePattern}) {
    const codes = new Set()
    const itemErrors = items.map((item) => {
        const code = String(item.code ?? '').trim()
        let codeError = null
        if (!code) {
            codeError = 'El código es obligatorio'
        } else if (!codePattern.test(code)) {
            codeError = "Mayúsculas sin tildes, cifras, '_', '.' y '-', sin espacios y empezando por letra o cifra"
        } else if (codes.has(code)) {
            codeError = 'Código repetido en la plantilla'
        } else {
            codes.add(code)
        }
        const errors = {
            code: codeError,
            label: String(item.label ?? '').trim() ? null : 'El texto es obligatorio',
            minValue: optionalMeasure(item.minValue),
            maxValue: optionalMeasure(item.maxValue),
        }
        const written = (value) => String(value ?? '').trim() !== ''
        if (!errors.minValue && !errors.maxValue && written(item.minValue) && written(item.maxValue)
            && Number(item.minValue) > Number(item.maxValue)) {
            errors.minValue = 'El mínimo no puede ser mayor que el máximo'
        }
        return errors
    })
    const nameError = String(name ?? '').trim() ? null : 'El nombre es obligatorio'
    const list = items.length === 0 ? 'Una plantilla lleva al menos un punto' : items.length > maxItems ? `Como mucho ${maxItems} puntos` : null
    const valid = !nameError && !list && itemErrors.every((errors) => Object.values(errors).every((error) => !error))
    return {name: nameError, list, items: itemErrors, valid}
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

/** El kp final de un defecto: puede ser el inicial (un defecto en un punto), nunca menor. */
export function kpNotBefore(startField, message = 'El KP final no puede ser menor que el inicial') {
    return (value, values) => {
        const end = String(value ?? '').trim()
        const start = String(values[startField] ?? '').trim()
        if (!end || !start || !KP.test(end) || !KP.test(start)) {
            return null
        }
        return Number(end) >= Number(start) ? null : message
    }
}

/** Un entero opcional mayor que cero: los días entre dos preventivos, los minutos netos. */
export function optionalPositiveInteger(value) {
    if (value === null || value === undefined || value === '') {
        return null
    }
    return Number.isInteger(Number(value)) && Number(value) > 0 ? null : 'Tiene que ser un entero mayor que cero'
}

/** Un entero opcional que puede ser cero: los minutos netos de un turno. */
export function optionalNonNegativeInteger(value) {
    const text = String(value ?? '').trim()
    if (!text) {
        return null
    }
    return /^\d+$/.test(text) ? null : 'Tiene que ser un entero, cero o más'
}

/** Una fecha y hora posterior a la de otro campo, si están las dos (YYYY-MM-DD HH:mm:ss se compara como texto). */
export function dateTimeAfter(startField, message) {
    return (value, values) => {
        const start = values[startField]
        return !value || !start || value > start ? null : message
    }
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

/** Una cantidad obligatoria que puede ser cero (lo previsto y lo consumido de una línea de material). */
export function nonNegativeQuantity(message) {
    return (value) => {
        const text = String(value ?? '').trim()
        if (!text) {
            return message
        }
        if (!DECIMAL.test(text)) {
            return text.startsWith('-') ? 'No puede ser negativo' : 'Un número con punto decimal y hasta seis decimales, como 12.5'
        }
        return null
    }
}

/** Una cifra del servicio como texto de un campo. */
export function toText(value) {
    return value === null || value === undefined ? '' : String(value)
}
