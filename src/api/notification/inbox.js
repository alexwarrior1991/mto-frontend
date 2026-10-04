import {endOfDayInstant, startOfDayInstant} from '../dates.js'
import {apiFetch} from '../http.js'
import {sortWithTieBreak, toPage, toPageParams} from '../paging.js'
import {notificationPath} from './values.js'

/**
 * Mi bandeja: el port de la parte de bandeja de NotificationClient del backoffice.
 *
 * - A quién va cada notificación lo resuelve el servicio al leer, con el token (usuario, perfiles y
 *   roles de cliente): la bandeja es siempre la de quien llama, y aquí no se filtra por nadie.
 * - El estado de lectura es de cada persona y el servicio no ordena por él. Ordena por createdAt,
 *   severity, category y title, y ninguno es único: createdAt desempata (el id no se admite, 400).
 * - Marcar una que no es mía es 404 NTF-404 (el id no dice si existe), y «marcar todas» va hasta la más
 *   reciente visible, no hasta ahora.
 * - El contador está acotado: con capped, count es «ese o más», no un total.
 */

/** El tamaño de página por defecto del servicio; su tope es 100. */
export const INBOX_PAGE_SIZE = 20

/** Sin columna elegida, la más reciente primero; y siempre desempata. */
export const BY_CREATED_DESC = 'createdAt,desc'

/**
 * Una página de mi bandeja con sus filtros; lo vacío no viaja. unread solo viaja verdadero (sin él,
 * leídas y no leídas). Las fechas son días enteros en la zona del navegador. La página empieza en 1.
 */
export async function searchInbox({
    unread = false, category = null, severity = null, from = null, to = null, page = 1, size = INBOX_PAGE_SIZE, sort = null,
} = {}, {signal} = {}) {
    const body = await apiFetch(notificationPath('inbox'), {
        query: {
            unread: unread === true ? true : null,
            category, severity,
            from: from ? startOfDayInstant(from) : null,
            to: to ? endOfDayInstant(to) : null,
            ...toPageParams({page, size}), sort: sortWithTieBreak(sort, BY_CREATED_DESC, BY_CREATED_DESC),
        },
        signal,
    })
    return toPage(body)
}

/** El contador de la campana: {count, capped}. */
export function unreadCount({signal} = {}) {
    return apiFetch(notificationPath('inbox', 'unread-count'), {signal})
}

/** Marca una como leída (POST sin cuerpo) y la devuelve; 404 NTF-404 si no va dirigida a mí. */
export function markRead(id) {
    return apiFetch(notificationPath('inbox', id, 'read'), {method: 'POST'})
}

/** Marca como leído todo lo visible (POST sin cuerpo); devuelve {allReadUntil}, hasta dónde quedó leído. */
export function markAllRead() {
    return apiFetch(notificationPath('inbox', 'read-all'), {method: 'POST'})
}

/** El número de la campana: «100+» si está acotado. */
export function unreadCountText(count) {
    if (!count) {
        return ''
    }
    return `${count.count ?? 0}${count.capped ? '+' : ''}`
}
