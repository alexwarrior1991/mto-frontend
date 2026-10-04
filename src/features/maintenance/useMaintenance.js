import {keepPreviousData, useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {NotFoundError} from '../../api/errors.js'
import {createAsset, disableAsset, enableAsset, listAssetOrders, patchAsset, searchAssets} from '../../api/maintenance/assets.js'
import {createTeam, listInspectionTemplates, listTaskTypes, listTeams, updateTeam} from '../../api/maintenance/catalogs.js'
import {listOrderMaterials, patchMaterial, registerMaterial, removeMaterial, syncMaterial} from '../../api/maintenance/materials.js'
import {createDefect, getDefect, listDefectHistory, patchDefect, searchDefects, transitionDefect} from '../../api/maintenance/defects.js'
import {isOpenOrder} from '../../api/maintenance/enums.js'
import {
    createCorrectiveOrder,
    createDefectFromInspection,
    createInspection,
    getInspection,
    patchInspection,
    patchInspectionItem,
    searchInspections,
} from '../../api/maintenance/inspections.js'
import {createOrder, getOrder, listOrderHistory, patchOrder, searchOrders, transitionOrder} from '../../api/maintenance/orders.js'
import {getShiftReport} from '../../api/maintenance/reports.js'
import {
    assignTaskToShift,
    cancelShift,
    createShift,
    getShift,
    listShiftProfiles,
    listShiftTasks,
    patchShift,
    searchShifts,
    transitionShift,
} from '../../api/maintenance/shifts.js'
import {cancelTask, completeTask, createTask, generateTasks, listOrderTasks, patchCheckItem, patchTask, startTask} from '../../api/maintenance/tasks.js'

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
 * - los turnos: la lista, ['maintenance', 'shifts', lo que se pide]; la cabecera de una ficha,
 *   ['maintenance', 'shift', id], y sus pestañas, 'shift-tasks', 'shift-profiles' y 'shift-report';
 * - las inspecciones y los defectos: sus listas, ['maintenance', 'inspections'|'defects', lo que se
 *   pide]; una ficha, ['maintenance', 'inspection'|'defect', id], y los estados de un defecto,
 *   ['maintenance', 'defect-history', id];
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

/** Las tareas de una orden; con enabled=false (sin orden elegida) no se piden. */
export function useOrderTasks(orderId, {enabled = true} = {}) {
    return useQuery({
        queryKey: maintenanceKey('order-tasks', orderId),
        queryFn: ({signal}) => listOrderTasks(orderId, {signal}),
        enabled: enabled && Boolean(orderId),
        staleTime: NOT_FRESH,
    })
}

/**
 * Las órdenes abiertas de una vía, la prevista antes primero: de dónde asignar tareas a un turno. Van
 * bajo 'orders', así que lo que relee las listas de órdenes las relee también.
 */
export function useOpenOrdersOnTrack(trackId) {
    return useQuery({
        queryKey: maintenanceKey('orders', {trackId, assignable: true}),
        queryFn: async ({signal}) => {
            const page = await searchOrders({trackId, size: 100, sort: {field: 'plannedDate', direction: 'asc'}}, {signal})
            return page.content.filter((order) => isOpenOrder(order.status))
        },
        enabled: trackId !== null && trackId !== undefined,
        staleTime: NOT_FRESH,
    })
}

/**
 * Los códigos de unas órdenes, para la columna «Orden» de las tareas de un turno: las tareas solo traen
 * el id, y un turno tiene pocas órdenes. Una que ya no existe se pinta como «?».
 */
export function useOrderCodes(orderIds) {
    const ids = [...new Set((orderIds ?? []).filter(Boolean))].sort()
    return useQuery({
        queryKey: maintenanceKey('order-codes', ids),
        queryFn: async ({signal}) => Object.fromEntries(await Promise.all(ids.map(async (id) => {
            try {
                return [id, (await getOrder(id, {signal})).code]
            } catch (error) {
                if (error instanceof NotFoundError) {
                    return [id, '?']
                }
                throw error
            }
        }))),
        enabled: ids.length > 0,
        staleTime: NOT_FRESH,
    })
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

/** Lo que un turno enseña de las tareas que trabaja: su lista, sus perfiles y su parte. */
const SHIFT_TABS = Object.freeze(['shift-tasks', 'shift-profiles', 'shift-report'])

/** Las pestañas de un turno, o las de todos: una tarea no sabe en qué turno se pinta. */
function invalidateShiftTabs(queryClient, shiftId = undefined) {
    return Promise.all(SHIFT_TABS.map((tab) => queryClient.invalidateQueries({
        queryKey: shiftId === undefined ? maintenanceKey(tab) : maintenanceKey(tab, shiftId),
    })))
}

/**
 * Tras tocar una tarea se relee la cabecera de su orden (el avance y la estimación), sus tareas y lo
 * que la enseña en un turno.
 */
function invalidateTasksOf(queryClient, orderId) {
    return Promise.all([
        queryClient.invalidateQueries({queryKey: maintenanceKey('order', orderId)}),
        queryClient.invalidateQueries({queryKey: maintenanceKey('order-tasks', orderId)}),
        invalidateOrderLists(queryClient),
        invalidateShiftTabs(queryClient),
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

/**
 * Cancelar una tarea con su motivo; si el servicio dice que no, el diálogo sigue abierto. La orden es
 * la de la ficha o, desde un turno, la de cada tarea ({orderId} en la llamada).
 */
export function useCancelTask(orderId = null) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({taskId, reason, orderId: taskOrder = orderId}) => cancelTask(taskOrder, taskId, reason),
        onSuccess: (_task, {orderId: taskOrder = orderId}) => invalidateTasksOf(queryClient, taskOrder),
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

export function useShiftList(params) {
    return useQuery({
        queryKey: maintenanceKey('shifts', params),
        queryFn: ({signal}) => searchShifts({...params, size: MAINTENANCE_PAGE_SIZE}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

/** La cabecera de una ficha de turno. Un turno que no existe se dice una vez y la ficha vuelve a la lista. */
export function useShift(shiftId) {
    return useQuery({
        queryKey: maintenanceKey('shift', shiftId),
        queryFn: ({signal}) => getShift(shiftId, {signal}),
        staleTime: NOT_FRESH,
        meta: {notFoundMessage: `No existe el turno ${shiftId}`},
    })
}

export function useShiftTasks(shiftId) {
    return useQuery({queryKey: maintenanceKey('shift-tasks', shiftId), queryFn: ({signal}) => listShiftTasks(shiftId, {signal}), staleTime: NOT_FRESH})
}

export function useShiftProfiles(shiftId, status) {
    return useQuery({
        queryKey: maintenanceKey('shift-profiles', shiftId, status),
        queryFn: ({signal}) => listShiftProfiles(shiftId, {status, signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

export function useShiftReport(shiftId) {
    return useQuery({queryKey: maintenanceKey('shift-report', shiftId), queryFn: ({signal}) => getShiftReport(shiftId, {signal}), staleTime: NOT_FRESH})
}

/** Los turnos en curso de una vía, para completar desde la orden una tarea de esa vía. */
export function useInProgressShifts(trackId, {enabled = true} = {}) {
    return useQuery({
        queryKey: maintenanceKey('shifts', {trackId, status: 'IN_PROGRESS'}),
        queryFn: ({signal}) => searchShifts({trackId, status: 'IN_PROGRESS', size: MAINTENANCE_PAGE_SIZE}, {signal}),
        enabled: enabled && trackId !== null && trackId !== undefined,
        staleTime: NOT_FRESH,
    })
}

/** Tras cambiar un turno: su cabecera queda con lo que devolvió el servicio, y se releen sus pestañas y las listas. */
function shiftChanged(queryClient, shift) {
    queryClient.setQueryData(maintenanceKey('shift', shift.id), shift)
    return Promise.all([invalidateShiftTabs(queryClient, shift.id), queryClient.invalidateQueries({queryKey: maintenanceKey('shifts')})])
}

/** El alta o la modificación de un turno, desde su editor, que trata él mismo sus errores. */
export function useSaveShift() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({id = null, body}) => (id === null ? createShift(body) : patchShift(id, body)),
        meta: {notifyError: false},
        onSuccess: (saved) => shiftChanged(queryClient, saved),
    })
}

/**
 * Iniciar, cerrar o cancelar un turno, desde su diálogo, que trata él mismo sus errores. Al cerrar o
 * cancelar, las tareas sin terminar vuelven a su orden: se releen las tareas de las órdenes.
 *
 * @param {{transition: 'start'|'close'|'cancel', body: object}} variables
 */
export function useShiftTransition(shiftId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({transition, body}) => (transition === 'cancel' ? cancelShift(shiftId, body.reason) : transitionShift(shiftId, transition, body)),
        meta: {notifyError: false},
        onSuccess: (shift) => Promise.all([
            shiftChanged(queryClient, shift),
            queryClient.invalidateQueries({queryKey: maintenanceKey('order-tasks')}),
        ]),
    })
}

/**
 * Asignar una tarea al turno; el diálogo las asigna una a una y cuenta las que el servicio rechaza.
 * Al terminar, el diálogo relee lo que cambió con settled.
 */
export function useAssignTask(shiftId) {
    const queryClient = useQueryClient()
    const mutation = useMutation({
        mutationFn: (taskId) => assignTaskToShift(shiftId, taskId),
        meta: {notifyError: false},
    })
    const settled = (orderId) => Promise.all([
        invalidateShiftTabs(queryClient, shiftId),
        queryClient.invalidateQueries({queryKey: maintenanceKey('order-tasks', orderId)}),
    ])
    return {...mutation, settled}
}

/** Iniciar una tarea en un turno en curso. */
export function useStartTask() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({orderId, taskId, shiftId}) => startTask(orderId, taskId, {shiftId}),
        onSuccess: (_task, {orderId}) => invalidateTasksOf(queryClient, orderId),
    })
}

/**
 * Completar una tarea, desde su diálogo, que trata él mismo sus errores. Deja defectos y líneas de
 * material en la orden y una fila en el parte del turno: se relee la orden entera y el turno.
 */
export function useCompleteTask(orderId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({taskId, body}) => completeTask(orderId, taskId, body),
        meta: {notifyError: false},
        onSuccess: () => Promise.all([
            invalidateTasksOf(queryClient, orderId),
            invalidateOrderTabs(queryClient, orderId),
        ]),
    })
}

/** Los turnos recientes de una vía, el más reciente primero: en cuál se corrigió un defecto. */
export function useRecentShiftsOn(trackId) {
    return useQuery({
        queryKey: maintenanceKey('shifts', {trackId, recent: true}),
        queryFn: ({signal}) => searchShifts({trackId, size: MAINTENANCE_PAGE_SIZE}, {signal}),
        enabled: trackId !== null && trackId !== undefined,
        staleTime: NOT_FRESH,
    })
}

export function useInspectionList(params) {
    return useQuery({
        queryKey: maintenanceKey('inspections', params),
        queryFn: ({signal}) => searchInspections({...params, size: MAINTENANCE_PAGE_SIZE}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

/** Una ficha de inspección. Una que no existe se dice una vez y la ficha vuelve a la lista. */
export function useInspection(inspectionId) {
    return useQuery({
        queryKey: maintenanceKey('inspection', inspectionId),
        queryFn: ({signal}) => getInspection(inspectionId, {signal}),
        staleTime: NOT_FRESH,
        meta: {notFoundMessage: `No existe la inspección ${inspectionId}`},
    })
}

/** Las inspecciones hechas desde una orden de inspección: la pestaña Inspecciones de su ficha. */
export function useOrderInspections(orderId) {
    return useQuery({
        queryKey: maintenanceKey('order-inspections', orderId),
        queryFn: async ({signal}) => (await searchInspections({originOrderId: orderId, size: 100}, {signal})).content,
        staleTime: NOT_FRESH,
    })
}

/** Lo que enseña una inspección fuera de su ficha: las listas y las pestañas de las órdenes. */
function invalidateInspectionLists(queryClient) {
    return Promise.all(['inspections', 'order-inspections'].map((part) => queryClient.invalidateQueries({queryKey: maintenanceKey(part)})))
}

/** El alta o la modificación de una inspección, desde su editor, que trata él mismo sus errores. */
export function useSaveInspection() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({id = null, body}) => (id === null ? createInspection(body) : patchInspection(id, body)),
        meta: {notifyError: false},
        onSuccess: (saved) => {
            queryClient.setQueryData(maintenanceKey('inspection', saved.id), saved)
            return invalidateInspectionLists(queryClient)
        },
    })
}

/** Un punto de una inspección; responde con la inspección entera, que la ficha pinta. */
export function useSaveInspectionItem(inspectionId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({itemId, patch}) => patchInspectionItem(inspectionId, itemId, patch),
        onSuccess: (inspection) => {
            queryClient.setQueryData(maintenanceKey('inspection', inspectionId), inspection)
            return invalidateInspectionLists(queryClient)
        },
    })
}

/**
 * El defecto o la orden correctiva que genera una inspección, desde su diálogo, que trata él mismo
 * sus errores. La inspección se relee: ahora enlaza a lo que generó.
 *
 * @param {{kind: 'defect'|'order', body: object}} variables
 */
export function useInspectionOutcome(inspectionId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({kind, body}) => (kind === 'defect' ? createDefectFromInspection(inspectionId, body) : createCorrectiveOrder(inspectionId, body)),
        meta: {notifyError: false},
        onSuccess: (_created, {kind}) => Promise.all([
            queryClient.invalidateQueries({queryKey: maintenanceKey('inspection', inspectionId)}),
            invalidateInspectionLists(queryClient),
            kind === 'defect' ? invalidateDefectLists(queryClient) : invalidateOrderLists(queryClient),
        ]),
    })
}

export function useDefectList(params) {
    return useQuery({
        queryKey: maintenanceKey('defects', params),
        queryFn: ({signal}) => searchDefects({...params, size: MAINTENANCE_PAGE_SIZE}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

/** Una ficha de defecto. Uno que no existe se dice una vez y la ficha vuelve a la lista. */
export function useDefect(defectId) {
    return useQuery({
        queryKey: maintenanceKey('defect', defectId),
        queryFn: ({signal}) => getDefect(defectId, {signal}),
        staleTime: NOT_FRESH,
        meta: {notFoundMessage: `No existe el defecto ${defectId}`},
    })
}

export function useDefectHistory(defectId) {
    return useQuery({queryKey: maintenanceKey('defect-history', defectId), queryFn: ({signal}) => listDefectHistory(defectId, {signal}),
        staleTime: NOT_FRESH})
}

/** Los defectos vinculados a una orden: la pestaña Defectos de su ficha. */
export function useOrderDefects(orderId) {
    return useQuery({
        queryKey: maintenanceKey('order-defects', orderId),
        queryFn: async ({signal}) => (await searchDefects({orderId, size: 100}, {signal})).content,
        staleTime: NOT_FRESH,
    })
}

/** Lo que enseña un defecto fuera de su ficha: las listas y las pestañas de las órdenes. */
function invalidateDefectLists(queryClient) {
    return Promise.all(['defects', 'order-defects'].map((part) => queryClient.invalidateQueries({queryKey: maintenanceKey(part)})))
}

/** El alta o la modificación de un defecto, desde su editor, que trata él mismo sus errores. */
export function useSaveDefect() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({id = null, body}) => (id === null ? createDefect(body) : patchDefect(id, body)),
        meta: {notifyError: false},
        onSuccess: (saved) => {
            queryClient.setQueryData(maintenanceKey('defect', saved.id), saved)
            return invalidateDefectLists(queryClient)
        },
    })
}

/**
 * Una transición del defecto (vincular, resolver, cerrar o descartar), desde su diálogo, que trata él
 * mismo sus errores. La ficha pinta el defecto que devuelve el servicio y relee sus estados.
 *
 * @param {{transition: 'link'|'resolve'|'close'|'discard', body?: object, orderId?: string}} variables
 */
export function useDefectTransition(defectId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({transition, body = null, orderId = null}) => transitionDefect(defectId, transition, {body, orderId}),
        meta: {notifyError: false},
        onSuccess: (defect) => {
            queryClient.setQueryData(maintenanceKey('defect', defectId), defect)
            return Promise.all([
                queryClient.invalidateQueries({queryKey: maintenanceKey('defect-history', defectId)}),
                invalidateDefectLists(queryClient),
            ])
        },
    })
}
