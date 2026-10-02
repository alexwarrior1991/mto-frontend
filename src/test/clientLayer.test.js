import {MutationObserver} from '@tanstack/react-query'
import {delay, http, HttpResponse} from 'msw'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {findLovResource, LOV_RESOURCES} from '../api/configuration/lovResources.js'
import {
    bulkCreateLovs,
    bulkUpdateLovs,
    changedLovEntry,
    createLov,
    deleteLov,
    listLovs,
    lovEntryWithEnabled,
    newLovEntry,
    updateLov,
} from '../api/configuration/lovs.js'
import {fileNameFromDisposition, downloadFile} from '../api/download.js'
import {endOfDayInstant, startOfDayInstant, toInstantParam, toLocalDateParam, toYearMonthParam} from '../api/dates.js'
import {defineEnum, UNKNOWN} from '../api/enums.js'
import {
    ApiError,
    ConflictError,
    emptyProblem,
    ForbiddenError,
    NetworkError,
    NotFoundError,
    SessionExpiredError,
    TokenRejectedError,
    TooManyRequestsError,
    UnavailableError,
    ValidationError,
} from '../api/errors.js'
import {apiFetch, buildUrl, configureHttp} from '../api/http.js'
import {buildMergePatch, MERGE_PATCH} from '../api/mergePatch.js'
import {hasNextOffsetPage, sortParam, toPage, toPageParams, toUsersPage} from '../api/paging.js'
import {runProbe, SERVICE_PROBES} from '../api/probes.js'
import {EXPECTED_AUDIENCES, prefixOf, SERVICES} from '../api/services.js'
import {createQueryClient} from '../app/queryClient.js'
import {errorMessage} from '../ui/errors/messages.js'
import {applyServerErrors, toFormPath} from '../ui/errors/serverValidation.js'
import {formatDate, formatDateTime, formatPercent, formatQuantity} from '../ui/format.js'
import {server} from './server.js'

/**
 * La capa de cliente (src/api y lo que traduce sus errores) contra un gateway simulado: lo que hacia
 * ClientLayerTest en el backoffice con MockRestServiceServer.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function useToken(token = 'token-1', {renewed = null, onSessionExpired = () => {}} = {}) {
    const renew = vi.fn(async () => renewed)
    const expired = vi.fn(onSessionExpired)
    configureHttp({getAccessToken: async () => token, renewAccessToken: renew, onSessionExpired: expired})
    return {renew, expired}
}

function record(method, path, respond = () => HttpResponse.json({})) {
    const requests = []
    server.use(http[method](path, async ({request}) => {
        requests.push({
            method: request.method,
            url: new URL(request.url),
            headers: request.headers,
            body: await request.clone().text(),
        })
        return respond(request, requests.length)
    }))
    return requests
}

async function failure(promise) {
    try {
        await promise
    } catch (error) {
        return error
    }
    throw new Error('La llamada tenia que fallar')
}

describe('http.js: la puerta hacia la API', () => {
    it('cada llamada lleva el Bearer de la persona y un X-Correlation-Id nuevo', async () => {
        useToken('token-1')
        const requests = record('get', '/api/stock/materials', () => HttpResponse.json({content: []}))

        await apiFetch('/api/stock/materials')
        await apiFetch('/api/stock/materials')

        expect(requests.map((request) => request.headers.get('authorization'))).toEqual(['Bearer token-1', 'Bearer token-1'])
        const ids = requests.map((request) => request.headers.get('x-correlation-id'))
        expect(ids[0]).toMatch(UUID)
        expect(ids[1]).toMatch(UUID)
        expect(ids[0]).not.toBe(ids[1])
        expect(requests[0].headers.get('accept')).toContain('application/json')
    })

    it('la query repite los arrays, deja fuera lo vacio y conserva false', async () => {
        useToken()
        const requests = record('get', '/api/stock/materials', () => HttpResponse.json({content: []}))

        await apiFetch('/api/stock/materials', {
            query: {sort: ['code,asc', 'name,desc'], active: false, search: '', warehouseId: null, page: 0, from: '2026-10-01T00:00:00.000Z'},
        })

        const params = requests[0].url.searchParams
        expect(params.getAll('sort')).toEqual(['code,asc', 'name,desc'])
        expect(params.get('active')).toBe('false')
        expect(params.get('page')).toBe('0')
        expect(params.has('search')).toBe(false)
        expect(params.has('warehouseId')).toBe(false)
        expect(requests[0].url.search).toContain('from=2026-10-01T00%3A00%3A00.000Z')
    })

    it('solo llama a /api del mismo origen y no acepta fechas como Date', () => {
        expect(() => buildUrl('http://gateway:8090/api/stock/materials')).toThrow(/mismo origen/)
        expect(() => buildUrl('//evil.example/api/x')).toThrow(/mismo origen/)
        expect(() => buildUrl('/actuator/health')).toThrow(/mismo origen/)
        expect(() => buildUrl('/api/stock/movements', {from: new Date()})).toThrow(/texto ISO/)
        expect(buildUrl('/api/stock/materials').origin).toBe(window.location.origin)
    })

    it('manda JSON, merge-patch y un DELETE con cuerpo con su Content-Type', async () => {
        useToken()
        const posts = record('post', '/api/configuration/pole-types', () => HttpResponse.json({id: 1}, {status: 201}))
        const patches = record('patch', '/api/maintenance/orders/o1', () => HttpResponse.json({id: 'o1', version: 4}))
        const deletes = record('delete', '/api/users/u1/roles/clients/c1', () => new HttpResponse(null, {status: 204}))

        await expect(apiFetch('/api/configuration/pole-types', {method: 'POST', json: {code: 'P1'}})).resolves.toEqual({id: 1})
        await apiFetch('/api/maintenance/orders/o1', {method: 'PATCH', json: {title: null, version: 3}, contentType: MERGE_PATCH})
        await expect(apiFetch('/api/users/u1/roles/clients/c1', {method: 'DELETE', json: [{name: 'stock-read'}]})).resolves.toBeNull()

        expect(posts[0].headers.get('content-type')).toBe('application/json')
        expect(JSON.parse(posts[0].body)).toEqual({code: 'P1'})
        expect(patches[0].headers.get('content-type')).toBe('application/merge-patch+json')
        expect(JSON.parse(patches[0].body)).toEqual({title: null, version: 3})
        expect(JSON.parse(deletes[0].body)).toEqual([{name: 'stock-read'}])
    })

    it('un 202 o un 204 sin cuerpo dan null, y un fichero llega como Blob con sus cabeceras', async () => {
        useToken()
        server.use(
            http.post('/api/users/u1/execute-actions-email', () => new HttpResponse(null, {status: 202})),
            http.get('/api/configuration/profiles/jobs/j1/file', () => new HttpResponse('a;b', {
                headers: {'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="perfiles.csv"'},
            })),
        )

        await expect(apiFetch('/api/users/u1/execute-actions-email', {method: 'POST', json: {}})).resolves.toBeNull()
        const {blob, headers} = await apiFetch('/api/configuration/profiles/jobs/j1/file', {responseType: 'blob'})
        expect(await blob.text()).toBe('a;b')
        expect(headers.get('content-disposition')).toContain('perfiles.csv')
    })
})

describe('http.js: el token caducado', () => {
    it('un 401 renueva el token una vez y repite la llamada con otro X-Correlation-Id', async () => {
        const {renew} = useToken('token-1', {renewed: 'token-2'})
        const requests = record('get', '/api/stock/materials', (_request, count) => count === 1
            ? new HttpResponse(null, {status: 401})
            : HttpResponse.json({ok: true}))

        await expect(apiFetch('/api/stock/materials')).resolves.toEqual({ok: true})

        expect(renew).toHaveBeenCalledTimes(1)
        expect(requests.map((request) => request.headers.get('authorization'))).toEqual(['Bearer token-1', 'Bearer token-2'])
        expect(requests[0].headers.get('x-correlation-id')).not.toBe(requests[1].headers.get('x-correlation-id'))
    })

    it('si la renovacion falla, la sesion ha caducado y se avisa', async () => {
        const {expired} = useToken('token-1', {renewed: null})
        server.use(http.get('/api/stock/materials', () => new HttpResponse(null, {status: 401})))

        const error = await failure(apiFetch('/api/stock/materials'))

        expect(error).toBeInstanceOf(SessionExpiredError)
        expect(expired).toHaveBeenCalledTimes(1)
    })

    it('un 401 con un token recien renovado es un token que el servicio no acepta, no una sesion caducada', async () => {
        const {expired} = useToken('token-1', {renewed: 'token-2'})
        server.use(http.get('/api/stock/materials', () => HttpResponse.json({correlationId: 'corr-401'}, {status: 401})))

        const error = await failure(apiFetch('/api/stock/materials'))

        expect(error).toBeInstanceOf(TokenRejectedError)
        expect(error.reference).toBe('corr-401')
        expect(expired).not.toHaveBeenCalled()
    })

    it('sin token no sale ninguna llamada', async () => {
        const expired = vi.fn()
        configureHttp({getAccessToken: async () => null, renewAccessToken: async () => null, onSessionExpired: expired})

        const error = await failure(apiFetch('/api/stock/materials'))

        expect(error).toBeInstanceOf(SessionExpiredError)
        expect(expired).toHaveBeenCalledTimes(1)
    })
})

describe('errors.js: los cinco formatos de error', () => {
    it('el problem+json de mto-configuration, con su codigo, sus errores por campo y el traceId como referencia', async () => {
        useToken()
        server.use(http.post('/api/configuration/pole-types', () => HttpResponse.json({
            type: 'https://api.mto-configuration/errors/VAL-001',
            title: 'Bad Request',
            status: 400,
            detail: 'Datos no validos',
            code: 'VAL-001',
            traceId: 'trace-1',
            retryable: false,
            errors: [{field: 'code', code: 'NotBlank', message: 'no puede estar vacío'}],
        }, {status: 400, headers: {'Content-Type': 'application/problem+json'}})))

        const error = await failure(apiFetch('/api/configuration/pole-types', {method: 'POST', json: {}}))

        expect(error).toBeInstanceOf(ValidationError)
        expect(error.code).toBe('VAL-001')
        expect(error.problem.retryable).toBe(false)
        expect(error.fieldErrors).toEqual([{field: 'code', code: 'NotBlank', message: 'no puede estar vacío'}])
        expect(error.reference).toBe('trace-1')
    })

    it('el problem+json de mto-users se lee por sus alias: errorCode y validationErrors sin codigo', async () => {
        useToken()
        server.use(http.post('/api/users', () => HttpResponse.json({
            title: 'Bad Request',
            status: 400,
            errorCode: 'REQ-VALIDATION',
            correlationId: 'corr-users',
            validationErrors: [{field: 'username', message: 'formato no válido'}],
        }, {status: 400, headers: {'Content-Type': 'application/problem+json'}})))

        const error = await failure(apiFetch('/api/users', {method: 'POST', json: {}}))

        expect(error.code).toBe('REQ-VALIDATION')
        expect(error.fieldErrors).toEqual([{field: 'username', code: null, message: 'formato no válido'}])
        expect(error.reference).toBe('corr-users')
    })

    it('el JSON de mto-stock y mto-maintenance: error es el titulo y message el detalle', async () => {
        useToken()
        server.use(http.post('/api/stock/movements/outputs', () => HttpResponse.json({
            timestamp: '2026-10-01T10:00:00Z',
            status: 409,
            error: 'Conflict',
            message: 'Disponible 2, pedido 5',
            path: '/api/v1/inventory/movements/outputs',
            method: 'POST',
            errorCode: 'STK-001',
            correlationId: 'corr-stock',
        }, {status: 409})))

        const error = await failure(apiFetch('/api/stock/movements/outputs', {method: 'POST', json: {}}))

        expect(error).toBeInstanceOf(ConflictError)
        expect(error.problem.title).toBe('Conflict')
        expect(error.problem.detail).toBe('Disponible 2, pedido 5')
        expect(error.code).toBe('STK-001')
        expect(errorMessage(error)).toBe('No hay stock disponible suficiente. Disponible 2, pedido 5')
    })

    it('el 403 del gateway solo trae correlationId, y es la referencia', async () => {
        useToken()
        server.use(http.get('/api/users', () => HttpResponse.json({
            type: 'about:blank', title: 'Forbidden', status: 403, detail: 'Forbidden', instance: '/api/users', correlationId: 'corr-9',
        }, {status: 403, headers: {'Content-Type': 'application/problem+json'}})))

        const error = await failure(apiFetch('/api/users'))

        expect(error).toBeInstanceOf(ForbiddenError)
        expect(error.reference).toBe('corr-9')
        expect(errorMessage(error)).toBe('No tienes permiso para esta operación.')
    })

    it('el 503 del fallback del gateway trae el servicio y cuando reintentar', async () => {
        useToken()
        server.use(http.get('/api/stock/materials', () => HttpResponse.json({
            title: 'Service Unavailable', status: 503, detail: 'El servicio mto-stock no está disponible',
            service: 'mto-stock', correlationId: 'corr-503',
        }, {status: 503, headers: {'Content-Type': 'application/problem+json', 'Retry-After': '30'}})))

        const error = await failure(apiFetch('/api/stock/materials'))

        expect(error).toBeInstanceOf(UnavailableError)
        expect(error.problem.service).toBe('mto-stock')
        expect(error.retryAfterSeconds).toBe(30)
        expect(errorMessage(error)).toBe('El servicio no está disponible ahora mismo. Inténtalo en 30 s.')
    })

    it('un cuerpo que no es JSON va acotado al detalle, y una pagina HTML no se ensena', async () => {
        useToken()
        server.use(
            http.get('/api/stock/materials', () => new HttpResponse('x'.repeat(400), {status: 500, headers: {'Content-Type': 'text/plain'}})),
            http.get('/api/stock/warehouses', () => new HttpResponse('<!doctype html><html><body>Bad Gateway</body></html>', {
                status: 502, headers: {'Content-Type': 'text/html'},
            })),
            http.get('/api/stock/suppliers', () => new HttpResponse('{roto', {status: 500, headers: {'Content-Type': 'application/json'}})),
        )

        const text = await failure(apiFetch('/api/stock/materials'))
        expect(text.status).toBe(500)
        expect(text.problem.detail).toBe(`${'x'.repeat(300)}...`)
        const html = await failure(apiFetch('/api/stock/warehouses'))
        expect(html).toBeInstanceOf(UnavailableError)
        expect(html.problem.detail).toBeNull()
        expect(errorMessage(html)).toBe('El servicio no ha podido completar la operación.')
        const broken = await failure(apiFetch('/api/stock/suppliers'))
        expect(broken.problem.detail).toBe('{roto')
    })

    it('la referencia es el traceId, si no el correlationId del cuerpo, si no la cabecera, si no el id enviado', async () => {
        useToken()
        const sent = record('get', '/api/stock/projects', () => new HttpResponse(null, {status: 404}))
        server.use(http.get('/api/stock/suppliers', () => new HttpResponse(null, {status: 404, headers: {'X-Correlation-Id': 'corr-header'}})))

        const fromHeader = await failure(apiFetch('/api/stock/suppliers'))
        const fromSent = await failure(apiFetch('/api/stock/projects'))

        expect(fromHeader).toBeInstanceOf(NotFoundError)
        expect(fromHeader.reference).toBe('corr-header')
        expect(fromSent.reference).toBe(sent[0].headers.get('x-correlation-id'))
    })

    it('un 429 trae lo rechazado en el cuerpo y cuando reintentar', async () => {
        useToken()
        server.use(http.post('/api/configuration/profiles/jobs/import', () => HttpResponse.json(
            {jobId: 'job-1', type: 'PROFILE_IMPORT', status: 'REJECTED'},
            {status: 429, headers: {'Retry-After': '30'}},
        )))

        const error = await failure(apiFetch('/api/configuration/profiles/jobs/import', {method: 'POST', json: {}}))

        expect(error).toBeInstanceOf(TooManyRequestsError)
        expect(error.body).toEqual({jobId: 'job-1', type: 'PROFILE_IMPORT', status: 'REJECTED'})
        expect(error.retryAfterSeconds).toBe(30)
    })

    it('sin respuesta es un fallo de red con el id que se mando, y una cancelacion no es un error de la API', async () => {
        useToken()
        server.use(
            http.get('/api/stock/materials', () => HttpResponse.error()),
            http.get('/api/stock/warehouses', async () => {
                await delay('infinite')
            }),
        )

        const network = await failure(apiFetch('/api/stock/materials'))
        expect(network).toBeInstanceOf(NetworkError)
        expect(network.reference).toMatch(UUID)

        const controller = new AbortController()
        const pending = apiFetch('/api/stock/warehouses', {signal: controller.signal})
        controller.abort()
        const aborted = await failure(pending)
        expect(aborted).not.toBeInstanceOf(ApiError)
        expect(aborted.name).toBe('AbortError')
    })
})

describe('ui/errors/messages.js: lo que se le dice a la persona', () => {
    const problem = (fields) => ({...emptyProblem(), ...fields})

    it('los dos 409 de mto-configuration se dicen distinto: una version vieja pide recargar y un valor repetido no', () => {
        expect(errorMessage(new ConflictError(409, {problem: problem({code: 'CON-001', detail: 'Intentelo de nuevo'})})))
            .toBe('Conflicto con otro cambio: recarga y vuelve a intentarlo.')
        expect(errorMessage(new ConflictError(409, {problem: problem({code: 'BUS-002'})})))
            .toBe('Ya existe otro registro con ese valor (un código que no se puede repetir), o la entrada está en uso.')
    })

    it('los 409 de estado de mantenimiento no piden recargar y llevan el detalle', () => {
        expect(errorMessage(new ConflictError(409, {problem: problem({code: 'TRN-001', detail: 'La orden ya está completada.'})})))
            .toBe('El estado actual no permite esta operación. La orden ya está completada.')
        expect(errorMessage(new ConflictError(409, {problem: problem({code: 'SHF-001'})}))).toBe('El turno no admite ese trabajo.')
        expect(errorMessage(new ConflictError(409, {problem: problem({code: 'MAT-001'})}))).toBe('La línea de material no admite esta operación.')
        expect(errorMessage(new ConflictError(409, {problem: problem({code: 'AST-001'})})))
            .toBe('El activo está desactivado, o ese dato lo manda mto-configuration.')
        expect(errorMessage(new ConflictError(409, {problem: problem({code: 'TEA-409', detail: 'x'})}))).toBe('Ya existe otro con ese código.')
        expect(errorMessage(new ConflictError(409, {problem: problem({detail: 'Otro'})})))
            .toBe('Conflicto con otro cambio: recarga y vuelve a intentarlo. Otro')
    })

    it('un 422 sin errores por campo es una regla de negocio; con ellos, los datos no valen', () => {
        expect(errorMessage(new ValidationError(422, {problem: problem({code: 'RES-001', detail: 'La reserva no está activa.'})})))
            .toBe('La operación no es posible. La reserva no está activa.')
        expect(errorMessage(new ValidationError(400, {
            problem: problem({errors: [{field: 'code', code: 'NotBlank', message: null}, {field: null, code: null, message: 'Algo más'}]}),
        }))).toBe('Datos no válidos: code NotBlank; Algo más')
        expect(errorMessage(new ValidationError(400, {problem: problem({code: 'SEARCH-400', detail: 'search y attribute no van juntos'})})))
            .toBe('La petición no es válida. search y attribute no van juntos')
        expect(errorMessage(new ValidationError(422, {problem: problem({code: 'INS-001'})})))
            .toBe('La inspección o su checklist no admiten esta operación.')
        expect(errorMessage(new ValidationError(422, {problem: problem({code: 'STK-422', detail: 'Material retirado'})})))
            .toBe('El almacén ha rechazado la operación. Material retirado')
    })

    it('un 502 no es transitorio y un 503 dice cuando reintentar; el STK-503 deja la linea como estaba', () => {
        expect(errorMessage(new UnavailableError(502, {problem: problem({code: 'KC-502', detail: 'No hay SMTP'})})))
            .toBe('El servicio no ha podido completar la operación. No hay SMTP')
        expect(errorMessage(new UnavailableError(503, {problem: problem({})}))).toBe('El servicio no está disponible ahora mismo. Inténtalo más tarde.')
        expect(errorMessage(new UnavailableError(503, {problem: problem({code: 'STK-503'})})))
            .toBe('El almacén no responde: la línea de material se queda como estaba. Inténtalo más tarde.')
    })

    it('el resto de casos', () => {
        expect(errorMessage(new NotFoundError(404, {problem: problem({detail: 'Orden o1'})}))).toBe('No se ha encontrado lo que se pedía. Orden o1')
        expect(errorMessage(new SessionExpiredError(401))).toBe('La sesión ha caducado. Hay que volver a entrar.')
        expect(errorMessage(new TokenRejectedError(401))).toContain('audiencia')
        expect(errorMessage(new NetworkError(0))).toContain('No se ha podido contactar con el servidor')
        expect(errorMessage(new ApiError(500, {problem: problem({detail: 'NPE'})}))).toBe('Error inesperado (500). NPE')
        expect(errorMessage(new TooManyRequestsError(429))).toBe('Error inesperado (429).')
        expect(errorMessage(new Error('otra cosa'))).toBe('Error inesperado.')
    })
})

describe('ui/errors/serverValidation.js: los errores del servicio campo a campo', () => {
    function fakeForm(values) {
        return {
            values,
            errors: null,
            getValues() {
                return this.values
            },
            setErrors(errors) {
                this.errors = errors
            },
        }
    }

    it('cada error va a su campo, tambien dentro de una lista, y lo que no tiene campo se devuelve', () => {
        const form = fakeForm({code: '', description: 'x', lines: [{quantity: 0}]})
        const error = new ValidationError(400, {
            problem: {
                ...emptyProblem(),
                errors: [
                    {field: 'code', code: 'NotBlank', message: 'es obligatorio'},
                    {field: 'lines[0].quantity', code: 'Positive', message: null},
                    {field: 'versionNumber', code: null, message: 'no coincide'},
                ],
            },
        })

        expect(applyServerErrors(form, error)).toEqual(['versionNumber: no coincide'])
        expect(form.errors).toEqual({code: 'es obligatorio', 'lines.0.quantity': 'Positive'})
        expect(toFormPath('a[2].b[10]')).toBe('a.2.b.10')
    })

    it('un error sin campos se dice entero y no toca el formulario', () => {
        const form = fakeForm({code: 'P1'})
        const error = new ConflictError(409, {problem: {...emptyProblem(), code: 'CON-001'}})

        expect(applyServerErrors(form, error)).toEqual(['Conflicto con otro cambio: recarga y vuelve a intentarlo.'])
        expect(form.errors).toBeNull()
    })
})

describe('paging.js: las tres formas de paginar', () => {
    it('la pagina con forma DTO, tolerando first y last', () => {
        expect(toPage({content: [{id: 1}], page: {number: 2, size: 50, totalElements: 101, totalPages: 3, first: false, last: true}}))
            .toEqual({content: [{id: 1}], number: 2, size: 50, totalElements: 101, totalPages: 3})
        expect(toPage(null)).toEqual({content: [], number: 0, size: 0, totalElements: 0, totalPages: 0})
    })

    it('la de mto-users, con first, max y total', () => {
        expect(toUsersPage({content: [{id: 'u'}], first: 200, max: 200, total: 201}))
            .toEqual({content: [{id: 'u'}], first: 200, max: 200, total: 201})
    })

    it('una lista sin total solo tiene siguiente si llego llena; la pantalla cuenta desde 1 y el servicio desde 0', () => {
        expect(hasNextOffsetPage(new Array(50).fill(0), 50)).toBe(true)
        expect(hasNextOffsetPage(new Array(49).fill(0), 50)).toBe(false)
        expect(toPageParams({page: 1, size: 50})).toEqual({page: 0, size: 50})
        expect(toPageParams({page: 3, size: 20})).toEqual({page: 2, size: 20})
        expect(sortParam({field: 'code', direction: 'desc'})).toBe('code,desc')
        expect(sortParam({field: 'code'})).toBe('code,asc')
        expect(sortParam(null)).toBeUndefined()
    })
})

describe('enums.js: los enumerados toleran lo desconocido', () => {
    const ReservationStatus = defineEnum({ACTIVE: 'Activa', RELEASED: 'Liberada', CONSUMED: 'Consumida', CANCELLED: 'Cancelada'})

    it('un valor nuevo del servicio se lee como desconocido, no se ofrece y no se confunde con uno conocido', () => {
        expect(ReservationStatus.parse('ACTIVE')).toBe('ACTIVE')
        expect(ReservationStatus.parse('ON_HOLD')).toBe(UNKNOWN)
        expect(ReservationStatus.label('ON_HOLD')).toBe('Desconocido')
        expect(ReservationStatus.label('RELEASED')).toBe('Liberada')
        expect(ReservationStatus.parse(null)).toBeNull()
        expect(ReservationStatus.label(undefined)).toBe('')
        expect(ReservationStatus.isKnown('ON_HOLD')).toBe(false)
        expect(ReservationStatus.selectable().map((option) => option.value)).toEqual(['ACTIVE', 'RELEASED', 'CONSUMED', 'CANCELLED'])
    })
})

describe('mergePatch.js: una modificacion de mantenimiento', () => {
    const original = {title: 'Revisión', description: 'Antes', plannedDate: '2026-10-01', estimatedHours: '12.100', teamId: 't1', version: 3}

    it('lo cambiado viaja con su valor, lo vaciado a null, lo igual no viaja y la version siempre', () => {
        const patch = buildMergePatch(original, {
            title: '  Revisión  ',
            description: 'Después',
            plannedDate: '',
            estimatedHours: 12.1,
            teamId: 't1',
        }, {fields: ['title', 'description', 'plannedDate', 'estimatedHours', 'teamId'], numberFields: ['estimatedHours'], version: 3})

        expect(patch).toEqual({description: 'Después', plannedDate: null, version: 3})
    })

    it('sin cambios no hay nada que mandar, y con cambios la version es obligatoria', () => {
        expect(buildMergePatch(original, {...original}, {fields: ['title', 'description'], version: 3})).toBeNull()
        expect(() => buildMergePatch(original, {title: 'Otro'}, {fields: ['title']})).toThrow(/version/)
        expect(() => buildMergePatch(original, {}, {fields: []})).toThrow(/campos/)
    })
})

describe('dates.js: las fechas en los parametros', () => {
    it('LocalDate, YearMonth e Instant viajan como texto ISO', () => {
        expect(toLocalDateParam('2026-10-01')).toBe('2026-10-01')
        expect(toLocalDateParam(new Date(2026, 9, 1, 23, 30))).toBe('2026-10-01')
        expect(toLocalDateParam('')).toBeUndefined()
        expect(() => toLocalDateParam('01/10/2026')).toThrow()
        expect(toYearMonthParam('2026-10')).toBe('2026-10')
        expect(toYearMonthParam('2026-10-15')).toBe('2026-10')
        expect(toInstantParam(new Date(Date.UTC(2026, 9, 1, 8)))).toBe('2026-10-01T08:00:00.000Z')
    })

    it('un filtro por dias cubre los dos extremos enteros', () => {
        const from = new Date(startOfDayInstant('2026-10-01'))
        const to = new Date(endOfDayInstant('2026-10-01'))
        expect(from.getHours()).toBe(0)
        expect(from.getDate()).toBe(1)
        expect(to.getDate()).toBe(1)
        expect(to.getHours()).toBe(23)
        expect(to.getMilliseconds()).toBe(999)
    })
})

describe('download.js: los ficheros se piden con el token y se guardan desde un Blob', () => {
    afterEach(() => {
        delete URL.createObjectURL
        delete URL.revokeObjectURL
    })

    it('el nombre sale de Content-Disposition: filename* gana a filename, y nunca trae una ruta', () => {
        expect(fileNameFromDisposition('attachment; filename="avance.xlsx"')).toBe('avance.xlsx')
        expect(fileNameFromDisposition("attachment; filename=\"parte.pdf\"; filename*=UTF-8''parte-turno%20%C3%B1.pdf")).toBe('parte-turno ñ.pdf')
        expect(fileNameFromDisposition('attachment; filename=mensual-2026-10.pdf')).toBe('mensual-2026-10.pdf')
        expect(fileNameFromDisposition('attachment; filename="../../etc/passwd"')).toBe('passwd')
        expect(fileNameFromDisposition(null)).toBeNull()
    })

    it('se descarga con el nombre del servicio, o con el de reserva si no lo trae', async () => {
        useToken('token-download')
        const requests = record('get', '/api/maintenance/reports/progress', (request) => new HttpResponse('xlsx', {
            headers: new URL(request.url).searchParams.get('format') === 'xlsx'
                ? {'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="avance.xlsx"'}
                : {'Content-Type': 'application/pdf'},
        }))
        Object.defineProperty(URL, 'createObjectURL', {value: vi.fn(() => 'blob:mto/1'), configurable: true})
        Object.defineProperty(URL, 'revokeObjectURL', {value: vi.fn(), configurable: true})
        const clicks = []
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
            clicks.push({download: this.download, href: this.href})
        })

        await expect(downloadFile('/api/maintenance/reports/progress', {query: {format: 'xlsx'}})).resolves.toBe('avance.xlsx')
        await expect(downloadFile('/api/maintenance/reports/progress', {query: {format: 'pdf'}, fallbackName: 'avance.pdf'})).resolves.toBe('avance.pdf')

        expect(requests[0].headers.get('authorization')).toBe('Bearer token-download')
        expect(clicks).toEqual([{download: 'avance.xlsx', href: 'blob:mto/1'}, {download: 'avance.pdf', href: 'blob:mto/1'}])
    })
})

describe('format.js: cifras y fechas', () => {
    it('cantidades y KP sin ceros de mas y con punto', () => {
        expect(formatQuantity('12.500')).toBe('12.5')
        expect(formatQuantity('10.000')).toBe('10')
        expect(formatQuantity('100')).toBe('100')
        expect(formatQuantity(10)).toBe('10')
        expect(formatQuantity(0.0000001)).toBe('0.0000001')
        expect(formatQuantity('-0.000')).toBe('0')
        expect(formatQuantity(null)).toBe('')
    })

    it('fechas como DD/MM/YYYY, un LocalDate sin pasar por ninguna zona, y porcentajes desde una fraccion', () => {
        expect(formatDate('2026-10-01')).toBe('01/10/2026')
        expect(formatDateTime(new Date(2026, 9, 1, 8, 5))).toBe('01/10/2026 08:05')
        expect(formatDateTime('no es una fecha')).toBe('')
        expect(formatPercent('0.4500')).toBe('45 %')
        expect(formatPercent(0.4567)).toBe('45.67 %')
        expect(formatPercent(0.07)).toBe('7 %')
        expect(formatPercent(null)).toBe('')
    })
})

describe('services.js y probes.js: los servicios del dominio en un solo sitio', () => {
    it('las seis audiencias que un token tiene que llevar: las cinco APIs y el gateway', () => {
        expect(EXPECTED_AUDIENCES).toEqual(['mto-configuration-api', 'mto-users-api', 'mto-stock-api', 'mto-maintenance-api',
            'mto-notification-api', 'mto-gateway-api'])
        expect(SERVICE_PROBES.map((probe) => probe.service)).toEqual(SERVICES.map((service) => service.name))
        for (const probe of SERVICE_PROBES) {
            expect(SERVICES.find((service) => service.name === probe.service).roles).toContain(probe.permission)
        }
    })

    it('el prefijo de cada servicio sale de aqui, y uno que no existe no se inventa', () => {
        expect(prefixOf('mto-configuration')).toBe('/api/configuration')
        expect(SERVICES.map((service) => prefixOf(service.name))).toEqual(SERVICES.map((service) => service.prefix))
        expect(() => prefixOf('mto-field')).toThrow('Servicio desconocido: mto-field')
    })

    it('una sonda es una lectura a traves del gateway', async () => {
        useToken()
        const requests = record('get', '/api/users', () => HttpResponse.json({content: [], first: 0, max: 1, total: 0}))

        await expect(runProbe(SERVICE_PROBES.find((probe) => probe.service === 'mto-users'))).resolves.toBe(true)

        expect(requests[0].url.searchParams.get('max')).toBe('1')
    })
})

describe('queryClient.js: un fallo se avisa en un solo sitio', () => {
    it('avisa de lo que falla salvo que la consulta o la mutacion lo trate ella misma', async () => {
        const notify = vi.fn()
        const client = createQueryClient({notify})
        const fail = () => Promise.reject(new ConflictError(409))

        await client.fetchQuery({queryKey: ['a'], queryFn: fail, retry: false}).catch(() => {})
        await client.fetchQuery({queryKey: ['b'], queryFn: fail, retry: false, meta: {notifyError: false}}).catch(() => {})
        await new MutationObserver(client, {mutationFn: fail}).mutate().catch(() => {})
        await new MutationObserver(client, {mutationFn: fail, meta: {notifyError: false}}).mutate().catch(() => {})

        expect(notify).toHaveBeenCalledTimes(2)
    })

    it('solo se reintenta lo que no llego a ningun sitio, y una vez', () => {
        const retry = createQueryClient({notify: () => {}}).getDefaultOptions().queries.retry
        expect(retry(0, new NetworkError(0))).toBe(true)
        expect(retry(1, new NetworkError(0))).toBe(false)
        expect(retry(0, new UnavailableError(503))).toBe(false)
    })
})

describe('configuration/lovs.js: los catalogos de mto-configuration', () => {
    const json = (request) => JSON.parse(request.body)

    it('los seis endpoints por recurso, con su verbo y su cuerpo JSON; borrar es un 204 sin cuerpo', async () => {
        useToken()
        const lists = record('get', '/api/configuration/pole-types', () => HttpResponse.json([{id: 1, code: 'PT1'}]))
        const creates = record('post', '/api/configuration/pole-types', () => HttpResponse.json({id: 2}, {status: 201}))
        const updates = record('put', '/api/configuration/pole-types/2', () => HttpResponse.json({id: 2, versionNumber: 4}))
        const deletes = record('delete', '/api/configuration/pole-types/2', () => new HttpResponse(null, {status: 204}))
        const bulkCreates = record('post', '/api/configuration/pole-types/bulk', () => HttpResponse.json([{id: 3}], {status: 201}))
        const bulkUpdates = record('put', '/api/configuration/pole-types/bulk', () => HttpResponse.json([{id: 2}]))

        await expect(listLovs('pole-types')).resolves.toEqual([{id: 1, code: 'PT1'}])
        await expect(createLov('pole-types', {code: 'PT2', description: 'Dos', enabled: true})).resolves.toEqual({id: 2})
        await expect(updateLov('pole-types', {id: 2, code: 'PT2', versionNumber: 3})).resolves.toEqual({id: 2, versionNumber: 4})
        await expect(deleteLov('pole-types', 2)).resolves.toBeNull()
        await expect(bulkCreateLovs('pole-types', [{code: 'PT3', description: 'Tres', enabled: true}])).resolves.toEqual([{id: 3}])
        await expect(bulkUpdateLovs('pole-types', [{id: 2, enabled: false, versionNumber: 4}])).resolves.toEqual([{id: 2}])

        expect(lists).toHaveLength(1)
        expect(json(creates[0])).toEqual({code: 'PT2', description: 'Dos', enabled: true})
        expect(creates[0].headers.get('content-type')).toBe('application/json')
        expect(json(updates[0])).toEqual({id: 2, code: 'PT2', versionNumber: 3})
        expect(deletes[0].body).toBe('')
        expect(json(bulkCreates[0])).toEqual([{code: 'PT3', description: 'Tres', enabled: true}])
        expect(json(bulkUpdates[0])).toEqual([{id: 2, enabled: false, versionNumber: 4}])
        for (const request of [...lists, ...creates, ...updates, ...deletes, ...bulkCreates, ...bulkUpdates]) {
            expect(request.headers.get('authorization')).toBe('Bearer token-1')
        }
    })

    it('el alta lleva solo lo escrito; una modificacion, la fila leida entera con su version y lo que no se ensena', () => {
        const poleTypes = findLovResource('pole-types')
        const read = {
            id: 42, code: 'PT9', description: 'Nueve', type: null, enabled: true, versionNumber: 3,
            versionDate: '2026-09-30T08:15:00', versionUser: 'ana', drawingNumber: 77, keyAddedTomorrow: {a: 1},
        }

        expect(newLovEntry(poleTypes, {code: 'PT9', description: 'Nueve', enabled: true}))
            .toEqual({code: 'PT9', description: 'Nueve', enabled: true})
        expect(changedLovEntry(poleTypes, read, {code: 'PT9', description: 'Nueve (baja)', enabled: false}))
            .toEqual({...read, description: 'Nueve (baja)', enabled: false})
        expect(lovEntryWithEnabled(read, false)).toEqual({...read, enabled: false})
    })

    it('en los tres catalogos con tipo, el tipo viaja como referencia por su id, y sin elegir otro vuelve el leido', () => {
        expect(LOV_RESOURCES.filter((resource) => resource.parent)
            .map(({path, parent}) => [path, parent.field, parent.path])).toEqual([
            ['anchorage-foundations', 'anchorageFoundationType', 'anchorage-foundation-types'],
            ['foundations', 'foundationType', 'foundation-types'],
            ['portals', 'portalType', 'portal-types'],
        ])
        for (const resource of LOV_RESOURCES.filter((entry) => entry.parent)) {
            expect(findLovResource(resource.parent.path), resource.path).not.toBeNull()
        }

        const foundations = findLovResource('foundations')
        const read = {id: 12, code: 'Z', description: 'Zapata', enabled: true, versionNumber: 3, drawingNumber: 1234,
            foundationType: {id: 4, code: 'FT1', versionNumber: 1}}
        const values = {code: 'Z', description: 'Zapata', enabled: true}

        expect(newLovEntry(foundations, {...values, parentId: '5'})).toEqual({...values, foundationType: {id: 5}})
        expect(changedLovEntry(foundations, read, {...values, parentId: '5'})).toEqual({...read, foundationType: {id: 5}})
        expect(changedLovEntry(foundations, read, values)).toEqual(read)
    })

    it('los dos 409 se distinguen por su codigo: una version vieja (CON-001) y un valor repetido o en uso (BUS-002)', async () => {
        useToken()
        const conflict = (code) => () => HttpResponse.json({title: 'Conflicto', status: 409, code, traceId: `t-${code}`},
            {status: 409, headers: {'Content-Type': 'application/problem+json'}})
        server.use(
            http.put('/api/configuration/pole-types/42', conflict('CON-001')),
            http.delete('/api/configuration/pole-types/42', conflict('BUS-002')),
        )

        const stale = await failure(updateLov('pole-types', {id: 42, code: 'PT9', versionNumber: 2}))
        const inUse = await failure(deleteLov('pole-types', 42))

        expect(stale).toBeInstanceOf(ConflictError)
        expect([stale.code, stale.reference]).toEqual(['CON-001', 't-CON-001'])
        expect([inUse.code, inUse.reference]).toEqual(['BUS-002', 't-BUS-002'])
        expect(errorMessage(stale)).toBe('Conflicto con otro cambio: recarga y vuelve a intentarlo.')
        expect(errorMessage(inUse)).not.toContain('recarga')
    })
})
