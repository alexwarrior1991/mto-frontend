import {endOfDayInstant, localDateTimeToInstant, startOfDayInstant} from '../dates.js'
import {defineEnum} from '../enums.js'
import {apiFetch} from '../http.js'
import {sortWithTieBreak, toPage, toPageParams} from '../paging.js'
import {stockPath, textOrNull, toQuantity, withoutNulls} from './values.js'

/**
 * El libro de movimientos de mto-stock: el port de MovementClient, de la parte del libro de
 * MaterialClient y de sus peticiones en el backoffice.
 *
 * - El libro solo crece: no hay modificación ni borrado, y un apunte equivocado se corrige con un
 *   ajuste.
 * - Una entrada lleva un proveedor opcional. Una salida, un proyecto opcional, o consume una reserva
 *   (reservationId): entonces el material, el almacén y la cantidad tienen que ser exactamente los
 *   reservados (422 RES-001 si no), y el proyecto no se copia de la reserva, así que viaja.
 * - Una transferencia va entre dos almacenes distintos y responde con los dos apuntes, primero el
 *   saliente.
 * - Un ajuste va en un sentido, positivo o negativo, y pide stock-adjust además de stock-write.
 * - Sin disponible, una salida, una transferencia o un ajuste negativo son un 409 STK-001; un
 *   material retirado es un 400 VAL-001 y un almacén retirado, un 422 WH-001.
 * - Sin fecha, el servicio pone ahora. Lo vacío no viaja: una referencia externa en blanco es un 500.
 *
 * Permisos que aplica el servicio: leer pide stock-read; registrar, stock-write.
 */

/** Los seis apuntes del libro. La cantidad con signo la da el servicio (signedQuantity), también la de uno desconocido. */
export const MOVEMENT_TYPE = defineEnum({
    ENTRY: 'Entrada',
    OUTPUT: 'Salida',
    POSITIVE_ADJUSTMENT: 'Ajuste positivo',
    NEGATIVE_ADJUSTMENT: 'Ajuste negativo',
    INCOMING_TRANSFER: 'Transferencia entrante',
    OUTGOING_TRANSFER: 'Transferencia saliente',
})

/** El sentido de un ajuste. Solo viaja en peticiones, así que no tolera lo desconocido: se manda uno de estos. */
export const ADJUSTMENT_DIRECTIONS = Object.freeze([
    Object.freeze({value: 'POSITIVE', label: 'Positivo: aparece material'}),
    Object.freeze({value: 'NEGATIVE', label: 'Negativo: falta material'}),
])

/** El orden del libro sin columna elegida: lo último primero. */
export const BY_LATEST = 'occurredAt,desc'

/**
 * Una página del libro entero, con sus filtros. Desde y hasta son días (YYYY-MM-DD) y cubren los dos
 * extremos enteros. La página empieza en 1.
 */
export async function searchMovements({
    type = null, warehouseId = null, projectId = null, materialId = null, fromDay = null, toDay = null, user = '',
    page = 1, size = 50, sort = null,
} = {}, {signal} = {}) {
    const body = await apiFetch(stockPath('movements'), {
        query: {
            movementType: type,
            warehouseId,
            projectId,
            materialId,
            ...dayRange(fromDay, toDay),
            user: user.trim(),
            ...toPageParams({page, size}),
            sort: sortWithTieBreak(sort, BY_LATEST),
        },
        signal,
    })
    return toPage(body)
}

/** Una página del libro de un material, en un almacén o en todos. */
export async function listMaterialMovements(materialId, {
    warehouseId = null, fromDay = null, toDay = null, user = '', page = 1, size = 50, sort = null,
} = {}, {signal} = {}) {
    const body = await apiFetch(stockPath('materials', materialId, 'movements'), {
        query: {
            warehouseId,
            ...dayRange(fromDay, toDay),
            user: user.trim(),
            ...toPageParams({page, size}),
            sort: sortWithTieBreak(sort, BY_LATEST),
        },
        signal,
    })
    return toPage(body)
}

/** 201 con el apunte. */
export function registerEntry(body) {
    return apiFetch(stockPath('movements', 'entries'), {method: 'POST', json: body})
}

/** 201 con el apunte. Con reservationId, la reserva queda consumida. */
export function registerOutput(body) {
    return apiFetch(stockPath('movements', 'outputs'), {method: 'POST', json: body})
}

/** 201 con el apunte. */
export function registerAdjustment(body) {
    return apiFetch(stockPath('movements', 'adjustments'), {method: 'POST', json: body})
}

/** 201 con los dos apuntes: el saliente y el entrante. */
export function registerTransfer(body) {
    return apiFetch(stockPath('movements', 'transfers'), {method: 'POST', json: body})
}

/**
 * Las peticiones de cada operación, desde lo escrito en su diálogo: ids, la cantidad como texto, la
 * fecha y hora como la deja el campo (YYYY-MM-DD HH:mm:ss, o nada) y los textos libres.
 */
export function entryRequest({materialId, warehouseId, supplierId = null, quantity, occurredAt = null, externalReference = '', notes = ''}) {
    return withoutNulls({materialId, warehouseId, supplierId, quantity: toQuantity(quantity), ...common({occurredAt, externalReference, notes})})
}

export function outputRequest({
    materialId, warehouseId, projectId = null, reservationId = null, quantity, occurredAt = null, externalReference = '', notes = '',
}) {
    return withoutNulls({
        materialId, warehouseId, projectId, reservationId, quantity: toQuantity(quantity), ...common({occurredAt, externalReference, notes}),
    })
}

export function transferRequest({
    materialId, warehouseId, targetWarehouseId, quantity, occurredAt = null, externalReference = '', notes = '',
}) {
    return withoutNulls({
        materialId, sourceWarehouseId: warehouseId, targetWarehouseId, quantity: toQuantity(quantity),
        ...common({occurredAt, externalReference, notes}),
    })
}

export function adjustmentRequest({materialId, warehouseId, direction, quantity, occurredAt = null, externalReference = '', notes = ''}) {
    if (!ADJUSTMENT_DIRECTIONS.some((option) => option.value === direction)) {
        throw new Error(`Sentido de ajuste desconocido: ${direction}`)
    }
    return withoutNulls({materialId, warehouseId, direction, quantity: toQuantity(quantity), ...common({occurredAt, externalReference, notes})})
}

function common({occurredAt, externalReference, notes}) {
    return {
        occurredAt: localDateTimeToInstant(occurredAt) ?? null,
        externalReference: textOrNull(externalReference),
        notes: textOrNull(notes),
    }
}

function dayRange(fromDay, toDay) {
    return {
        dateFrom: fromDay ? startOfDayInstant(fromDay) : undefined,
        dateTo: toDay ? endOfDayInstant(toDay) : undefined,
    }
}
