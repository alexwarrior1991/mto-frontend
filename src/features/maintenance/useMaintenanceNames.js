import {useQuery, useQueryClient} from '@tanstack/react-query'
import {useMemo} from 'react'
import {NotFoundError} from '../../api/errors.js'
import {getCatalogueEntry} from '../../api/stock/catalogues.js'
import {codeAndName, summaryOf} from '../../api/stock/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import {useReferenceCatalog} from '../infrastructure/useMasters.js'
import {stockKey} from '../stock/useStock.js'
import {maintenanceKey} from './useMaintenance.js'

/**
 * Los nombres de lo que mto-maintenance solo guarda como id (el port de MaintenanceNames): vías,
 * estaciones y paquetes de mto-configuration, y almacenes y proyectos de mto-stock. El servicio no los
 * copia, así que la pantalla los pide a su servicio con el token de la persona.
 *
 * Sin config-read o sin stock-read no se llama a ese servicio, que respondería 403: se pinta el id
 * (#12, o el principio del UUID) y sus desplegables salen vacíos. Los perfiles de mantenimiento del
 * realm llevan los dos permisos de lectura precisamente para esto. Un id que no se sabe nombrar nunca
 * se lee como vacío: un formulario que lo leyera vacío lo mandaría a vaciar.
 */

/** Cuánto vale un nombre de mto-stock: un almacén o un proyecto apenas cambian de nombre. */
const STOCK_NAME_STALE_MS = 5 * 60_000

/** El id que no se sabe nombrar: #12, o los ocho primeros caracteres de un UUID. */
export function shortId(id) {
    if (id === null || id === undefined || id === '') {
        return ''
    }
    const text = String(id)
    return /^[0-9a-f]{8}-/i.test(text) ? `#${text.slice(0, 8)}` : `#${text}`
}

/**
 * Vías, estaciones y paquetes, cargados una vez por pantalla con los catálogos de infraestructura. Sin
 * config-read no se pide nada.
 */
export function useConfigurationNames({stations = false, tracks = false} = {}) {
    const session = useSession()
    const readsConfiguration = session.has(P.CONFIG_READ)
    const references = useReferenceCatalog({stations, tracks, enabled: readsConfiguration})
    return useMemo(() => ({readsConfiguration, ...references}), [readsConfiguration, references])
}

/**
 * Los nombres de unos almacenes o proyectos de mto-stock, pedidos por id: una consulta por pantalla
 * que guarda cada uno aparte, así que un fallo del almacén se avisa una vez y lo ya leído no se vuelve
 * a pedir. Lo que no existe (404) se pinta como #id, sin aviso. Sin stock-read no se pide nada.
 *
 * @param {'warehouses'|'projects'} catalogue
 * @param {Array<string|null>} ids
 */
export function useStockNames(catalogue, ids) {
    const session = useSession()
    const readsStock = session.has(P.STOCK_READ)
    const queryClient = useQueryClient()
    const wanted = [...new Set((ids ?? []).filter((id) => id !== null && id !== undefined && id !== ''))].sort()
    const names = useQuery({
        queryKey: maintenanceKey('stock-names', catalogue, wanted),
        queryFn: async () => {
            const entries = await Promise.all(wanted.map((id) => queryClient.fetchQuery({
                queryKey: stockKey('entry', catalogue, id),
                queryFn: ({signal}) => getCatalogueEntry(catalogue, id, {signal})
                    .then(summaryOf)
                    .catch((error) => {
                        if (error instanceof NotFoundError) {
                            return null
                        }
                        throw error
                    }),
                staleTime: STOCK_NAME_STALE_MS,
                meta: {notifyError: false},
            })))
            return Object.fromEntries(wanted.map((id, index) => [id, entries[index]]))
        },
        enabled: readsStock && wanted.length > 0,
        staleTime: STOCK_NAME_STALE_MS,
    })
    const found = names.data
    // Leído, o sin nada que leer: un formulario espera a esto para partir del nombre y no del #id.
    const ready = !readsStock || wanted.length === 0 || names.isFetched
    return useMemo(() => {
        const entry = (id) => (id && found ? found[id] ?? null : null)
        return {
            readsStock,
            ready,
            entry,
            label: (id) => {
                const summary = entry(id)
                return summary ? codeAndName(summary.code, summary.name) : shortId(id)
            },
            /** Para un desplegable: el de mto-stock o, si no se sabe nombrar, uno con su id. Nunca null para un id. */
            ref: (id) => (id ? entry(id) ?? {id, code: shortId(id), name: null, active: true} : null),
        }
    }, [found, readsStock, ready])
}
