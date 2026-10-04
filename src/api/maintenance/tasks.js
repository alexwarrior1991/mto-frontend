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

/** Iniciar una tarea pendiente en un turno en curso de su vía, con la orden en curso. */
export function startTask(orderId, taskId, body) {
    return apiFetch(taskPath(orderId, taskId, 'start'), {method: 'POST', json: body})
}

/** Completar una tarea en un turno en curso de su vía: la fila del parte. Responde con la tarea. */
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

/**
 * Completar una tarea, desde su diálogo (el port de CompleteTaskRequest).
 *
 * - Los tipos solo viajan si cambiaron, y nunca vacíos: sustituyen a los de la tarea antes de que el
 *   servicio compruebe la posesión.
 * - Las notas y los defectos del parte, solo si cambiaron (vaciar uno manda texto vacío).
 * - Con el trabajo sin terminar viaja workComplete=false y la fecha de reparación: los defectos quedan
 *   abiertos. Si no, nacen resueltos en este turno.
 * - Los defectos en línea y los materiales, si hay. Un material lleva el resumen de mto-stock elegido,
 *   y viaja con la unidad del material: el servicio lo registra como línea de la orden, ya consumida.
 *
 * @param {object} task la tarea como se leyó
 * @param {{inlineDefects: Array, materials: Array}} lists lo añadido en el diálogo
 */
export function completeRequest(task, values, {inlineDefects = [], materials = []} = {}) {
    const codes = values.taskTypeCodes ?? []
    const original = task.taskTypeCodes ?? []
    const sameTypes = codes.length === original.length && codes.every((code) => original.includes(code))
    const workComplete = values.workComplete !== false
    return withoutNulls({
        shiftId: values.shiftId ?? null,
        taskTypeCodes: sameTypes || codes.length === 0 ? null : codes,
        notes: changedText(values.notes, task.notes),
        defectsFound: changedText(values.defectsFound, task.defectsFound),
        workComplete: workComplete ? null : false,
        repairPlannedDate: workComplete ? null : values.repairPlannedDate ?? null,
        inlineDefects: inlineDefects.length > 0 ? inlineDefects.map(inlineDefectRequest) : null,
        materials: materials.length > 0 ? materials.map(taskMaterialRequest) : null,
    })
}

/** El texto recortado si cambió respecto a lo leído (vaciarlo es texto vacío); si no, null. */
function changedText(value, original) {
    const current = String(value ?? '').trim()
    return current === (original ?? '') ? null : current
}

/** Un defecto encontrado al completar: gravedad y descripción obligatorias. */
export function inlineDefectRequest(values) {
    return withoutNulls({
        severity: values.severity ?? null,
        description: textOrNull(values.description),
        technicalNotes: textOrNull(values.technicalNotes),
        correctionType: textOrNull(values.correctionType),
        partsReplaced: textOrNull(values.partsReplaced),
    })
}

/** Un material usado: el material y el almacén elegidos en mto-stock, la cantidad y la unidad del material. */
export function taskMaterialRequest(line) {
    return withoutNulls({
        materialId: line.material?.id ?? null,
        warehouseId: line.warehouse?.id ?? null,
        quantity: numberOrNull(line.quantity),
        unit: line.material?.unitOfMeasure ?? null,
    })
}
