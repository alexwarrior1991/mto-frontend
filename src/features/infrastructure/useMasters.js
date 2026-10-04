import {keepPreviousData, useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {useMemo} from 'react'
import {filterMasters, listBusinessEntities} from '../../api/configuration/masters.js'
import {buildReferenceCatalog} from './references.js'

/** Las filas de cada página, como el backoffice. */
export const PAGE_SIZE = 50

/** Más que cualquiera de los maestros que se cargan enteros, y por debajo del tope del servicio. */
const ALL_REFERENCES = 1000

const BY_NAME = Object.freeze({field: 'name', direction: 'asc'})

export function mastersKey(path) {
    return path ? ['configuration', 'masters', path] : ['configuration', 'masters']
}

export function referencesKey(kind) {
    return kind ? ['configuration', 'references', kind] : ['configuration', 'references']
}

/**
 * Una página de la lista de un maestro. Mientras llega la siguiente se sigue viendo la anterior, como
 * en el Grid del backoffice.
 */
export function useMasterList(path, {page, sort, filter}) {
    return useQuery({
        queryKey: [...mastersKey(path), {page, sort, filter}],
        queryFn: ({signal}) => filterMasters(path, {page, size: PAGE_SIZE, sort, filter}, {signal}),
        placeholderData: keepPreviousData,
    })
}

/**
 * Una escritura en un maestro. Al acabar bien se releen las listas y las referencias, porque una
 * estación o una vía nuevas tienen que salir en los desplegables y con su nombre en las columnas. Quien
 * trata el error él mismo (el editor, que lleva los errores a sus campos) pasa handlesErrors.
 */
export function useMasterMutation(mutationFn, {handlesErrors = false} = {}) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn,
        meta: handlesErrors ? {notifyError: false} : undefined,
        onSuccess: () => Promise.all([
            queryClient.invalidateQueries({queryKey: mastersKey()}),
            queryClient.invalidateQueries({queryKey: referencesKey()}),
        ]),
    })
}

function useReferenceList(kind, path, enabled) {
    return useQuery({
        queryKey: referencesKey(kind),
        queryFn: ({signal}) => filterMasters(path, {page: 1, size: ALL_REFERENCES, sort: BY_NAME}, {signal})
            .then((page) => page.content),
        enabled,
    })
}

/**
 * Los nombres de paquetes, estaciones, vías y empresas, cargados una vez por pantalla y compartidos
 * por la lista y los editores. Los paquetes se cargan siempre, porque nombran a estaciones y vías.
 * Los perfiles no están aquí, porque son miles: el que hace falta se busca en el servidor.
 *
 * Con enabled=false no se pide nada (mantenimiento sin config-read, que respondería 403): cada id se
 * nombra #id y los desplegables salen vacíos.
 */
export function useReferenceCatalog({stations = false, tracks = false, companies = false, enabled = true} = {}) {
    const packageList = useReferenceList('packages', 'execution-packages', enabled)
    const stationList = useReferenceList('stations', 'stations', enabled && stations)
    const trackList = useReferenceList('tracks', 'tracks', enabled && tracks)
    const companyList = useQuery({
        queryKey: referencesKey('companies'),
        queryFn: ({signal}) => listBusinessEntities({signal}),
        enabled: enabled && companies,
    })
    const packageRows = packageList.data
    const stationRows = stationList.data
    const trackRows = trackList.data
    const companyRows = companyList.data
    return useMemo(() => buildReferenceCatalog({
        packages: Array.isArray(packageRows) ? packageRows : [],
        stations: Array.isArray(stationRows) ? stationRows : [],
        tracks: Array.isArray(trackRows) ? trackRows : [],
        companies: Array.isArray(companyRows) ? companyRows : [],
    }), [packageRows, stationRows, trackRows, companyRows])
}
