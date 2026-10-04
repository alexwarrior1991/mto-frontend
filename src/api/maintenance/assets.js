import {idOrNull, numberOrNull, textOrNull, withoutNulls} from '../bodies.js'
import {apiFetch} from '../http.js'
import {buildMergePatch, MERGE_PATCH} from '../mergePatch.js'
import {sortWithTieBreak, toPage, toPageParams} from '../paging.js'
import {BY_CREATED_DESC} from './orders.js'
import {maintenancePath} from './values.js'

/**
 * Los activos de catenaria de mto-maintenance: el port de AssetClient y AssetForm del backoffice.
 *
 * - Solo se da de alta un tramo de vía (TRACK_SECTION). Perfiles, seccionadores y aisladores llegan
 *   por datos maestros de mto-configuration (sourceService), y de ellos solo se cambian aquí la
 *   descripción y el intervalo del preventivo: cualquier otro campo es un 409 AST-001.
 * - Una modificación es un PATCH merge-patch con la versión leída: lo cambiado, lo vaciado a null y
 *   nada más (409 CON-001 si otra persona guardó antes).
 * - enabled lo deciden dos voces que el servicio guarda por separado: enabledAtSource (lo que dice
 *   mto-configuration; null en un tramo propio) y disabledLocally (lo que decidió mantenimiento, que
 *   ningún evento deshace). Desactivar es un DELETE (204, también si ya lo estaba) con
 *   maintenance-delete; reactivar, un PATCH con enabled=true y maintenance-write, solo de lo que se
 *   desactivó aquí y el origen tiene activo (si no, 409 AST-001). Un activo nunca se borra: las
 *   órdenes lo referencian.
 * - Un código repetido es un 409 AST-409.
 *
 * Paquete, vía y estación son ids de mto-configuration: el servicio no guarda sus nombres.
 */

/** El orden de la lista sin columna elegida: el físico, vía y kp. */
export const BY_TRACK_AND_KP = Object.freeze(['trackId,asc', 'startKp,asc'])

/**
 * Una página de activos con sus filtros; lo vacío no viaja. La página empieza en 1.
 *
 * @param {object} [filters]
 * @param {string} [filters.name] el nombre de campo (12-2.27, HSA-NS5), parcial y sin mayúsculas
 * @param {boolean|null} [filters.enabled] null no filtra
 * @param {string} [filters.preventiveDueBefore] un Instant: los que tienen el preventivo vencido antes
 */
export async function searchAssets({
    type = null, trackId = null, stationId = null, executionPackageId = null, enabled = null, name = '',
    preventiveDueBefore = null, page = 1, size = 50, sort = null,
} = {}, {signal} = {}) {
    const body = await apiFetch(maintenancePath('assets'), {
        query: {
            type, trackId, stationId, executionPackageId, enabled, name: textOrNull(name), preventiveDueBefore,
            ...toPageParams({page, size}), sort: sortWithTieBreak(sort, BY_TRACK_AND_KP),
        },
        signal,
    })
    return toPage(body)
}

export function getAsset(id, {signal} = {}) {
    return apiFetch(maintenancePath('assets', id), {signal})
}

/** 201 con el tramo, activo. */
export function createAsset(body) {
    return apiFetch(maintenancePath('assets'), {method: 'POST', json: body})
}

export function patchAsset(id, patch) {
    return apiFetch(maintenancePath('assets', id), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/** 204, también si ya estaba desactivado. */
export function disableAsset(id) {
    return apiFetch(maintenancePath('assets', id), {method: 'DELETE', responseType: 'none'})
}

/** Deshace la desactivación hecha aquí, con la versión leída. */
export function enableAsset(asset) {
    return patchAsset(asset.id, {enabled: true, version: asset.version})
}

/** Una página de las órdenes de un activo. */
export async function listAssetOrders(id, {page = 1, size = 50, sort = null} = {}, {signal} = {}) {
    const body = await apiFetch(maintenancePath('assets', id, 'orders'), {
        query: {...toPageParams({page, size}), sort: sortWithTieBreak(sort, BY_CREATED_DESC)},
        signal,
    })
    return toPage(body)
}

/** La ruta del historial de un activo, para listRevisions. Uno que solo llegó por datos maestros no tiene: 404. */
export function assetRevisionsPath(id) {
    return maintenancePath('assets', id, 'revisions')
}

/** Lo que de un activo viaja dentro de otra cosa: el resumen que traen una orden, una inspección o un defecto. */
export function assetSummaryOf(asset) {
    if (!asset) {
        return null
    }
    const {id, code, name, type, trackId, startKp, endKp, sectioning, enabled} = asset
    return {id, code, name, type, trackId, startKp, endKp, sectioning, enabled}
}

/** Llega de los datos maestros de mto-configuration: su identidad y su localización no se tocan aquí. */
export function isSynchronizedAsset(asset) {
    return typeof asset?.sourceService === 'string' && asset.sourceService.trim() !== ''
}

export function isAssetEnabled(asset) {
    return asset?.enabled === true
}

/** mto-configuration lo tiene desactivado: reactivarlo aquí es un 409 AST-001. */
export function isDisabledAtSource(asset) {
    return asset?.enabledAtSource === false
}

/** Lo desactivó mantenimiento: sigue así diga lo que diga mto-configuration, hasta que se reactive aquí. */
export function isDisabledLocally(asset) {
    return asset?.disabledLocally === true
}

/** Solo se reactiva lo que se desactivó aquí y el origen tiene activo. */
export function canReactivate(asset) {
    return isDisabledLocally(asset) && !isDisabledAtSource(asset)
}

/** Lo que de un activo sincronizado se cambia aquí: el resto es un 409 AST-001. */
export const SYNCHRONIZED_ASSET_FIELDS = Object.freeze(['description', 'preventiveIntervalDays'])

const TRACK_SECTION_FIELDS = Object.freeze([
    'name', 'description', 'preventiveIntervalDays', 'executionPackageId', 'trackId', 'stationId', 'startKp', 'endKp', 'trackKind',
])
const NUMBER_FIELDS = Object.freeze(['preventiveIntervalDays', 'executionPackageId', 'trackId', 'stationId', 'startKp', 'endKp'])

/** El alta de un tramo de vía, desde lo escrito en su editor; lo vacío no viaja. */
export function trackSectionRequest(values) {
    return withoutNulls({...assetValues(values), code: textOrNull(values.code), name: textOrNull(values.name)})
}

/**
 * La modificación de un activo: lo que cambió frente a lo leído, lo vaciado a null y la versión. De uno
 * sincronizado solo cuentan la descripción y el intervalo. null si no cambió nada.
 */
export function assetPatch(original, values) {
    return buildMergePatch(original, assetValues(values), {
        fields: isSynchronizedAsset(original) ? SYNCHRONIZED_ASSET_FIELDS : TRACK_SECTION_FIELDS,
        numberFields: NUMBER_FIELDS,
        version: original.version,
    })
}

function assetValues(values) {
    return {
        name: values.name ?? null,
        description: textOrNull(values.description),
        preventiveIntervalDays: numberOrNull(values.preventiveIntervalDays),
        executionPackageId: idOrNull(values.executionPackageId),
        trackId: idOrNull(values.trackId),
        stationId: idOrNull(values.stationId),
        startKp: numberOrNull(values.startKp),
        endKp: numberOrNull(values.endKp),
        trackKind: values.trackKind ?? null,
    }
}
