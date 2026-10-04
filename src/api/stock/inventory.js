import {apiFetch} from '../http.js'
import {sortWithTieBreak, toPage, toPageParams} from '../paging.js'
import {BY_CODE} from './catalogues.js'
import {stockPath} from './values.js'

/**
 * Las existencias de mto-stock: las cifras de un material y los materiales bajo mínimo. Es la parte de
 * existencias de MaterialClient del backoffice.
 *
 * Las cifras son del servicio, que las lee de su proyección (inventory_balance): físico, reservado
 * (solo las reservas activas), disponible y si está por debajo del mínimo. Aquí no se suma ni se
 * resta nada.
 */

/**
 * Las existencias de un material en un almacén, o en todos: entonces la cifra es el total y warehouse
 * llega a null. lowStock dice si el disponible que se enseña está por debajo del mínimo.
 */
export function getMaterialStock(materialId, {warehouseId = null} = {}, {signal} = {}) {
    return apiFetch(stockPath('materials', materialId, 'stock'), {query: {warehouseId}, signal})
}

/** Los materiales activos por debajo de su mínimo, en un almacén o en todos. La página empieza en 1. */
export async function listLowStock({warehouseId = null, page = 1, size = 50, sort = null} = {}, {signal} = {}) {
    const body = await apiFetch(stockPath('materials', 'low-stock'), {
        query: {warehouseId, ...toPageParams({page, size}), sort: sortWithTieBreak(sort, BY_CODE)},
        signal,
    })
    return toPage(body)
}
