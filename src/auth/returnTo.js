/**
 * Las dos rutas propias de la entrada y la salida, y a donde se vuelve despues de entrar.
 *
 * La URL que se pidio (un enlace de una notificacion, de un correo o un favorito) viaja en el state
 * de OIDC y se restaura al volver de Keycloak. Solo vale una ruta de esta aplicacion: nada de //host,
 * /\host ni las propias /auth/*, que acabarian en otro sitio o en un bucle.
 */

export const CALLBACK_PATH = '/auth/callback'
export const LOGGED_OUT_PATH = '/auth/logged-out'

export function safeReturnTo(value) {
    if (typeof value !== 'string' || !value.startsWith('/')) {
        return '/'
    }
    if (value.startsWith('//') || value.startsWith('/\\')) {
        return '/'
    }
    if (value === '/auth' || value.startsWith('/auth/') || value.startsWith('/auth?') || value.startsWith('/auth#')) {
        return '/'
    }
    if ([...value].some((character) => character.charCodeAt(0) < 0x20)) {
        return '/'
    }
    return value
}

export function currentReturnTo(location = window.location) {
    return safeReturnTo(`${location.pathname}${location.search}${location.hash}`)
}

/** Lo que hace react-oidc-context al volver de Keycloak: quita code y state de la URL y vuelve a la pedida. */
export function restoreReturnTo(user) {
    window.history.replaceState(null, '', safeReturnTo(user?.state?.returnTo))
}
