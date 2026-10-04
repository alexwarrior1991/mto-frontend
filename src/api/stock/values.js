import {prefixOf} from '../services.js'

/**
 * Lo que comparten los módulos de mto-stock: su prefijo, cómo se nombra una referencia (el port de
 * StockLabels del backoffice) y cómo viajan una cantidad y un texto opcional.
 */

export function stockPath(...segments) {
    return [prefixOf('mto-stock'), ...segments.map((segment) => encodeURIComponent(segment))].join('/')
}

/** El código y, si lo hay, el nombre: «MAT-001 - Hilo de contacto». */
export function codeAndName(code, name) {
    const hasCode = typeof code === 'string' && code.trim() !== ''
    const hasName = typeof name === 'string' && name.trim() !== ''
    if (!hasName) {
        return hasCode ? code : ''
    }
    return hasCode ? `${code} - ${name}` : name
}

/** Cómo se nombra una referencia que llega dentro de otra cosa (el material de un apunte, el almacén de una reserva). */
export function referenceLabel(reference) {
    return reference ? codeAndName(reference.code, reference.name) : ''
}

/** Lo que de una entrada de catálogo viaja dentro de otra cosa: id, código, nombre, unidad (si la tiene) y si está activa. */
export function summaryOf(entry) {
    if (!entry) {
        return null
    }
    const summary = {id: entry.id, code: entry.code, name: entry.name, active: entry.active}
    return entry.unitOfMeasure === undefined ? summary : {...summary, unitOfMeasure: entry.unitOfMeasure}
}

/**
 * Una cantidad escrita (texto con punto decimal) como el número que espera el servicio. Los decimales
 * del servicio son seis y las cifras del almacén caben de sobra en un número de JavaScript.
 */
export function toQuantity(value) {
    if (value === null || value === undefined || String(value).trim() === '') {
        return null
    }
    return Number(String(value).trim())
}

/** Un texto opcional: en blanco es null, porque una referencia externa en blanco es un 500 del servicio. */
export function textOrNull(value) {
    const text = typeof value === 'string' ? value.trim() : ''
    return text === '' ? null : text
}

/** El cuerpo sin lo que no se dice: lo vacío no viaja, como el NON_NULL del backoffice. */
export function withoutNulls(body) {
    return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== null && value !== undefined))
}
