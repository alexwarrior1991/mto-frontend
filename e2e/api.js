import process from 'node:process'

/**
 * Lo que una prueba necesita y no recorre en pantalla, puesto por la API y quitado al acabar: lo que su
 * usuario no puede crear (la vía del recorrido de mantenimiento) o lo que ya prueban los tests de vista
 * (el perfil del esquema de una vía). Así la prueba vale en una plataforma recién levantada, que no trae
 * datos de infraestructura (en el CI, la de cada pasada).
 *
 * - El token se pide por password grant con un usuario de desarrollo: el cliente mto-frontend lo
 *   admite en el realm local (mto-realm-local.json), nunca en el de referencia. Se pide desde Node y a
 *   localhost, sin depender del fichero hosts: el `iss` lo fija el --hostname de Keycloak, así que el
 *   token es el mismo que recibe el navegador.
 * - Las llamadas van a /api por el origen de la SPA (nginx y el gateway), como las haría ella.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4200'
const KEYCLOAK_URL = process.env.E2E_KEYCLOAK_URL ?? 'http://localhost:8082'
const PASSWORD = process.env.E2E_PASSWORD ?? 'local'

/**
 * Un cliente de /api con el token de un usuario de desarrollo. Cada llamada que no sale bien lanza
 * con su estado y su cuerpo. Se cierra con dispose().
 *
 * @param {object} playwright el fixture `playwright`, que también tienen beforeAll y afterAll
 * @param {string} username
 */
export async function apiAs(playwright, username) {
    const keycloak = await playwright.request.newContext()
    let token
    try {
        const response = await keycloak.post(`${KEYCLOAK_URL}/realms/mto/protocol/openid-connect/token`, {
            form: {grant_type: 'password', client_id: 'mto-frontend', username, password: PASSWORD},
        })
        if (!response.ok()) {
            throw new Error(`Keycloak no da token a ${username}: ${response.status()} ${await response.text()}`)
        }
        token = (await response.json()).access_token
    } finally {
        await keycloak.dispose()
    }

    const api = await playwright.request.newContext({baseURL: BASE_URL, extraHTTPHeaders: {Authorization: `Bearer ${token}`}})
    const call = async (method, path, data) => {
        const response = await api.fetch(path, {method, data})
        const text = await response.text()
        if (!response.ok()) {
            throw new Error(`${method} ${path}: ${response.status()} ${text}`)
        }
        return text ? JSON.parse(text) : null
    }
    return {
        get: (path) => call('GET', path),
        post: (path, data) => call('POST', path, data),
        delete: (path) => call('DELETE', path),
        dispose: () => api.dispose(),
    }
}
