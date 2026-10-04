/**
 * Las tres formas de paginar del dominio.
 *
 * - La de Spring Data con forma DTO, {content, page:{number, size, totalElements, totalPages}}: la
 *   fija mto-configuration con via_dto, y mto-stock, mto-maintenance y mto-notification anaden
 *   first y last dentro de page, que aqui no hacen falta.
 * - La de mto-users, al estilo de Keycloak: {content, first, max, total}, con max de 200 como mucho.
 * - Las listas sin total (los miembros de un perfil o de un rol): una pagina llena es la unica senal
 *   de que hay mas.
 *
 * En la pantalla las paginas empiezan en 1 (la tabla y la URL); en el servicio, en 0.
 */

export const USERS_MAX_PAGE = 200

export function toPage(body) {
    const content = Array.isArray(body?.content) ? body.content : []
    const page = body?.page ?? {}
    return {
        content,
        number: numberOr(page.number, 0),
        size: numberOr(page.size, content.length),
        totalElements: numberOr(page.totalElements, content.length),
        totalPages: numberOr(page.totalPages, content.length > 0 ? 1 : 0),
    }
}

export function toUsersPage(body) {
    const content = Array.isArray(body?.content) ? body.content : []
    return {
        content,
        first: numberOr(body?.first, 0),
        max: numberOr(body?.max, content.length),
        total: numberOr(body?.total, content.length),
    }
}

/** En una lista sin total, «siguientes» solo se ofrece si la pagina llego llena. */
export function hasNextOffsetPage(items, size) {
    return Array.isArray(items) && size > 0 && items.length >= size
}

/** De la pagina de la pantalla (empieza en 1) a la del servicio (empieza en 0). */
export function toPageParams({page = 1, size = 50} = {}) {
    return {page: Math.max(0, Math.trunc(page) - 1), size}
}

/**
 * De la pagina de la pantalla (empieza en 1) a first y max, al estilo de Keycloak (mto-users). max no
 * pasa de 200, el tope del servicio.
 */
export function toOffsetParams({page = 1, size}) {
    if (!Number.isInteger(size) || size < 1 || size > USERS_MAX_PAGE) {
        throw new Error(`Una pagina de mto-users tiene de 1 a ${USERS_MAX_PAGE} filas: ${size}`)
    }
    return {first: (Math.max(1, Math.trunc(page)) - 1) * size, max: size}
}

/** sort=campo,dir solo si se eligio un orden: sin el, ordena el servicio. */
export function sortParam(sort) {
    if (!sort?.field) {
        return undefined
    }
    return `${sort.field},${sort.direction === 'desc' ? 'desc' : 'asc'}`
}

/**
 * El orden de una lista de mto-stock o de mto-maintenance: el de la columna elegida o, sin ella, el de
 * la pantalla, y siempre id,asc al final.
 *
 * - mto-stock no tiene orden por defecto, y uno desconocido es un 500.
 * - El de mto-maintenance no es único (dos turnos del mismo día, dos perfiles en el mismo kp), y la
 *   columna elegida lo sustituye entero. Allí uno desconocido es un 400 REQ-400.
 *
 * Sin el desempate, dos filas iguales en el orden (los dos apuntes de una transferencia) podrían salir
 * en las dos páginas o en ninguna. Solo atributos de la entidad: lo que calcula el servicio no se
 * ordena.
 *
 * @param {{field: string, direction: 'asc'|'desc'}|null} sort la columna elegida
 * @param {string|string[]} fallback el orden de la pantalla, como campo,dir, o varios en su orden
 * @returns {string[]} los sort que viajan, en su orden
 */
export function sortWithTieBreak(sort, fallback) {
    const chosen = sortParam(sort)
    return [...(chosen ? [chosen] : [fallback].flat()), 'id,asc']
}

function numberOr(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
