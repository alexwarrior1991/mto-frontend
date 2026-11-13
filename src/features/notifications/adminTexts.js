import {DELIVERY_STATUS, INBOX_MESSAGE_STATUS, REPROCESS_STOP} from '../../api/notification/enums.js'
import {BROADCAST_CHANNELS} from '../../api/notification/admin.js'
import {formatDateTime} from '../../ui/format.js'
import {countText} from './notificationTexts.js'

/**
 * Lo que dice la administración de notificaciones, con las cifras y las cadenas del servicio: aquí no se
 * suma ni se interpreta nada. Es el port de los textos de los paneles y diálogos Admin* del backoffice.
 */

const SEPARATOR = ' · '

/**
 * «Ráfagas abiertas: 2 · Entregas: Pendiente 0 · …»: los estados conocidos en el orden del enumerado,
 * solo los que vienen, y detrás los que esta versión no conoce, con su clave tal cual.
 */
export function sourcesSummary(status) {
    const totals = status?.deliveries ?? {}
    const deliveries = [
        ...DELIVERY_STATUS.selectable().filter(({value}) => hasTotal(totals[value])).map(({value, label}) => `${label} ${totals[value]}`),
        ...Object.entries(totals).filter(([key]) => !DELIVERY_STATUS.isKnown(key)).map(([key, total]) => `${key} ${total}`),
    ]
    const bursts = `Ráfagas abiertas: ${status?.openBursts ?? 0}`
    return deliveries.length === 0 ? bursts : `${bursts}${SEPARATOR}Entregas: ${deliveries.join(SEPARATOR)}`
}

/** Quién tiene arrendado un lector y hasta cuándo; sin dueño, nada. */
export function leaseText(cursor) {
    const owner = typeof cursor?.leaseOwner === 'string' ? cursor.leaseOwner.trim() : ''
    if (owner === '') {
        return ''
    }
    return cursor.leaseUntil ? `${owner} hasta ${formatDateTime(cursor.leaseUntil)}` : owner
}

/** Lo que se dice encima de los mensajes mirados: cuántos hay, cuántos se enseñan y que el cuerpo no sale. */
export function peekSummary(peek) {
    const held = typeof peek.messages === 'number' ? `${peek.messages} en la cola; ` : ''
    return `${peek.deadLetterQueue}: ${held}se enseñan los primeros ${peek.peeked.length}, que siguen en ella. `
        + 'El cuerpo de un mensaje no se enseña nunca.'
}

/** El agregado de un mensaje: su tipo y su id, lo que haya. */
export function aggregateText(message) {
    return [message?.aggregateType, message?.aggregateId].filter((part) => part !== null && part !== undefined).join(' ')
}

/** «rejected x3»: por qué lo apartó el broker y cuántas veces. */
export function deathText(message) {
    const reason = message?.deathReason ?? ''
    return typeof message?.deathCount === 'number' && message.deathCount > 1 ? `${reason} x${message.deathCount}`.trim() : reason
}

export const NO_INBOX = 'Sin registro en el inbox'

/** Lo que el inbox guarda de un mensaje: su estado, sus intentos, cuándo falló y por qué. */
export function inboxRecordText(inbox) {
    if (!inbox) {
        return NO_INBOX
    }
    const parts = []
    if (inbox.status !== null && inbox.status !== undefined) {
        parts.push(INBOX_MESSAGE_STATUS.label(inbox.status))
    }
    if (typeof inbox.attempts === 'number') {
        parts.push(countText(inbox.attempts, 'intento', 'intentos'))
    }
    if (inbox.failedAt) {
        parts.push(`falló el ${formatDateTime(inbox.failedAt)}`)
    }
    if (typeof inbox.failureReason === 'string' && inbox.failureReason.trim() !== '') {
        parts.push(inbox.failureReason)
    }
    return parts.join(SEPARATOR)
}

/** Lo que va a pasar al reprocesar una cola: es la confirmación de su diálogo. */
export function reprocessExplanation(queue) {
    return `Pasa los primeros mensajes de ${queue.deadLetterQueue} otra vez por el consumidor de ${queue.source}, cada uno una vez. `
        + 'Los que se aplican, y los que ya estaban aplicados, salen de la cola; los que vuelven a fallar se quedan en ella, con su motivo. '
        + 'No se republica nada, y lo que se aplique puede generar avisos, como cualquier evento.'
}

/** «Pedidos 20 · sacados 3 · procesados 1 · duplicados 1 · fallidos 1 · quedan 1 en la cola · paró porque …». */
export function reprocessSummary(result) {
    const number = (value) => value ?? 0
    const parts = [
        `Pedidos ${number(result.requested)}`, `sacados ${number(result.fetched)}`, `procesados ${number(result.processed)}`,
        `duplicados ${number(result.duplicates)}`, `fallidos ${number(result.failed)}`,
    ]
    if (result.remaining !== null && result.remaining !== undefined) {
        parts.push(`quedan ${result.remaining} en la cola`)
    }
    if (result.stoppedBy !== null && result.stoppedBy !== undefined) {
        parts.push(REPROCESS_STOP.isKnown(result.stoppedBy)
            ? `paró porque ${REPROCESS_STOP.label(result.stoppedBy)}`
            : 'paró por un motivo que esta versión no conoce')
    }
    return parts.join(SEPARATOR)
}

/** «Variables: a = 1 · b = x», por orden de nombre; sin variables, nada. */
export function variablesText(variables) {
    const names = Object.keys(variables ?? {}).sort()
    return names.length === 0 ? '' : `Variables: ${names.map((name) => `${name} = ${valueText(variables[name])}`).join(SEPARATOR)}`
}

function valueText(value) {
    return value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value)
}

/** «Uno cada 30 min por #{…}»: la ventana del freno de una regla y su clave; sin freno, nada. */
export function throttleText(rule) {
    const window = typeof rule?.throttleWindow === 'string' ? rule.throttleWindow.trim() : ''
    if (window === '') {
        return ''
    }
    const text = `Uno cada ${windowText(window)}`
    const key = typeof rule.throttleKey === 'string' ? rule.throttleKey.trim() : ''
    return key === '' ? text : `${text} por ${rule.throttleKey}`
}

const ISO_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i

/**
 * Una duración ISO-8601 (PT30M) en días, horas y minutos. Si no se sabe leer, trae segundos o es cero,
 * tal cual.
 */
export function windowText(iso) {
    const match = ISO_DURATION.exec(iso)
    if (!match || match[4] !== undefined && Number(match[4]) !== 0 || /^P$|T$/i.test(iso)) {
        return iso
    }
    // Como una Duration de Java: 90 minutos son 1 h 30 min, y 36 horas, 1 d 12 h.
    const minutes = Number(match[1] ?? 0) * 1440 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)
    if (minutes === 0) {
        return iso
    }
    const parts = []
    if (Math.floor(minutes / 1440) > 0) {
        parts.push(`${Math.floor(minutes / 1440)} d`)
    }
    if (Math.floor(minutes % 1440 / 60) > 0) {
        parts.push(`${Math.floor(minutes % 1440 / 60)} h`)
    }
    if (minutes % 60 > 0) {
        parts.push(`${minutes % 60} min`)
    }
    return parts.join(' ')
}

/** Lo que se ve de una regla, que es donde busca su filtro. */
export function ruleSearchText(rule) {
    return [rule.key, rule.when, rule.title, rule.link, ...rule.events, ...rule.audiences, ...rule.channels]
        .filter((value) => value !== null && value !== undefined).map(String)
}

/** «3 reglas», «1 regla», o «1 de 3 reglas» con el filtro puesto. */
export function rulesCountText(shown, total) {
    return shown === total ? countText(total, 'regla', 'reglas') : `${shown} de ${total} reglas`
}

/** A quién va un aviso general y por dónde: lo que dice su confirmación antes de enviarlo. */
export function broadcastConfirmation(request) {
    const channels = BROADCAST_CHANNELS.filter((channel) => request.channels.includes(channel.value)).map((channel) => channel.label)
    return `«${request.title}» se envía a ${countText(request.audiences.length, 'audiencia', 'audiencias')} `
        + `(${request.audiences.join(', ')}) por ${channels.join(' y ')}. Llega a personas de verdad y no se puede retirar. ¿Enviar?`
}

/** «Último enviado: «título», el 13/11/2026 08:29, a PROFILE:mto-ops»: lo último que se mandó desde la pestaña. */
export function lastSentText(notification) {
    const audiences = Array.isArray(notification.audiences) ? notification.audiences : []
    return `Último enviado: «${notification.title}»`
        + (notification.createdAt ? `, el ${formatDateTime(notification.createdAt)}` : '')
        + (audiences.length === 0 ? '' : `, a ${audiences.join(', ')}`)
}

function hasTotal(value) {
    return value !== null && value !== undefined
}
