/**
 * La configuracion de cada entorno se lee al arrancar de /config.json. En el contenedor la genera
 * nginx desde sus variables de entorno; en desarrollo es public/config.json. Asi una misma imagen
 * sirve para todos los entornos y nada del entorno queda dentro del bundle.
 *
 * La base de la API no se configura: es siempre /api del mismo origen.
 */
export async function loadRuntimeConfig(fetchImpl = fetch) {
    const response = await fetchImpl('/config.json', {cache: 'no-store'})
    if (!response.ok) {
        throw new Error(`/config.json ha respondido ${response.status}`)
    }
    return validateRuntimeConfig(await response.json())
}

export function validateRuntimeConfig(raw) {
    const authority = raw?.oidc?.authority
    const clientId = raw?.oidc?.clientId
    if (!isHttpUrl(authority)) {
        throw new Error('config.json: oidc.authority tiene que ser la URL http(s) del realm de Keycloak')
    }
    if (typeof clientId !== 'string' || !clientId.trim()) {
        throw new Error('config.json: falta oidc.clientId')
    }
    return Object.freeze({
        oidc: Object.freeze({authority: authority.trim().replace(/\/+$/, ''), clientId: clientId.trim()}),
        environment: typeof raw.environment === 'string' ? raw.environment.trim() : '',
        // Mientras convivan los dos frontales, las pantallas pendientes enlazan al backoffice.
        backofficeUrl: isHttpUrl(raw.backofficeUrl) ? raw.backofficeUrl.trim().replace(/\/+$/, '') : null,
    })
}

function isHttpUrl(value) {
    if (typeof value !== 'string' || !value.trim()) {
        return false
    }
    try {
        const url = new URL(value.trim())
        return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
        return false
    }
}
