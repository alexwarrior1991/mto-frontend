import {localDateTimeToInstant} from '../dates.js'
import {defineEnum} from '../enums.js'
import {apiFetch} from '../http.js'
import {sortWithTieBreak, toPage, toPageParams} from '../paging.js'
import {stockPath, toQuantity, withoutNulls} from './values.js'

/**
 * Las reservas de mto-stock: el port de ReservationClient y de sus peticiones en el backoffice.
 *
 * - Una reserva nace activa y reduce el disponible; sin disponible, el alta es un 409 STK-001. Siempre
 *   es para un proyecto.
 * - Solo una reserva activa cambia, y cada cambio es su llamada, que no se funde con las demás:
 *   - modificar es un PUT con el almacén, el proyecto y la cantidad, sin el material, que no cambia;
 *   - liberar (vuelve al disponible sin movimiento) y consumir (el material sale: queda una salida en
 *     el libro, sin referencia ni notas) son POST sin cuerpo;
 *   - cancelar es un DELETE que devuelve la reserva cancelada y pide stock-delete.
 *   En una reserva que ya no está activa, cualquiera de ellos es un 422 RES-001.
 * - Para que la salida lleve referencia y notas, la reserva se consume con una salida de movimientos
 *   con su reservationId.
 *
 * Permisos que aplica el servicio: leer pide stock-read; crear, modificar, liberar y consumir,
 * stock-write; cancelar, stock-delete.
 */

/** Solo una reserva activa reduce el disponible y solo una activa cambia. Una desconocida no es activa: su fila no ofrece cambios. */
export const RESERVATION_STATUS = defineEnum({
    ACTIVE: 'Activa',
    RELEASED: 'Liberada',
    CONSUMED: 'Consumida',
    CANCELLED: 'Cancelada',
})

/** El orden de la lista sin columna elegida: la más reciente primero. */
export const BY_RESERVED = 'reservedAt,desc'

export function isActiveReservation(reservation) {
    return reservation?.status === 'ACTIVE'
}

/** Una página de reservas, con sus filtros; sin estado, todas. La página empieza en 1. */
export async function searchReservations({
    warehouseId = null, status = null, projectId = null, materialId = null, page = 1, size = 50, sort = null,
} = {}, {signal} = {}) {
    const body = await apiFetch(stockPath('reservations'), {
        query: {warehouseId, status, projectId, materialId, ...toPageParams({page, size}), sort: sortWithTieBreak(sort, BY_RESERVED)},
        signal,
    })
    return toPage(body)
}

export function getReservation(id, {signal} = {}) {
    return apiFetch(stockPath('reservations', id), {signal})
}

/** 201 con la reserva, activa. */
export function createReservation(body) {
    return apiFetch(stockPath('reservations'), {method: 'POST', json: body})
}

export function updateReservation(id, body) {
    return apiFetch(stockPath('reservations', id), {method: 'PUT', json: body})
}

/** El DELETE responde 200 con la reserva ya cancelada. */
export function cancelReservation(id) {
    return apiFetch(stockPath('reservations', id), {method: 'DELETE'})
}

export function releaseReservation(id) {
    return apiFetch(stockPath('reservations', id, 'release'), {method: 'POST'})
}

/** Consume la reserva entera y escribe su salida en el libro. */
export function consumeReservation(id) {
    return apiFetch(stockPath('reservations', id, 'consume'), {method: 'POST'})
}

/** La ruta del historial de una reserva, para listRevisions. */
export function reservationRevisionsPath(id) {
    return stockPath('reservations', id, 'revisions')
}

/** El alta, desde lo escrito en su diálogo; sin fecha, el servicio pone ahora. */
export function reservationRequest({materialId, warehouseId, projectId, quantity, reservedAt = null}) {
    return withoutNulls({materialId, warehouseId, projectId, quantity: toQuantity(quantity), reservedAt: localDateTimeToInstant(reservedAt)})
}

/** La modificación no lleva el material: el servicio no lo cambia. */
export function reservationUpdateRequest({warehouseId, projectId, quantity}) {
    return {warehouseId, projectId, quantity: toQuantity(quantity)}
}
