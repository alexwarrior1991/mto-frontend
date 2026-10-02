import {apiFetch} from '../http.js'
import {sortParam, toPage, toPageParams} from '../paging.js'
import {prefixOf} from '../services.js'

/**
 * Los maestros de infraestructura de mto-configuration: paquetes de ejecución, estaciones, vías,
 * perfiles, seccionadores y aisladores de sección. Es el port de MasterClient, MasterFilters,
 * TrackClient.schematic y BusinessEntityClient del backoffice. Los seis comparten la familia de
 * endpoints de CRUDController, así que van parametrizados por recurso.
 *
 * Permisos que aplica el servicio: leer pide config-read; crear y modificar, config-write; borrar,
 * config-delete.
 *
 * Cómo viaja un maestro (README_API.md §3 y §4 de mto-configuration):
 * - La lista se pide página a página a POST /{recurso}/filter. Sin orden elegido, sort no viaja y
 *   ordena el servicio.
 * - Una modificación es la fila leída entera con lo cambiado encima. Lo que la pantalla no enseña y
 *   el versionNumber (el bloqueo optimista) vuelven tal cual; si otra persona guardó antes, 409
 *   CON-001.
 * - Una colección de hijos que se manda es el estado final: el hijo que falta se borra. Por eso la
 *   que el editor no toca viaja a null («de esta no digo nada»), y la que toca va entera.
 * - Una referencia a catálogo se resuelve por su código. En un perfil, null es «no la toques» y {}
 *   (sin código) la quita.
 * - Borrar es lógico: la fila desaparece de las listas y lo que cuelga de ella se queda.
 */

/** Las colecciones de hijos de cada maestro (README_API.md §4: «Dónde aplica»). */
export const MASTER_CHILDREN = Object.freeze({
    'execution-packages': Object.freeze(['tracks', 'stations']),
    stations: Object.freeze(['tracks', 'disconnectors', 'sectionInsulators']),
    tracks: Object.freeze(['profiles']),
    profiles: Object.freeze(['cantilevers']),
    disconnectors: Object.freeze([]),
    'section-insulators': Object.freeze(['switches']),
})

/** Quitar una referencia opcional a catálogo de un perfil: sin código, porque null no la toca. */
export const CLEARED_LOV_REF = Object.freeze({})

function base(resource) {
    return `${prefixOf('mto-configuration')}/${resource}`
}

/**
 * Una página de la lista, con el cuerpo del /filter limpio. La página empieza en 1, como en la
 * tabla.
 *
 * @param {object} [options]
 * @param {number} [options.page]
 * @param {number} [options.size]
 * @param {{field: string, direction: 'asc'|'desc'}|null} [options.sort]
 * @param {object} [options.filter] searchText y los filtros propios de cada maestro
 */
export async function filterMasters(resource, {page = 1, size = 50, sort = null, filter = {}} = {}, {signal} = {}) {
    const body = await apiFetch(`${base(resource)}/filter`, {
        method: 'POST',
        query: {...toPageParams({page, size}), sort: sortParam(sort)},
        json: masterFilter(filter),
        signal,
    })
    return toPage(body)
}

export function getMaster(resource, id, {signal} = {}) {
    return apiFetch(`${base(resource)}/${id}`, {signal})
}

export function createMaster(resource, dto) {
    return apiFetch(base(resource), {method: 'POST', json: dto})
}

export function updateMaster(resource, dto) {
    return apiFetch(`${base(resource)}/${dto.id}`, {method: 'PUT', json: dto})
}

export function deleteMaster(resource, id) {
    return apiFetch(`${base(resource)}/${id}`, {method: 'DELETE', responseType: 'none'})
}

/**
 * El esquema de una vía en una llamada: lo justo para dibujarla, ya ordenado y cacheado en el
 * servicio. Las medidas y los KP llegan como texto.
 */
export function trackSchematic(trackId, {signal} = {}) {
    return apiFetch(`${base('tracks')}/${trackId}/schematic`, {signal})
}

/** Las empresas a las que apunta el companyId de un paquete. Son de solo lectura en el servicio. */
export function listBusinessEntities({signal} = {}) {
    return apiFetch(`${prefixOf('mto-configuration')}/business-entities`, {signal})
}

/**
 * El cuerpo de un /filter. Lo nulo o en blanco no viaja, porque un filtro ausente no filtra. Los
 * textos van recortados, y false sí viaja (es «solo los inactivos»).
 */
export function masterFilter(filter) {
    const body = {}
    for (const [key, value] of Object.entries(filter ?? {})) {
        if (value === null || value === undefined) {
            continue
        }
        if (typeof value === 'string') {
            const text = value.trim()
            if (text) {
                body[key] = text
            }
            continue
        }
        body[key] = value
    }
    return body
}

/**
 * El cuerpo de un alta (read = {}) o de una modificación: la fila leída entera, con lo cambiado
 * encima y cada colección de hijos a null salvo las que el editor tocó, que van enteras.
 *
 * @param {string} resource
 * @param {object} read la fila leída, o {} en un alta
 * @param {object} changes los campos que escribe el editor
 * @param {object} [children] las colecciones que se tocaron, enteras: {cantilevers: [...]}
 */
export function masterBody(resource, read, changes, children = {}) {
    const body = {...read, ...changes}
    for (const field of MASTER_CHILDREN[resource] ?? []) {
        body[field] = Object.hasOwn(children, field) ? children[field] : null
    }
    return body
}

/** Una entrada de catálogo como referencia dentro de un maestro: el servicio la resuelve por código. */
export function lovRef(entry) {
    if (!entry) {
        return null
    }
    return {id: entry.id ?? null, code: entry.code ?? null}
}
