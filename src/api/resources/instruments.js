import {textOrNull, withoutNulls} from '../bodies.js'
import {toLocalDateParam} from '../dates.js'
import {apiFetch} from '../http.js'
import {buildMergePatch, MERGE_PATCH} from '../mergePatch.js'
import {sortWithTieBreak, toPage, toPageParams} from '../paging.js'
import {resourcesPath} from './values.js'

/**
 * Los instrumentos de mto-resources (pértigas de puesta a tierra, detectores de tensión, equipos de
 * medida), con su calibración: el port de InstrumentClient y su formulario del backoffice.
 *
 * - Escribir pide resources-fleet-write; el código no cambia y no se repite (409 INT-409).
 * - No se borra: DELETE lo retira (resources-delete) y un PATCH active=true lo reactiva. Tiene
 *   historial.
 * - Se eligen en un turno de mantenimiento, que no admite uno retirado ni con la calibración caducada a
 *   la fecha del turno (409 SHF-001): eso lo decide mto-maintenance.
 */

export const BY_CODE = Object.freeze(['code,asc'])

/**
 * Una página de instrumentos con sus filtros; lo vacío no viaja. La página empieza en 1.
 *
 * @param {object} [filters]
 * @param {string} [filters.search] el código, el nombre o el número de serie
 * @param {string|null} [filters.kind] su tipo
 * @param {boolean|null} [filters.active] null no filtra
 * @param {string|null} [filters.calibrationExpiresBefore] YYYY-MM-DD: los que tienen que calibrarse antes
 */
export async function searchInstruments({search = '', kind = null, active = null, calibrationExpiresBefore = null, page = 1, size = 50,
    sort = null} = {}, {signal} = {}) {
    const body = await apiFetch(resourcesPath('instruments'), {
        query: {
            search: textOrNull(search), kind, active, calibrationExpiresBefore: toLocalDateParam(calibrationExpiresBefore),
            ...toPageParams({page, size}), sort: sortWithTieBreak(sort, BY_CODE),
        },
        signal,
    })
    return toPage(body)
}

export function getInstrument(id, {signal} = {}) {
    return apiFetch(resourcesPath('instruments', id), {signal})
}

/** 201; 409 INT-409 si el código ya existe. */
export function createInstrument(body) {
    return apiFetch(resourcesPath('instruments'), {method: 'POST', json: body})
}

export function patchInstrument(id, patch) {
    return apiFetch(resourcesPath('instruments', id), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/** Retira: 204. Deja de ofrecerse en los turnos; los que ya lo llevan lo siguen nombrando. */
export function retireInstrument(id) {
    return apiFetch(resourcesPath('instruments', id), {method: 'DELETE', responseType: 'none'})
}

export function reactivateInstrument(instrument) {
    return patchInstrument(instrument.id, {active: true, version: instrument.version})
}

export function instrumentRevisionsPath(id) {
    return resourcesPath('instruments', id, 'revisions')
}

export function isActiveInstrument(instrument) {
    return instrument?.active === true
}

function instrumentValues(values) {
    return {
        name: textOrNull(values.name),
        kind: values.kind ?? null,
        serialNumber: textOrNull(values.serialNumber),
        calibratedOn: toLocalDateParam(values.calibratedOn) ?? null,
        calibrationExpiresOn: toLocalDateParam(values.calibrationExpiresOn) ?? null,
        notes: textOrNull(values.notes),
    }
}

/** El alta, desde lo escrito en su editor; lo vacío no viaja (sin calibración, nada que caduque). */
export function newInstrumentRequest(values) {
    return withoutNulls({code: textOrNull(values.code), ...instrumentValues(values)})
}

const INSTRUMENT_FIELDS = Object.freeze(['name', 'kind', 'serialNumber', 'calibratedOn', 'calibrationExpiresOn', 'notes'])

/** La modificación: lo cambiado, lo vaciado a null y la versión. El código no cambia. null si nada. */
export function instrumentPatch(original, values) {
    return buildMergePatch(original, instrumentValues(values), {fields: INSTRUMENT_FIELDS, version: original.version})
}
