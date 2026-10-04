import {numberOrNull, textOrNull, withoutNulls} from '../bodies.js'
import {apiFetch} from '../http.js'
import {buildMergePatch, MERGE_PATCH} from '../mergePatch.js'
import {CHECK_ITEM_RESULT} from './enums.js'
import {maintenancePath} from './values.js'

/**
 * Las tareas de una orden y su checklist: el port de la parte de tareas de OrderClient y de TaskForm,
 * GenerateTasksDialog y CheckItemsDialog del backoffice. Una tarea solo existe dentro de su orden.
 *
 * - Se añade a una orden sin terminar (409 TRN-001 si no). Generar crea una por perfil habilitado del
 *   tramo de un preventivo en borrador o planificado; los perfiles que ya tienen tarea se saltan, así
 *   que repetirlo no duplica. Sin tipos, los del servicio (grupos 1, 2 y 4).
 * - Solo una tarea abierta (pendiente o en curso) se modifica o se cancela. Sus tipos, si cambian,
 *   van enteros: sustituyen a los que tenía.
 * - Iniciar y completar piden la orden en curso y un turno en curso que cubra su vía, con una posesión
 *   compatible (409 SHF-001 si no). Los puntos con medida tienen que tener resultado para completarla.
 * - Cada punto del checklist se guarda por separado, con su versión, y la respuesta es la tarea
 *   entera: el servicio dice si quedó fuera de rango y rechaza un OK fuera de rango sin ajustar (422
 *   INS-001).
 */

function taskPath(orderId, ...segments) {
    return maintenancePath('orders', orderId, 'tasks', ...segments)
}

/** Las tareas de una orden, en su orden (llegan enteras: una por perfil, quizá cientos). */
export async function listOrderTasks(orderId, {signal} = {}) {
    return bySequence(await apiFetch(taskPath(orderId), {signal}))
}

export function bySequence(tasks) {
    return [...(tasks ?? [])].sort((left, right) => (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER))
}

/** 201 con la tarea. */
export function createTask(orderId, body) {
    return apiFetch(taskPath(orderId), {method: 'POST', json: body})
}

/** 200 con lo que generó el servicio: creadas, perfiles saltados, total y estimación. */
export function generateTasks(orderId, body) {
    return apiFetch(taskPath(orderId, 'generate'), {method: 'POST', json: body})
}

export function patchTask(orderId, taskId, patch) {
    return apiFetch(taskPath(orderId, taskId), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

export function cancelTask(orderId, taskId, reason) {
    return apiFetch(taskPath(orderId, taskId, 'cancel'), {method: 'POST', json: {reason}})
}

export function startTask(orderId, taskId, body) {
    return apiFetch(taskPath(orderId, taskId, 'start'), {method: 'POST', json: body})
}

export function completeTask(orderId, taskId, body) {
    return apiFetch(taskPath(orderId, taskId, 'complete'), {method: 'POST', json: body})
}

/** Un punto del checklist; responde con la tarea entera. */
export function patchCheckItem(orderId, taskId, itemId, patch) {
    return apiFetch(taskPath(orderId, taskId, 'check-items', itemId), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/** El alta, desde lo escrito en su editor; lo vacío no viaja. assetId guarda el activo elegido. */
export function taskRequest(values) {
    const codes = values.taskTypeCodes ?? []
    return withoutNulls({
        description: textOrNull(values.description),
        assetId: values.assetId?.id ?? null,
        assignedUser: textOrNull(values.assignedUser),
        taskTypeCodes: codes.length > 0 ? codes : null,
        withChecklist: values.withChecklist === true ? true : null,
    })
}

/** Lo que cambió de una tarea, lo vaciado y su versión; los tipos se comparan como conjunto. null si nada. */
export function taskPatch(original, values) {
    return buildMergePatch(original, {
        description: values.description,
        assignedUser: values.assignedUser,
        taskTypeCodes: values.taskTypeCodes ?? [],
        notes: values.notes,
        defectsFound: values.defectsFound,
    }, {fields: ['description', 'assignedUser', 'taskTypeCodes', 'notes', 'defectsFound'], setFields: ['taskTypeCodes'], version: original.version})
}

/** Generar: sin tipos ni checklist el cuerpo va vacío y el servicio pone los suyos. */
export function generateRequest({taskTypeCodes = [], withChecklist = false} = {}) {
    return withoutNulls({taskTypeCodes: taskTypeCodes.length > 0 ? taskTypeCodes : null, withChecklist: withChecklist ? true : null})
}

/** En el orden de la plantilla. */
export function itemsInOrder(items) {
    return [...(items ?? [])].sort((left, right) => (left.orderIndex ?? Number.MAX_SAFE_INTEGER) - (right.orderIndex ?? Number.MAX_SAFE_INTEGER))
}

/**
 * Lo que cambió de un punto, lo vaciado y su versión. Un resultado que esta versión no conoce se pinta
 * vacío y, si nadie lo toca, se queda como está. null si nada.
 */
export function checkItemPatch(item, values) {
    return buildMergePatch({...item, adjusted: item.adjusted === true, itemResult: shownResult(item)}, {
        measuredValue: numberOrNull(values.measuredValue),
        adjusted: values.adjusted === true,
        valueAfterAdjustment: numberOrNull(values.valueAfterAdjustment),
        itemResult: values.itemResult ?? null,
        notes: values.notes,
    }, {
        fields: ['measuredValue', 'adjusted', 'valueAfterAdjustment', 'itemResult', 'notes'],
        numberFields: ['measuredValue', 'valueAfterAdjustment'],
        version: item.version,
    })
}

/** El resultado de un punto como lo enseña su desplegable: uno desconocido, vacío. */
export function shownResult(item) {
    return CHECK_ITEM_RESULT.isKnown(item?.itemResult) ? item.itemResult : null
}
