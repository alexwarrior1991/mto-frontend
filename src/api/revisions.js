import {defineEnum} from './enums.js'
import {apiFetch} from './http.js'
import {toPage, toPageParams} from './paging.js'

/**
 * El historial de una fila: Envers en mto-stock y, en la fase 6, en mto-maintenance, con la misma
 * forma. Es el port de RevisionDto, RevisionMetadataDto y RevisionOperation del backoffice.
 *
 * - Se pide a GET /{recurso}/{id}/revisions con page y size, sin sort: llega la más reciente primero.
 * - Cada revisión trae quién, cuándo, qué operación y por qué camino (source: HTTP, MESSAGING, SYSTEM
 *   o BASELINE, la foto de lo que ya existía al empezar a auditar), su correlationId tal cual, y la
 *   entidad tal como quedó. El bloque audit de la entidad viene vacío a propósito y no se enseña.
 * - Sin revisiones, el servicio responde 404: eso es «sin historial todavía», no un error.
 */

export const REVISION_OPERATION = defineEnum({
    CREATED: 'Alta',
    UPDATED: 'Modificación',
    DELETED: 'Baja',
})

/** Las revisiones de cada página, como el backoffice. */
export const REVISIONS_PAGE_SIZE = 20

/**
 * Una página del historial. La página empieza en 1, como en la tabla.
 *
 * @param {string} path la ruta del historial de la fila (/api/stock/materials/{id}/revisions)
 */
export async function listRevisions(path, {page = 1, size = REVISIONS_PAGE_SIZE} = {}, {signal} = {}) {
    return toPage(await apiFetch(path, {query: toPageParams({page, size}), signal}))
}
