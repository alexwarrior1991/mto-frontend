import {useQueries} from '@tanstack/react-query'
import {listLovs} from '../../api/configuration/lovs.js'
import {catalogueKey} from '../catalogues/useCatalogue.js'

/**
 * Las entradas de varios catálogos para los desplegables de un editor (el port de LovCatalog). Cada
 * catálogo se pide una vez y comparte la caché con su pantalla de catálogos. Llegan todas las entradas,
 * también las desactivadas, porque la referencia que ya tiene un perfil puede apuntar a una entrada
 * dada de baja y tiene que seguir viéndose.
 *
 * @param {string[]} paths los catálogos (profile-statuses, pole-types...)
 * @returns {Record<string, Array>} las entradas de cada uno; lista vacía mientras no han llegado
 */
export function useCatalogues(paths) {
    return useQueries({
        queries: paths.map((path) => ({
            queryKey: catalogueKey(path),
            queryFn: ({signal}) => listLovs(path, {signal}),
        })),
        combine: (results) => Object.fromEntries(paths.map((path, index) => {
            const data = results[index].data
            return [path, Array.isArray(data) ? data : []]
        })),
    })
}
