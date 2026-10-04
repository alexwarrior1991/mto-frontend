import {numberOrNull, textOrNull, withoutNulls} from '../bodies.js'
import {endOfDayInstant, localDateTimeToInstant, startOfDayInstant, toLocalDateParam} from '../dates.js'
import {apiFetch} from '../http.js'
import {buildMergePatch, MERGE_PATCH} from '../mergePatch.js'
import {sortWithTieBreak, toPage, toPageParams} from '../paging.js'
import {maintenancePath} from './values.js'

/**
 * Los defectos de catenaria: el port de DefectClient y de DefectForm y DefectTransitionDialogs del
 * backoffice.
 *
 * - Un defecto va OPEN → IN_PROGRESS (vinculado a una orden) → RESOLVED → CLOSED, o DISCARDED
 *   mientras está abierto. Desde un estado que no la admite, la transición es un 409 TRN-001.
 * - Activo, gravedad y descripción son obligatorios y no se vacían. Desde la ficha de una orden, el
 *   activo es el de la orden y el defecto queda vinculado a ella. Se modifica mientras no esté cerrado
 *   ni descartado, con un merge-patch y la versión leída.
 * - Vincular a una orden pide maintenance-write; resolver, cerrar y descartar, además
 *   maintenance-supervise. Con una orden vinculada sin completar, resolverlo pide el turno en el que se
 *   corrigió in situ (409 TRN-001 si no).
 */

/** Sin columna elegida, el más reciente primero. */
export const BY_DETECTED_DESC = 'detectedAt,desc'

/**
 * Una página de defectos con sus filtros; lo vacío no viaja. Las fechas «desde» y «hasta» son días
 * enteros, en la zona del navegador: el servicio filtra por instantes. La página empieza en 1.
 */
export async function searchDefects({
    severity = null, status = null, assetId = null, orderId = null, trackId = null, stationId = null, executionPackageId = null,
    detectedFrom = null, detectedTo = null, page = 1, size = 50, sort = null,
} = {}, {signal} = {}) {
    const body = await apiFetch(maintenancePath('defects'), {
        query: {
            severity, status, assetId, orderId, trackId, stationId, executionPackageId,
            detectedFrom: detectedFrom ? startOfDayInstant(detectedFrom) : null,
            detectedTo: detectedTo ? endOfDayInstant(detectedTo) : null,
            ...toPageParams({page, size}), sort: sortWithTieBreak(sort, BY_DETECTED_DESC),
        },
        signal,
    })
    return toPage(body)
}

export function getDefect(id, {signal} = {}) {
    return apiFetch(maintenancePath('defects', id), {signal})
}

/** 201 con el defecto, abierto (o en curso, si nace vinculado a una orden). */
export function createDefect(body) {
    return apiFetch(maintenancePath('defects'), {method: 'POST', json: body})
}

export function patchDefect(id, patch) {
    return apiFetch(maintenancePath('defects', id), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/** Las transiciones: cada una es su ruta y su cuerpo, y responden con el defecto como quedó. */
export function transitionDefect(id, transition, {body = null, orderId = null} = {}) {
    switch (transition) {
        case 'link':
            return apiFetch(maintenancePath('defects', id, 'link-order', orderId), {method: 'POST'})
        case 'resolve':
        case 'close':
        case 'discard':
            return apiFetch(maintenancePath('defects', id, transition), {method: 'POST', json: body})
        default:
            throw new Error(`Transicion de defecto desconocida: ${transition}`)
    }
}

/** Los cambios de estado con su comentario, el más antiguo primero. */
export function listDefectHistory(id, {signal} = {}) {
    return apiFetch(maintenancePath('defects', id, 'history'), {signal})
}

export function defectRevisionsPath(id) {
    return maintenancePath('defects', id, 'revisions')
}

/** Lo que el formulario guarda de un defecto leído (o de uno nuevo, con null). */
export function defectFormValues(defect) {
    return {
        assetId: null,
        severity: defect?.severity ?? null,
        description: defect?.description ?? '',
        technicalNotes: defect?.technicalNotes ?? '',
        correctionType: defect?.correctionType ?? '',
        partsReplaced: defect?.partsReplaced ?? '',
        repairPlannedDate: defect?.repairPlannedDate ?? null,
        detectedAt: null,
        startKp: '',
        endKp: '',
    }
}

function requestValues(values) {
    return {
        severity: values.severity ?? null,
        description: textOrNull(values.description),
        technicalNotes: textOrNull(values.technicalNotes),
        correctionType: textOrNull(values.correctionType),
        partsReplaced: textOrNull(values.partsReplaced),
        repairPlannedDate: toLocalDateParam(values.repairPlannedDate) ?? null,
    }
}

/**
 * El alta: lo vacío no viaja, y sin fecha de detección el servicio pone ahora. Desde una orden, el
 * activo es el de la orden y el defecto queda vinculado a ella.
 *
 * @param {{asset: object|null, orderId: string|null}} origin
 */
export function defectRequest(values, {asset = null, orderId = null} = {}) {
    return withoutNulls({
        assetId: (asset ?? values.assetId)?.id ?? null,
        ...requestValues(values),
        detectedAt: localDateTimeToInstant(values.detectedAt) ?? null,
        orderId,
        startKp: numberOrNull(values.startKp),
        endKp: numberOrNull(values.endKp),
    })
}

/** Lo que cambió de un defecto, lo vaciado y su versión, o null si nada. */
export function defectPatch(original, values) {
    return buildMergePatch(original, requestValues(values), {
        fields: ['severity', 'description', 'technicalNotes', 'correctionType', 'partsReplaced', 'repairPlannedDate'],
        version: original.version,
    })
}

/** Resolver: cómo se resolvió (obligatorio) y, si se dieron, el turno, la corrección y las piezas. */
export function resolveRequest(values) {
    return withoutNulls({
        resolutionNotes: textOrNull(values.resolutionNotes),
        resolvedInShiftId: values.resolvedInShiftId || null,
        correctionType: textOrNull(values.correctionType),
        partsReplaced: textOrNull(values.partsReplaced),
    })
}
