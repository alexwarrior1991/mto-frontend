import {InMemoryWebStorage, UserManager, WebStorageStateStore} from 'oidc-client-ts'
import {CALLBACK_PATH, LOGGED_OUT_PATH} from './returnTo.js'

/**
 * El cliente OIDC de la SPA: el cliente publico mto-frontend del realm, con Authorization Code y PKCE.
 *
 * - El token vive SOLO en memoria (InMemoryWebStorage): nunca en localStorage ni en sessionStorage.
 *   Recargar la pagina es volver a entrar por el SSO de Keycloak, un rebote breve sin formulario.
 * - En sessionStorage solo va el state y el code_verifier de PKCE, que tienen que sobrevivir a la ida
 *   y vuelta a Keycloak y se borran al usarse.
 * - No hay renovacion automatica: la hace tokenSource cuando una llamada la necesita, y solo con el
 *   refresh token. oidc-client-ts, sin refresh token, probaria con un iframe, y entre localhost:4200
 *   y auth.mto.local el navegador bloquea las cookies de terceros. Ademas, asi una pestana olvidada no
 *   mantiene viva la sesion SSO: la inactividad de Keycloak (30 minutos) cuenta de verdad.
 */
export function createUserManager(config, origin = window.location.origin) {
    return new UserManager({
        authority: config.oidc.authority,
        client_id: config.oidc.clientId,
        redirect_uri: origin + CALLBACK_PATH,
        post_logout_redirect_uri: origin + LOGGED_OUT_PATH,
        response_type: 'code',
        scope: 'openid',
        userStore: new WebStorageStateStore({store: new InMemoryWebStorage()}),
        stateStore: new WebStorageStateStore({store: window.sessionStorage}),
        automaticSilentRenew: false,
        monitorSession: false,
        loadUserInfo: false,
        redirectMethod: 'replace',
    })
}
