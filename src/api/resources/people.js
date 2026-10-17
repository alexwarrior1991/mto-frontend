import {textOrNull, withoutNulls} from '../bodies.js'
import {apiFetch} from '../http.js'
import {buildMergePatch, MERGE_PATCH} from '../mergePatch.js'
import {sortWithTieBreak, toPage, toPageParams} from '../paging.js'
import {PERSON_CATEGORY} from './enums.js'
import {resourcesPath} from './values.js'

/**
 * Las personas de mto-resources: el port de PersonClient y PersonForm del backoffice.
 *
 * - Toda persona tiene ficha, con o sin usuario de Keycloak (username, su preferred_username).
 * - No se borra nunca: DELETE desactiva (resources-delete; 409 UNI-001 si dirige una unidad o si un
 *   equipo se quedaría con menos de 2 linemen) y se reactiva con un PATCH active=true (resources-write).
 * - Una modificación es un PATCH merge-patch con la versión leída (409 CON-001 si otra persona guardó
 *   antes); el servicio deja vaciar el número de empleado, el usuario, la empresa y el teléfono.
 * - Un usuario o un número de empleado repetidos son un 409 PER-409.
 */

/** El orden de la lista sin columna elegida, y el id para desempatar al final. */
export const BY_NAME = Object.freeze(['lastName,asc', 'firstName,asc'])

/**
 * Una página de personas con sus filtros; lo vacío no viaja. La página empieza en 1.
 *
 * @param {object} [filters]
 * @param {string} [filters.search] el código, el nombre, los apellidos, el usuario o el número de empleado
 * @param {string[]} [filters.categories] cualquiera de ellas (category repetido), en el orden del enumerado
 * @param {string|null} [filters.unitId] quien dirige esa unidad o es uno de sus linemen ahora
 * @param {boolean|null} [filters.active] null no filtra
 */
export async function searchPeople({search = '', categories = [], unitId = null, active = null, page = 1, size = 50, sort = null} = {},
                                   {signal} = {}) {
    const ordered = PERSON_CATEGORY.values.filter((category) => categories.includes(category))
    const body = await apiFetch(resourcesPath('people'), {
        query: {
            search: textOrNull(search), category: ordered.length > 0 ? ordered : null, unitId, active,
            ...toPageParams({page, size}), sort: sortWithTieBreak(sort, BY_NAME),
        },
        signal,
    })
    return toPage(body)
}

export function getPerson(id, {signal} = {}) {
    return apiFetch(resourcesPath('people', id), {signal})
}

/** 201 con la persona y su código (PER-000001). */
export function createPerson(body) {
    return apiFetch(resourcesPath('people'), {method: 'POST', json: body})
}

export function patchPerson(id, patch) {
    return apiFetch(resourcesPath('people', id), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/** 204: deja de entrar en equipos y turnos nuevos. */
export function deactivatePerson(id) {
    return apiFetch(resourcesPath('people', id), {method: 'DELETE', responseType: 'none'})
}

/** Deshace la desactivación, con la versión leída. */
export function reactivatePerson(person) {
    return patchPerson(person.id, {active: true, version: person.version})
}

/** La ruta del historial de una persona, para listRevisions. */
export function personRevisionsPath(id) {
    return resourcesPath('people', id, 'revisions')
}

export function isActivePerson(person) {
    return person?.active === true
}

const PERSON_FIELDS = Object.freeze(['firstName', 'lastName', 'category', 'employer', 'company', 'employeeNumber', 'username', 'phone'])

/** El alta, desde lo escrito en su editor; lo vacío no viaja, y una persona propia no lleva empresa. */
export function newPersonRequest(values) {
    return withoutNulls(personValues(values))
}

/**
 * La modificación: lo que cambió frente a lo leído, lo vaciado a null y la versión. Pasar a propio vacía
 * la empresa. null si no cambió nada.
 */
export function personPatch(original, values) {
    return buildMergePatch(original, personValues(values), {fields: PERSON_FIELDS, version: original.version})
}

function personValues(values) {
    const employer = values.employer ?? 'OWN'
    return {
        firstName: textOrNull(values.firstName),
        lastName: textOrNull(values.lastName),
        category: values.category ?? null,
        employer,
        company: employer === 'SUBCONTRACTOR' ? textOrNull(values.company) : null,
        employeeNumber: textOrNull(values.employeeNumber),
        username: textOrNull(values.username),
        phone: textOrNull(values.phone),
    }
}
