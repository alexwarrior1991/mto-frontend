import {textOrNull, withoutNulls} from '../bodies.js'
import {toLocalDateParam} from '../dates.js'
import {apiFetch} from '../http.js'
import {buildMergePatch, MERGE_PATCH} from '../mergePatch.js'
import {sortWithTieBreak, toPage, toPageParams} from '../paging.js'
import {allowsFullOrderUpdate} from './enums.js'
import {maintenancePath} from './values.js'

/**
 * Las órdenes de mantenimiento: el port de OrderClient (sin tareas ni materiales, que van aparte) y de
 * OrderForm y OrderTransitionDialog del backoffice.
 *
 * - Una orden nace en borrador sobre un activo activo (409 AST-001 si no); una urgente, además,
 *   crítica. El activo ya no cambia.
 * - En borrador y planificada se modifica todo; asignada o en curso, solo la descripción, la prioridad
 *   y las notas de cierre: lo demás es un 409 TRN-001. La modificación es un merge-patch con lo que
 *   cambió y la versión leída (409 CON-001 si otra persona guardó antes).
 * - Cada transición es su llamada, con su cuerpo, y no se funden: planificar (con la fecha, que no
 *   puede ser pasada, y es cuando se reservan los materiales), asignar (equipo, persona o los dos),
 *   iniciar, completar (con force si lleva maintenance-supervise) y cancelar (con su motivo, y
 *   supervise). Desde un estado que no la admite es un 409 TRN-001.
 * - Vía, estación y paquete son ids de mto-configuration, y el proyecto de almacén, de mto-stock.
 */

/** Sin columna elegida, la más reciente primero. */
export const BY_CREATED_DESC = 'createdAt,desc'

/** Una página de órdenes con sus filtros; lo vacío no viaja. La página empieza en 1. */
export async function searchOrders({
    status = null, type = null, priority = null, assetId = null, assetType = null, trackId = null, stationId = null,
    executionPackageId = null, plannedFrom = null, plannedTo = null, assignedUser = '', teamId = null, code = '',
    page = 1, size = 50, sort = null,
} = {}, {signal} = {}) {
    const body = await apiFetch(maintenancePath('orders'), {
        query: {
            status, type, priority, assetId, assetType, trackId, stationId, executionPackageId,
            plannedFrom: toLocalDateParam(plannedFrom), plannedTo: toLocalDateParam(plannedTo),
            assignedUser: textOrNull(assignedUser), teamId, code: textOrNull(code),
            ...toPageParams({page, size}), sort: sortWithTieBreak(sort, BY_CREATED_DESC),
        },
        signal,
    })
    return toPage(body)
}

export function getOrder(id, {signal} = {}) {
    return apiFetch(maintenancePath('orders', id), {signal})
}

/** 201 con la orden, en borrador. */
export function createOrder(body) {
    return apiFetch(maintenancePath('orders'), {method: 'POST', json: body})
}

export function patchOrder(id, patch) {
    return apiFetch(maintenancePath('orders', id), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/** Las transiciones con datos y cancelar: cada una es su ruta y su cuerpo. */
export const ORDER_TRANSITIONS = Object.freeze(['plan', 'assign', 'start', 'complete', 'cancel'])

export function transitionOrder(id, transition, body) {
    if (!ORDER_TRANSITIONS.includes(transition)) {
        throw new Error(`Transición de orden desconocida: ${transition}`)
    }
    return apiFetch(maintenancePath('orders', id, transition), {method: 'POST', json: body})
}

/** Los cambios de estado, el primero el alta, con el comentario o el motivo de cada uno. */
export function listOrderHistory(id, {signal} = {}) {
    return apiFetch(maintenancePath('orders', id, 'history'), {signal})
}

/** La ruta del historial de Envers de una orden, para listRevisions. */
export function orderRevisionsPath(id) {
    return maintenancePath('orders', id, 'revisions')
}

/** El alta, desde lo escrito en su editor; lo vacío no viaja. assetId y stockProjectId guardan lo elegido. */
export function orderRequest(values) {
    return withoutNulls({
        title: textOrNull(values.title),
        description: textOrNull(values.description),
        type: values.type,
        priority: values.priority,
        assetId: values.assetId?.id ?? null,
        plannedDate: toLocalDateParam(values.plannedDate) ?? null,
        teamId: values.teamId || null,
        assignedUser: textOrNull(values.assignedUser),
        stockProjectId: values.stockProjectId?.id ?? null,
    })
}

const FULL_UPDATE = Object.freeze(['title', 'description', 'priority', 'plannedDate', 'teamId', 'assignedUser', 'stockProjectId'])
const RESTRICTED_UPDATE = Object.freeze(['description', 'priority', 'closingNotes'])

/**
 * Lo que de una orden cambió en su editor, lo vaciado a null y la versión leída; null si nada. En
 * borrador o planificada, todo lo que el editor enseña; después, solo la descripción, la prioridad y
 * las notas de cierre, que es lo que el servicio admite. Sin stock-read el proyecto de almacén no se
 * enseña ni viaja: no se puede nombrar, y tampoco se manda a vaciar.
 */
export function orderPatch(original, values, {readsStock}) {
    const fields = (allowsFullOrderUpdate(original.status) ? FULL_UPDATE : RESTRICTED_UPDATE)
        .filter((field) => readsStock || field !== 'stockProjectId')
    return buildMergePatch({...original, teamId: original.team?.id ?? null}, {
        title: values.title,
        description: values.description,
        priority: values.priority,
        plannedDate: toLocalDateParam(values.plannedDate) ?? null,
        teamId: values.teamId || null,
        assignedUser: values.assignedUser,
        closingNotes: values.closingNotes,
        stockProjectId: values.stockProjectId?.id ?? null,
    }, {fields, version: original.version})
}

/**
 * El cuerpo de una transición, desde su diálogo: el comentario para el historial y lo de cada una.
 * Completar lleva force solo si se marcó, y cancelar, su motivo.
 *
 * @param {'plan'|'assign'|'start'|'complete'|'cancel'} transition
 */
export function transitionRequest(transition, values) {
    const comment = textOrNull(values.comment)
    switch (transition) {
        case 'plan':
            return withoutNulls({plannedDate: toLocalDateParam(values.plannedDate) ?? null, comment})
        case 'assign':
            return withoutNulls({teamId: values.teamId || null, assignedUser: textOrNull(values.assignedUser), comment})
        case 'complete':
            return withoutNulls({closingNotes: textOrNull(values.closingNotes), force: values.force === true ? true : null, comment})
        case 'cancel':
            return {reason: String(values.reason ?? '').trim()}
        default:
            return withoutNulls({comment})
    }
}
