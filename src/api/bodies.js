/**
 * Cómo viajan los cuerpos de las peticiones, en todos los servicios: lo vacío no viaja (el NON_NULL
 * del backoffice) y un texto opcional en blanco es null, recortado si no. mto-stock responde 500 a una
 * referencia externa en blanco, y mto-maintenance guarda los textos tal cual llegan: un «jdoe » no lo
 * encontraría nunca el filtro exacto de assignedUser.
 */

import {exactDecimal} from './decimals.js'

/** Un texto opcional: en blanco es null, y si no, recortado. */
export function textOrNull(value) {
    const text = typeof value === 'string' ? value.trim() : ''
    return text === '' ? null : text
}

/** El cuerpo sin lo que no se dice: lo vacío no viaja. */
export function withoutNulls(body) {
    return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== null && value !== undefined))
}

/**
 * Un número escrito (texto con punto decimal, o el número de un NumberInput) como el número que espera
 * el servicio; vacío, null. Vale para lo que cabe en un número de JavaScript: un kp o una medida
 * (numeric(12,3), 12 cifras), unas coordenadas, un entero. Una cantidad (numeric(19,6)) no cabe: va
 * con decimalOrNull.
 */
export function numberOrNull(value) {
    if (value === null || value === undefined || String(value).trim() === '') {
        return null
    }
    return Number(String(value).trim())
}

/**
 * Una cantidad escrita (numeric(19,6): 13 enteros y 6 decimales) sin pasar por coma flotante; vacía,
 * null. Viaja como número JSON si cabe exacta en un Number y, si no, como su texto, que el servicio lee
 * cifra a cifra (decimals.js). Lo que no es un decimal es un error: el formulario lo comprueba antes.
 */
export function decimalOrNull(value) {
    if (value === null || value === undefined || String(value).trim() === '') {
        return null
    }
    return exactDecimal(value)
}

/** Un id numérico de mto-configuration (una vía, una estación, un paquete) que llega de un desplegable como texto. */
export function idOrNull(value) {
    return value === null || value === undefined || value === '' ? null : Number(value)
}
