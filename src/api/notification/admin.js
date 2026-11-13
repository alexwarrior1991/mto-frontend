import {textOrNull, withoutNulls} from '../bodies.js'
import {apiFetch} from '../http.js'
import {sortWithTieBreak, toPage, toPageParams} from '../paging.js'
import {DELIVERY_STATUS} from './enums.js'
import {notificationTarget} from './links.js'
import {notificationPath} from './values.js'

/**
 * La administración de mto-notification (/api/notifications/admin/**, toda con notification-admin): el
 * port de la parte de administración de NotificationClient del backoffice y de las reglas de sus DTO
 * (DeliveryStatus.canRetry, QueueDto.hasMessages, AudienceKind.problemOf, BroadcastForm).
 *
 * - Aquí no se decide nada: lo que admite una cola o una entrega lo dice el servicio, y lo único que se
 *   copia de él es lo justo para no ofrecer lo que va a fallar.
 * - Las cifras son las del servicio; nada se suma.
 * - Mirar una cola de mensajes muertos no saca nada de ella y nunca trae el cuerpo de un mensaje.
 * - Las entregas se ordenan por createdAt, status, nextAttemptAt, channel y sentAt (otro sort es 400
 *   REQ-400), y el servicio no admite el id: desempata createdAt,desc.
 */

/** Las entregas de cada página (el servicio no da más de 100). */
export const DELIVERIES_PAGE_SIZE = 50

/** Sin columna elegida, la más reciente primero; y es también el desempate. */
export const DELIVERIES_BY_CREATED_DESC = 'createdAt,desc'

/** Cuántos mensajes enseña «Mirar»: los primeros, el lote por defecto del servicio. */
export const DEAD_LETTER_PEEK = 20

/** Lo que admite una pasada de reproceso: de 1 a 100 mensajes, 20 de partida. */
export const REPROCESS_MIN = 1
export const REPROCESS_MAX = 100
export const REPROCESS_DEFAULT = 20

/** Los topes de TestEmailRequest y BroadcastRequest en el servicio. */
export const EMAIL_MAX = 320
export const TITLE_MAX = 255
export const BODY_MAX = 4000
export const LINK_MAX = 500
export const AUDIENCE_MAX = 300

/**
 * Las clases de audiencia de un aviso manual, CLASE:clave, con su ejemplo. Solo viajan en peticiones:
 * son las que el servicio acepta hoy, y otra sería su 422 NTF-422.
 */
export const AUDIENCE_KINDS = Object.freeze([
    {value: 'USER', example: 'USER:nombre.de.usuario'},
    {value: 'USER_ID', example: 'USER_ID:id-de-keycloak'},
    {value: 'PROFILE', example: 'PROFILE:mto-admin'},
    {value: 'CLIENT_ROLE', example: 'CLIENT_ROLE:mto-stock-api:stock-read'},
])

/** Los canales de un aviso manual, por su nombre en el servicio y en el orden en que viajan. */
export const BROADCAST_CHANNELS = Object.freeze([
    {value: 'inbox', label: 'Bandeja'},
    {value: 'email', label: 'Correo'},
])

/** Lo que la bandeja sabe seguir: una ruta de esta aplicación o una dirección http(s). */
export const LINK_RULE = 'Una ruta de la aplicación (/notificaciones) o una dirección http(s)'

/** La forma de un email, la misma que comprueba el backoffice antes de llamar. */
const EMAIL = /^[a-zA-Z0-9_.\-+]+@[a-zA-Z0-9-.]+\.[a-zA-Z0-9-]{2,}$/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Las reglas cargadas, enteras: {source, variables, rules}. Las listas que no vienen se leen vacías. */
export async function loadedRules({signal} = {}) {
    const body = await apiFetch(notificationPath('admin', 'rules'), {signal})
    return {
        source: body?.source ?? '',
        variables: body?.variables ?? {},
        rules: (Array.isArray(body?.rules) ? body.rules : []).map((rule) => ({
            ...rule,
            events: listOf(rule.events),
            audiences: listOf(rule.audiences),
            channels: listOf(rule.channels),
        })),
    }
}

/** Cómo están las fuentes: {cursors, inbox, openBursts, deliveries}, con las cifras del servicio. */
export async function sourcesStatus({signal} = {}) {
    const body = await apiFetch(notificationPath('admin', 'sources'), {signal})
    return {
        cursors: listOf(body?.cursors),
        inbox: listOf(body?.inbox),
        openBursts: body?.openBursts ?? null,
        deliveries: body?.deliveries ?? {},
    }
}

/**
 * Una página de las entregas con sus filtros; lo vacío no viaja. El id de la notificación es un UUID
 * entero: uno a medias se rechaza antes de llamar (el servicio respondería 400). La página empieza en 1.
 */
export async function searchDeliveries({
    status = null, channel = '', notificationId = '', page = 1, size = DELIVERIES_PAGE_SIZE, sort = null,
} = {}, {signal} = {}) {
    const notification = textOrNull(notificationId)
    if (notification !== null && !isUuid(notification)) {
        throw new Error(`No es el id de una notificación: ${notification}`)
    }
    const body = await apiFetch(notificationPath('admin', 'deliveries'), {
        query: {
            status,
            channel: textOrNull(channel),
            notificationId: notification,
            ...toPageParams({page, size}),
            sort: sortWithTieBreak(sort, DELIVERIES_BY_CREATED_DESC, DELIVERIES_BY_CREATED_DESC),
        },
        signal,
    })
    return toPage(body)
}

/** Devuelve una entrega a la cola (POST sin cuerpo) y la devuelve ya PENDING; 404 DLV-404, 409 DLV-409. */
export function retryDelivery(id) {
    return apiFetch(notificationPath('admin', 'deliveries', id, 'retry'), {method: 'POST'})
}

/**
 * Si una entrega se puede reintentar: solo una fallida o una omitida, que es lo que el servicio
 * reintenta (AdminServiceImpl.retry); en otro estado sería su 409 DLV-409. Lo desconocido, no.
 */
export function canRetryDelivery(status) {
    const known = DELIVERY_STATUS.parse(status)
    return known === 'FAILED' || known === 'SKIPPED'
}

/** A quién va una entrega: la dirección (y su usuario) de un destinatario, o la audiencia que aún se expande. */
export function deliveryRecipient(delivery) {
    const recipient = textOrNull(delivery?.recipient)
    if (recipient !== null) {
        const username = textOrNull(delivery.recipientUsername)
        return username === null ? recipient : `${recipient} (${username})`
    }
    return delivery?.audienceKey ?? ''
}

/** Las colas de mensajes muertos de cada fuente: {enabled, queues}. enabled false es RabbitMQ apagado. */
export async function deadLetterQueues({signal} = {}) {
    const body = await apiFetch(notificationPath('admin', 'dead-letters'), {signal})
    return {enabled: body?.enabled === true, queues: listOf(body?.queues)}
}

/**
 * Si hay algo que mirar o reprocesar en una cola: existe (messages no es null) y guarda mensajes. Sin
 * cola el servicio responde 409 SRC-409; vacía, no hay nada que hacer.
 */
export function hasMessages(queue) {
    return typeof queue?.messages === 'number' && queue.messages > 0
}

/** Los primeros mensajes de una cola, que siguen en ella. Nunca traen el cuerpo. */
export async function peekDeadLetters(source, {max = DEAD_LETTER_PEEK} = {}, {signal} = {}) {
    const body = await apiFetch(notificationPath('admin', 'dead-letters', source), {query: {max}, signal})
    return {...body, peeked: listOf(body?.peeked)}
}

/**
 * Pasa los primeros mensajes de una cola otra vez por su consumidor (POST sin cuerpo), hasta 10 s. max
 * va de 1 a 100: fuera de rango se rechaza antes de llamar (el servicio respondería 400 VAL-001).
 */
export async function reprocessDeadLetters(source, max) {
    if (!isReprocessMax(max)) {
        throw new Error(`Una pasada reprocesa de ${REPROCESS_MIN} a ${REPROCESS_MAX} mensajes: ${max}`)
    }
    const body = await apiFetch(notificationPath('admin', 'dead-letters', source, 'reprocess'), {method: 'POST', query: {max}})
    return {...body, results: listOf(body?.results)}
}

export function isReprocessMax(value) {
    return Number.isInteger(value) && value >= REPROCESS_MIN && value <= REPROCESS_MAX
}

/** El correo de prueba: 202 con la notificación creada. La dirección viaja recortada. */
export function sendTestEmail(to) {
    return apiFetch(notificationPath('admin', 'test-email'), {method: 'POST', json: {to: String(to ?? '').trim()}})
}

/** El aviso general: 201 con la notificación creada. Su Location es la ruta interna del servicio y no se usa. */
export function sendBroadcast(request) {
    return apiFetch(notificationPath('admin', 'broadcasts'), {method: 'POST', json: request})
}

/**
 * El cuerpo de un aviso general: el título recortado, lo vacío fuera (sin cuerpo ni enlace el aviso no
 * los lleva), las audiencias limpias en su orden y los canales por su nombre en el servicio y en su
 * orden (inbox, email).
 */
export function broadcastRequest({title, body, link, severity, audiences, channels}) {
    const chosen = new Set(channels ?? [])
    return withoutNulls({
        title: String(title ?? '').trim(),
        body: textOrNull(body),
        link: textOrNull(link),
        severity,
        audiences: audiencesOf(audiences),
        channels: BROADCAST_CHANNELS.map((channel) => channel.value).filter((value) => chosen.has(value)),
    })
}

/** Las audiencias escritas, una por línea: sin blancos alrededor, sin líneas vacías y sin repetidas, en su orden. */
export function audiencesOf(text) {
    const lines = String(text ?? '').split(/\r\n|\r|\n/).map((line) => line.trim()).filter((line) => line !== '')
    return [...new Set(lines)]
}

/**
 * Por qué una audiencia escrita no la aceptaría el servicio, o null si vale. La misma regla que
 * Audience.parse allí: una clase conocida (sin distinguir mayúsculas, con - como _), dos puntos y una
 * clave que no esté en blanco; la de un rol de cliente es cliente:rol.
 */
export function audienceProblem(audience) {
    const text = String(audience ?? '').trim()
    const separator = text.indexOf(':')
    if (separator <= 0 || text.slice(separator + 1).trim() === '') {
        return `«${text}» no es CLASE:clave`
    }
    const kind = text.slice(0, separator).trim().toUpperCase().replaceAll('-', '_')
    if (!AUDIENCE_KINDS.some((known) => known.value === kind)) {
        return `«${text}»: la clase es USER, USER_ID, PROFILE o CLIENT_ROLE`
    }
    if (kind === 'CLIENT_ROLE' && !text.slice(separator + 1).trim().includes(':')) {
        return `«${text}»: un rol de cliente es CLIENT_ROLE:cliente:rol`
    }
    if (text.length > AUDIENCE_MAX) {
        return `Una audiencia tiene como mucho ${AUDIENCE_MAX} caracteres`
    }
    return null
}

/** Lo primero que el servicio rechazaría de las audiencias escritas; null si valen. */
export function audiencesProblem(text) {
    const lines = audiencesOf(text)
    if (lines.length === 0) {
        return 'Al menos una audiencia'
    }
    return lines.map(audienceProblem).find((problem) => problem !== null) ?? null
}

/** Lo que el correo de prueba exige de su dirección antes de llamar; null si vale. */
export function emailProblem(value) {
    const text = String(value ?? '').trim()
    if (text === '') {
        return 'La dirección es obligatoria'
    }
    if (!EMAIL.test(text)) {
        return 'No tiene forma de email'
    }
    return text.length > EMAIL_MAX ? `Como mucho ${EMAIL_MAX} caracteres` : null
}

/** Lo que el aviso exige de su enlace: opcional, pero uno que la bandeja sepa seguir; null si vale. */
export function linkProblem(value) {
    const text = String(value ?? '').trim()
    if (text.length > LINK_MAX) {
        return `Como mucho ${LINK_MAX} caracteres`
    }
    return text === '' || notificationTarget(text) !== null ? null : LINK_RULE
}

/** El id entero de una notificación, que es como el servicio lo compara. */
export function isUuid(value) {
    return UUID.test(String(value ?? '').trim())
}

function listOf(value) {
    return Array.isArray(value) ? value : []
}
