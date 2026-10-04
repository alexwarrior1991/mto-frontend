import {keepPreviousData, useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {createAsset, disableAsset, enableAsset, listAssetOrders, patchAsset, searchAssets} from '../../api/maintenance/assets.js'
import {createTeam, listInspectionTemplates, listTaskTypes, listTeams, updateTeam} from '../../api/maintenance/catalogs.js'

/**
 * Las consultas y las escrituras del módulo de mantenimiento. Las claves van todas bajo
 * ['maintenance', …]:
 * - los catálogos: ['maintenance', 'teams'], ['maintenance', 'task-types', grupo] y
 *   ['maintenance', 'templates'];
 * - los activos: ['maintenance', 'assets', lo que se pide], y sus órdenes,
 *   ['maintenance', 'asset-orders', activo, lo que se pide];
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
