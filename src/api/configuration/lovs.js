import {apiFetch} from '../http.js'
import {prefixOf} from '../services.js'

/**
 * Los catalogos de mto-configuration (el port de LovClient del backoffice): los endpoints de
 * AbstractLovController, los mismos para los 17, asi que van parametrizados por recurso. El
 * catalogo entero llega en una lista, no en una pagina.
 *
 * Permisos que aplica el servicio: leer pide config-read; crear y modificar, config-write y
 * lov-manage; los lotes (/bulk), config-import y lov-manage; borrar, config-delete y lov-manage.
 *
 * Como viaja una entrada (README_API.md §5 de mto-configuration):
 * - el alta lleva solo lo que se escribe: ni id ni version, que pone el servicio;
 * - una modificacion SUSTITUYE la entrada entera, asi que se manda la fila leida con lo cambiado
 *   encima: lo que la pantalla no ensena (drawingNumber, o una clave que el servicio anada manana)
 *   vuelve tal cual, y si no viajara se borraria;
 * - el versionNumber vuelve como se leyo: es el bloqueo optimista. Si otra persona guardo antes, el
 *   servicio responde 409 CON-001 sin escribir nada (en un lote, una sola fila vieja rechaza el lote
 *   entero). La pantalla no compara versiones: eso lo decide el servicio;
 * - el borrado es fisico, y una entrada que otro registro usa no se borra (409 BUS-002).
 */

function base(resource) {
    return `${prefixOf('mto-configuration')}/${resource}`
}

export function listLovs(resource, {signal} = {}) {
    return apiFetch(base(resource), {signal})
}

export function createLov(resource, entry) {
    return apiFetch(base(resource), {method: 'POST', json: entry})
}

export function updateLov(resource, entry) {
    return apiFetch(`${base(resource)}/${entry.id}`, {method: 'PUT', json: entry})
}

export function deleteLov(resource, id) {
    return apiFetch(`${base(resource)}/${id}`, {method: 'DELETE', responseType: 'none'})
}

export function bulkCreateLovs(resource, entries) {
    return apiFetch(`${base(resource)}/bulk`, {method: 'POST', json: entries})
}

export function bulkUpdateLovs(resource, entries) {
    return apiFetch(`${base(resource)}/bulk`, {method: 'PUT', json: entries})
}

/**
 * El cuerpo de un alta: codigo, descripcion y si esta activa, mas el tipo padre por su id en los tres
 * catalogos que lo exigen (resource.parent).
 */
export function newLovEntry(resource, {code, description, enabled, parentId = null}) {
    return withParent(resource, {code, description, enabled}, parentId)
}

/** El cuerpo de una modificacion: la fila leida entera, con su version, y lo cambiado encima. */
export function changedLovEntry(resource, read, {code, description, enabled, parentId = null}) {
    return withParent(resource, {...read, code, description, enabled}, parentId)
}

/** Activar o desactivar en lote: cada fila leida entera, con su version, y enabled cambiado. */
export function lovEntryWithEnabled(read, enabled) {
    return {...read, enabled}
}

function withParent(resource, entry, parentId) {
    if (!resource.parent || parentId === null || parentId === undefined || parentId === '') {
        return entry
    }
    return {...entry, [resource.parent.field]: {id: Number(parentId)}}
}
