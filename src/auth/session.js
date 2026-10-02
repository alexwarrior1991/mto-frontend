import {decodeJwtPayload} from './claims.js'
import {permissionsByClient} from './permissions.js'

/**
 * Quien ha entrado y que puede ver, sacado del ACCESS token (no del ID token: Keycloak solo pone
 * resource_access en el access token). Se recalcula en cada renovacion, asi que un cambio de roles se
 * nota en menos de cinco minutos.
 */
export function buildSession(accessToken) {
    const claims = decodeJwtPayload(accessToken) ?? {}
    const byClient = permissionsByClient(claims)
    const permissions = new Set(byClient.flatMap((client) => client.roles))
    return Object.freeze({
        username: stringOrNull(claims.preferred_username) ?? stringOrNull(claims.sub),
        name: stringOrNull(claims.name),
        permissions,
        permissionsByClient: byClient,
        audiences: audiencesOf(claims.aud),
        // Solo informativos: un rol de realm nunca concede nada.
        realmRoles: Array.isArray(claims.realm_access?.roles)
            ? claims.realm_access.roles.filter((role) => typeof role === 'string').sort()
            : [],
        has: (permission) => permissions.has(permission),
        hasAll: (...required) => required.every((permission) => permissions.has(permission)),
        hasAny: (...candidates) => candidates.some((permission) => permissions.has(permission)),
    })
}

function audiencesOf(aud) {
    if (typeof aud === 'string') {
        return [aud]
    }
    return Array.isArray(aud) ? aud.filter((value) => typeof value === 'string') : []
}

function stringOrNull(value) {
    return typeof value === 'string' && value ? value : null
}
