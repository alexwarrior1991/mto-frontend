import {CORRELATION_HEADER} from './correlation.js'

/**
 * Los errores de la API se tipan aqui y en ningun otro sitio: las pantallas solo conocen ApiError y
 * sus subclases, y los textos para la persona estan en ui/errors/messages.js. Es el port de
 * ApiErrorDecoder y ApiProblem del backoffice.
 *
 * Llegan cinco formatos, y todos se leen igual:
 * - mto-configuration: problem+json con code, traceId, retryable y errors[{field, code, message}];
 * - mto-users: problem+json con errorCode, correlationId y validationErrors[{field, message}];
 * - mto-stock, mto-maintenance y mto-notification: JSON con error, message, errorCode, correlationId
 *   y validationErrors (mas path y method);
 * - el 401/403 del gateway, que solo trae correlationId;
 * - el 503 del fallback del gateway (o el de nginx y Vite cuando el gateway no contesta), con service
 *   y la cabecera Retry-After.
 */

const MAX_RAW_DETAIL = 300

export function emptyProblem() {
    return {
        type: null,
        title: null,
        status: null,
        detail: null,
        instance: null,
        code: null,
        traceId: null,
        correlationId: null,
        timestamp: null,
        retryable: null,
        service: null,
        errors: [],
    }
}

/**
 * Lee el cuerpo de un error. Devuelve el problema normalizado y, si era JSON, el cuerpo tal cual (un
 * 429 de mto-configuration trae en el el trabajo rechazado).
 */
export function readProblem(text, contentType = '') {
    if (!text || !text.trim()) {
        return {problem: emptyProblem(), body: null}
    }
    if (isJson(contentType)) {
        try {
            const body = JSON.parse(text)
            if (body && typeof body === 'object' && !Array.isArray(body)) {
                return {problem: problemFrom(body), body}
            }
        } catch {
            // Decia ser JSON y no lo era: se trata como texto.
        }
    }
    if (isHtml(contentType, text)) {
        // La pagina de error de un proxy no se le ensena a nadie.
        return {problem: emptyProblem(), body: null}
    }
    const raw = text.trim()
    const detail = raw.length > MAX_RAW_DETAIL ? `${raw.slice(0, MAX_RAW_DETAIL)}...` : raw
    return {problem: {...emptyProblem(), detail}, body: null}
}

function problemFrom(body) {
    const errors = asArray(body.errors ?? body.validationErrors).map((item) => ({
        field: textOrNull(item?.field),
        code: textOrNull(item?.code),
        message: textOrNull(item?.message),
    }))
    return {
        type: textOrNull(body.type),
        title: textOrNull(body.title ?? body.error),
        status: typeof body.status === 'number' ? body.status : null,
        detail: textOrNull(body.detail ?? body.message),
        instance: textOrNull(body.instance),
        code: textOrNull(body.code ?? body.errorCode),
        traceId: textOrNull(body.traceId),
        correlationId: textOrNull(body.correlationId),
        timestamp: textOrNull(body.timestamp),
        retryable: typeof body.retryable === 'boolean' ? body.retryable : null,
        service: textOrNull(body.service),
        errors,
    }
}

/** Retry-After en segundos. Tambien admite una fecha HTTP, pero el gateway y los servicios mandan segundos. */
export function parseRetryAfter(value) {
    if (value === null || value === undefined || !/^\s*\d+\s*$/.test(String(value))) {
        return null
    }
    return Number.parseInt(String(value).trim(), 10)
}

export class ApiError extends Error {
    constructor(status, {problem, body = null, correlationId = null, retryAfterSeconds = null, operation = null, cause} = {}) {
        const normalized = problem ?? emptyProblem()
        super(describe(status, normalized, operation), cause === undefined ? undefined : {cause})
        this.status = status
        this.problem = normalized
        this.body = body
        this.correlationId = correlationId
        this.retryAfterSeconds = retryAfterSeconds
        this.operation = operation
    }

    // El nombre se da a mano: un minificador puede renombrar las clases.
    get name() {
        return 'ApiError'
    }

    get code() {
        return this.problem.code
    }

    get fieldErrors() {
        return this.problem.errors
    }

    get hasFieldErrors() {
        return this.problem.errors.length > 0
    }

    /** La referencia para buscar el fallo en los logs: traceId, el correlationId del cuerpo o el de la llamada. */
    get reference() {
        return this.problem.traceId ?? this.problem.correlationId ?? this.correlationId
    }

    static of(status, init) {
        const Type = TYPES_BY_STATUS[status] ?? ApiError
        return new Type(status, init)
    }
}

/** 400 o 422: datos no validos, o una regla de negocio si no trae errores por campo. */
export class ValidationError extends ApiError {
    get name() {
        return 'ValidationError'
    }
}

/** 401 sin forma de renovar el token: hay que volver a entrar. */
export class SessionExpiredError extends ApiError {
    get name() {
        return 'SessionExpiredError'
    }
}

/** 401 con un token recien renovado: el servicio no lo acepta (casi siempre, le falta su audiencia). */
export class TokenRejectedError extends ApiError {
    get name() {
        return 'TokenRejectedError'
    }
}

export class ForbiddenError extends ApiError {
    get name() {
        return 'ForbiddenError'
    }
}

export class NotFoundError extends ApiError {
    get name() {
        return 'NotFoundError'
    }
}

export class ConflictError extends ApiError {
    get name() {
        return 'ConflictError'
    }
}

/** 429: no hay hueco. El cuerpo puede traer lo rechazado (un trabajo de mto-configuration). */
export class TooManyRequestsError extends ApiError {
    get name() {
        return 'TooManyRequestsError'
    }
}

/** 502, 503 o 504: el servicio no ha podido o no esta. */
export class UnavailableError extends ApiError {
    get name() {
        return 'UnavailableError'
    }
}

/** Sin respuesta: la red, o el servidor de esta aplicacion caido. */
export class NetworkError extends ApiError {
    get name() {
        return 'NetworkError'
    }
}

const TYPES_BY_STATUS = {
    400: ValidationError,
    401: SessionExpiredError,
    403: ForbiddenError,
    404: NotFoundError,
    409: ConflictError,
    422: ValidationError,
    429: TooManyRequestsError,
    502: UnavailableError,
    503: UnavailableError,
    504: UnavailableError,
}

/** Convierte una respuesta de error en su ApiError. */
export async function decodeErrorResponse(response, {correlationId = null, operation = null} = {}) {
    const text = await response.text().catch(() => '')
    const {problem, body} = readProblem(text, response.headers.get('content-type') ?? '')
    return ApiError.of(response.status, {
        problem,
        body,
        correlationId: response.headers.get(CORRELATION_HEADER) ?? correlationId,
        retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after')),
        operation,
    })
}

function describe(status, problem, operation) {
    const parts = [operation, status ? `-> ${status}` : 'sin respuesta', problem.code, problem.detail ?? problem.title]
    return parts.filter(Boolean).join(' ')
}

function isJson(contentType) {
    const type = contentType.split(';')[0].trim().toLowerCase()
    return type === 'application/json' || type.endsWith('+json')
}

function isHtml(contentType, text) {
    return contentType.toLowerCase().includes('text/html') || /^\s*<(!doctype|html)/i.test(text)
}

function asArray(value) {
    return Array.isArray(value) ? value : []
}

function textOrNull(value) {
    return typeof value === 'string' && value.trim() ? value : null
}
