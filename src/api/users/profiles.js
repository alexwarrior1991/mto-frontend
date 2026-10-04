import {apiFetch} from '../http.js'
import {prefixOf} from '../services.js'
import {toUserRoles} from './roles.js'
import {toUser} from './users.js'

/**
 * Los perfiles de mto-users (la parte de perfiles de UsersClient del backoffice).
 *
 * - Un perfil es un rol compuesto de realm con el prefijo mto- que concede roles de cliente. Asignarlo
 *   es una asignación de realm: aquí no se calcula nada.
 * - Asignar es un PUT sin cuerpo, idempotente; quitar, un DELETE. Los dos devuelven los perfiles del
 *   usuario como quedan, y la pantalla pinta esa respuesta.
 * - Los miembros de un perfil son solo las asignaciones directas, en una lista sin total.
 *
 * Leer pide users-read; asignar y quitar, users-profiles-write.
 */

function base() {
    return prefixOf('mto-users')
}

function path(...segments) {
    return [base(), ...segments.map((segment) => encodeURIComponent(segment))].join('/')
}

export async function listProfiles({signal} = {}) {
    return asList(await apiFetch(path('profiles'), {signal}))
}

/** Lo que concede un perfil: sus roles de cliente y de realm. */
export async function getProfile(name, {signal} = {}) {
    const body = await apiFetch(path('profiles', name), {signal})
    return {...body, ...toUserRoles(body)}
}

/** Quién tiene un perfil, por asignación directa: una página sin total, al estilo de Keycloak. */
export async function listProfileMembers(name, {first = 0, max = 50} = {}, {signal} = {}) {
    const body = await apiFetch(path('profiles', name, 'users'), {query: {first, max}, signal})
    return asList(body).map(toUser)
}

export async function getUserProfiles(userId, {signal} = {}) {
    return asList(await apiFetch(path(userId, 'profiles'), {signal}))
}

/** Asigna un perfil (PUT sin cuerpo); devuelve los perfiles del usuario como quedan. */
export async function assignProfile(userId, name) {
    return asList(await apiFetch(path(userId, 'profiles', name), {method: 'PUT'}))
}

/** Quita un perfil; devuelve los perfiles del usuario como quedan. */
export async function removeProfile(userId, name) {
    return asList(await apiFetch(path(userId, 'profiles', name), {method: 'DELETE'}))
}

function asList(value) {
    return Array.isArray(value) ? value : []
}
