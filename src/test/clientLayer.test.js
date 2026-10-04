import {MutationObserver} from '@tanstack/react-query'
import {delay, http, HttpResponse} from 'msw'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {
    downloadJobFile,
    exportProfiles,
    fallbackFileName,
    familyOf,
    getJob,
    hasErrorReport,
    importLovs,
    importProfiles,
    isDownloadable,
    isTerminal,
    JOB_FAMILIES,
    JOB_STATUS,
    JOB_TYPE,
    JOBS_PAGE_SIZE,
    listJobs,
    MAPPER_TYPES,
    rejectedJobOf,
    REPUBLISH_TARGETS,
    republish,
    toJob,
    XLSX_MIME,
} from '../api/configuration/jobs.js'
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
import {
    CLEARED_LOV_REF,
    createMaster,
    deleteMaster,
    filterMasters,
    getMaster,
    listBusinessEntities,
    lovRef,
    MASTER_CHILDREN,
    masterBody,
    masterFilter,
    trackSchematic,
    updateMaster,
} from '../api/configuration/masters.js'
import {fileNameFromDisposition, downloadFile} from '../api/download.js'
import {endOfDayInstant, localDateTimeToInstant, startOfDayInstant, toInstantParam, toLocalDateParam, toYearMonthParam} from '../api/dates.js'
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
import {hasNextOffsetPage, sortParam, sortWithTieBreak, toOffsetParams, toPage, toPageParams, toUsersPage, USERS_MAX_PAGE} from '../api/paging.js'
import {runProbe, SERVICE_PROBES} from '../api/probes.js'
import {listRevisions, REVISION_OPERATION, REVISIONS_PAGE_SIZE} from '../api/revisions.js'
import {EXPECTED_AUDIENCES, prefixOf, SERVICES} from '../api/services.js'
import {
    assemblyBody,
    catalogueEntryBody,
    catalogueRevisionsPath,
    createCatalogueEntry,
    getAssemblyAvailability,
    getCatalogueEntry,
    isSynchronizedProject,
    materialBody,
    searchCatalogue,
    updateCatalogueEntry,
} from '../api/stock/catalogues.js'
import {getMaterialStock, listLowStock} from '../api/stock/inventory.js'
import {
    ADJUSTMENT_DIRECTIONS,
    adjustmentRequest,
    entryRequest,
    listMaterialMovements,
    MOVEMENT_TYPE,
    outputRequest,
    registerAdjustment,
    registerEntry,
    registerOutput,
    registerTransfer,
    searchMovements,
    transferRequest,
} from '../api/stock/movements.js'
import {
    cancelReservation,
    consumeReservation,
    createReservation,
    isActiveReservation,
    releaseReservation,
    RESERVATION_STATUS,
    reservationRequest,
    reservationRevisionsPath,
    reservationUpdateRequest,
    searchReservations,
    updateReservation,
} from '../api/stock/reservations.js'
import {codeAndName, referenceLabel, summaryOf, textOrNull, toQuantity, withoutNulls} from '../api/stock/values.js'
import {
    assignProfile,
    getProfile,
    getUserProfiles,
    listProfileMembers,
    listProfiles,
    removeProfile,
} from '../api/users/profiles.js'
import {
    addClientRoles,
    clientLabel,
    getUserRoles,
    listClientRoleMembers,
    listClientRoles,
    listClients,
    removeClientRoles,
    toUserRoles,
} from '../api/users/roles.js'
import {
    changedUserRequest,
    createUser,
    credentialTypeLabel,
    deleteCredential,
    deleteUser,
    fullNameOf,
    getUser,
    isAttributeFilter,
    isPasswordCredential,
    listCredentials,
    listOfflineSessions,
    listSessions,
    newUserRequest,
    REQUIRED_ACTION,
    requiredActionLabel,
    resetPassword,
    revokeOfflineSession,
    revokeOfflineSessions,
    revokeSession,
    revokeSessions,
    sameAttributes,
    searchUsers,
    sendActionsEmail,
    setUserEnabled,
    TAKE_OUT_STEPS,
    takeOut,
    toUser,
    updateUser,
} from '../api/users/users.js'
import {createQueryClient} from '../app/queryClient.js'
import {errorMessage} from '../ui/errors/messages.js'
import {applyServerErrors, toFormPath} from '../ui/errors/serverValidation.js'
import {formatDate, formatDateTime, formatDayTime, formatPercent, formatQuantity} from '../ui/format.js'
import {parseTypedDate, parseTypedDateTime} from '../ui/typedDates.js'
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
        const deletes = record('delete', '/api/users/u1/roles/clients/c1', () => HttpResponse.json({realmRoles: [], clientRoles: []}))

        await expect(apiFetch('/api/configuration/pole-types', {method: 'POST', json: {code: 'P1'}})).resolves.toEqual({id: 1})
        await apiFetch('/api/maintenance/orders/o1', {method: 'PATCH', json: {title: null, version: 3}, contentType: MERGE_PATCH})
        await expect(apiFetch('/api/users/u1/roles/clients/c1', {method: 'DELETE', json: {roles: ['stock-read']}}))
            .resolves.toEqual({realmRoles: [], clientRoles: []})

        expect(posts[0].headers.get('content-type')).toBe('application/json')
        expect(JSON.parse(posts[0].body)).toEqual({code: 'P1'})
        expect(patches[0].headers.get('content-type')).toBe('application/merge-patch+json')
        expect(JSON.parse(patches[0].body)).toEqual({title: null, version: 3})
        expect(deletes[0].headers.get('content-type')).toBe('application/json')
        expect(JSON.parse(deletes[0].body)).toEqual({roles: ['stock-read']})
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

    it('mto-users: un usuario repetido no pide recargar, una sesión o una credencial ajenas se dicen así y el KC-400 trae el texto de Keycloak', () => {
        expect(errorMessage(new ConflictError(409, {problem: problem({code: 'USR-409', detail: 'User exists with same username'})})))
            .toBe('Ya existe un usuario con ese nombre de usuario o ese email. User exists with same username')
        expect(errorMessage(new NotFoundError(404, {problem: problem({code: 'SES-404', detail: 'Session s-9 not found'})})))
            .toBe('Esa sesión ya no existe o no es de este usuario.')
        expect(errorMessage(new NotFoundError(404, {problem: problem({code: 'CRED-404'})})))
            .toBe('Esa credencial ya no existe o no es de este usuario.')
        expect(errorMessage(new ValidationError(400, {problem: problem({code: 'KC-400', detail: 'invalidPasswordMinLengthMessage'})})))
            .toBe('Keycloak ha rechazado la petición. invalidPasswordMinLengthMessage')
        expect(errorMessage(new ValidationError(400, {problem: problem({code: 'KC-400', errors: [{field: 'email', code: null, message: 'no vale'}]})})))
            .toBe('Datos no válidos: email no vale')
    })

    it('mto-stock: un código repetido de un catálogo no pide recargar, y la falta de stock lleva su detalle', () => {
        for (const code of ['MAT-409', 'WH-409', 'SUP-409', 'PRJ-409', 'ASM-409']) {
            expect(errorMessage(new ConflictError(409, {problem: problem({code, detail: 'Code already exists: X-1'})})))
                .toBe('Ya existe otro con ese código.')
        }
        expect(errorMessage(new ConflictError(409, {problem: problem({code: 'STK-001', detail: 'requested 5, available 2'})})))
            .toBe('No hay stock disponible suficiente. requested 5, available 2')
        expect(errorMessage(new ValidationError(422, {problem: problem({code: 'PRJ-001', detail: 'Project is synchronized'})})))
            .toBe('La operación no es posible. Project is synchronized')
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

    it('un campo del servicio que en el formulario se llama de otra forma cae en el suyo por su alias', () => {
        const form = fakeForm({warehouseId: null, targetWarehouseId: null, quantity: '3'})
        const error = new ValidationError(400, {
            problem: {
                ...emptyProblem(),
                errors: [
                    {field: 'sourceWarehouseId', code: 'NotNull', message: 'must not be null'},
                    {field: 'differentWarehouses', code: 'AssertTrue', message: 'source and target warehouses must be different'},
                    {field: 'quantity', code: 'Positive', message: 'must be greater than 0'},
                ],
            },
        })

        expect(applyServerErrors(form, error, {aliases: {sourceWarehouseId: 'warehouseId', differentWarehouses: 'targetWarehouseId'}}))
            .toEqual([])
        expect(form.errors).toEqual({
            warehouseId: 'must not be null',
            targetWarehouseId: 'source and target warehouses must be different',
            quantity: 'must be greater than 0',
        })
        expect(applyServerErrors(fakeForm({warehouseId: null}), error)).toEqual([
            'sourceWarehouseId: must not be null',
            'differentWarehouses: source and target warehouses must be different',
            'quantity: must be greater than 0',
        ])
    })
})

describe('paging.js: las tres formas de paginar', () => {
    it('la pagina con forma DTO, tolerando first y last', () => {
        expect(toPage({content: [{id: 1}], page: {number: 2, size: 50, totalElements: 101, totalPages: 3, first: false, last: true}}))
            .toEqual({content: [{id: 1}], number: 2, size: 50, totalElements: 101, totalPages: 3})
        expect(toPage(null)).toEqual({content: [], number: 0, size: 0, totalElements: 0, totalPages: 0})
    })

    it('la de mto-users, con first, max y total; la pantalla cuenta páginas desde 1 y el servicio pide desde qué fila', () => {
        expect(toUsersPage({content: [{id: 'u'}], first: 200, max: 200, total: 201}))
            .toEqual({content: [{id: 'u'}], first: 200, max: 200, total: 201})
        expect(toOffsetParams({page: 1, size: 50})).toEqual({first: 0, max: 50})
        expect(toOffsetParams({page: 3, size: 50})).toEqual({first: 100, max: 50})
        expect(toOffsetParams({page: 0, size: 20})).toEqual({first: 0, max: 20})
        expect(toOffsetParams({page: 2, size: USERS_MAX_PAGE})).toEqual({first: 200, max: 200})
        expect(() => toOffsetParams({page: 1, size: 201})).toThrow(/200/)
        expect(() => toOffsetParams({page: 1})).toThrow(/200/)
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

    it('una lista de mto-stock lleva siempre su orden: el de la columna o el de la pantalla, y el id para desempatar', () => {
        expect(sortWithTieBreak(null, 'code,asc')).toEqual(['code,asc', 'id,asc'])
        expect(sortWithTieBreak({field: 'name', direction: 'desc'}, 'code,asc')).toEqual(['name,desc', 'id,asc'])
        expect(sortWithTieBreak({field: 'quantity'}, 'occurredAt,desc')).toEqual(['quantity,asc', 'id,asc'])
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

    it('una fecha y hora escritas viajan como el Instant de la zona del navegador; vacías no viajan y el servicio pone ahora', () => {
        expect(parseTypedDateTime('01/02/2026 08:30')).toBe('2026-02-01 08:30:00')
        expect(parseTypedDateTime('1/2/2026 8:05')).toBe('2026-02-01 08:05:00')
        expect([parseTypedDateTime('31/02/2026 08:30'), parseTypedDateTime('01/02/2026 24:00'), parseTypedDateTime('01/02/2026 08:60'),
            parseTypedDateTime('01/02/2026'), parseTypedDateTime('')]).toEqual([null, null, null, null, null])
        expect([parseTypedDate('29/02/2028'), parseTypedDate('29/02/2026')]).toEqual(['2028-02-29', null])
        expect(localDateTimeToInstant('2026-02-01 08:30:00')).toBe(new Date(2026, 1, 1, 8, 30).toISOString())
        expect(localDateTimeToInstant('2026-02-01T08:30')).toBe(new Date(2026, 1, 1, 8, 30).toISOString())
        expect([localDateTimeToInstant(''), localDateTimeToInstant(null), localDateTimeToInstant(undefined)])
            .toEqual([undefined, undefined, undefined])
        expect(() => localDateTimeToInstant('2026-02-30 08:30:00')).toThrow(/no validas/)
        expect(() => localDateTimeToInstant('01/02/2026 08:30')).toThrow(/no validas/)
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
        expect(formatDayTime(new Date(2026, 7, 27, 9, 2, 3))).toBe('27/08 09:02:03')
        expect(formatDayTime(null)).toBe('')
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

    it('un 404 de una consulta con notFoundMessage se dice con ese texto, una vez; cualquier otro fallo, con el suyo', async () => {
        const notify = vi.fn()
        const client = createQueryClient({notify})
        const missing = new NotFoundError(404, {problem: {...emptyProblem(), code: 'USR-404'}})
        const unavailable = new UnavailableError(503)
        const meta = {notFoundMessage: 'No existe el usuario u-9'}

        await client.fetchQuery({queryKey: ['u', 'u-9'], queryFn: () => Promise.reject(missing), retry: false, meta}).catch(() => {})
        await client.fetchQuery({queryKey: ['u', 'u-8'], queryFn: () => Promise.reject(unavailable), retry: false, meta}).catch(() => {})

        expect(notify.mock.calls).toEqual([[missing, {message: 'No existe el usuario u-9'}], [unavailable]])
    })

    it('un 404 de una consulta con silentNotFound es una respuesta, no un fallo; cualquier otro fallo se avisa igual', async () => {
        const notify = vi.fn()
        const client = createQueryClient({notify})
        const none = new NotFoundError(404, {problem: {...emptyProblem(), code: 'RES-404'}})
        const forbidden = new ForbiddenError(403)
        const meta = {silentNotFound: true}

        await client.fetchQuery({queryKey: ['revisions', 'r-1'], queryFn: () => Promise.reject(none), retry: false, meta}).catch(() => {})
        await client.fetchQuery({queryKey: ['revisions', 'r-2'], queryFn: () => Promise.reject(forbidden), retry: false, meta}).catch(() => {})
        await client.fetchQuery({queryKey: ['revisions', 'r-3'], queryFn: () => Promise.reject(none), retry: false}).catch(() => {})

        expect(notify.mock.calls).toEqual([[forbidden], [none]])
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

describe('configuration/masters.js: los maestros de infraestructura', () => {
    const json = (request) => JSON.parse(request.body)
    const page = (content, number, size, totalElements) =>
        ({content, page: {number, size, totalElements, totalPages: Math.ceil(totalElements / size)}})

    it('la lista es un POST /filter con la pagina del servicio (desde 0), el tamano, el orden y el cuerpo limpio', async () => {
        useToken()
        const filters = record('post', '/api/configuration/stations/filter', (request, count) => HttpResponse.json(count === 1
            ? page([{id: 4, name: 'ATOCHA', executionPackageId: 100, tracks: null, versionNumber: 3, brandNewField: 'x'}], 1, 20, 21)
            : page([], 0, 50, 0)))

        const second = await filterMasters('stations', {
            page: 2, size: 20, sort: {field: 'name', direction: 'asc'},
            filter: {searchText: ' ato ', enabled: null, name: '  ', onLoad: false, trackId: 3},
        })
        const plain = await filterMasters('stations')

        expect(filters[0].url.search).toBe('?page=1&size=20&sort=name%2Casc')
        expect(json(filters[0])).toEqual({searchText: 'ato', onLoad: false, trackId: 3})
        expect(second).toMatchObject({number: 1, size: 20, totalElements: 21, totalPages: 2})
        expect(second.content[0]).toEqual({id: 4, name: 'ATOCHA', executionPackageId: 100, tracks: null, versionNumber: 3,
            brandNewField: 'x'})
        expect(filters[1].url.search).toBe('?page=0&size=50')
        expect(json(filters[1])).toEqual({})
        expect(plain.totalElements).toBe(0)
        expect(masterFilter(undefined)).toEqual({})
    })

    it('leer, dar de alta (201), modificar con PUT /{id} y borrar (204, logico); el esquema y las empresas', async () => {
        useToken()
        const reads = record('get', '/api/configuration/tracks/3', () => HttpResponse.json({id: 3, name: 'VIA 1'}))
        const creates = record('post', '/api/configuration/profiles', () => HttpResponse.json({id: 99}, {status: 201}))
        const updates = record('put', '/api/configuration/tracks/3', () => HttpResponse.json({id: 3, versionNumber: 8}))
        const deletes = record('delete', '/api/configuration/tracks/3', () => new HttpResponse(null, {status: 204}))
        const schematics = record('get', '/api/configuration/tracks/3/schematic', () => HttpResponse.json({
            trackId: 3, trackName: 'VIA 1', enabled: true, executionPackageName: 'EP4', stations: ['ATOCHA'],
            profiles: [{id: 7, code: 'P-007', kp: '12.345', cantilevers: [{id: 21, type: 'PT1', cwHeight: '5.300'}],
                disconnector: {id: 40, name: 'SEC-40'}}],
            sectionInsulators: [],
        }))
        const companies = record('get', '/api/configuration/business-entities', () => HttpResponse.json([
            {id: 1, identificationNumber: 'A12345678', name: 'Constructora Norte', code: 'CN'},
        ]))

        await expect(getMaster('tracks', 3)).resolves.toEqual({id: 3, name: 'VIA 1'})
        await expect(createMaster('profiles', {profileId: 'P-9', kp: '10.500'})).resolves.toEqual({id: 99})
        await expect(updateMaster('tracks', {id: 3, name: 'VIA PRINCIPAL', versionNumber: 7})).resolves.toEqual({id: 3, versionNumber: 8})
        await expect(deleteMaster('tracks', 3)).resolves.toBeNull()
        const schematic = await trackSchematic(3)
        const entities = await listBusinessEntities()

        expect(reads).toHaveLength(1)
        expect(json(creates[0])).toEqual({profileId: 'P-9', kp: '10.500'})
        expect(json(updates[0])).toEqual({id: 3, name: 'VIA PRINCIPAL', versionNumber: 7})
        expect(deletes[0].body).toBe('')
        expect(schematics).toHaveLength(1)
        expect(schematic.profiles[0].cantilevers[0].cwHeight).toBe('5.300')
        expect(schematic.profiles[0].disconnector.name).toBe('SEC-40')
        expect(entities[0].identificationNumber).toBe('A12345678')
        expect(companies[0].headers.get('authorization')).toBe('Bearer token-1')
    })

    it('una modificacion es la fila leida entera: lo desconocido y la version vuelven, y los hijos sin tocar van a null', () => {
        const track = {id: 3, name: 'VIA 1', enabled: true, executionPackageId: 100, stationIds: [12, 13], profiles: null,
            versionNumber: 7, createUser: 'importador', fieldOfTomorrow: {deep: [1, 2]}}
        const profile = {id: 7, profileId: 'P-007', kp: '12.345', trackId: 3, versionNumber: 2, orderInTrack: 4,
            cantilevers: [{id: 21, cwHeight: 5.3, steadyArm: {id: 31, length: 1200}}],
            disconnector: {id: 5, name: 'SEC-1', versionNumber: 6}}

        expect(masterBody('tracks', track, {name: 'VIA PRINCIPAL'})).toEqual({...track, name: 'VIA PRINCIPAL', profiles: null})
        const untouched = masterBody('profiles', profile, {kp: '12.500'})
        expect(untouched).toEqual({...profile, kp: '12.500', cantilevers: null})
        expect(untouched.disconnector).toEqual({id: 5, name: 'SEC-1', versionNumber: 6})
        const edited = [...profile.cantilevers, {cwHeight: 6}]
        expect(masterBody('profiles', profile, {}, {cantilevers: edited}).cantilevers).toEqual(edited)
        expect(masterBody('stations', {}, {name: 'NUEVA'})).toEqual({name: 'NUEVA', tracks: null, disconnectors: null,
            sectionInsulators: null})
        expect(masterBody('disconnectors', {id: 5, name: 'SEC-1', profileId: 7}, {onLoad: true}))
            .toEqual({id: 5, name: 'SEC-1', profileId: 7, onLoad: true})
        expect(Object.keys(MASTER_CHILDREN)).toEqual(['execution-packages', 'stations', 'tracks', 'profiles', 'disconnectors',
            'section-insulators'])
        expect(MASTER_CHILDREN['section-insulators']).toEqual(['switches'])
    })

    it('una referencia a catalogo viaja como {id, code}; quitar una opcional de un perfil es {}, porque null no la toca', () => {
        expect(lovRef({id: 5, code: 'PT1', description: 'Poste tipo 1', enabled: true, versionNumber: 3}))
            .toEqual({id: 5, code: 'PT1'})
        expect(lovRef(null)).toBeNull()
        expect(JSON.stringify({poleType: CLEARED_LOV_REF, portal: null})).toBe('{"poleType":{},"portal":null}')
        expect(Object.isFrozen(CLEARED_LOV_REF)).toBe(true)
    })
})

describe('configuration/jobs.js: los trabajos en segundo plano', () => {
    const JOB = '6f1c0000-0000-4000-8000-000000000001'
    const accepted = (type, extra = {}) => HttpResponse.json(
        {id: JOB, type, status: 'PENDING', createdAt: '2026-08-27T09:12:03Z', processedItems: 0, successfulItems: 0, failedItems: 0, ...extra},
        {status: 202, headers: {Location: `/api/v1/jobs/${JOB}`}},
    )

    it('las dos importaciones son un multipart con la parte file y su nombre, y dryRun viaja siempre en la query', async () => {
        useToken()
        const profiles = record('post', '/api/configuration/profiles/jobs/import', () => accepted('PROFILE_IMPORT'))
        const lovs = record('post', '/api/configuration/lovs/jobs/import', () => accepted('LOV_IMPORT'))
        // En jsdom, el Request de Vitest rehace el FormData para Node sin el nombre de cada fichero (lo
        // manda como «blob»). El nombre se comprueba donde la aplicación lo pone, en append; en un
        // navegador viaja en la parte tal cual.
        const parts = vi.spyOn(FormData.prototype, 'append')
        const profileMaster = new File(['PK-xlsx'], 'profile-master.xlsx', {type: XLSX_MIME})
        const lovMaster = new File(['PK-lov'], 'lov-master.xlsx', {type: XLSX_MIME})

        const profileJob = await importProfiles(profileMaster, {dryRun: true})
        await importLovs(lovMaster)

        expect(parts.mock.calls).toEqual([['file', profileMaster, 'profile-master.xlsx'], ['file', lovMaster, 'lov-master.xlsx']])
        expect(profiles[0].url.search).toBe('?dryRun=true')
        expect(lovs[0].url.search).toBe('?dryRun=false')
        expect(profiles[0].headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/)
        expect(profiles[0].body).toContain('Content-Disposition: form-data; name="file"; filename=')
        expect(profiles[0].body).toContain(`Content-Type: ${XLSX_MIME}`)
        expect(profiles[0].body).toContain('PK-xlsx')
        expect(lovs[0].body).toContain('PK-lov')
        expect(profiles[0].headers.get('authorization')).toBe('Bearer token-1')
        expect(profileJob).toMatchObject({id: JOB, type: 'PROFILE_IMPORT', status: 'PENDING', itemErrors: []})
        expect(profileJob).not.toHaveProperty('totalItems')
    })

    it('exportar lleva la vía y el formato; republicar, lo que se republica y su filtro, y sin barra final', async () => {
        useToken()
        const exports = record('post', '/api/configuration/profiles/jobs/export', () => accepted('PROFILE_EXPORT'))
        // Con barra final la ruta no casa con este manejador: la llamada fallaría por no tenerlo.
        const republished = record('post', '/api/configuration/master-data/republish', () => accepted('MASTER_DATA_REPUBLISH'))

        await exportProfiles({trackId: 3, mapperType: 'technical'})
        await exportProfiles({trackId: 4})
        await republish({entity: 'profile', trackId: 3})
        await republish({entity: 'disconnector', stationId: 12})
        await republish({entity: 'all'})

        expect(exports.map((request) => request.url.search)).toEqual(['?trackId=3&mapperType=technical', '?trackId=4&mapperType=basic'])
        expect(republished.map((request) => request.url.search)).toEqual(['?entity=profile&trackId=3', '?entity=disconnector&stationId=12',
            '?entity=all'])
        expect(exports[0].body).toBe('')
        expect(MAPPER_TYPES).toEqual(['basic', 'default', 'technical'])
        expect(REPUBLISH_TARGETS.map((target) => [target.value, target.scope])).toEqual([
            ['profile', 'track'], ['disconnector', 'station'], ['section-insulator', 'station'], ['all', null]])
    })

    it('la lista pide la página del servicio (desde 0), 20 filas y los filtros, sin sort: ordena el servicio', async () => {
        useToken()
        const lists = record('get', '/api/configuration/jobs', (_request, count) => HttpResponse.json(count === 1
            ? {
                content: [{id: JOB, type: 'LOV_IMPORT', status: 'COMPLETED', createdAt: '2026-08-27T09:12:03Z', totalItems: 17,
                    processedItems: 17, successfulItems: 17, failedItems: 0}],
                page: {number: 1, size: 20, totalElements: 21, totalPages: 2, first: false, last: true},
            }
            : {content: [], page: {number: 0, size: 20, totalElements: 0, totalPages: 0}}))

        const second = await listJobs({page: 2, type: 'LOV_IMPORT', status: 'COMPLETED'})
        const first = await listJobs()

        expect(lists[0].url.search).toBe('?page=1&size=20&type=LOV_IMPORT&status=COMPLETED')
        expect(lists[1].url.search).toBe('?page=0&size=20')
        expect(second).toMatchObject({number: 1, size: 20, totalElements: 21, totalPages: 2})
        expect(second.content[0]).toMatchObject({id: JOB, totalItems: 17, itemErrors: []})
        expect(first.content).toEqual([])
        expect(JOBS_PAGE_SIZE).toBe(20)
    })

    it('el detalle se pide a la familia de su tipo, con sus errores por elemento; uno de tipo desconocido vuelve sin llamar', async () => {
        useToken()
        const detail = (type, extra = {}) => () => HttpResponse.json({id: JOB, type, status: 'COMPLETED_WITH_ERRORS', processedItems: 100,
            successfulItems: 98, failedItems: 2, ...extra})
        const profiles = record('get', `/api/configuration/profiles/jobs/${JOB}`, detail('PROFILE_IMPORT', {
            itemErrors: [{index: 118, operation: 'create', code: 'ValidationException', message: 'kp obligatorio [kp]'}],
        }))
        const lovs = record('get', `/api/configuration/lovs/jobs/${JOB}`, detail('LOV_IMPORT'))
        const republishes = record('get', `/api/configuration/master-data/republish/${JOB}`, detail('MASTER_DATA_REPUBLISH'))

        const imported = await getJob({id: JOB, type: 'PROFILE_IMPORT'})
        await getJob({id: JOB, type: 'PROFILE_BULK_UPDATE'})
        await getJob({id: JOB, type: 'LOV_IMPORT'})
        await getJob({id: JOB, type: 'MASTER_DATA_REPUBLISH'})
        const unknown = {id: JOB, type: 'PROFILE_REPAIR', status: 'RUNNING'}

        await expect(getJob(unknown)).resolves.toBe(unknown)
        expect(profiles).toHaveLength(2)
        expect(lovs).toHaveLength(1)
        expect(republishes).toHaveLength(1)
        expect(imported.itemErrors).toEqual([{index: 118, operation: 'create', code: 'ValidationException', message: 'kp obligatorio [kp]'}])
        expect(familyOf({type: 'PROFILE_EXPORT'})).toBe(JOB_FAMILIES.profiles)
        expect(familyOf({type: 'PROFILE_REPAIR'})).toBeNull()
        expect(JOB_FAMILIES.republish.producesFile).toBe(false)
    })

    describe('el fichero', () => {
        afterEach(() => {
            delete URL.createObjectURL
            delete URL.revokeObjectURL
        })

        it('se pide por familia e id con el token, con el nombre del servicio o el de reserva; lo que no se descarga no se pide', async () => {
            useToken('token-files')
            const exportFile = record('get', `/api/configuration/profiles/jobs/${JOB}/file`, () => new HttpResponse('a;b', {
                headers: {'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="perfiles-VIA-1-basic.csv"'},
            }))
            const report = record('get', `/api/configuration/lovs/jobs/${JOB}/file`, () => HttpResponse.json({errors: []}))
            Object.defineProperty(URL, 'createObjectURL', {value: vi.fn(() => 'blob:mto/1'), configurable: true})
            Object.defineProperty(URL, 'revokeObjectURL', {value: vi.fn(), configurable: true})
            const saved = []
            vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
                saved.push(this.download)
            })

            await expect(downloadJobFile({id: JOB, type: 'PROFILE_EXPORT', status: 'COMPLETED', trackId: 3}))
                .resolves.toBe('perfiles-VIA-1-basic.csv')
            await expect(downloadJobFile({id: JOB, type: 'LOV_IMPORT', status: 'COMPLETED_WITH_ERRORS'}))
                .resolves.toBe(`informe-catalogo-lov-${JOB}.json`)
            await expect(downloadJobFile({id: JOB, type: 'PROFILE_EXPORT', status: 'RUNNING', trackId: 3})).rejects.toThrow('no tiene fichero')
            await expect(downloadJobFile({id: JOB, type: 'MASTER_DATA_REPUBLISH', status: 'COMPLETED'})).rejects.toThrow('no tiene fichero')
            await expect(downloadJobFile({id: JOB, type: 'PROFILE_REPAIR', status: 'COMPLETED'})).rejects.toThrow('no tiene fichero')

            expect(exportFile).toHaveLength(1)
            expect(exportFile[0].headers.get('authorization')).toBe('Bearer token-files')
            expect(report).toHaveLength(1)
            expect(saved).toEqual(['perfiles-VIA-1-basic.csv', `informe-catalogo-lov-${JOB}.json`])
        })

        it('un 410 es un fichero que ya no está: se pide relanzar el trabajo', async () => {
            useToken()
            server.use(http.get(`/api/configuration/profiles/jobs/${JOB}/file`, () => HttpResponse.json(
                {status: 410, detail: `El fichero del trabajo ${JOB} ya no esta disponible`},
                {status: 410, headers: {'Content-Type': 'application/problem+json'}},
            )))

            const error = await failure(downloadJobFile({id: JOB, type: 'PROFILE_IMPORT', status: 'COMPLETED'}))

            expect(error).toBeInstanceOf(ApiError)
            expect(error.status).toBe(410)
            expect(errorMessage(error)).toBe('El fichero ya no está en el servicio: vuelve a lanzar el trabajo.')
        })
    })

    it('un 429 trae el trabajo rechazado y cuándo reintentar; un cuerpo que no es un trabajo no se convierte en uno', async () => {
        useToken()
        server.use(http.post('/api/configuration/profiles/jobs/export', () => HttpResponse.json(
            {id: JOB, type: 'PROFILE_EXPORT', status: 'REJECTED', createdAt: '2026-08-27T09:12:03Z', trackId: 3, mapperType: 'basic',
                processedItems: 0, successfulItems: 0, failedItems: 0},
            {status: 429, headers: {'Retry-After': '30'}},
        )))

        const error = await failure(exportProfiles({trackId: 3}))

        expect(error).toBeInstanceOf(TooManyRequestsError)
        expect(error.retryAfterSeconds).toBe(30)
        expect(rejectedJobOf(error)).toMatchObject({id: JOB, type: 'PROFILE_EXPORT', status: 'REJECTED', trackId: 3, itemErrors: []})
        expect(rejectedJobOf(new TooManyRequestsError(429, {body: {message: 'rate limit'}}))).toBeNull()
        expect(rejectedJobOf(new TooManyRequestsError(429))).toBeNull()
        expect(rejectedJobOf(new ValidationError(400, {body: {id: JOB}}))).toBeNull()
    })

    it('qué está terminado y qué se descarga, en cada tipo y en cada estado', () => {
        const job = (type, status) => ({id: JOB, type, status, trackId: 3})

        expect(['PENDING', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'REJECTED', 'PAUSED', null]
            .map((status) => isTerminal(job('PROFILE_EXPORT', status))))
            .toEqual([false, false, true, true, true, true, true, true])
        expect(isDownloadable(job('PROFILE_EXPORT', 'COMPLETED'))).toBe(true)
        expect(isDownloadable(job('PROFILE_EXPORT', 'COMPLETED_WITH_ERRORS'))).toBe(false)
        expect(isDownloadable(job('PROFILE_IMPORT', 'COMPLETED'))).toBe(true)
        expect(isDownloadable(job('PROFILE_IMPORT', 'COMPLETED_WITH_ERRORS'))).toBe(true)
        expect(isDownloadable(job('LOV_IMPORT', 'COMPLETED_WITH_ERRORS'))).toBe(true)
        expect(isDownloadable(job('LOV_IMPORT', 'FAILED'))).toBe(false)
        expect(isDownloadable(job('PROFILE_BULK_CREATE', 'COMPLETED'))).toBe(false)
        expect(isDownloadable(job('MASTER_DATA_REPUBLISH', 'COMPLETED'))).toBe(false)
        expect(isDownloadable(job('PROFILE_REPAIR', 'COMPLETED'))).toBe(false)
        expect(isDownloadable(job('PROFILE_EXPORT', 'PAUSED'))).toBe(false)
        expect(hasErrorReport(job('PROFILE_IMPORT', 'COMPLETED_WITH_ERRORS'))).toBe(true)
        expect(hasErrorReport(job('PROFILE_EXPORT', 'COMPLETED'))).toBe(false)
        expect(hasErrorReport(job('LOV_IMPORT', 'FAILED'))).toBe(false)
        expect(fallbackFileName(job('PROFILE_EXPORT', 'COMPLETED'))).toBe('perfiles-via-3.csv')
        expect(fallbackFileName(job('PROFILE_IMPORT', 'COMPLETED'))).toBe(`informe-maestro-perfiles-${JOB}.json`)
        expect(fallbackFileName(job('PROFILE_REPAIR', 'COMPLETED'))).toBe(`trabajo-${JOB}`)
    })

    it('un tipo y un estado nuevos se leen como «Desconocido», no se ofrecen y el trabajo leído no se reescribe', () => {
        const read = toJob({id: JOB, type: 'PROFILE_REPAIR', status: 'PAUSED'})

        expect(read).toEqual({id: JOB, type: 'PROFILE_REPAIR', status: 'PAUSED', processedItems: 0, successfulItems: 0, failedItems: 0,
            itemErrors: []})
        expect(JOB_TYPE.label(read.type)).toBe('Desconocido')
        expect(JOB_STATUS.label(read.status)).toBe('Desconocido')
        expect(JOB_TYPE.label('LOV_IMPORT')).toBe('Importación del catálogo de LOV')
        expect(JOB_STATUS.label('COMPLETED_WITH_ERRORS')).toBe('Terminado con errores')
        expect(JOB_TYPE.selectable().map((option) => option.value)).not.toContain(UNKNOWN)
        expect(JOB_STATUS.selectable()).toHaveLength(6)
    })
})

describe('users/*.js: usuarios, roles y perfiles de mto-users', () => {
    const ANA = {
        id: 'u-1', username: 'ana.nueva', firstName: 'Ana', lastName: 'Nueva', email: 'ana@mto.local', emailVerified: true,
        enabled: true, createdAt: '2026-09-21T10:00:00Z', attributes: {dept: ['taller']}, requiredActions: ['UPDATE_PASSWORD'],
        unknownTomorrow: 1,
    }
    const ROLES = {realmRoles: ['mto-users-viewer'], clientRoles: [{clientId: 'mto-users-api', roles: ['users-write']}]}
    const noContent = () => new HttpResponse(null, {status: 204})
    const json = (request) => JSON.parse(request.body)

    it('la búsqueda pide first y max al estilo de Keycloak, sin orden, y lee la página con su total', async () => {
        useToken()
        const searches = record('get', '/api/users', () => HttpResponse.json({
            content: [ANA, {id: 'u-2', username: 'sin.nada', attributes: null}], first: 50, max: 50, total: 123,
        }))

        const page = await searchUsers({search: ' ana ', enabled: true, first: 50, max: 50})

        expect(searches[0].url.search).toBe('?search=ana&enabled=true&first=50&max=50')
        expect(page).toMatchObject({first: 50, max: 50, total: 123})
        expect(page.content[0]).toEqual(ANA)
        expect(page.content[1]).toEqual({id: 'u-2', username: 'sin.nada', attributes: {}, requiredActions: []})
        expect(page.content.map(fullNameOf)).toEqual(['Ana Nueva', 'sin.nada'])
        expect(fullNameOf({username: 'x', firstName: ' ', lastName: 'Ruiz'})).toBe('Ruiz')
    })

    it('el atributo repite el parámetro, codificado, y nunca viaja con la búsqueda; lo que el servicio rechazaría no sale', async () => {
        useToken()
        const searches = record('get', '/api/users', () => HttpResponse.json({content: [], first: 0, max: 20, total: 0}))

        await expect(searchUsers({attributes: ['dept:taller', 'turno:noche']})).resolves.toEqual({content: [], first: 0, max: 20, total: 0})
        await searchUsers({search: '  ', attributes: ['dept:']})
        await expect(searchUsers({search: 'ana', attributes: ['dept:taller']})).rejects.toThrow(/SEARCH-400/)
        await expect(searchUsers({attributes: ['dept:taller', 'dept:almacen']})).rejects.toThrow(/SEARCH-400/)
        await expect(searchUsers({max: USERS_MAX_PAGE + 1})).rejects.toThrow(/max/)
        await expect(searchUsers({max: 0})).rejects.toThrow(/max/)

        expect(searches.map((request) => request.url.search))
            .toEqual(['?attribute=dept%3Ataller&attribute=turno%3Anoche&first=0&max=20', '?attribute=dept%3A&first=0&max=20'])
        expect(['dept:taller', 'dept:', 'dept:a:b'].map(isAttributeFilter)).toEqual([true, true, true])
        expect(['dept', ':taller', 'dept taller:x', 'dept: x', ''].map(isAttributeFilter)).toEqual([false, false, false, false, false])
    })

    it('leer, dar de alta (201), modificar con un PUT parcial, activar con su PATCH y borrar (204); los ids van codificados', async () => {
        useToken()
        const FEDERATED = 'f:ldap:ana'
        const reads = record('get', '/api/users/:userId', () => HttpResponse.json({...ANA, id: FEDERATED}))
        const posts = record('post', '/api/users', () => HttpResponse.json(ANA, {status: 201, headers: {Location: '/api/v1/users/u-1'}}))
        const puts = record('put', '/api/users/:userId', () => HttpResponse.json({...ANA, firstName: 'Anabel', email: null}))
        const patches = record('patch', '/api/users/:userId/enabled', () => HttpResponse.json({...ANA, enabled: false}))
        const deletes = record('delete', '/api/users/:userId', noContent)

        const read = await getUser(FEDERATED)
        const created = await createUser(newUserRequest({username: ' ana.nueva ', email: 'ana@mto.local', temporaryPassword: ' Cambiame.123',
            requiredActions: ['UPDATE_PASSWORD']}))
        const updated = await updateUser('u-1', {firstName: 'Anabel', email: ''})
        const disabled = await setUserEnabled('u-1', false)
        await expect(deleteUser('u-1')).resolves.toBeNull()

        expect(reads[0].url.pathname).toBe('/api/users/f%3Aldap%3Aana')
        expect(read.id).toBe(FEDERATED)
        expect(json(posts[0])).toEqual({username: 'ana.nueva', email: 'ana@mto.local', emailVerified: false, enabled: true,
            temporaryPassword: ' Cambiame.123', requiredActions: ['UPDATE_PASSWORD']})
        expect(created).toMatchObject({id: 'u-1', username: 'ana.nueva'})
        expect(json(puts[0])).toEqual({firstName: 'Anabel', email: ''})
        expect(updated).toMatchObject({firstName: 'Anabel', email: null})
        expect(json(patches[0])).toEqual({enabled: false})
        expect(disabled.enabled).toBe(false)
        expect(deletes[0].url.pathname).toBe('/api/users/u-1')
        expect(deletes[0].body).toBe('')
    })

    it('un alta lleva lo escrito, recortado, con activo y «email verificado» siempre; una modificación, solo lo que cambió', () => {
        expect(newUserRequest({username: ' ana ', firstName: ' ', lastName: ' Nueva ', email: '', temporaryPassword: '  ', attributes: {},
            requiredActions: []}))
            .toEqual({username: 'ana', lastName: 'Nueva', emailVerified: false, enabled: true})
        expect(newUserRequest({username: 'ana', emailVerified: true, enabled: false, attributes: {dept: ['taller']}}))
            .toEqual({username: 'ana', emailVerified: true, enabled: false, attributes: {dept: ['taller']}})

        const read = toUser(ANA)
        const same = {firstName: 'Ana', lastName: 'Nueva', email: 'ana@mto.local', emailVerified: true, attributes: {dept: ['taller']}}
        expect(changedUserRequest(read, same)).toBeNull()
        expect(changedUserRequest(read, {...same, firstName: ' Ana ', email: ''})).toEqual({email: ''})
        expect(changedUserRequest(read, {...same, firstName: 'Anabel'})).toEqual({firstName: 'Anabel'})
        expect(changedUserRequest(read, {...same, emailVerified: false})).toEqual({emailVerified: false})
        expect(changedUserRequest(read, {...same, attributes: {dept: ['taller'], turno: ['noche']}}))
            .toEqual({attributes: {dept: ['taller'], turno: ['noche']}})
        expect(changedUserRequest(read, {...same, attributes: {}})).toEqual({attributes: {}})
        expect(changedUserRequest(toUser({...ANA, lastName: null}), {...same, lastName: '  '})).toBeNull()
    })

    it('dos mapas de atributos son el mismo sin mirar el orden de las claves, pero sí el de los valores', () => {
        expect(sameAttributes({a: ['1'], b: ['2', '3']}, {b: ['2', '3'], a: ['1']})).toBe(true)
        expect(sameAttributes({b: ['3', '2']}, {b: ['2', '3']})).toBe(false)
        expect(sameAttributes({a: ['1']}, {a: ['1'], b: []})).toBe(false)
        expect(sameAttributes({a: ['1']}, {b: ['1']})).toBe(false)
        expect(sameAttributes({}, {})).toBe(true)
    })

    it('la contraseña y el correo de acciones mandan su cuerpo; sin validez, vale la del realm', async () => {
        useToken()
        const resets = record('post', '/api/users/u-1/reset-password', noContent)
        const emails = record('post', '/api/users/u-1/execute-actions-email', () => new HttpResponse(null, {status: 202}))

        await expect(resetPassword('u-1', {password: ' Secreta.123', temporary: true})).resolves.toBeNull()
        await resetPassword('u-1', {password: 'Secreta.123'})
        await expect(sendActionsEmail('u-1', {actions: ['UPDATE_PASSWORD', 'VERIFY_EMAIL'], lifespanSeconds: 3600})).resolves.toBeNull()
        await sendActionsEmail('u-1', {actions: ['VERIFY_EMAIL'], lifespanSeconds: ''})

        expect(resets.map(json)).toEqual([{password: ' Secreta.123', temporary: true}, {password: 'Secreta.123', temporary: false}])
        expect(emails.map(json)).toEqual([{actions: ['UPDATE_PASSWORD', 'VERIFY_EMAIL'], lifespanSeconds: 3600}, {actions: ['VERIFY_EMAIL']}])
    })

    it('sesiones normales y offline, y credenciales: listarlas, cerrar una o todas y quitar una, cada cosa en su ruta', async () => {
        useToken()
        const SESSION = {id: 's-1', username: 'ana.nueva', ipAddress: '10.0.0.7', startedAt: '2026-09-21T09:00:00Z',
            lastAccessAt: '2026-09-21T09:30:00Z', clients: ['mto-backoffice', 'mto-frontend']}
        server.use(
            http.get('/api/users/u-1/sessions', () => HttpResponse.json([SESSION])),
            http.get('/api/users/u-1/offline-sessions', () => HttpResponse.json([])),
            http.get('/api/users/u-1/credentials', () => HttpResponse.json([
                {id: 'c-1', type: 'otp', userLabel: 'móvil', createdAt: '2026-09-21T09:00:00Z'},
                {id: 'c-2', type: 'password', userLabel: null, createdAt: '2026-09-20T09:00:00Z'},
            ])),
        )
        const deletes = record('delete', '/api/users/u-1/*', noContent)

        await expect(listSessions('u-1')).resolves.toEqual([SESSION])
        await expect(listOfflineSessions('u-1')).resolves.toEqual([])
        const credentials = await listCredentials('u-1')
        await revokeSessions('u-1')
        await revokeSession('u-1', 's-1')
        await revokeOfflineSessions('u-1')
        await revokeOfflineSession('u-1', 'o-9')
        await deleteCredential('u-1', 'c-1')

        expect(deletes.map((request) => request.url.pathname)).toEqual([
            '/api/users/u-1/sessions', '/api/users/u-1/sessions/s-1', '/api/users/u-1/offline-sessions',
            '/api/users/u-1/offline-sessions/o-9', '/api/users/u-1/credentials/c-1',
        ])
        expect(credentials.map((credential) => credentialTypeLabel(credential.type))).toEqual(['Segundo factor (OTP)', 'Contraseña'])
        expect(credentials.map(isPasswordCredential)).toEqual([false, true])
        expect(credentialTypeLabel('recovery-authn-codes')).toBe('recovery-authn-codes')
        expect(credentialTypeLabel(null)).toBe('')
    })

    it('cerrar una sesión que no es de esa persona es un 404 SES-404, que se lee por sus alias y se dice así', async () => {
        useToken()
        server.use(http.delete('/api/users/u-1/sessions/s-9', () => HttpResponse.json(
            {status: 404, title: 'Not Found', detail: 'Session s-9 not found for user u-1', errorCode: 'SES-404', correlationId: 'corr-ses'},
            {status: 404, headers: {'Content-Type': 'application/problem+json'}},
        )))

        const error = await failure(revokeSession('u-1', 's-9'))

        expect(error).toBeInstanceOf(NotFoundError)
        expect(error.code).toBe('SES-404')
        expect(error.reference).toBe('corr-ses')
        expect(errorMessage(error)).toBe('Esa sesión ya no existe o no es de este usuario.')
    })

    it('los roles de cliente: añadir es un PUT con {roles}, quitar un DELETE con el mismo cuerpo, y los dos devuelven cómo quedan', async () => {
        useToken()
        const puts = record('put', '/api/users/u-1/roles/clients/mto-users-api', () => HttpResponse.json(ROLES))
        const deletes = record('delete', '/api/users/u-1/roles/clients/mto-users-api', () => HttpResponse.json({realmRoles: ['mto-users-viewer']}))
        server.use(http.get('/api/users/u-1/roles', () => HttpResponse.json(ROLES)))

        const added = await addClientRoles('u-1', 'mto-users-api', ['users-write'])
        const removed = await removeClientRoles('u-1', 'mto-users-api', ['users-read'])
        const current = await getUserRoles('u-1')

        expect(json(puts[0])).toEqual({roles: ['users-write']})
        expect(deletes[0].headers.get('content-type')).toBe('application/json')
        expect(json(deletes[0])).toEqual({roles: ['users-read']})
        expect(added).toEqual(ROLES)
        expect(removed).toEqual({realmRoles: ['mto-users-viewer'], clientRoles: []})
        expect(current).toEqual(ROLES)
        expect(toUserRoles({clientRoles: [{clientId: 'x'}]})).toEqual({realmRoles: [], clientRoles: [{clientId: 'x', roles: []}]})
    })

    it('los perfiles: asignar es un PUT sin cuerpo y quitar un DELETE; los dos devuelven los perfiles de la persona', async () => {
        useToken()
        const PROFILES = [{name: 'mto-users-viewer', description: 'Lectura'}]
        const puts = record('put', '/api/users/u-1/profiles/mto-users-viewer', () => HttpResponse.json(PROFILES))
        const deletes = record('delete', '/api/users/u-1/profiles/mto-users-viewer', () => HttpResponse.json([]))
        server.use(http.get('/api/users/u-1/profiles', () => HttpResponse.json(PROFILES)))

        await expect(assignProfile('u-1', 'mto-users-viewer')).resolves.toEqual(PROFILES)
        await expect(removeProfile('u-1', 'mto-users-viewer')).resolves.toEqual([])
        await expect(getUserProfiles('u-1')).resolves.toEqual(PROFILES)

        expect(puts[0].body).toBe('')
        expect(puts[0].headers.get('content-type')).toBeNull()
        expect(deletes[0].body).toBe('')
    })

    it('los catálogos de clientes, roles y perfiles se leen tal cual; sus miembros son listas sin total, con first y max', async () => {
        useToken()
        server.use(
            http.get('/api/users/roles/clients', () => HttpResponse.json([
                {clientId: 'mto-users-api', name: '', description: 'Usuarios'},
                {clientId: 'mto-configuration-api', name: 'Configuración', description: null},
            ])),
            http.get('/api/users/roles/clients/mto-users-api', () => HttpResponse.json([{name: 'users-read', description: 'Consulta', composite: false}])),
            http.get('/api/users/profiles', () => HttpResponse.json([{name: 'mto-users-admin', description: 'Todo'}])),
            http.get('/api/users/profiles/mto-users-admin', () => HttpResponse.json({
                name: 'mto-users-admin', description: 'Todo', clientRoles: [{clientId: 'mto-users-api', roles: ['users-read', 'users-delete']}],
                realmRoles: null,
            })),
        )
        const roleMembers = record('get', '/api/users/roles/clients/mto-users-api/users-read/users', () => HttpResponse.json([ANA]))
        const profileMembers = record('get', '/api/users/profiles/mto-users-admin/users', () => HttpResponse.json([]))

        const clients = await listClients()
        await expect(listClientRoles('mto-users-api')).resolves.toEqual([{name: 'users-read', description: 'Consulta', composite: false}])
        await expect(listProfiles()).resolves.toEqual([{name: 'mto-users-admin', description: 'Todo'}])
        const admin = await getProfile('mto-users-admin')
        const holders = await listClientRoleMembers('mto-users-api', 'users-read')
        await expect(listProfileMembers('mto-users-admin', {first: 50, max: 50})).resolves.toEqual([])

        expect(clients.map(clientLabel)).toEqual(['mto-users-api', 'Configuración'])
        expect(admin).toEqual({
            name: 'mto-users-admin', description: 'Todo', realmRoles: [],
            clientRoles: [{clientId: 'mto-users-api', roles: ['users-read', 'users-delete']}],
        })
        expect(holders.map((user) => user.username)).toEqual(['ana.nueva'])
        expect(roleMembers[0].url.search).toBe('?first=0&max=50')
        expect(profileMembers[0].url.search).toBe('?first=50&max=50')
    })

    it('sacar a la persona son tres llamadas en este orden; para en la primera que falla y dice cuál, con su error', async () => {
        useToken()
        const calls = []
        const logged = (respond) => async ({request}) => {
            calls.push(`${request.method} ${new URL(request.url).pathname} ${await request.text()}`.trim())
            return respond()
        }
        server.use(
            http.patch('/api/users/:userId/enabled', logged(() => HttpResponse.json({...ANA, enabled: false}))),
            http.delete('/api/users/u-1/sessions', logged(noContent)),
            http.delete('/api/users/:userId/offline-sessions', logged(noContent)),
            http.delete('/api/users/u-2/sessions', logged(() => HttpResponse.json(
                {status: 503, title: 'Service Unavailable', detail: 'Keycloak no responde', errorCode: 'KC-503', correlationId: 'corr-kc'},
                {status: 503, headers: {'Content-Type': 'application/problem+json', 'Retry-After': '10'}},
            ))),
        )

        const out = await takeOut('u-1')
        const halfway = await takeOut('u-2')

        expect(TAKE_OUT_STEPS).toEqual(['disable', 'sessions', 'offline'])
        expect(out).toEqual({done: ['disable', 'sessions', 'offline'], failed: null, error: null})
        expect(calls).toEqual([
            'PATCH /api/users/u-1/enabled {"enabled":false}', 'DELETE /api/users/u-1/sessions', 'DELETE /api/users/u-1/offline-sessions',
            'PATCH /api/users/u-2/enabled {"enabled":false}', 'DELETE /api/users/u-2/sessions',
        ])
        expect(halfway).toMatchObject({done: ['disable'], failed: 'sessions'})
        expect(halfway.error).toBeInstanceOf(UnavailableError)
        expect(halfway.error.code).toBe('KC-503')
        expect(halfway.error.retryAfterSeconds).toBe(10)
        expect(errorMessage(halfway.error)).toBe('El servicio no está disponible ahora mismo. Inténtalo en 10 s.')
    })

    it('una acción requerida se nombra si se conoce; una que el servicio estrene se enseña tal cual y no se ofrece', () => {
        expect(requiredActionLabel('UPDATE_PASSWORD')).toBe('Cambiar la contraseña')
        expect(requiredActionLabel('CUSTOM_ACTION')).toBe('CUSTOM_ACTION')
        expect(requiredActionLabel(null)).toBe('')
        expect(REQUIRED_ACTION.selectable().map((option) => option.value))
            .toEqual(['UPDATE_PASSWORD', 'VERIFY_EMAIL', 'UPDATE_PROFILE', 'CONFIGURE_TOTP', 'TERMS_AND_CONDITIONS'])
    })
})

describe('stock/*.js: el almacén de mto-stock', () => {
    const MAT = '1a2b3c4d-0000-4000-8000-000000000001'
    const WH = '1a2b3c4d-0000-4000-8000-000000000002'
    const WH2 = '1a2b3c4d-0000-4000-8000-000000000003'
    const PRJ = '1a2b3c4d-0000-4000-8000-000000000004'
    const RES = '1a2b3c4d-0000-4000-8000-000000000005'
    const ASM = '1a2b3c4d-0000-4000-8000-000000000006'
    const AUDIT = {createdAt: '2026-09-01T08:00:00Z', updatedAt: '2026-09-02T08:00:00Z', createdBy: 'almacen.responsable', updatedBy: 'almacen.operario'}
    const MATERIAL = {id: MAT, code: 'MAT-001', name: 'Hilo de contacto', unitOfMeasure: 'm', active: true}
    const WAREHOUSE = {id: WH, code: 'WH-001', name: 'Central', active: true}
    const PROJECT = {id: PRJ, code: 'EP-42', name: 'Tramo', active: true}
    const MOVEMENT = {
        id: 'mv-1', type: 'OUTPUT', quantity: 3, signedQuantity: -3, material: MATERIAL, warehouse: WAREHOUSE, supplier: null,
        project: PROJECT, reservation: null, relatedMovement: null, occurredAt: '2026-09-10T10:00:00Z', externalReference: 'OT-7',
        notes: null, audit: AUDIT,
    }
    const page = (content, {number = 0, size = 50, totalElements = content.length} = {}) => ({
        content, page: {number, size, totalElements, totalPages: Math.ceil(totalElements / size), first: number === 0, last: true},
    })
    const json = (request) => JSON.parse(request.body)
    const created = (body) => HttpResponse.json(body, {status: 201, headers: {Location: '/api/v1/inventory/x/1'}})

    it('un catálogo pide search, active y el Pageable de Spring (desde 0), siempre con su orden y el id para desempatar', async () => {
        useToken()
        const warehouses = record('get', '/api/stock/warehouses', () => HttpResponse.json(page([{...WAREHOUSE, audit: AUDIT}],
            {number: 1, size: 20, totalElements: 21})))
        const suppliers = record('get', '/api/stock/suppliers', () => HttpResponse.json(page([])))

        const central = await searchCatalogue('warehouses', {search: ' cen ', active: true, page: 2, size: 20})
        await searchCatalogue('suppliers', {active: false, sort: {field: 'name', direction: 'desc'}})
        await searchCatalogue('suppliers', {search: '   '})

        expect(warehouses[0].headers.get('authorization')).toBe('Bearer token-1')
        expect(warehouses[0].url.search).toBe('?search=cen&active=true&page=1&size=20&sort=code%2Casc&sort=id%2Casc')
        expect(suppliers.map((request) => request.url.search)).toEqual([
            '?active=false&page=0&size=50&sort=name%2Cdesc&sort=id%2Casc',
            '?page=0&size=50&sort=code%2Casc&sort=id%2Casc',
        ])
        expect(central).toMatchObject({number: 1, size: 20, totalElements: 21, totalPages: 2})
        expect(central.content[0].audit.updatedBy).toBe('almacen.operario')
        await expect(searchCatalogue('movements')).rejects.toThrow(/desconocido: movements/)
    })

    it('el alta no lleva active y la modificación sí, porque su PUT es completo; un proyecto sincronizado es de mto-configuration', async () => {
        useToken()
        const supplierPosts = record('post', '/api/stock/suppliers', () => created({id: 'sup-1', code: 'SUP-001', name: 'Rail Supplier', active: true}))
        const projectPuts = record('put', '/api/stock/projects/:id', () => HttpResponse.json({...PROJECT, code: 'PRJ-001', name: 'Renovación',
            active: false, sourceService: null, synchronizedFromMasterData: false}))
        const projectReads = record('get', '/api/stock/projects/:id', () => HttpResponse.json({...PROJECT, sourceService: 'mto-configuration',
            synchronizedFromMasterData: true, newTomorrow: 1}))
        const materialPosts = record('post', '/api/stock/materials', () => created({...MATERIAL, minimumStockLevel: 100}))
        const materialPuts = record('put', '/api/stock/materials/:id', () => HttpResponse.json({...MATERIAL, active: false}))

        const supplier = await createCatalogueEntry('suppliers', catalogueEntryBody({code: ' SUP-001 ', name: 'Rail Supplier ', active: false},
            {creating: true}))
        const retired = await updateCatalogueEntry('projects', PRJ, catalogueEntryBody({code: 'PRJ-001', name: 'Renovación', active: false},
            {creating: false}))
        const synchronizedProject = await getCatalogueEntry('projects', RES)
        await createCatalogueEntry('materials', materialBody({code: 'MAT-001', name: 'Hilo de contacto', unitOfMeasure: ' m ',
            minimumStockLevel: '100', active: true}, {creating: true}))
        await updateCatalogueEntry('materials', MAT, materialBody({code: 'MAT-001', name: 'Hilo de contacto', unitOfMeasure: 'm',
            minimumStockLevel: '12.5', active: false}, {creating: false}))

        expect(json(supplierPosts[0])).toEqual({code: 'SUP-001', name: 'Rail Supplier'})
        expect(supplier).toMatchObject({id: 'sup-1', active: true})
        expect(projectPuts[0].url.pathname).toBe(`/api/stock/projects/${PRJ}`)
        expect(json(projectPuts[0])).toEqual({code: 'PRJ-001', name: 'Renovación', active: false})
        expect(projectReads[0].url.pathname).toBe(`/api/stock/projects/${RES}`)
        expect([retired, synchronizedProject].map(isSynchronizedProject)).toEqual([false, true])
        expect(synchronizedProject.sourceService).toBe('mto-configuration')
        expect(json(materialPosts[0])).toEqual({code: 'MAT-001', name: 'Hilo de contacto', unitOfMeasure: 'm', minimumStockLevel: 100})
        expect(json(materialPuts[0])).toEqual({code: 'MAT-001', name: 'Hilo de contacto', unitOfMeasure: 'm', minimumStockLevel: 12.5,
            active: false})
    })

    it('las existencias: materiales por almacén y bajo mínimo, la lista bajo mínimo, las cifras de un material y su libro', async () => {
        useToken()
        const materials = record('get', '/api/stock/materials', () => HttpResponse.json(page([])))
        const lowStock = record('get', '/api/stock/materials/low-stock', () => HttpResponse.json(page([{...MATERIAL, minimumStockLevel: 100}])))
        const figures = record('get', '/api/stock/materials/:id/stock', () => HttpResponse.json({
            material: MATERIAL, warehouse: WAREHOUSE, onHandQuantity: 12.5, activeReservedQuantity: 2, availableQuantity: 10.5,
            minimumStockLevel: 100, lowStock: true, calculatedAt: '2026-09-21T10:00:00Z',
        }))
        const ledger = record('get', '/api/stock/materials/:id/movements', () => HttpResponse.json(page([MOVEMENT])))

        await searchCatalogue('materials', {search: 'hilo', active: true, warehouseId: WH, belowMinimum: true, size: 20})
        await searchCatalogue('materials', {belowMinimum: false})
        const below = await listLowStock({size: 20})
        await listLowStock({warehouseId: WH})
        const stock = await getMaterialStock(MAT, {warehouseId: WH})
        await getMaterialStock(MAT)
        const movements = await listMaterialMovements(MAT, {fromDay: '2026-09-01', size: 20})

        expect(materials.map((request) => request.url.search)).toEqual([
            `?search=hilo&active=true&warehouseId=${WH}&belowMinimum=true&page=0&size=20&sort=code%2Casc&sort=id%2Casc`,
            '?page=0&size=50&sort=code%2Casc&sort=id%2Casc',
        ])
        expect(lowStock.map((request) => request.url.search)).toEqual([
            '?page=0&size=20&sort=code%2Casc&sort=id%2Casc',
            `?warehouseId=${WH}&page=0&size=50&sort=code%2Casc&sort=id%2Casc`,
        ])
        expect(below.content[0].minimumStockLevel).toBe(100)
        expect(figures.map((request) => request.url.pathname + request.url.search))
            .toEqual([`/api/stock/materials/${MAT}/stock?warehouseId=${WH}`, `/api/stock/materials/${MAT}/stock`])
        expect(stock).toMatchObject({availableQuantity: 10.5, activeReservedQuantity: 2, lowStock: true, warehouse: {code: 'WH-001'}})
        expect(ledger[0].url.searchParams.get('dateFrom')).toBe(new Date(2026, 8, 1).toISOString())
        expect(ledger[0].url.searchParams.has('dateTo')).toBe(false)
        expect(ledger[0].url.searchParams.has('user')).toBe(false)
        expect(ledger[0].url.searchParams.getAll('sort')).toEqual(['occurredAt,desc', 'id,asc'])
        expect(movements.content[0]).toMatchObject({type: 'OUTPUT', signedQuantity: -3, project: {code: 'EP-42'}, supplier: null})
        expect(MOVEMENT_TYPE.label(movements.content[0].type)).toBe('Salida')
    })

    it('el libro entero pide el tipo como movementType, los días enteros y quién lo registró, y sin columna lo último primero', async () => {
        useToken()
        const searches = record('get', '/api/stock/movements', () => HttpResponse.json(page([MOVEMENT])))

        await searchMovements({
            type: 'ENTRY', warehouseId: WH, projectId: PRJ, materialId: MAT, fromDay: '2026-09-01', toDay: '2026-09-30', user: ' ana ',
            page: 3, size: 20, sort: {field: 'quantity', direction: 'asc'},
        })
        await searchMovements()

        const filters = searches[0].url.searchParams
        expect(Object.fromEntries(['movementType', 'warehouseId', 'projectId', 'materialId', 'user', 'page', 'size']
            .map((name) => [name, filters.get(name)])))
            .toEqual({movementType: 'ENTRY', warehouseId: WH, projectId: PRJ, materialId: MAT, user: 'ana', page: '2', size: '20'})
        expect(filters.get('dateFrom')).toBe(new Date(2026, 8, 1).toISOString())
        expect(filters.get('dateTo')).toBe(new Date(new Date(2026, 9, 1).getTime() - 1).toISOString())
        expect(filters.getAll('sort')).toEqual(['quantity,asc', 'id,asc'])
        expect(searches[1].url.search).toBe('?page=0&size=50&sort=occurredAt%2Cdesc&sort=id%2Casc')
    })

    it('cada movimiento va a su ruta con lo escrito: lo vacío no viaja, la fecha va en UTC y una transferencia devuelve sus dos apuntes', async () => {
        useToken()
        const entries = record('post', '/api/stock/movements/entries', () => created({...MOVEMENT, type: 'ENTRY', quantity: 10, signedQuantity: 10}))
        const outputs = record('post', '/api/stock/movements/outputs', () => created(MOVEMENT))
        const adjustments = record('post', '/api/stock/movements/adjustments', () => created({...MOVEMENT, type: 'NEGATIVE_ADJUSTMENT'}))
        const transfers = record('post', '/api/stock/movements/transfers', () => created([
            {...MOVEMENT, type: 'OUTGOING_TRANSFER'},
            {...MOVEMENT, id: 'mv-2', type: 'INCOMING_TRANSFER', signedQuantity: 3, relatedMovement: {id: 'mv-1', type: 'OUTGOING_TRANSFER'}},
        ]))

        const entered = await registerEntry(entryRequest({materialId: MAT, warehouseId: WH, quantity: '10', externalReference: '  ', notes: ''}))
        await registerOutput(outputRequest({
            materialId: MAT, warehouseId: WH, projectId: PRJ, reservationId: RES, quantity: '3', externalReference: ' OT-7 ',
            occurredAt: '2026-09-10 08:30:00',
        }))
        await registerAdjustment(adjustmentRequest({materialId: MAT, warehouseId: WH, direction: 'NEGATIVE', quantity: '1', notes: 'Rotura'}))
        const transferred = await registerTransfer(transferRequest({materialId: MAT, warehouseId: WH, targetWarehouseId: WH2, quantity: '3'}))

        expect(json(entries[0])).toEqual({materialId: MAT, warehouseId: WH, quantity: 10})
        expect(entered.signedQuantity).toBe(10)
        expect(json(outputs[0])).toEqual({
            materialId: MAT, warehouseId: WH, projectId: PRJ, reservationId: RES, quantity: 3,
            occurredAt: new Date(2026, 8, 10, 8, 30).toISOString(), externalReference: 'OT-7',
        })
        expect(json(adjustments[0])).toEqual({materialId: MAT, warehouseId: WH, direction: 'NEGATIVE', quantity: 1, notes: 'Rotura'})
        expect(json(transfers[0])).toEqual({materialId: MAT, sourceWarehouseId: WH, targetWarehouseId: WH2, quantity: 3})
        expect(transferred.map((movement) => movement.type)).toEqual(['OUTGOING_TRANSFER', 'INCOMING_TRANSFER'])
        expect(transferred[1].relatedMovement.type).toBe('OUTGOING_TRANSFER')
        expect(() => adjustmentRequest({materialId: MAT, warehouseId: WH, direction: 'SIDEWAYS', quantity: '1'})).toThrow(/Sentido/)
        expect(ADJUSTMENT_DIRECTIONS.map((direction) => direction.value)).toEqual(['POSITIVE', 'NEGATIVE'])
    })

    it('una reserva: el alta, la modificación sin material, cancelar con un DELETE que la devuelve, y liberar y consumir con POST sin cuerpo', async () => {
        useToken()
        const reservation = (status, releasedAt = null) => ({
            id: RES, material: MATERIAL, warehouse: WAREHOUSE, project: PROJECT, quantity: 2, status, reservedAt: '2026-09-10T10:00:00Z',
            releasedAt, active: status === 'ACTIVE', audit: AUDIT,
        })
        const posts = record('post', '/api/stock/reservations', () => created(reservation('ACTIVE')))
        const puts = record('put', '/api/stock/reservations/:id', () => HttpResponse.json({...reservation('ACTIVE'), quantity: 3}))
        const deletes = record('delete', '/api/stock/reservations/:id', () => HttpResponse.json(reservation('CANCELLED', '2026-09-11T10:00:00Z')))
        const releases = record('post', '/api/stock/reservations/:id/release', () => HttpResponse.json(reservation('RELEASED', '2026-09-11T10:00:00Z')))
        const consumes = record('post', '/api/stock/reservations/:id/consume', () => HttpResponse.json(reservation('CONSUMED', '2026-09-11T10:00:00Z')))
        const searches = record('get', '/api/stock/reservations', () => HttpResponse.json(page([reservation('ACTIVE')], {size: 20})))

        const reserved = await createReservation(reservationRequest({materialId: MAT, warehouseId: WH, projectId: PRJ, quantity: '2'}))
        await createReservation(reservationRequest({materialId: MAT, warehouseId: WH, projectId: PRJ, quantity: '2', reservedAt: '2026-09-10 12:00:00'}))
        const updated = await updateReservation(RES, reservationUpdateRequest({warehouseId: WH2, projectId: PRJ, quantity: '3'}))
        const cancelled = await cancelReservation(RES)
        const released = await releaseReservation(RES)
        const consumed = await consumeReservation(RES)
        const active = await searchReservations({warehouseId: WH, status: 'ACTIVE', size: 20})
        await searchReservations({sort: {field: 'status', direction: 'desc'}})

        expect(json(posts[0])).toEqual({materialId: MAT, warehouseId: WH, projectId: PRJ, quantity: 2})
        expect(json(posts[1]).reservedAt).toBe(new Date(2026, 8, 10, 12).toISOString())
        expect(json(puts[0])).toEqual({warehouseId: WH2, projectId: PRJ, quantity: 3})
        expect([deletes, releases, consumes].map((requests) => [requests[0].url.pathname, requests[0].body])).toEqual([
            [`/api/stock/reservations/${RES}`, ''],
            [`/api/stock/reservations/${RES}/release`, ''],
            [`/api/stock/reservations/${RES}/consume`, ''],
        ])
        expect([reserved, updated, cancelled, released, consumed].map((result) => result.status))
            .toEqual(['ACTIVE', 'ACTIVE', 'CANCELLED', 'RELEASED', 'CONSUMED'])
        expect([reserved, cancelled, released, consumed].map(isActiveReservation)).toEqual([true, false, false, false])
        expect(searches.map((request) => request.url.search)).toEqual([
            `?warehouseId=${WH}&status=ACTIVE&page=0&size=20&sort=reservedAt%2Cdesc&sort=id%2Casc`,
            '?page=0&size=50&sort=status%2Cdesc&sort=id%2Casc',
        ])
        expect(active.content[0].material.name).toBe('Hilo de contacto')
    })

    it('un conjunto lleva su lista de materiales entera; su disponibilidad se pide en un almacén y marca el componente que limita', async () => {
        useToken()
        const assembly = {
            id: ASM, code: 'ASM-001', name: 'Ménsula', active: true, components: [{id: 'c-1', material: MATERIAL, quantity: 2, audit: AUDIT}],
            audit: AUDIT,
        }
        const posts = record('post', '/api/stock/assemblies', () => created(assembly))
        const puts = record('put', '/api/stock/assemblies/:id', () => HttpResponse.json(assembly))
        const availability = record('get', '/api/stock/assemblies/:id/availability', () => HttpResponse.json({
            assembly: {id: ASM, code: 'ASM-001', name: 'Ménsula', active: true}, warehouse: WAREHOUSE, availableQuantity: 5,
            components: [{
                material: MATERIAL, requiredQuantityPerAssembly: 2, onHandQuantity: 12, activeReservedQuantity: 2, availableQuantity: 10,
                producibleAssemblyQuantity: 5, limitingComponent: true,
            }],
            calculatedAt: '2026-09-21T10:00:00Z',
        }))

        const made = await createCatalogueEntry('assemblies', assemblyBody({code: 'ASM-001', name: 'Ménsula'}, [{materialId: MAT, quantity: '2'}],
            {creating: true}))
        await updateCatalogueEntry('assemblies', ASM, assemblyBody({code: 'ASM-001', name: 'Ménsula', active: true},
            [{materialId: MAT, quantity: '2.5'}, {materialId: 'm-2', quantity: 4}], {creating: false}))
        const result = await getAssemblyAvailability(made.id, WH)

        expect(json(posts[0])).toEqual({code: 'ASM-001', name: 'Ménsula', components: [{materialId: MAT, quantity: 2}]})
        expect(json(puts[0])).toEqual({code: 'ASM-001', name: 'Ménsula', active: true,
            components: [{materialId: MAT, quantity: 2.5}, {materialId: 'm-2', quantity: 4}]})
        expect(availability[0].url.pathname + availability[0].url.search).toBe(`/api/stock/assemblies/${ASM}/availability?warehouseId=${WH}`)
        expect(result).toMatchObject({availableQuantity: 5, warehouse: {name: 'Central'}})
        expect(result.components[0].limitingComponent).toBe(true)
        expect(() => getAssemblyAvailability(ASM, null)).toThrow(/almacen/)
        expect(availability).toHaveLength(1)
    })

    it('el historial de una fila pide page y size sin sort, la más reciente primero; sin revisiones es un 404', async () => {
        useToken()
        const revision = {
            revision: {revision: 3, revisionAt: '2026-09-02T08:00:00Z', operation: 'UPDATED', author: 'almacen.operario', source: 'HTTP', correlationId: 'c-1'},
            entity: {...MATERIAL, minimumStockLevel: 100, audit: {createdAt: null, updatedAt: null, createdBy: null, updatedBy: null}},
        }
        const materialRevisions = record('get', '/api/stock/materials/:id/revisions', () => HttpResponse.json(page([revision],
            {size: 10, totalElements: 3})))
        const reservationRevisions = record('get', '/api/stock/reservations/:id/revisions', () => HttpResponse.json({
            status: 404, error: 'NOT_FOUND', message: `No revisions found for reservation ${RES}`, errorCode: 'RES-404', validationErrors: [],
        }, {status: 404}))

        const history = await listRevisions(catalogueRevisionsPath('materials', MAT), {page: 1, size: 10})
        const none = await failure(listRevisions(reservationRevisionsPath(RES)))

        expect(materialRevisions[0].url.search).toBe('?page=0&size=10')
        expect(history.totalElements).toBe(3)
        expect(history.content[0].revision).toMatchObject({revision: 3, operation: 'UPDATED', author: 'almacen.operario', source: 'HTTP'})
        expect(REVISION_OPERATION.label(history.content[0].revision.operation)).toBe('Modificación')
        expect(reservationRevisions[0].url.pathname).toBe(`/api/stock/reservations/${RES}/revisions`)
        expect(reservationRevisions[0].url.searchParams.get('size')).toBe(String(REVISIONS_PAGE_SIZE))
        expect(none).toBeInstanceOf(NotFoundError)
        expect(catalogueRevisionsPath('assemblies', ASM)).toBe(`/api/stock/assemblies/${ASM}/revisions`)
    })

    it('un valor que mto-stock estrene se lee como «Desconocido», no se ofrece y una reserva desconocida no está activa', async () => {
        useToken()
        record('get', '/api/stock/movements', () => HttpResponse.json(page([MOVEMENT, {...MOVEMENT, id: 'mv-9', type: 'RETURN_TO_SUPPLIER'}])))

        const ledger = await searchMovements()

        expect(ledger.content.map((movement) => movement.type)).toEqual(['OUTPUT', 'RETURN_TO_SUPPLIER'])
        expect(ledger.content.map((movement) => MOVEMENT_TYPE.label(movement.type))).toEqual(['Salida', 'Desconocido'])
        expect(MOVEMENT_TYPE.parse('RETURN_TO_SUPPLIER')).toBe(UNKNOWN)
        expect(MOVEMENT_TYPE.selectable().map((option) => option.value)).toEqual(['ENTRY', 'OUTPUT', 'POSITIVE_ADJUSTMENT',
            'NEGATIVE_ADJUSTMENT', 'INCOMING_TRANSFER', 'OUTGOING_TRANSFER'])
        expect(RESERVATION_STATUS.label('EXPIRED')).toBe('Desconocido')
        expect(isActiveReservation({status: 'EXPIRED', active: true})).toBe(false)
        expect(isActiveReservation(null)).toBe(false)
        expect(RESERVATION_STATUS.selectable().map((option) => option.value)).toEqual(['ACTIVE', 'RELEASED', 'CONSUMED', 'CANCELLED'])
        expect(REVISION_OPERATION.label('RESTORED')).toBe('Desconocido')
        expect(REVISION_OPERATION.selectable().map((option) => option.value)).toEqual(['CREATED', 'UPDATED', 'DELETED'])
    })

    it('el JSON de error de mto-stock se lee por sus alias, y cada código se dice como en el backoffice', async () => {
        useToken()
        record('post', '/api/stock/materials', () => HttpResponse.json({
            timestamp: '2026-09-21T10:00:00Z', status: 400, error: 'BAD_REQUEST', message: 'Request validation failed.',
            path: '/api/v1/inventory/materials', method: 'POST', errorCode: 'REQ-VALIDATION', correlationId: 'corr-s1',
            validationErrors: [{field: 'code', message: 'must not be blank'}],
        }, {status: 400, headers: {'X-Correlation-Id': 'corr-s1'}}))
        record('post', '/api/stock/movements/outputs', () => HttpResponse.json({
            status: 409, error: 'CONFLICT', message: `Insufficient stock for material ${MAT} in warehouse ${WH}: requested 5, available 2`,
            errorCode: 'STK-001', correlationId: null, validationErrors: [],
        }, {status: 409}))
        record('post', '/api/stock/reservations/:id/release', () => HttpResponse.json({
            status: 422, error: 'UNPROCESSABLE_CONTENT', message: 'Only active reservations can be changed', errorCode: 'RES-001', validationErrors: [],
        }, {status: 422}))
        record('post', '/api/stock/suppliers', () => HttpResponse.json({
            status: 409, error: 'CONFLICT', message: 'Supplier code already exists: SUP-001', errorCode: 'SUP-409', validationErrors: [],
        }, {status: 409}))

        const validation = await failure(createCatalogueEntry('materials', {code: '', name: 'Hilo', unitOfMeasure: 'm', minimumStockLevel: 1}))
        const insufficient = await failure(registerOutput({materialId: MAT, warehouseId: WH, quantity: 5}))
        const rule = await failure(releaseReservation(RES))
        const repeated = await failure(createCatalogueEntry('suppliers', {code: 'SUP-001', name: 'Otro'}))

        expect(validation).toBeInstanceOf(ValidationError)
        expect(validation).toMatchObject({status: 400, code: 'REQ-VALIDATION', reference: 'corr-s1'})
        expect(validation.problem).toMatchObject({title: 'BAD_REQUEST', detail: 'Request validation failed.'})
        expect(validation.fieldErrors).toEqual([{field: 'code', code: null, message: 'must not be blank'}])
        expect(insufficient).toBeInstanceOf(ConflictError)
        expect(errorMessage(insufficient)).toMatch(/^No hay stock disponible suficiente\. .*requested 5, available 2$/)
        expect(rule).toBeInstanceOf(ValidationError)
        expect(rule).toMatchObject({status: 422, code: 'RES-001'})
        expect(errorMessage(rule)).toBe('La operación no es posible. Only active reservations can be changed')
        expect(errorMessage(repeated)).toBe('Ya existe otro con ese código.')
    })

    it('cómo se nombra una referencia y cómo viajan una cantidad y un texto opcional', () => {
        expect(codeAndName('MAT-001', 'Hilo')).toBe('MAT-001 - Hilo')
        expect(codeAndName('MAT-001', ' ')).toBe('MAT-001')
        expect(codeAndName(null, 'Hilo')).toBe('Hilo')
        expect(referenceLabel(null)).toBe('')
        expect(summaryOf({...MATERIAL, minimumStockLevel: 100, audit: AUDIT})).toEqual(MATERIAL)
        expect(summaryOf({...WAREHOUSE, audit: AUDIT})).toEqual(WAREHOUSE)
        expect([toQuantity(' 12.5 '), toQuantity(''), toQuantity(null), toQuantity(3)]).toEqual([12.5, null, null, 3])
        expect([textOrNull('  '), textOrNull(' OT-7 '), textOrNull(null)]).toEqual([null, 'OT-7', null])
        expect(withoutNulls({a: 1, b: null, c: undefined, d: false, e: 0})).toEqual({a: 1, d: false, e: 0})
    })
})
