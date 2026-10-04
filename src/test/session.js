import {EXPECTED_AUDIENCES} from '../api/services.js'
import {P, ROLE_CATALOG} from '../auth/permissions.js'
import {buildSession} from '../auth/session.js'

/**
 * Un access token sin firmar con la forma de los de Keycloak: preferred_username, aud,
 * realm_access y resource_access. Es lo unico que lee la sesion, y asi los tests de pantallas pasan
 * por el mismo mapeo de permisos que produccion.
 */
export function fakeAccessToken({
    username = 'persona.prueba',
    clientRoles = {},
    realmRoles = [],
    aud = EXPECTED_AUDIENCES,
    expiresInSeconds = 300,
    extra = {},
} = {}) {
    const payload = {
        sub: `sub-${username}`,
        preferred_username: username,
        aud,
        exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
        realm_access: {roles: realmRoles},
        resource_access: Object.fromEntries(Object.entries(clientRoles).map(([client, roles]) => [client, {roles}])),
        ...extra,
    }
    return `${base64Url({alg: 'none', typ: 'JWT'})}.${base64Url(payload)}.`
}

/** La sesion de una persona con estos permisos, cada uno en su cliente, como los daria Keycloak. */
export function sessionWith(permissions = [], {username = 'persona.prueba', realmRoles = [], aud} = {}) {
    const clientRoles = {}
    for (const permission of permissions) {
        const client = Object.keys(ROLE_CATALOG).find((clientId) => ROLE_CATALOG[clientId].includes(permission))
        if (!client) {
            throw new Error(`Permiso desconocido en un test: ${permission}`)
        }
        clientRoles[client] = [...(clientRoles[client] ?? []), permission]
    }
    return buildSession(fakeAccessToken({username, clientRoles, realmRoles, aud}))
}

/**
 * Los usuarios de desarrollo del realm con sus permisos (los perfiles de mto-platform). Todos los
 * perfiles llevan notification-inbox; los de mantenimiento, ademas, config-read y stock-read.
 */
export const DEV_USERS = Object.freeze({
    'config.lector': [P.CONFIG_READ, P.NOTIFICATION_INBOX],
    'config.responsable': [P.CONFIG_READ, P.CONFIG_WRITE, P.CONFIG_DELETE, P.CONFIG_IMPORT, P.CONFIG_AUDIT,
        P.LOV_MANAGE, P.NOTIFICATION_INBOX, P.NOTIFICATION_ACTIVITY_READ],
    'almacen.lector': [P.STOCK_READ, P.NOTIFICATION_INBOX],
    'almacen.operario': [P.STOCK_READ, P.STOCK_WRITE, P.NOTIFICATION_INBOX],
    'almacen.responsable': [P.STOCK_READ, P.STOCK_WRITE, P.STOCK_DELETE, P.STOCK_ADJUST, P.NOTIFICATION_INBOX,
        P.NOTIFICATION_ACTIVITY_READ],
    'mantenimiento.lector': [P.MAINTENANCE_READ, P.CONFIG_READ, P.STOCK_READ, P.NOTIFICATION_INBOX],
    'mantenimiento.tecnico': [P.MAINTENANCE_READ, P.MAINTENANCE_WRITE, P.CONFIG_READ, P.STOCK_READ, P.NOTIFICATION_INBOX],
    'mantenimiento.responsable': [P.MAINTENANCE_READ, P.MAINTENANCE_WRITE, P.MAINTENANCE_DELETE, P.MAINTENANCE_SUPERVISE, P.CONFIG_READ,
        P.STOCK_READ, P.NOTIFICATION_INBOX, P.NOTIFICATION_ACTIVITY_READ],
    'usuarios.lector': [P.USERS_READ, P.NOTIFICATION_INBOX],
    'usuarios.gestor': [P.USERS_READ, P.USERS_WRITE, P.USERS_ROLES_WRITE, P.USERS_PASSWORD_RESET, P.USERS_PROFILES_WRITE,
        P.USERS_SESSIONS_WRITE, P.USERS_CREDENTIALS_WRITE, P.NOTIFICATION_INBOX],
    'usuarios.responsable': [P.USERS_READ, P.USERS_WRITE, P.USERS_DELETE, P.USERS_ROLES_WRITE, P.USERS_PASSWORD_RESET,
        P.USERS_PROFILES_WRITE, P.USERS_SESSIONS_WRITE, P.USERS_CREDENTIALS_WRITE, P.NOTIFICATION_INBOX,
        P.NOTIFICATION_ACTIVITY_READ, P.NOTIFICATION_ACCESS_READ],
})

export function loginAs(username, {realmRoles = []} = {}) {
    const permissions = DEV_USERS[username]
    if (!permissions) {
        throw new Error(`Usuario de desarrollo desconocido en un test: ${username}`)
    }
    return sessionWith(permissions, {username, realmRoles})
}

function base64Url(value) {
    return Buffer.from(JSON.stringify(value)).toString('base64url')
}
