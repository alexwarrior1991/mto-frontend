import {apiFetch} from '../http.js'
import {prefixOf} from '../services.js'
import {toUser} from './users.js'

/**
 * Los roles de cliente de mto-users (la parte de roles de UsersClient del backoffice): los clientes
 * del realm, sus roles, quién tiene cada uno, y los de una persona.
 *
 * - Los clientes protegidos del realm (realm-management, account…) ni se listan ni se asignan.
 * - Asignar es un PUT con {roles}, que añade.
 * - Quitar es un DELETE con el mismo cuerpo.
 * - Los dos devuelven los roles del usuario como quedan, y la pantalla pinta esa respuesta sin
 *   volver a pedirlos.
 * - Los miembros de un rol son solo las asignaciones directas, en una lista sin total.
 *
 * Leer pide users-read; asignar y quitar, users-roles-write.
 */

function base() {
    return prefixOf('mto-users')
}

function path(...segments) {
    return [base(), ...segments.map((segment) => encodeURIComponent(segment))].join('/')
}

/** Los roles de una persona, con todo presente aunque no venga. */
export function toUserRoles(body) {
    return {
        realmRoles: asList(body?.realmRoles),
        clientRoles: asList(body?.clientRoles).map((assignment) => ({
            clientId: assignment?.clientId ?? '',
            roles: asList(assignment?.roles),
        })),
    }
}

/** Un cliente se nombra por su nombre, o por su clientId si no lo tiene (ClientDto.label). */
export function clientLabel(client) {
    return typeof client?.name === 'string' && client.name.trim() ? client.name : (client?.clientId ?? '')
}

export async function listClients({signal} = {}) {
    return asList(await apiFetch(path('roles', 'clients'), {signal}))
}

export async function listClientRoles(clientId, {signal} = {}) {
    return asList(await apiFetch(path('roles', 'clients', clientId), {signal}))
}

/** Quién tiene un rol, por asignación directa: una página sin total, al estilo de Keycloak. */
export async function listClientRoleMembers(clientId, roleName, {first = 0, max = 50} = {}, {signal} = {}) {
    const body = await apiFetch(path('roles', 'clients', clientId, roleName, 'users'), {query: {first, max}, signal})
    return asList(body).map(toUser)
}

export async function getUserRoles(userId, {signal} = {}) {
    return toUserRoles(await apiFetch(path(userId, 'roles'), {signal}))
}

/** Añade roles de un cliente; devuelve los roles del usuario como quedan. */
export async function addClientRoles(userId, clientId, roles) {
    return toUserRoles(await apiFetch(path(userId, 'roles', 'clients', clientId), {method: 'PUT', json: {roles}}))
}

/** Quita roles de un cliente: un DELETE con cuerpo. Devuelve los roles del usuario como quedan. */
export async function removeClientRoles(userId, clientId, roles) {
    return toUserRoles(await apiFetch(path(userId, 'roles', 'clients', clientId), {method: 'DELETE', json: {roles}}))
}

function asList(value) {
    return Array.isArray(value) ? value : []
}
