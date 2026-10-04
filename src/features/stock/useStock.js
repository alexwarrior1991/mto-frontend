import {keepPreviousData, useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {createCatalogueEntry, getAssemblyAvailability, searchCatalogue, updateCatalogueEntry} from '../../api/stock/catalogues.js'
import {getMaterialStock, listLowStock} from '../../api/stock/inventory.js'
import {listMaterialMovements, searchMovements} from '../../api/stock/movements.js'
import {
    cancelReservation,
    consumeReservation,
    createReservation,
    releaseReservation,
    searchReservations,
    updateReservation,
} from '../../api/stock/reservations.js'

/**
 * Las consultas y las escrituras del módulo de almacén. Las claves van todas bajo ['stock', …]:
 * - un catálogo: ['stock', 'catalogue', catálogo, lo que se pide];
 * - un desplegable: ['stock', 'picker', catálogo, si lleva lo retirado, texto];
 * - las cifras de un material: ['stock', 'figures', material, almacén];
 * - el libro de un material: ['stock', 'ledger', material, lo que se pide];
 * - los materiales bajo mínimo: ['stock', 'low-stock', lo que se pide];
 * - el libro entero: ['stock', 'movements', lo que se pide];
 * - las reservas: ['stock', 'reservations', lo que se pide];
 * - la disponibilidad de un conjunto: ['stock', 'availability', conjunto, almacén].
 *
 * Nada de eso se da por fresco: las cifras, los libros y las reservas cambian con lo que hace
 * cualquiera, y la pantalla enseña lo que dice el servicio. Tras cada escritura se relee lo que ha
 * podido cambiar con ella:
 * - un movimiento: las cifras, los dos libros, bajo mínimo y la disponibilidad;
 * - una salida con su reserva: además, las reservas;
 * - una reserva (alta, modificación, liberar o cancelar): las reservas, las cifras, bajo mínimo y la
 *   disponibilidad;
 * - consumir una reserva: además, los dos libros, porque deja una salida;
 * - guardar en un catálogo: todo el almacén, porque sus códigos y nombres salen en las demás listas.
 * Solo se vuelve a pedir lo que está en pantalla; lo demás queda viejo y se pide al abrirlo.
 */

/** Las filas de cada página, como el backoffice. */
export const STOCK_PAGE_SIZE = 50

const NOT_FRESH = 0

const INVENTORY = Object.freeze(['figures', 'ledger', 'low-stock', 'movements', 'availability'])
const RESERVATIONS = Object.freeze(['reservations', 'figures', 'low-stock', 'availability'])

export function stockKey(...parts) {
    return ['stock', ...parts]
}

function invalidate(queryClient, parts) {
    return Promise.all([...new Set(parts)].map((part) => queryClient.invalidateQueries({queryKey: stockKey(part)})))
}

/** Una página de un catálogo. Mientras llega la siguiente se sigue viendo la anterior. */
export function useCatalogueList(catalogue, params) {
    return useQuery({
        queryKey: stockKey('catalogue', catalogue, params),
        queryFn: ({signal}) => searchCatalogue(catalogue, {...params, size: STOCK_PAGE_SIZE}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

/** Las cifras de un material, en un almacén o en todos; sin material no se pide nada. */
export function useMaterialStock(materialId, warehouseId) {
    return useQuery({
        queryKey: stockKey('figures', materialId, warehouseId),
        queryFn: ({signal}) => getMaterialStock(materialId, {warehouseId}, {signal}),
        enabled: Boolean(materialId),
        staleTime: NOT_FRESH,
    })
}

/** Una página del libro de un material; sin material no se pide nada. */
export function useMaterialLedger(materialId, params) {
    return useQuery({
        queryKey: stockKey('ledger', materialId, params),
        queryFn: ({signal}) => listMaterialMovements(materialId, {...params, size: STOCK_PAGE_SIZE}, {signal}),
        enabled: Boolean(materialId),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

export function useLowStock(params) {
    return useQuery({
        queryKey: stockKey('low-stock', params),
        queryFn: ({signal}) => listLowStock({...params, size: STOCK_PAGE_SIZE}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

export function useMovementList(params) {
    return useQuery({
        queryKey: stockKey('movements', params),
        queryFn: ({signal}) => searchMovements({...params, size: STOCK_PAGE_SIZE}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

export function useReservationList(params) {
    return useQuery({
        queryKey: stockKey('reservations', params),
        queryFn: ({signal}) => searchReservations({...params, size: STOCK_PAGE_SIZE}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

/** Cuántos conjuntos se pueden montar en un almacén; sin almacén no se pide nada. */
export function useAssemblyAvailability(assemblyId, warehouseId) {
    return useQuery({
        queryKey: stockKey('availability', assemblyId, warehouseId),
        queryFn: ({signal}) => getAssemblyAvailability(assemblyId, warehouseId, {signal}),
        enabled: Boolean(warehouseId),
        staleTime: NOT_FRESH,
    })
}

/** El alta o la modificación de una entrada de catálogo, desde su editor, que trata él mismo sus errores. */
export function useSaveCatalogueEntry(catalogue) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({id = null, body}) => (id === null ? createCatalogueEntry(catalogue, body) : updateCatalogueEntry(catalogue, id, body)),
        meta: {notifyError: false},
        onSuccess: () => queryClient.invalidateQueries({queryKey: stockKey()}),
    })
}

/**
 * Un movimiento desde su diálogo, que trata él mismo sus errores.
 *
 * @param {{register: Function, body: object}} variables la llamada de la operación y su cuerpo
 */
export function useRegisterMovement() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({register, body}) => register(body),
        meta: {notifyError: false},
        onSuccess: (_movement, {body}) => invalidate(queryClient, body.reservationId ? [...INVENTORY, 'reservations'] : INVENTORY),
    })
}

/** El alta o la modificación de una reserva, desde su diálogo, que trata él mismo sus errores. */
export function useSaveReservation() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({id = null, body}) => (id === null ? createReservation(body) : updateReservation(id, body)),
        meta: {notifyError: false},
        onSuccess: () => invalidate(queryClient, RESERVATIONS),
    })
}

const RESERVATION_ACTIONS = Object.freeze({
    release: releaseReservation,
    cancel: cancelReservation,
    consume: consumeReservation,
})

/**
 * Liberar, cancelar o consumir una reserva, cada uno su llamada. Haya ido bien o no, se relee: si la
 * reserva ya no estaba activa (422 RES-001), la lista enseña cómo está.
 *
 * @param {{action: 'release'|'cancel'|'consume', reservation: object}} variables
 */
export function useReservationAction() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({action, reservation}) => RESERVATION_ACTIONS[action](reservation.id),
        onSettled: (_result, _error, {action}) => invalidate(queryClient, action === 'consume' ? [...RESERVATIONS, ...INVENTORY] : RESERVATIONS),
    })
}
