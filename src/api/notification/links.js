/**
 * Adónde lleva el enlace de una notificación (el port de NotificationLinks del backoffice). Las reglas
 * de mto-notification ponen rutas de esta aplicación, con una barra inicial y a veces con parámetros
 * (/mantenimiento/ordenes/{id}, /actividad?category=SYSTEM, /actividad/accesos?username=...).
 *
 * - Una ruta empieza por una sola barra, sin barra invertida detrás ni caracteres de control: se
 *   navega a ella con sus parámetros, dentro de la aplicación.
 * - Un enlace http(s) absoluto se abre en otra pestaña, con noopener.
 * - Cualquier otra cosa (otro esquema, javascript:, //host) se descarta: no se abre nada.
 *
 * @returns {{path: string}|{url: string}|null}
 */
export function notificationTarget(link) {
    const text = typeof link === 'string' ? link.trim() : ''
    if (text === '' || [...text].some((character) => character.charCodeAt(0) < 0x20)) {
        return null
    }
    if (text.startsWith('/')) {
        return text.startsWith('//') || text.startsWith('/\\') ? null : {path: text}
    }
    if (/^https?:\/\//i.test(text)) {
        try {
            const url = new URL(text)
            return url.protocol === 'http:' || url.protocol === 'https:' ? {url: url.href} : null
        } catch {
            return null
        }
    }
    return null
}
