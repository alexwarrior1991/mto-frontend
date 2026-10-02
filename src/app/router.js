import {createBrowserRouter} from 'react-router'
import {appRoutes} from './routes.js'

let router = null

/**
 * El router se crea una sola vez, y solo cuando AuthGate ya ha dado paso: para entonces la URL de
 * vuelta de Keycloak (con code y state) ya se ha cambiado por la que se pidio.
 */
export function getAppRouter() {
    if (!router) {
        router = createBrowserRouter(appRoutes())
    }
    return router
}
