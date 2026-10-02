/**
 * Cada llamada lleva un X-Correlation-Id nuevo. El gateway lo acepta si casa con [A-Za-z0-9._-] y no
 * pasa de 64 caracteres, lo propaga al servicio y lo devuelve en la respuesta: es la «Referencia» que
 * ensenan los avisos de error, y con ella se encuentra la llamada en los logs.
 */
export const CORRELATION_HEADER = 'X-Correlation-Id'

export function newCorrelationId() {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    // Fuera de un contexto seguro (http que no es localhost) no hay randomUUID: un UUID v4 hecho a
    // mano con getRandomValues vale igual.
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
