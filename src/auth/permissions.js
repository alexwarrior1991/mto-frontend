import {SERVICES} from '../api/services.js'

/**
 * Los permisos de la aplicacion son roles de CLIENTE de los cinco clientes de API, leidos de
 * resource_access del access token. Nunca roles de realm: si un rol de realm concediera algo, quien
 * administre el realm podria crear uno llamado como un permiso y darselo a cualquiera. Y nunca un rol
 * que no este en el catalogo de su cliente (ops-metrics, o un users-read colado en mto-stock-api).
 *
 * Los nombres no se repiten entre clientes (config-*, lov-manage, users-*, stock-*, maintenance-*,
 * notification-*), asi que un Set plano basta; securityLayer.test.js lo comprueba.
 *
 * Esto decide que se ensena, no que se puede hacer: quien decide es el 403 del servicio.
 */

export const ROLE_CATALOG = Object.freeze(Object.fromEntries(
    SERVICES.map((service) => [service.clientId, Object.freeze([...service.roles])]),
))

/** Los permisos con nombre, para no escribir cadenas sueltas en las pantallas. */
export const P = Object.freeze({
    CONFIG_READ: 'config-read',
    CONFIG_WRITE: 'config-write',
    CONFIG_DELETE: 'config-delete',
    CONFIG_IMPORT: 'config-import',
    LOV_MANAGE: 'lov-manage',
    CONFIG_AUDIT: 'config-audit',
    USERS_READ: 'users-read',
    USERS_WRITE: 'users-write',
    USERS_DELETE: 'users-delete',
    USERS_ROLES_WRITE: 'users-roles-write',
    USERS_PASSWORD_RESET: 'users-password-reset',
    USERS_PROFILES_WRITE: 'users-profiles-write',
    USERS_SESSIONS_WRITE: 'users-sessions-write',
    USERS_CREDENTIALS_WRITE: 'users-credentials-write',
    STOCK_READ: 'stock-read',
    STOCK_WRITE: 'stock-write',
    STOCK_DELETE: 'stock-delete',
    STOCK_ADJUST: 'stock-adjust',
    MAINTENANCE_READ: 'maintenance-read',
    MAINTENANCE_WRITE: 'maintenance-write',
    MAINTENANCE_DELETE: 'maintenance-delete',
    MAINTENANCE_SUPERVISE: 'maintenance-supervise',
    NOTIFICATION_INBOX: 'notification-inbox',
    NOTIFICATION_ACTIVITY_READ: 'notification-activity-read',
    NOTIFICATION_ACCESS_READ: 'notification-access-read',
    NOTIFICATION_ADMIN: 'notification-admin',
})

/** Los roles de cada cliente del catalogo que trae el token, en el orden del catalogo. */
export function permissionsByClient(claims) {
    const resourceAccess = claims?.resource_access
    return Object.entries(ROLE_CATALOG).map(([clientId, catalog]) => {
        const granted = resourceAccess && typeof resourceAccess === 'object'
            ? resourceAccess[clientId]?.roles
            : null
        const roles = Array.isArray(granted) ? catalog.filter((role) => granted.includes(role)) : []
        return {clientId, roles}
    })
}

export function permissionsFrom(claims) {
    return new Set(permissionsByClient(claims).flatMap((client) => client.roles))
}
