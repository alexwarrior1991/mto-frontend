import {numberOrNull, textOrNull, withoutNulls} from '../bodies.js'
import {toLocalDateParam} from '../dates.js'
import {apiFetch} from '../http.js'
import {buildMergePatch, MERGE_PATCH} from '../mergePatch.js'
import {sortWithTieBreak, toPage, toPageParams} from '../paging.js'
import {maintenancePath} from './values.js'

/**
 * Las inspecciones: el port de InspectionClient y de InspectionForm e InspectionOutcomeDialogs del
 * backoffice.
 *
 * - Una inspección copia al darse de alta los puntos de la plantilla activa del tipo de su activo.
 *   Que el resultado case con los puntos lo comprueba el servicio (422 INS-001).
 * - Activo, fecha y resultado son obligatorios; desde una orden de inspección, el activo es el de la
 *   orden y queda como su origen (originOrderId). La modificación es un merge-patch con lo que
 *   cambió y la versión leída; la fecha, el tipo y el resultado no se vacían.
 * - Crear el defecto y la orden correctiva son idempotentes: repetir devuelve lo ya creado. Una
 *   inspección correcta no genera nada (422 INS-001), y una con defecto leve solo da defecto con
 *   force.
 */

/** Sin columna elegida, la más reciente primero. */
export const BY_INSPECTION_DATE_DESC = 'inspectionDate,desc'

/** Una página de inspecciones con sus filtros; lo vacío no viaja. La página empieza en 1. */
export async function searchInspections({
    result = null, assetId = null, assetType = null, trackId = null, stationId = null, executionPackageId = null, inspectionFrom = null,
    inspectionTo = null, inspector = '', originOrderId = null, page = 1, size = 50, sort = null,
} = {}, {signal} = {}) {
    const body = await apiFetch(maintenancePath('inspections'), {
        query: {
            result, assetId, assetType, trackId, stationId, executionPackageId, inspectionFrom: toLocalDateParam(inspectionFrom),
            inspectionTo: toLocalDateParam(inspectionTo), inspector: textOrNull(inspector), originOrderId,
            ...toPageParams({page, size}), sort: sortWithTieBreak(sort, BY_INSPECTION_DATE_DESC),
        },
        signal,
    })
    return toPage(body)
}

export function getInspection(id, {signal} = {}) {
    return apiFetch(maintenancePath('inspections', id), {signal})
}

/** 201 con la inspección y sus puntos, copiados de la plantilla. */
export function createInspection(body) {
    return apiFetch(maintenancePath('inspections'), {method: 'POST', json: body})
}

export function patchInspection(id, patch) {
    return apiFetch(maintenancePath('inspections', id), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/** Un punto de la inspección, con su versión; responde con la inspección entera. */
export function patchInspectionItem(id, itemId, patch) {
    return apiFetch(maintenancePath('inspections', id, 'items', itemId), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/** El defecto que genera la inspección; repetir devuelve el mismo. */
export function createDefectFromInspection(id, body) {
    return apiFetch(maintenancePath('inspections', id, 'create-defect'), {method: 'POST', json: body})
}

/** La orden correctiva que genera la inspección; repetir devuelve la misma. Insegura, urgente y crítica. */
export function createCorrectiveOrder(id, body) {
    return apiFetch(maintenancePath('inspections', id, 'create-corrective-order'), {method: 'POST', json: body})
}

export function inspectionRevisionsPath(id) {
    return maintenancePath('inspections', id, 'revisions')
}

/** Lo que el formulario guarda de una inspección leída (o de una nueva, con null y su fecha de hoy). */
export function inspectionFormValues(inspection, {today = null} = {}) {
    return {
        assetId: null,
        inspectionDate: inspection?.inspectionDate ?? today,
        inspector: inspection?.inspector ?? '',
        inspectionKind: inspection?.inspectionKind ?? 'VISUAL',
        result: inspection?.result ?? 'OK',
        kp: inspection?.kp === null || inspection?.kp === undefined ? '' : String(inspection.kp),
        description: inspection?.description ?? '',
        detectedDefects: inspection?.detectedDefects ?? '',
        recommendedActions: inspection?.recommendedActions ?? '',
    }
}

function requestValues(values) {
    return {
        inspectionDate: toLocalDateParam(values.inspectionDate) ?? null,
        inspector: textOrNull(values.inspector),
        inspectionKind: values.inspectionKind ?? null,
        result: values.result ?? null,
        description: textOrNull(values.description),
        detectedDefects: textOrNull(values.detectedDefects),
        recommendedActions: textOrNull(values.recommendedActions),
        kp: numberOrNull(values.kp),
    }
}

/**
 * El alta: lo vacío no viaja. assetId guarda el activo elegido; desde una orden de inspección, el de
 * la orden, que queda como su origen.
 *
 * @param {{asset: object|null, originOrderId: string|null}} origin
 */
export function inspectionRequest(values, {asset = null, originOrderId = null} = {}) {
    return withoutNulls({assetId: (asset ?? values.assetId)?.id ?? null, ...requestValues(values), originOrderId})
}

/** Lo que cambió de una inspección, lo vaciado y su versión, o null si nada. */
export function inspectionPatch(original, values) {
    return buildMergePatch(original, requestValues(values), {
        fields: ['inspectionDate', 'inspector', 'inspectionKind', 'result', 'description', 'detectedDefects', 'recommendedActions', 'kp'],
        numberFields: ['kp'],
        version: original.version,
    })
}

/**
 * El defecto desde una inspección: lo vacío lo pone el servicio (la gravedad sale del resultado y la
 * descripción, de lo observado). force solo si se marcó, para una inspección con defecto leve.
 */
export function defectFromInspectionRequest(values) {
    return withoutNulls({
        severity: values.severity ?? null,
        description: textOrNull(values.description),
        technicalNotes: textOrNull(values.technicalNotes),
        force: values.force === true ? true : null,
    })
}

/** La orden correctiva: lo vacío lo pone el servicio (un título con la inspección y el activo). */
export function correctiveOrderRequest(values) {
    return withoutNulls({
        title: textOrNull(values.title),
        description: textOrNull(values.description),
        priority: values.priority ?? null,
        plannedDate: toLocalDateParam(values.plannedDate) ?? null,
        teamId: values.teamId || null,
    })
}
