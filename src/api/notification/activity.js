import {textOrNull} from '../bodies.js'
import {endOfDayInstant, startOfDayInstant} from '../dates.js'
import {apiFetch} from '../http.js'
import {sortWithTieBreak, toPage, toPageParams} from '../paging.js'
import {notificationPath} from './values.js'

/**
 * El registro de actividad y los accesos: el port del resto de NotificationClient del backoffice.
 *
 * - El registro es todo lo que pasa en el dominio salvo los accesos, que tienen su lista y su permiso
 *   (notification-access-read, que no viene con el registro porque llevan usuario e IP).
 *   category=ACCESS en el registro es un 400: aquí se rechaza antes de llamar.
 * - Los tipos, los orígenes y los sujetos se escriben enteros y los compara el servicio: el catálogo de
 *   tipos es suyo y aquí no se copia.
 * - Lo fundido (el evento de administración de Keycloak que ya cuenta el de mto-users del mismo cambio)
 *   se esconde salvo con includeSuperseded, que solo viaja verdadero.
 * - La lista del registro no trae el payload: lo trae el detalle (GET /activity/{id}). Un acceso lo
 *   trae en la propia lista, y no tiene detalle: /activity/{id} de un acceso es 404 ACT-404.
 * - Ordenan por occurredAt, recordedAt, severity, type y seq, y siempre con seq,desc al final: seq es
 *   único, y sin él dos líneas del mismo instante (una racha y el fallo que la abrió) podrían saltar de
 *   página. Un sort que no admite es 400 REQ-400.
 */

/** Las páginas del registro y de los accesos (el servicio no da más de 100). */
export const ACTIVITY_PAGE_SIZE = 50

/** Sin columna elegida, lo más reciente primero. */
export const BY_OCCURRED_DESC = 'occurredAt,desc'

/** El desempate de las dos listas: seq es único y sigue el orden en que se registró cada línea. */
export const BY_SEQ_DESC = 'seq,desc'

/**
 * Una página del registro con sus filtros; lo vacío no viaja. Las fechas son días enteros en la zona del
 * navegador. La página empieza en 1.
 */
export async function searchActivity({
    category = null, type = '', actorUsername = '', subjectType = '', subjectId = '', severity = null, sourceService = '',
    from = null, to = null, includeSuperseded = false, page = 1, size = ACTIVITY_PAGE_SIZE, sort = null,
} = {}, {signal} = {}) {
    if (category === 'ACCESS') {
        throw new Error('Los accesos tienen su lista: el registro no los admite como categoría')
    }
    const body = await apiFetch(notificationPath('activity'), {
        query: {
            category,
            type: textOrNull(type),
            actorUsername: textOrNull(actorUsername),
            subjectType: textOrNull(subjectType),
            subjectId: textOrNull(subjectId),
            severity,
            sourceService: textOrNull(sourceService),
            from: from ? startOfDayInstant(from) : null,
            to: to ? endOfDayInstant(to) : null,
            includeSuperseded: includeSuperseded === true ? true : null,
            ...toPageParams({page, size}), sort: sortWithTieBreak(sort, BY_OCCURRED_DESC, BY_SEQ_DESC),
        },
        signal,
    })
    return toPage(body)
}

/** Una línea del registro entera, con su payload; 404 ACT-404 si no existe o es un acceso. */
export function getActivityEvent(id, {signal} = {}) {
    return apiFetch(notificationPath('activity', id), {signal})
}

/**
 * Una página de los accesos con sus filtros; lo vacío no viaja. La IP es un literal, no un rango: una
 * que no lo es se rechaza antes de llamar (el servicio respondería 400 VAL-001).
 */
export async function searchAccess({
    username = '', ipAddress = '', type = '', outcome = null, from = null, to = null, page = 1, size = ACTIVITY_PAGE_SIZE, sort = null,
} = {}, {signal} = {}) {
    const ip = textOrNull(ipAddress)
    if (ip !== null && !isIpLiteral(ip)) {
        throw new Error(`No es una IP: ${ip}`)
    }
    const body = await apiFetch(notificationPath('access'), {
        query: {
            username: textOrNull(username),
            ipAddress: ip,
            type: textOrNull(type),
            outcome,
            from: from ? startOfDayInstant(from) : null,
            to: to ? endOfDayInstant(to) : null,
            ...toPageParams({page, size}), sort: sortWithTieBreak(sort, BY_OCCURRED_DESC, BY_SEQ_DESC),
        },
        signal,
    })
    return toPage(body)
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const IPV6 = /^[0-9a-fA-F:.]{2,45}$/

/**
 * Si un texto es una IP que el servicio leería como literal: una IPv4 entera (10.0.0.7) o algo con
 * forma de IPv6 (::1, fe80::1, ::ffff:10.0.0.7). Lo demás no llega a pedirse; lo que se escapa de esta
 * comprobación lo rechaza el servicio con 400, sin consultar el DNS.
 */
export function isIpLiteral(value) {
    const text = String(value ?? '').trim()
    const ipv4 = IPV4.exec(text)
    if (ipv4) {
        return ipv4.slice(1).every((part) => Number(part) <= 255)
    }
    return text.includes(':') && IPV6.test(text)
}
