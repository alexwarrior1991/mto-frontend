import {apiFetch} from '../http.js'
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
