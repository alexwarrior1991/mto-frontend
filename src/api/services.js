/**
 * Los servicios del dominio vistos desde la SPA, en un solo sitio: su prefijo publico en el gateway,
 * el cliente de Keycloak cuyos roles son sus permisos y una lectura barata para comprobarlo desde
 * Inicio. De aqui salen el catalogo de permisos (auth/permissions.js), las audiencias que Inicio
 * espera y las sondas.
 *
 * Un servicio nuevo (mto-field, por ejemplo) es una entrada mas aqui, mas su ruta en el gateway y
 * su audience mapper en el cliente mto-frontend del realm.
 */

export const GATEWAY_AUDIENCE = 'mto-gateway-api'

export const SERVICES = Object.freeze([
    {
        name: 'mto-configuration',
        clientId: 'mto-configuration-api',
        prefix: '/api/configuration',
        roles: ['config-read', 'config-write', 'config-delete', 'config-import', 'lov-manage', 'config-audit'],
        probe: {permission: 'config-read', path: '/api/configuration/profile-statuses'},
    },
    {
        name: 'mto-users',
        clientId: 'mto-users-api',
        prefix: '/api/users',
        roles: ['users-read', 'users-write', 'users-delete', 'users-roles-write', 'users-password-reset',
            'users-profiles-write', 'users-sessions-write', 'users-credentials-write'],
        probe: {permission: 'users-read', path: '/api/users', query: {first: 0, max: 1}},
    },
    {
        name: 'mto-stock',
        clientId: 'mto-stock-api',
        prefix: '/api/stock',
        roles: ['stock-read', 'stock-write', 'stock-delete', 'stock-adjust'],
        probe: {permission: 'stock-read', path: '/api/stock/warehouses', query: {page: 0, size: 1}},
    },
    {
        name: 'mto-maintenance',
        clientId: 'mto-maintenance-api',
        prefix: '/api/maintenance',
        roles: ['maintenance-read', 'maintenance-write', 'maintenance-delete', 'maintenance-supervise'],
        probe: {permission: 'maintenance-read', path: '/api/maintenance/teams'},
    },
    {
        name: 'mto-notification',
        clientId: 'mto-notification-api',
        prefix: '/api/notifications',
        roles: ['notification-inbox', 'notification-activity-read', 'notification-access-read', 'notification-admin'],
        probe: {permission: 'notification-inbox', path: '/api/notifications/inbox/unread-count'},
    },
])

/** Las audiencias que un mismo access token tiene que llevar para valer en todo el dominio. */
export const EXPECTED_AUDIENCES = Object.freeze([...SERVICES.map((service) => service.clientId), GATEWAY_AUDIENCE])
