/**
 * El token que usa http.js, y su renovacion.
 *
 * - Si al token le quedan menos de diez segundos, se renueva antes de llamar.
 * - Se renueva solo con el refresh token (grant refresh_token). Sin refresh token no se intenta
 *   nada: oidc-client-ts probaria con un iframe, que aqui no puede funcionar.
 * - La renovacion es de un solo vuelo: si varias llamadas la piden a la vez (una pantalla que carga
 *   tres listas justo cuando caduca el token), comparten la misma.
 * - Si falla (la sesion SSO ha caducado o se ha cerrado en Keycloak), devuelve null y http.js abre
 *   el aviso de sesion caducada.
 */

const MIN_REMAINING_SECONDS = 10

export function createTokenSource(userManager) {
    let inFlight = null

    function renew() {
        if (!inFlight) {
            inFlight = refresh()
                .catch(() => null)
                .finally(() => {
                    inFlight = null
                })
        }
        return inFlight
    }

    async function refresh() {
        const user = await userManager.getUser()
        if (!user?.refresh_token) {
            return null
        }
        const renewed = await userManager.signinSilent()
        return renewed?.access_token ?? null
    }

    async function get() {
        const user = await userManager.getUser()
        if (!user?.access_token) {
            return null
        }
        if (typeof user.expires_in === 'number' && user.expires_in < MIN_REMAINING_SECONDS) {
            return renew()
        }
        return user.access_token
    }

    return {get, renew}
}
