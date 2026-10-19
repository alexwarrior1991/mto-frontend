import {textOrNull, withoutNulls} from '../bodies.js'
import {toLocalDateParam} from '../dates.js'
import {apiFetch} from '../http.js'
import {buildMergePatch, MERGE_PATCH} from '../mergePatch.js'
import {resourcesPath} from './values.js'

/**
 * Las ausencias de una persona en mto-resources (vacaciones, una baja, una formación...): el port de
 * PersonAbsenceClient y su formulario del backoffice.
 *
 * - Llegan enteras, la más reciente primero. Las dos fechas van incluidas.
 * - Dos de la misma persona no se solapan (409 ABS-001): lo decide el servicio. Un fin anterior al
 *   inicio es un 400 VAL-001, y aquí se comprueba antes de llamar.
 * - Se dan de alta y se modifican con resources-write (merge-patch con la versión leída; solo las notas
 *   se vacían) y se quitan (un borrado físico que el historial guarda) con resources-delete.
 * - Su clase no sale del servicio: mto-maintenance solo recibe el periodo, y con él no deja a la persona
 *   en un turno de esas fechas (409 SHF-001).
 */

export function listAbsences(personId, {signal} = {}) {
    return apiFetch(resourcesPath('people', personId, 'absences'), {signal})
}

/** 201; 409 ABS-001 si se solapa con otra de la persona. */
export function addAbsence(personId, body) {
    return apiFetch(resourcesPath('people', personId, 'absences'), {method: 'POST', json: body})
}

export function patchAbsence(personId, absenceId, patch) {
    return apiFetch(resourcesPath('people', personId, 'absences', absenceId), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/** 204: se borra; el historial del servicio la guarda. */
export function removeAbsence(personId, absenceId) {
    return apiFetch(resourcesPath('people', personId, 'absences', absenceId), {method: 'DELETE', responseType: 'none'})
}

/** Lo que el formulario guarda de una ausencia leída, o de una nueva. */
export function absenceFormValues(absence) {
    return {
        kind: absence?.kind ?? null,
        startsOn: absence?.startsOn ?? null,
        endsOn: absence?.endsOn ?? null,
        notes: absence?.notes ?? '',
    }
}

function absenceValues(values) {
    return {
        kind: values.kind ?? null,
        startsOn: toLocalDateParam(values.startsOn) ?? null,
        endsOn: toLocalDateParam(values.endsOn) ?? null,
        notes: textOrNull(values.notes),
    }
}

/** El alta: lo escrito; lo vacío no viaja. */
export function absenceRequest(values) {
    return withoutNulls(absenceValues(values))
}

const ABSENCE_FIELDS = Object.freeze(['kind', 'startsOn', 'endsOn', 'notes'])

/** La modificación: lo cambiado, las notas vaciadas a null y la versión; null si no cambió nada. */
export function absencePatch(original, values) {
    return buildMergePatch(original, absenceValues(values), {fields: ABSENCE_FIELDS, version: original.version})
}

/** Los días que dura, contando los dos extremos. */
export function absenceDays(absence) {
    if (!absence?.startsOn || !absence?.endsOn) {
        return null
    }
    const day = 24 * 60 * 60 * 1000
    return Math.round((Date.parse(`${absence.endsOn}T00:00:00Z`) - Date.parse(`${absence.startsOn}T00:00:00Z`)) / day) + 1
}
