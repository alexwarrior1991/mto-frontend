import {numberOrNull, withoutNulls} from '../bodies.js'
import {apiFetch} from '../http.js'
import {buildMergePatch, MERGE_PATCH} from '../mergePatch.js'
import {isOpenOrder, isSyncFailed, ORDER_STATUS} from './enums.js'
import {maintenancePath} from './values.js'

/**
 * Las líneas de material de una orden: el port de la parte de materiales de OrderClient y de
 * MaterialUsageDto del backoffice. El material y el almacén son ids de mto-stock, con el código y la
 * descripción copiados al registrarla. Una línea se reserva al planificar la orden, se consume al
 * completarla y se libera al cancelarla.
 */

function materialPath(orderId, ...segments) {
    return maintenancePath('orders', orderId, 'materials', ...segments)
}

/** Las líneas de una orden, enteras. */
export function listOrderMaterials(orderId, {signal} = {}) {
    return apiFetch(materialPath(orderId), {signal})
}

/** 201 con la línea. Fuera de borrador el servicio la reserva al momento, y la línea dice cómo fue. */
export function registerMaterial(orderId, body) {
    return apiFetch(materialPath(orderId), {method: 'POST', json: body})
}

export function patchMaterial(orderId, lineId, patch) {
    return apiFetch(materialPath(orderId, lineId), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/**
 * Vuelve a intentarlo con el almacén. Si el almacén sigue caído o dice que no (503 STK-503, 409
 * STK-001, 422 STK-422), la respuesta es el error, pero la línea guarda lo que pasó: hay que releerla.
 */
export function syncMaterial(orderId, lineId) {
    return apiFetch(materialPath(orderId, lineId, 'sync'), {method: 'POST'})
}

/** 204. Libera antes lo que la línea retenga en el almacén; con el almacén caído (503 STK-503), la línea se queda. */
export function removeMaterial(orderId, lineId) {
    return apiFetch(materialPath(orderId, lineId), {method: 'DELETE', responseType: 'none'})
}

/** Tiene su reserva en mto-stock. */
export function isReservedLine(line) {
    return line?.stockReservationId !== null && line?.stockReservationId !== undefined
}

/**
 * Hay una petición al almacén sin respuesta (stockRequestInDoubt): hasta que conteste, el servicio
 * rechaza (409 MAT-001) cambiar lo previsto o lo consumido de la línea y el proyecto de almacén de la
 * orden. Un valor que no se conoce también cuenta como en duda.
 */
export function isInDoubtLine(line) {
    return line?.stockRequestInDoubt !== null && line?.stockRequestInDoubt !== undefined
}

/** Los estados de una línea que todavía cambia; consumida ya no, y una que no se conoce no abre nada. */
const CHANGEABLE_STATUSES = Object.freeze(['NOT_REQUESTED', 'RESERVED', 'RELEASED', 'FAILED', 'REJECTED'])

/**
 * Se modifica: con la orden sin terminar y la línea sin consumir. Lo que admite cada campo lo dicen
 * fixedPlanned y fixedConsumed.
 */
export function isEditableLine(line, orderStatus) {
    return isOpenOrder(orderStatus) && CHANGEABLE_STATUSES.includes(line?.stockSyncStatus)
}

/**
 * Se quita: como se modifica, salvo con una salida en duda (el material quizá ya salió) o con una
 * petición que no se conoce. Una reserva en duda sí: el servicio la confirma para liberarla.
 */
export function isRemovableLine(line, orderStatus) {
    return isEditableLine(line, orderStatus) && (!isInDoubtLine(line) || line.stockRequestInDoubt === 'RESERVATION')
}

/**
 * Qué hace «Sincronizar» con una línea, o null si no se ofrece:
 *
 * - 'retry': una fallida o rechazada, o una sin pedir fuera de borrador, también con la orden ya
 *   terminada, porque el servicio la liquida al reintentar;
 * - 'check': con la orden abierta, una reservada, por si Almacén liberó su reserva (el servicio pide
 *   entonces otra).
 */
export function syncActionOf(line, orderStatus) {
    const status = line?.stockSyncStatus
    if (isSyncFailed(status) || (status === 'NOT_REQUESTED' && ORDER_STATUS.isKnown(orderStatus) && orderStatus !== 'DRAFT')) {
        return 'retry'
    }
    return status === 'RESERVED' && isOpenOrder(orderStatus) ? 'check' : null
}

/** Lo previsto no cambia con una reserva (se quita y se registra otra vez) ni con una petición en duda, en la que viaja. */
export function fixedPlanned(line) {
    return isReservedLine(line) || isInDoubtLine(line)
}

/** Lo consumido tampoco con una petición en duda. */
export function fixedConsumed(line) {
    return isInDoubtLine(line)
}

/**
 * El alta, desde su diálogo. materialId y warehouseId guardan el resumen elegido en mto-stock; la
 * unidad es la del material, y lo vacío no viaja.
 */
export function materialRequest(values) {
    return withoutNulls({
        materialId: values.materialId?.id ?? null,
        warehouseId: values.warehouseId?.id ?? null,
        plannedQuantity: numberOrNull(values.plannedQuantity),
        unit: values.materialId?.unitOfMeasure ?? null,
        taskId: values.taskId || null,
        allowOverConsumption: values.allowOverConsumption === true ? true : null,
    })
}

/**
 * Lo que cambió de una línea y su versión, o null si nada. Lo fijo no viaja nunca, y nada se vacía:
 * las cantidades y el permiso son siempre un valor.
 */
export function materialPatch(line, values) {
    const fields = [
        ...(fixedPlanned(line) ? [] : ['plannedQuantity']),
        ...(fixedConsumed(line) ? [] : ['consumedQuantity']),
        'allowOverConsumption',
    ]
    return buildMergePatch({...line, allowOverConsumption: line.allowOverConsumption === true}, {
        plannedQuantity: numberOrNull(values.plannedQuantity),
        consumedQuantity: numberOrNull(values.consumedQuantity),
        allowOverConsumption: values.allowOverConsumption === true,
    }, {fields, numberFields: ['plannedQuantity', 'consumedQuantity'], version: line.version})
}
