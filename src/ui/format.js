/**
 * Como se pintan las cifras y las fechas (el port de Formats del backoffice).
 *
 * - Cantidades y KP: sin ceros de mas y con punto decimal, sin separador de miles (12.500 es 12.5).
 * - Fecha y hora: DD/MM/YYYY HH:mm en la zona del navegador.
 * - Fecha (un LocalDate del servicio): DD/MM/YYYY, sin pasar por ninguna zona.
 * - Porcentaje: el servicio manda una fraccion (0.4500) y aqui solo se multiplica por cien.
 */

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function formatQuantity(value) {
    if (value === null || value === undefined || value === '') {
        return ''
    }
    const text = typeof value === 'number'
        ? value.toLocaleString('en-US', {useGrouping: false, maximumFractionDigits: 20})
        : String(value).trim()
    if (!/^-?\d+(\.\d+)?$/.test(text)) {
        return text
    }
    const stripped = text.includes('.') ? text.replace(/\.?0+$/, '') : text
    return stripped === '-0' ? '0' : stripped
}

export function formatDateTime(value) {
    const date = toDate(value)
    if (!date) {
        return ''
    }
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatDate(value) {
    if (typeof value === 'string') {
        const match = LOCAL_DATE.exec(value)
        if (match) {
            return `${match[3]}/${match[2]}/${match[1]}`
        }
    }
    const date = toDate(value)
    if (!date) {
        return ''
    }
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

export function formatPercent(ratio) {
    if (ratio === null || ratio === undefined || ratio === '') {
        return ''
    }
    const number = Number(ratio)
    if (!Number.isFinite(number)) {
        return ''
    }
    // Redondear a dos decimales evita el 45.00000000000001 de la coma flotante.
    return `${Math.round(number * 10000) / 100} %`
}

function toDate(value) {
    if (value === null || value === undefined || value === '') {
        return null
    }
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
}

function pad(value) {
    return String(value).padStart(2, '0')
}
