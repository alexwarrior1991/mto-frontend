import {apiFetch} from '../http.js'
import {sortWithTieBreak, toPage, toPageParams} from '../paging.js'
import {stockPath, toQuantity} from './values.js'

/**
 * Los cinco catálogos de mto-stock: materiales, almacenes, proveedores, proyectos y conjuntos. Es el
 * port de StockCatalogueClient y sus subinterfaces del backoffice, más la disponibilidad de un
 * conjunto.
 *
 * - La lista es el Pageable de Spring por parámetros: page (desde 0), size y sort=campo,dir. El sort
 *   solo admite atributos de la entidad (uno desconocido es un 500) y el servicio no tiene orden por
 *   defecto, así que siempre viaja uno: el de la columna o el código, más el id para desempatar.
 * - search busca en el código o en el nombre; active filtra solo si viene.
 * - El alta no lleva active: el servicio crea la entrada activa. La modificación es un PUT completo y
 *   lo lleva siempre. Un catálogo no se borra (los movimientos y las reservas lo referencian): se
 *   retira modificándolo con active=false.
 * - Un código repetido es un 409 con el prefijo del catálogo: MAT-409, WH-409, SUP-409, PRJ-409 o
 *   ASM-409.
 * - Un proyecto con synchronizedFromMasterData es de mto-configuration: su PUT es un 422 PRJ-001.
 * - Un conjunto no tiene stock propio. Su lista de materiales va entera en el alta y en la
 *   modificación (la que llega sustituye a la anterior), no puede ir vacía ni repetir material, y
 *   cuántos se pueden montar lo calcula el servicio por almacén.
 *
 * Permisos que aplica el servicio: leer pide stock-read; crear y modificar, stock-write.
 */

export const STOCK_CATALOGUES = Object.freeze(['materials', 'warehouses', 'suppliers', 'projects', 'assemblies'])

/** El orden de un catálogo sin columna elegida. */
export const BY_CODE = 'code,asc'

function base(catalogue, ...segments) {
    if (!STOCK_CATALOGUES.includes(catalogue)) {
        throw new Error(`Catalogo de mto-stock desconocido: ${catalogue}`)
    }
    return stockPath(catalogue, ...segments)
}

/**
 * Una página de un catálogo. La página empieza en 1, como en la tabla.
 *
 * @param {'materials'|'warehouses'|'suppliers'|'projects'|'assemblies'} catalogue
 * @param {object} [options]
 * @param {string} [options.search] código o nombre; en blanco no viaja
 * @param {boolean|null} [options.active] null no filtra
 * @param {{field: string, direction: 'asc'|'desc'}|null} [options.sort] la columna elegida; sin ella, por código
 * @param {string|null} [options.warehouseId] solo materiales: los que tienen movimientos en ese almacén
 * @param {boolean} [options.belowMinimum] solo materiales: true filtra; false no es «por encima», así que no viaja
 */
export async function searchCatalogue(catalogue, {
    search = '', active = null, page = 1, size = 50, sort = null, warehouseId = null, belowMinimum = false,
} = {}, {signal} = {}) {
    const body = await apiFetch(base(catalogue), {
        query: {
            search: search.trim(),
            active,
            warehouseId,
            belowMinimum: belowMinimum === true ? true : undefined,
            ...toPageParams({page, size}),
            sort: sortWithTieBreak(sort, BY_CODE),
        },
        signal,
    })
    return toPage(body)
}

export function getCatalogueEntry(catalogue, id, {signal} = {}) {
    return apiFetch(base(catalogue, id), {signal})
}

/** 201 con la entrada creada, activa. */
export function createCatalogueEntry(catalogue, body) {
    return apiFetch(base(catalogue), {method: 'POST', json: body})
}

export function updateCatalogueEntry(catalogue, id, body) {
    return apiFetch(base(catalogue, id), {method: 'PUT', json: body})
}

/** La ruta del historial de una entrada, para listRevisions. */
export function catalogueRevisionsPath(catalogue, id) {
    return base(catalogue, id, 'revisions')
}

/**
 * Cuántos conjuntos se podrían montar ahora en un almacén, y qué componente lo limita (puede ser más
 * de uno). El almacén es obligatorio, porque el stock es por almacén; el conjunto y el almacén tienen
 * que estar activos (422 si no).
 */
export function getAssemblyAvailability(assemblyId, warehouseId, {signal} = {}) {
    if (!warehouseId) {
        throw new Error('La disponibilidad de un conjunto se pide en un almacen')
    }
    return apiFetch(base('assemblies', assemblyId, 'availability'), {query: {warehouseId}, signal})
}

/** Si un proyecto vino de mto-configuration (un paquete de ejecución): entonces es de su origen y no se modifica aquí. */
export function isSynchronizedProject(project) {
    return project?.synchronizedFromMasterData === true
}

/** Almacén, proveedor o proyecto: el alta sin active y la modificación con él. */
export function catalogueEntryBody({code, name, active}, {creating}) {
    const body = {code: code.trim(), name: name.trim()}
    return creating ? body : {...body, active: Boolean(active)}
}

/** Un material: el alta sin active y la modificación con él. La unidad es texto libre en el servicio. */
export function materialBody({code, name, unitOfMeasure, minimumStockLevel, active}, {creating}) {
    const body = {
        code: code.trim(),
        name: name.trim(),
        unitOfMeasure: unitOfMeasure.trim(),
        minimumStockLevel: toQuantity(minimumStockLevel),
    }
    return creating ? body : {...body, active: Boolean(active)}
}

/**
 * Un conjunto con su lista de materiales entera, una línea por material.
 *
 * @param {Array<{materialId: string, quantity: string|number}>} components
 */
export function assemblyBody({code, name, active}, components, {creating}) {
    const body = {
        code: code.trim(),
        name: name.trim(),
        components: components.map(({materialId, quantity}) => ({materialId, quantity: toQuantity(quantity)})),
    }
    return creating ? body : {...body, active: Boolean(active)}
}
