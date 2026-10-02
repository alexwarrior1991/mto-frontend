import {CORRELATION_HEADER, newCorrelationId} from './correlation.js'
import {decodeErrorResponse, NetworkError, SessionExpiredError, TokenRejectedError} from './errors.js'

/**
 * La unica puerta hacia la API. El navegador solo llama a /api de su mismo origen: en desarrollo lo
 * reenvia el proxy de Vite al gateway y en el contenedor, nginx. Nunca se llama a la URL del gateway.
 *
 * http.js no conoce OIDC: el token le llega con configureHttp, que llama bootstrap al arrancar (y cada
 * test, con un token falso). Asi esta capa sigue siendo JavaScript puro.
 */

const API_PREFIX = '/api/'

let dependencies = {
    getAccessToken: async () => null,
    renewAccessToken: async () => null,
    onSessionExpired: () => {
    },
}

export function configureHttp(next) {
    dependencies = {...dependencies, ...next}
}

/**
 * Llama a la API con el token de la persona y un X-Correlation-Id nuevo.
 *
 * @param {string} path ruta publica, siempre bajo /api/ (por ejemplo /api/stock/materials)
 * @param {object} [options]
 * @param {string} [options.method] GET por defecto
 * @param {object} [options.query] parametros; un array repite la clave (sort=a,asc&sort=b,desc) y lo vacio no viaja
 * @param {*} [options.json] cuerpo que se manda como JSON (o con contentType, como merge-patch)
 * @param {BodyInit} [options.body] cuerpo tal cual (FormData para un multipart)
 * @param {string} [options.contentType] Content-Type del cuerpo JSON (application/merge-patch+json)
 * @param {'json'|'blob'|'text'|'none'} [options.responseType] json por defecto; blob devuelve {blob, headers}
 * @param {AbortSignal} [options.signal]
 */
export async function apiFetch(path, options = {}) {
    const url = buildUrl(path, options.query)
    const method = (options.method ?? 'GET').toUpperCase()
    const operation = `${method} ${url.pathname}`

    const token = await dependencies.getAccessToken()
    if (!token) {
        throw sessionExpired(operation, null)
    }

    let attempt = await send(url, method, token, options)
    if (attempt.response.status === 401) {
        // El token ha caducado o el servicio lo rechaza: se renueva una vez y se repite la llamada,
        // con un X-Correlation-Id nuevo porque es otra llamada.
        const renewed = await dependencies.renewAccessToken()
        if (!renewed) {
            throw sessionExpired(operation, attempt.correlationId)
        }
        attempt = await send(url, method, renewed, options)
        if (attempt.response.status === 401) {
            const {problem, body, correlationId} = await decodeErrorResponse(attempt.response, {
                correlationId: attempt.correlationId,
                operation,
            })
            throw new TokenRejectedError(401, {problem, body, correlationId, operation})
        }
    }

    if (!attempt.response.ok) {
        throw await decodeErrorResponse(attempt.response, {correlationId: attempt.correlationId, operation})
    }
    return readBody(attempt.response, options.responseType ?? 'json', operation)
}

/** La URL de una llamada: solo rutas /api/ del mismo origen, con la query ya codificada. */
export function buildUrl(path, query) {
    if (typeof path !== 'string' || !path.startsWith(API_PREFIX)) {
        throw new Error(`Solo se llama a la API del mismo origen (/api/...): ${path}`)
    }
    const url = new URL(path, window.location.origin)
    for (const [key, value] of Object.entries(query ?? {})) {
        for (const item of Array.isArray(value) ? value : [value]) {
            if (item === undefined || item === null || item === '') {
                continue
            }
            if (item instanceof Date) {
                throw new Error(`Una fecha viaja como texto ISO (api/dates.js), no como Date: ${key}`)
            }
            url.searchParams.append(key, String(item))
        }
    }
    return url
}

async function send(url, method, token, options) {
    const correlationId = newCorrelationId()
    const headers = new Headers({
        Authorization: `Bearer ${token}`,
        [CORRELATION_HEADER]: correlationId,
        Accept: acceptFor(options.responseType ?? 'json'),
    })
    let body = options.body
    if (options.json !== undefined) {
        headers.set('Content-Type', options.contentType ?? 'application/json')
        body = JSON.stringify(options.json)
    } else if (options.contentType) {
        headers.set('Content-Type', options.contentType)
    }
    try {
        const response = await fetch(url, {
            method,
            headers,
            body,
            signal: options.signal,
            credentials: 'omit',
            cache: 'no-store',
        })
        return {response, correlationId}
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw error
        }
        throw new NetworkError(0, {correlationId, operation: `${method} ${url.pathname}`, cause: error})
    }
}

function sessionExpired(operation, correlationId) {
    dependencies.onSessionExpired()
    return new SessionExpiredError(401, {operation, correlationId})
}

function acceptFor(responseType) {
    if (responseType === 'json') {
        return 'application/json, application/problem+json'
    }
    if (responseType === 'text') {
        return 'text/plain, */*'
    }
    return '*/*'
}

async function readBody(response, responseType, operation) {
    if (responseType === 'none') {
        return null
    }
    if (responseType === 'blob') {
        return {blob: await response.blob(), headers: response.headers}
    }
    const text = await response.text()
    if (responseType === 'text') {
        return text
    }
    if (!text.trim()) {
        // 202 y 204 sin cuerpo.
        return null
    }
    try {
        return JSON.parse(text)
    } catch (error) {
        throw new Error(`${operation}: la respuesta no es JSON`, {cause: error})
    }
}
