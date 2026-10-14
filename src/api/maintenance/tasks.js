import {idOrNull, numberOrNull, textOrNull, withoutNulls} from '../bodies.js'
import {apiFetch} from '../http.js'
import {buildMergePatch, MERGE_PATCH} from '../mergePatch.js'
import {CHECK_ITEM_RESULT} from './enums.js'
import {maintenancePath} from './values.js'

/**
 * Las tareas de una orden y su checklist: el port de la parte de tareas de OrderClient y de TaskForm,
 * GenerateTasksDialog y CheckItemsDialog del backoffice. Una tarea solo existe dentro de su orden.
 *
 * - Se añade a una orden sin terminar (409 TRN-001 si no). Generar, en un preventivo en borrador o
 *   planificado, crea una por activo de lo que se pide: los perfiles del tramo de la orden, como
 *   siempre, o perfiles, aisladores y seccionadores de otro tramo, de una vía, de una estación, de todo
 *   el EP o elegidos, en cualquier vía del EP de la orden (una orden es de un solo EP). Lo que ya tiene
 *   tarea en la orden, lo que es de otro EP y lo que tiene una tarea abierta en otra orden se salta, así
 *   que repetirlo no duplica. Sin tipos, los del servicio para cada activo (grupos 1, 2 y 4 en un
 *   perfil, RG-03 en un aislador, RP-06 en un seccionador con motor); los elegidos van a todo lo
 *   generado, y los de una fila solo a lo suyo. dryRun dice qué pasaría sin crear nada.
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

/** 200 con lo que generó el servicio, o con dryRun lo que generaría: recuentos, estimación y, previsualizando, cada activo. */
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

/** Lo que se genera uno a uno; un tramo no. */
export const GENERATED_ASSET_TYPES = ['PROFILE', 'SECTION_INSULATOR', 'DISCONNECTOR']

/**
 * Dónde busca una fila de generar: el tramo de la orden (la petición de siempre), otro tramo del EP,
 * una vía (lo suyo y lo que conecta con ella) con KP opcionales, una estación del EP, todo el EP o unos
 * activos elegidos. Todo menos el tramo de la orden pide una orden con EP: una orden es de un solo EP.
 */
export const GENERATION_SCOPE = Object.freeze({
    ORDER_SECTION: 'ORDER_SECTION',
    SECTION: 'SECTION',
    TRACK: 'TRACK',
    STATION: 'STATION',
    PACKAGE: 'PACKAGE',
    ASSETS: 'ASSETS',
})

/** Una fila de generar: qué tipo de activo, dónde y, si se quiere, con sus propios tipos de tarea. */
export function generationRow(assetType = 'PROFILE', scope = GENERATION_SCOPE.ORDER_SECTION) {
    return {assetType, scope, section: null, trackId: null, fromKp: '', toKp: '', stationId: null, assetIds: [], taskTypeCodes: []}
}

/** Todo es el tramo de la orden sin tipos propios: viaja la petición de siempre. */
export function isOrderSectionOnly(rows) {
    return rows.every((row) => row.scope === GENERATION_SCOPE.ORDER_SECTION && (row.taskTypeCodes ?? []).length === 0)
}

/**
 * El cuerpo de generar; lo vacío no viaja. Si todo es el tramo de la orden sin tipos propios, la
 * petición de siempre: sin nada, los perfiles del tramo ({}), y con otros tipos de activo, assetTypes.
 * Si no, una selección por fila, con el tramo de la orden como uno más. Los tipos de arriba van a todo
 * lo generado; los de una fila, solo a lo suyo.
 *
 * @param {string|null} orderSectionId el tramo de la orden, para una fila «el tramo de la orden» entre otras
 */
export function generateRequest({rows = [generationRow()], taskTypeCodes = [], withChecklist = false, dryRun = false, orderSectionId = null} = {}) {
    const common = {
        taskTypeCodes: taskTypeCodes.length > 0 ? taskTypeCodes : null,
        withChecklist: withChecklist ? true : null,
    }
    if (isOrderSectionOnly(rows)) {
        const types = new Set(rows.map((row) => row.assetType))
        const onlyProfiles = types.size === 1 && types.has('PROFILE')
        return withoutNulls({
            ...common,
            assetTypes: onlyProfiles ? null : GENERATED_ASSET_TYPES.filter((type) => types.has(type)),
            dryRun: dryRun ? true : null,
        })
    }
    return withoutNulls({...common, selections: rows.map((row) => selectionOf(row, orderSectionId)), dryRun: dryRun ? true : null})
}

function selectionOf(row, orderSectionId) {
    const own = (row.taskTypeCodes ?? []).length > 0 ? row.taskTypeCodes : null
    const selection = {assetType: row.assetType, taskTypeCodes: own}
    switch (row.scope) {
        case GENERATION_SCOPE.ORDER_SECTION:
            return withoutNulls({...selection, sectionId: orderSectionId})
        case GENERATION_SCOPE.SECTION:
            return withoutNulls({...selection, sectionId: row.section?.id ?? null})
        case GENERATION_SCOPE.TRACK:
            return withoutNulls({...selection, trackId: idOrNull(row.trackId), fromKp: numberOrNull(row.fromKp), toKp: numberOrNull(row.toKp)})
        case GENERATION_SCOPE.STATION:
            return withoutNulls({...selection, stationId: idOrNull(row.stationId)})
        case GENERATION_SCOPE.ASSETS:
            return withoutNulls({...selection, assetIds: row.assetIds ?? []})
        default:
            return withoutNulls(selection)
    }
}

/** Lo que ya tenía tarea: todos los activos si el servicio lo cuenta, si no los perfiles. */
export function skippedOf(result) {
    return result.skippedAssets ?? result.skippedProfiles
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
