import {numberOrNull, textOrNull, withoutNulls} from '../bodies.js'
import {toLocalDateParam} from '../dates.js'
import {apiFetch} from '../http.js'
import {buildMergePatch, MERGE_PATCH} from '../mergePatch.js'
import {sortWithTieBreak, toPage, toPageParams} from '../paging.js'
import {resourcesPath} from './values.js'

/**
 * Las cualificaciones de mto-resources: el catálogo de sus tipos y las de cada persona, con su
 * caducidad (el port de QualificationTypeClient, PersonQualificationClient y sus formularios del
 * backoffice).
 *
 * - Un tipo (resources-write) es un permiso de conducir (que dice cuál: B, C o C+E), una habilitación de
 *   vehículo, una de seguridad u otra, con su vigencia habitual en meses. El código no cambia y no se
 *   repite (409 QTY-409). No se borra: DELETE lo retira (resources-delete) y un PATCH active=true lo
 *   vuelve a ofrecer. No tiene historial: es un catálogo.
 * - Una persona tiene cada tipo una vez (409 QUA-001 si ya lo tiene, o si el tipo está retirado):
 *   renovarla es cambiar su caducidad. Se dan de alta y se modifican con resources-write, y se quitan
 *   (un borrado físico que el historial del servicio guarda) con resources-delete. La lista llega entera,
 *   por el código del tipo. Una caducidad anterior a la expedición es un 400 VAL-001.
 * - Lo caducado no entra en un turno de mantenimiento (409 SHF-001): eso lo decide mto-maintenance.
 */

export const BY_CODE = Object.freeze(['code,asc'])

/** Los tipos activos caben en una petición: el catálogo es pequeño. */
export const ALL_TYPES = 200

/**
 * Una página de tipos con sus filtros; lo vacío no viaja. La página empieza en 1.
 *
 * @param {object} [filters]
 * @param {string} [filters.search] el código o el nombre
 * @param {string|null} [filters.kind] su clase
 * @param {boolean|null} [filters.active] null no filtra
 */
export async function searchQualificationTypes({search = '', kind = null, active = null, page = 1, size = 50, sort = null} = {},
                                               {signal} = {}) {
    const body = await apiFetch(resourcesPath('qualification-types'), {
        query: {search: textOrNull(search), kind, active, ...toPageParams({page, size}), sort: sortWithTieBreak(sort, BY_CODE)},
        signal,
    })
    return toPage(body)
}

export function getQualificationType(id, {signal} = {}) {
    return apiFetch(resourcesPath('qualification-types', id), {signal})
}

/** 201; 409 QTY-409 si el código ya existe. */
export function createQualificationType(body) {
    return apiFetch(resourcesPath('qualification-types'), {method: 'POST', json: body})
}

export function patchQualificationType(id, patch) {
    return apiFetch(resourcesPath('qualification-types', id), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/** Retira: 204. Nadie nuevo lo recibe; quien ya lo tiene lo conserva. */
export function retireQualificationType(id) {
    return apiFetch(resourcesPath('qualification-types', id), {method: 'DELETE', responseType: 'none'})
}

export function offerQualificationTypeAgain(type) {
    return patchQualificationType(type.id, {active: true, version: type.version})
}

export function isActiveQualificationType(type) {
    return type?.active === true
}

/** Solo un permiso de conducir dice cuál. */
export function takesDrivingLicence(kind) {
    return kind === 'DRIVING_LICENCE'
}

function qualificationTypeValues(values) {
    return {
        name: textOrNull(values.name),
        kind: values.kind ?? null,
        drivingLicence: takesDrivingLicence(values.kind) ? values.drivingLicence ?? null : null,
        validityMonths: numberOrNull(values.validityMonths),
        description: textOrNull(values.description),
    }
}

/** El alta, desde lo escrito en su editor; lo vacío no viaja, y el permiso solo con su clase. */
export function newQualificationTypeRequest(values) {
    return withoutNulls({code: textOrNull(values.code), ...qualificationTypeValues(values)})
}

const QUALIFICATION_TYPE_FIELDS = Object.freeze(['name', 'kind', 'drivingLicence', 'validityMonths', 'description'])

/**
 * La modificación: lo que cambió, lo vaciado a null y la versión. Pasar a otra clase vacía el permiso.
 * El código no cambia. null si no cambió nada.
 */
export function qualificationTypePatch(original, values) {
    return buildMergePatch(original, qualificationTypeValues(values), {
        fields: QUALIFICATION_TYPE_FIELDS, numberFields: ['validityMonths'], version: original.version,
    })
}

/** Las cualificaciones de una persona, enteras, por el código de su tipo. */
export function listPersonQualifications(personId, {signal} = {}) {
    return apiFetch(resourcesPath('people', personId, 'qualifications'), {signal})
}

/** 201; 409 QUA-001 si la persona ya tiene ese tipo o el tipo está retirado. */
export function addPersonQualification(personId, body) {
    return apiFetch(resourcesPath('people', personId, 'qualifications'), {method: 'POST', json: body})
}

export function patchPersonQualification(personId, qualificationId, patch) {
    return apiFetch(resourcesPath('people', personId, 'qualifications', qualificationId),
        {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/** 204: se borra; el historial del servicio la guarda. */
export function removePersonQualification(personId, qualificationId) {
    return apiFetch(resourcesPath('people', personId, 'qualifications', qualificationId), {method: 'DELETE', responseType: 'none'})
}

/** Lo que el formulario guarda de una cualificación leída, o de una nueva. */
export function personQualificationFormValues(qualification) {
    return {
        qualificationTypeId: qualification?.qualificationType?.id ?? null,
        reference: qualification?.reference ?? '',
        issuedOn: qualification?.issuedOn ?? null,
        expiresOn: qualification?.expiresOn ?? null,
        notes: qualification?.notes ?? '',
    }
}

function personQualificationValues(values) {
    return {
        reference: textOrNull(values.reference),
        issuedOn: toLocalDateParam(values.issuedOn) ?? null,
        expiresOn: toLocalDateParam(values.expiresOn) ?? null,
        notes: textOrNull(values.notes),
    }
}

/** El alta: el tipo y lo escrito; lo vacío no viaja (sin caducidad, no caduca). */
export function personQualificationRequest(values) {
    return withoutNulls({qualificationTypeId: values.qualificationTypeId ?? null, ...personQualificationValues(values)})
}

const PERSON_QUALIFICATION_FIELDS = Object.freeze(['reference', 'issuedOn', 'expiresOn', 'notes'])

/** La modificación (el tipo no cambia): lo cambiado, lo vaciado a null y la versión; null si nada. */
export function personQualificationPatch(original, values) {
    return buildMergePatch(original, personQualificationValues(values), {fields: PERSON_QUALIFICATION_FIELDS, version: original.version})
}

/** Los tipos que se ofrecen en el alta: los activos que la persona no tiene ya (409 QUA-001 si no). */
export function offeredQualificationTypes(types, held) {
    const taken = new Set((held ?? []).map((qualification) => qualification.qualificationType?.id))
    return (types ?? []).filter((type) => isActiveQualificationType(type) && !taken.has(type.id))
}
