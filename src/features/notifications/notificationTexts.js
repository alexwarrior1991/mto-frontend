import {ACCESS_OUTCOME, ACTIVITY_CATEGORY, ACTIVITY_SEVERITY} from '../../api/notification/enums.js'
import {unreadCountText} from '../../api/notification/inbox.js'
import {actorText, subjectText} from '../../api/notification/values.js'
import {formatDateTime} from '../../ui/format.js'

/** Un recuento con su nombre, en singular si es uno: «1 evento», «12 eventos». */
export function countText(total, singular, plural) {
    return `${total} ${total === 1 ? singular : plural}`
}

/** Cuántas hay en la bandeja: «2 sin leer» con «Solo no leídas», «2 notificaciones» sin él. */
export function inboxCountText(total, unreadOnly) {
    return unreadOnly ? `${total} sin leer` : countText(total, 'notificación', 'notificaciones')
}

/** El nombre de la campana, que dice también cuántas hay sin leer: «Notificaciones: 100+ sin leer». */
export function bellLabel(count) {
    if (!count) {
        return 'Notificaciones'
    }
    return count.count > 0 ? `Notificaciones: ${unreadCountText(count)} sin leer` : 'Notificaciones: nada sin leer'
}

/** Las veces que se repitió lo que agrupa una línea (una ráfaga, una racha): «x12645»; una sola, nada. */
export function eventCountText(count) {
    return count > 1 ? `x${count}` : ''
}

/** Un valor del payload como texto: tal cual si lo es, y en JSON si no (una lista, un objeto, un número). */
export function payloadValueText(value) {
    if (value === null || value === undefined) {
        return ''
    }
    return typeof value === 'string' ? value : JSON.stringify(value)
}

/** El payload clave a clave, en orden de clave: lo que la fuente publicó y dejó pasar el servicio. */
export function payloadEntries(payload) {
    const entries = payload && typeof payload === 'object' ? payload : {}
    return Object.keys(entries).sort().map((key) => ({key, value: payloadValueText(entries[key])}))
}

/** La cabecera de una línea del registro en su detalle, sin lo que viene vacío. */
export function activityFields(event) {
    return present([
        ['Tipo', event.type],
        ['Categoría', ACTIVITY_CATEGORY.label(event.category)],
        ['Gravedad', ACTIVITY_SEVERITY.label(event.severity)],
        ['Cuándo', formatDateTime(event.occurredAt)],
        ['Registrado', formatDateTime(event.recordedAt)],
        ['Quién', actorText(event.actor, {withKind: true})],
        ['Sobre qué', subjectText(event.subject)],
        ['Origen', event.sourceService],
        ['Evento de origen', event.sourceEventId],
        ['Eventos agrupados', event.eventCount > 1 ? event.eventCount : null],
        ['Correlación', event.correlationId],
        ['Fundida en', event.supersededBy],
        ['Id', event.id],
    ])
}

/** La cabecera de un acceso en su detalle, sin lo que viene vacío. */
export function accessFields(event) {
    return present([
        ['Tipo', event.type],
        ['Resultado', ACCESS_OUTCOME.label(event.outcome)],
        ['Gravedad', ACTIVITY_SEVERITY.label(event.severity)],
        ['Cuándo', formatDateTime(event.occurredAt)],
        ['Registrado', formatDateTime(event.recordedAt)],
        ['Usuario', event.username],
        ['Id de usuario', event.userId],
        ['IP', event.ipAddress],
        ['Eventos agrupados', event.eventCount > 1 ? event.eventCount : null],
        ['Correlación', event.correlationId],
        ['Id', event.id],
    ])
}

function present(fields) {
    return fields
        .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
        .map(([label, value]) => ({label, value: String(value)}))
}
