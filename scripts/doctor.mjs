/**
 * npm run doctor: comprueba el entorno local antes de arrancar y, para cada fallo, dice que hacer.
 *
 * Es Node puro y sin dependencias, asi que funciona igual en Windows, macOS y Linux (desde WebStorm,
 * la configuracion «Doctor»). Mira lo que necesita `npm run dev` contra mto-platform: Node, el
 * fichero hosts, Keycloak con el realm y el cliente mto-frontend bien configurado, el gateway y el
 * puerto 4200 libre.
 */
import {lookup} from 'node:dns/promises'
import {readFileSync} from 'node:fs'
import {createServer} from 'node:net'
import process from 'node:process'

const PORT = 4200
const ORIGIN = `http://localhost:${PORT}`
const AUTHORITY = trimSlash(process.env.MTO_OIDC_AUTHORITY ?? devConfig()?.oidc?.authority ?? 'http://auth.mto.local:8082/realms/mto')
const CLIENT_ID = process.env.MTO_OIDC_CLIENT_ID ?? devConfig()?.oidc?.clientId ?? 'mto-frontend'
const GATEWAY = trimSlash(process.env.MTO_DEV_GATEWAY_URL ?? 'http://localhost:8090')
const HOSTS_FILE = process.platform === 'win32' ? 'C:\\Windows\\System32\\drivers\\etc\\hosts' : '/etc/hosts'
const START_PLATFORM = 'Levanta la plataforma desde ../mto-platform: «docker compose --profile all up -d» y después '
    + '«./keycloak/apply-partials.sh» (en Windows, desde Git Bash).'

const checks = [
    {name: 'Node 22.22 o posterior', run: checkNode},
    {name: `${new URL(AUTHORITY).hostname} resuelve`, run: checkHost},
    {name: 'Keycloak responde con el realm', run: checkRealm},
    {name: `El cliente ${CLIENT_ID} admite volver a ${ORIGIN}`, run: checkRedirect},
    {name: `El cliente ${CLIENT_ID} admite volver a ${ORIGIN} al salir`, run: checkLogoutRedirect},
    {name: `El gateway responde en ${GATEWAY}`, run: checkGateway},
    {name: `El puerto ${PORT} está libre para npm run dev`, run: checkPort},
]

let failures = 0
for (const check of checks) {
    let result
    try {
        result = await check.run()
    } catch (error) {
        result = {ok: false, detail: error.message}
    }
    console.log(`${result.ok ? '✔' : '✘'} ${check.name}${result.detail ? ` (${result.detail})` : ''}`)
    if (!result.ok) {
        failures += 1
        if (result.hint) {
            console.log(`    → ${result.hint}`)
        }
    }
}
console.log(failures === 0 ? '\nTodo listo: npm run dev y abre http://localhost:4200' : `\n${failures} comprobación(es) fallida(s).`)
process.exitCode = failures === 0 ? 0 : 1

function checkNode() {
    const [major, minor] = process.versions.node.split('.').map(Number)
    const ok = major > 22 || (major === 22 && minor >= 22)
    return {
        ok,
        detail: `tienes ${process.versions.node}`,
        hint: 'Instala Node 22 LTS (el instalador oficial, nvm o nvm-windows) y elígelo en WebStorm: Settings → Languages & Frameworks → Node.js.',
    }
}

async function checkHost() {
    const host = new URL(AUTHORITY).hostname
    try {
        const {address} = await lookup(host)
        return {ok: true, detail: address}
    } catch {
        return {
            ok: false,
            hint: `Añade la línea «127.0.0.1 auth.mto.local otel.mto.local» a ${HOSTS_FILE}`
                + (process.platform === 'win32' ? ' (abriendo el editor como administrador).' : '.'),
        }
    }
}

async function checkRealm() {
    const response = await get(`${AUTHORITY}/.well-known/openid-configuration`)
    if (!response) {
        return {ok: false, detail: 'no contesta', hint: START_PLATFORM}
    }
    if (!response.ok) {
        return {ok: false, detail: `responde ${response.status}`, hint: START_PLATFORM}
    }
    const {issuer} = await response.json()
    return issuer === AUTHORITY
        ? {ok: true}
        : {ok: false, detail: `el issuer es ${issuer}`, hint: 'MTO_OIDC_AUTHORITY tiene que ser exactamente el issuer del realm.'}
}

// Keycloak rechaza con un 400 un redirect_uri que el cliente no tiene registrado; si lo acepta, pinta el formulario.
async function checkRedirect() {
    const url = new URL(`${AUTHORITY}/protocol/openid-connect/auth`)
    url.search = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: `${ORIGIN}/auth/callback`,
        response_type: 'code',
        scope: 'openid',
        code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        code_challenge_method: 'S256',
    }).toString()
    const response = await get(url)
    if (!response) {
        return {ok: false, detail: 'Keycloak no contesta', hint: START_PLATFORM}
    }
    return response.ok
        ? {ok: true}
        : {ok: false, detail: `responde ${response.status}`, hint: `El cliente ${CLIENT_ID} del realm no tiene ${ORIGIN}/* como redirect URI.`}
}

async function checkLogoutRedirect() {
    const url = new URL(`${AUTHORITY}/protocol/openid-connect/logout`)
    url.search = new URLSearchParams({client_id: CLIENT_ID, post_logout_redirect_uri: `${ORIGIN}/auth/logged-out`}).toString()
    const response = await get(url)
    if (!response) {
        return {ok: false, detail: 'Keycloak no contesta', hint: START_PLATFORM}
    }
    return response.ok
        ? {ok: true}
        : {
            ok: false,
            detail: `responde ${response.status}`,
            hint: 'El realm no tiene el post-logout redirect URI de la fase 0: recrea Keycloak desde ../mto-platform con '
                + '«docker compose up -d --force-recreate keycloak» y vuelve a lanzar «./keycloak/apply-partials.sh».',
        }
}

async function checkGateway() {
    const response = await get(`${GATEWAY}/actuator/health`)
    if (!response) {
        return {ok: false, detail: 'no contesta', hint: START_PLATFORM}
    }
    return response.ok
        ? {ok: true}
        : {ok: false, detail: `responde ${response.status}`, hint: START_PLATFORM}
}

function checkPort() {
    return new Promise((resolve) => {
        const server = createServer()
        server.once('error', () => resolve({
            ok: false,
            detail: 'ocupado',
            hint: 'Lo usa el contenedor de la SPA (desde ../mto-platform: «docker compose stop frontend») u otro npm run dev.',
        }))
        server.once('listening', () => server.close(() => resolve({ok: true})))
        server.listen(PORT, 'localhost')
    })
}

async function get(url) {
    try {
        return await fetch(url, {redirect: 'manual', signal: AbortSignal.timeout(5000)})
    } catch {
        return null
    }
}

function devConfig() {
    try {
        return JSON.parse(readFileSync(new URL('../public/config.json', import.meta.url), 'utf8'))
    } catch {
        return null
    }
}

function trimSlash(value) {
    return value.replace(/\/+$/, '')
}
