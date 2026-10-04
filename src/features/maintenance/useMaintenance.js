import {keepPreviousData, useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {createAsset, disableAsset, enableAsset, listAssetOrders, patchAsset, searchAssets} from '../../api/maintenance/assets.js'
import {createTeam, listInspectionTemplates, listTaskTypes, listTeams, updateTeam} from '../../api/maintenance/catalogs.js'
import {listOrderMaterials, patchMaterial, registerMaterial, removeMaterial, syncMaterial} from '../../api/maintenance/materials.js'
import {createOrder, getOrder, listOrderHistory, patchOrder, searchOrders, transitionOrder} from '../../api/maintenance/orders.js'
import {cancelTask, createTask, generateTasks, listOrderTasks, patchCheckItem, patchTask} from '../../api/maintenance/tasks.js'

/**
 * Las consultas y las escrituras del módulo de mantenimiento. Las claves van todas bajo
 * ['maintenance', …]:
 * - los catálogos: ['maintenance', 'teams'], ['maintenance', 'task-types', grupo] y
 *   ['maintenance', 'templates'];
 * - los activos: ['maintenance', 'assets', lo que se pide], y sus órdenes,
 *   ['maintenance', 'asset-orders', activo, lo que se pide];
 * - las órdenes: la lista, ['maintenance', 'orders', lo que se pide]; la cabecera de una ficha,
 *   ['maintenance', 'order', id], que no es prefijo de sus pestañas: ['maintenance', 'order-tasks', id],
 *   'order-materials', 'order-defects', 'order-inspections' y 'order-history';
 * - un desplegable: ['maintenance', 'picker', qué, filtro, texto];
 * - los nombres de mto-stock: ['maintenance', 'stock-names', catálogo, ids].
 *
 * Nada se da por fresco: estados, tareas y líneas cambian con lo que hace cualquiera, y la pantalla
 * enseña lo que dice el servicio. Tras una escritura se relee lo que ha podido cambiar con ella, y
 * solo se vuelve a pedir lo que está en pantalla; lo demás queda viejo y se pide al abrirlo.
 */

/** Las filas de cada página, como el backoffice. */
export const MAINTENANCE_PAGE_SIZE = 50

const NOT_FRESH = 0

export function maintenanceKey(...parts) {
    return ['maintenance', ...parts]
}

/** Todos los equipos, también los retirados, para nombrar lo que ya estaba asignado. */
export function useTeams() {
    return useQuery({queryKey: maintenanceKey('teams'), queryFn: ({signal}) => listTeams({signal}), staleTime: NOT_FRESH})
}

/** Los tipos de tarea del plan; con un grupo, solo los suyos. */
export function useTaskTypes(functionalGroup = null) {
    return useQuery({
        queryKey: maintenanceKey('task-types', functionalGroup),
        queryFn: ({signal}) => listTaskTypes({functionalGroup}, {signal}),
        staleTime: NOT_FRESH,
    })
}

export function useInspectionTemplates() {
    return useQuery({
        queryKey: maintenanceKey('templates'),
        queryFn: ({signal}) => listInspectionTemplates({signal}),
        staleTime: NOT_FRESH,
    })
}

/** El alta o la modificación de un equipo, desde su editor, que trata él mismo sus errores. */
export function useSaveTeam() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({id = null, body}) => (id === null ? createTeam(body) : updateTeam(id, body)),
        meta: {notifyError: false},
        onSuccess: () => queryClient.invalidateQueries({queryKey: maintenanceKey('teams')}),
    })
}

/** Una página de activos. Mientras llega la siguiente se sigue viendo la anterior. */
export function useAssetList(params) {
    return useQuery({
        queryKey: maintenanceKey('assets', params),
        queryFn: ({signal}) => searchAssets({...params, size: MAINTENANCE_PAGE_SIZE}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

export function useAssetOrders(assetId, params) {
    return useQuery({
        queryKey: maintenanceKey('asset-orders', assetId, params),
        queryFn: ({signal}) => listAssetOrders(assetId, {...params, size: MAINTENANCE_PAGE_SIZE}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

/**
 * El alta de un tramo o la modificación de un activo, desde su editor, que trata él mismo sus errores.
 * Un activo sale en las órdenes, las inspecciones y los defectos: se relee todo el módulo.
 */
export function useSaveAsset() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({id = null, body}) => (id === null ? createAsset(body) : patchAsset(id, body)),
        meta: {notifyError: false},
        onSuccess: () => queryClient.invalidateQueries({queryKey: maintenanceKey()}),
    })
}

/**
 * Desactivar (DELETE) o reactivar (PATCH con enabled=true) un activo. Haya ido bien o no, se relee: si
 * el servicio dice que no (409 AST-001), la lista enseña cómo está.
 *
 * @param {{action: 'disable'|'enable', asset: object}} variables
 */
export function useAssetAction() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({action, asset}) => (action === 'disable' ? disableAsset(asset.id) : enableAsset(asset)),
        onSettled: () => queryClient.invalidateQueries({queryKey: maintenanceKey()}),
    })
}

/** Las pestañas de la ficha de una orden: releerlas solo pide las que se abrieron. */
const ORDER_TABS = Object.freeze(['order-tasks', 'order-materials', 'order-defects', 'order-inspections', 'order-history'])

/** Lo que cambia con una orden fuera de su ficha: las listas en las que sale. */
function invalidateOrderLists(queryClient) {
    return Promise.all(['orders', 'asset-orders'].map((part) => queryClient.invalidateQueries({queryKey: maintenanceKey(part)})))
}

function invalidateOrderTabs(queryClient, orderId) {
    return Promise.all(ORDER_TABS.map((tab) => queryClient.invalidateQueries({queryKey: maintenanceKey(tab, orderId)})))
}

export function useOrderList(params) {
    return useQuery({
        queryKey: maintenanceKey('orders', params),
        queryFn: ({signal}) => searchOrders({...params, size: MAINTENANCE_PAGE_SIZE}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

/** La cabecera de la ficha de una orden. Una que no existe se dice una vez («No existe la orden …»). */
export function useOrder(orderId) {
    return useQuery({
        queryKey: maintenanceKey('order', orderId),
        queryFn: ({signal}) => getOrder(orderId, {signal}),
        staleTime: NOT_FRESH,
        meta: {notFoundMessage: `No existe la orden ${orderId}`},
    })
}

export function useOrderTasks(orderId) {
    return useQuery({queryKey: maintenanceKey('order-tasks', orderId), queryFn: ({signal}) => listOrderTasks(orderId, {signal}), staleTime: NOT_FRESH})
}

export function useOrderHistory(orderId) {
    return useQuery({queryKey: maintenanceKey('order-history', orderId), queryFn: ({signal}) => listOrderHistory(orderId, {signal}), staleTime: NOT_FRESH})
}

/**
 * Las líneas de material de una orden. Con enabled=false no se piden (el editor solo las mira fuera de
 * borrador y con stock-read).
 */
export function useOrderMaterials(orderId, {enabled = true, notifyError = true} = {}) {
    return useQuery({
        queryKey: maintenanceKey('order-materials', orderId),
        queryFn: ({signal}) => listOrderMaterials(orderId, {signal}),
        enabled,
        staleTime: NOT_FRESH,
        meta: notifyError ? undefined : {notifyError: false},
    })
}

/**
 * El alta o la modificación de una orden, desde su editor, que trata él mismo sus errores. La ficha
 * pinta lo que devuelve el servicio.
 */
export function useSaveOrder() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({id = null, body}) => (id === null ? createOrder(body) : patchOrder(id, body)),
        meta: {notifyError: false},
        onSuccess: (saved) => {
            queryClient.setQueryData(maintenanceKey('order', saved.id), saved)
            return invalidateOrderLists(queryClient)
        },
    })
}

/**
 * Una transición de la orden (planificar, asignar, iniciar, completar o cancelar), desde su diálogo,
 * que trata él mismo sus errores. La ficha se repinta con la orden que devuelve el servicio y se
 * releen las pestañas abiertas: una transición reserva, consume o libera materiales y deja su estado.
 *
 * @param {{transition: string, body: object}} variables
 */
export function useOrderTransition(orderId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({transition, body}) => transitionOrder(orderId, transition, body),
        meta: {notifyError: false},
        onSuccess: (order) => {
            queryClient.setQueryData(maintenanceKey('order', orderId), order)
            return Promise.all([invalidateOrderTabs(queryClient, orderId), invalidateOrderLists(queryClient)])
        },
    })
}

/** Tras tocar una tarea se relee la cabecera (el avance y la estimación) y sus tareas. */
function invalidateTasksOf(queryClient, orderId) {
    return Promise.all([
        queryClient.invalidateQueries({queryKey: maintenanceKey('order', orderId)}),
        queryClient.invalidateQueries({queryKey: maintenanceKey('order-tasks', orderId)}),
        invalidateOrderLists(queryClient),
    ])
}

/** El alta o la modificación de una tarea, desde su editor, que trata él mismo sus errores. */
export function useSaveTask(orderId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({taskId = null, body}) => (taskId === null ? createTask(orderId, body) : patchTask(orderId, taskId, body)),
        meta: {notifyError: false},
        onSuccess: () => invalidateTasksOf(queryClient, orderId),
    })
}

export function useGenerateTasks(orderId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (body) => generateTasks(orderId, body),
        onSuccess: () => invalidateTasksOf(queryClient, orderId),
    })
}

/** Cancelar una tarea con su motivo; si el servicio dice que no, el diálogo sigue abierto. */
export function useCancelTask(orderId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({taskId, reason}) => cancelTask(orderId, taskId, reason),
        onSuccess: () => invalidateTasksOf(queryClient, orderId),
    })
}

/** Un punto del checklist de una tarea; responde con la tarea entera, con sus puntos como quedaron. */
export function useSaveTaskCheckItem(orderId, taskId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({itemId, patch}) => patchCheckItem(orderId, taskId, itemId, patch),
        onSuccess: () => invalidateTasksOf(queryClient, orderId),
    })
}

/** Lo que cambia con una línea de material son las líneas de su orden, que también mira el editor de la orden. */
function invalidateMaterialsOf(queryClient, orderId) {
    return queryClient.invalidateQueries({queryKey: maintenanceKey('order-materials', orderId)})
}

/** El alta o la modificación de una línea, desde su diálogo, que trata él mismo sus errores. */
export function useSaveMaterial(orderId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({lineId = null, body}) => (lineId === null ? registerMaterial(orderId, body) : patchMaterial(orderId, lineId, body)),
        meta: {notifyError: false},
        onSuccess: () => invalidateMaterialsOf(queryClient, orderId),
    })
}

/**
 * Sincronizar una línea con el almacén. Se relee salga bien o no: si el almacén sigue caído o dice que
 * no, la respuesta es el error, pero la línea guarda lo que pasó (el motivo, el estado).
 */
export function useSyncMaterial(orderId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (lineId) => syncMaterial(orderId, lineId),
        onSettled: () => invalidateMaterialsOf(queryClient, orderId),
    })
}

/** Quitar una línea; se relee salga bien o no (con el almacén caído, la línea se queda como estaba). */
export function useRemoveMaterial(orderId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (lineId) => removeMaterial(orderId, lineId),
        onSettled: () => invalidateMaterialsOf(queryClient, orderId),
    })
}
