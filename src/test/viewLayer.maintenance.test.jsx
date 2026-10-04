import {screen, waitFor, within} from '@testing-library/react'
import {http, HttpResponse} from 'msw'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {endOfDayInstant, startOfDayInstant} from '../api/dates.js'
import {buildMenu} from '../app/navigation.js'
import {P} from '../auth/permissions.js'
import {formatDateTime} from '../ui/format.js'
import {renderRoute} from './render.jsx'
import {server} from './server.js'
import {loginAs, sessionWith} from './session.js'

/**
 * Las pantallas de mantenimiento (mantenimiento/*) con los casos de mantenimiento de ViewLayerTest del
 * backoffice, contra un mto-maintenance simulado que filtra, ordena y pagina como el de verdad, y con
 * los nombres de mto-configuration y mto-stock pedidos solo con su permiso de lectura.
 */

const BASE = '/api/maintenance'
const CONFIGURATION = '/api/configuration'
const STOCK = '/api/stock'

const ASSET_SYNCED = '3c3c3c3c-0000-4000-8000-000000000001'
const ASSET_OWN = '3c3c3c3c-0000-4000-8000-000000000002'
const ASSET_OWN_OFF = '3c3c3c3c-0000-4000-8000-000000000003'
const ASSET_OFF_HERE = '3c3c3c3c-0000-4000-8000-000000000004'
const ASSET_OFF_AT_SOURCE = '3c3c3c3c-0000-4000-8000-000000000005'
const ASSET_OFF_BOTH = '3c3c3c3c-0000-4000-8000-000000000006'
const TEAM1 = '3c3c3c3c-0000-4000-8000-000000000011'
const ORDER1 = '3c3c3c3c-0000-4000-8000-000000000012'

const MERGE_PATCH = 'application/merge-patch+json'

/** Un perfil de mto-configuration: activo solo si el origen lo tiene activo y aquí nadie lo desactivó. */
function syncedProfile({id = ASSET_SYNCED, code = 'PRF-0001', enabledAtSource = true, disabledLocally = false} = {}) {
    return {
        id, code, name: '12-2.27', type: 'PROFILE', description: null, executionPackageId: 3, trackId: 12, stationId: 4,
        startKp: 12.27, endKp: 12.27, profileSourceId: '501', sectioning: 'S-3', trackKind: null, connectedTrackId: null,
        installationType: null, switches: [], sourceService: 'mto-configuration', sourceEntityId: '501',
        enabled: enabledAtSource && !disabledLocally, enabledAtSource, disabledLocally, preventiveIntervalDays: 180,
        lastPreventiveCompletedAt: null, nextPreventiveDueAt: '2026-10-01T00:00:00Z', audit: null, version: 7,
    }
}

function ownSection(id, code, enabled) {
    return {
        id, code, name: `Tramo ${code}`, type: 'TRACK_SECTION', description: 'Tramo propio', executionPackageId: 3, trackId: 12,
        stationId: null, startKp: 12.1, endKp: 13.45, profileSourceId: null, sectioning: null, trackKind: 'MAIN', connectedTrackId: null,
        installationType: null, switches: [], sourceService: null, sourceEntityId: null, enabled, enabledAtSource: null,
        disabledLocally: !enabled, preventiveIntervalDays: null, lastPreventiveCompletedAt: null, nextPreventiveDueAt: null, audit: null,
        version: 1,
    }
}

const TEAM_SUMMARY = Object.freeze({id: TEAM1, code: 'EQ-01', name: 'Brigada norte', baseName: 'Base Norte'})

/** Una orden como la del backoffice: un preventivo sobre un tramo propio de la vía 12, con su equipo. */
function order(extra = {}) {
    return {
        id: ORDER1, code: 'MO-000001', title: 'Revisión tramo 12', description: null, type: 'PREVENTIVE', status: 'PLANNED', priority: 'HIGH',
        asset: {id: ASSET_OWN, code: 'TS-0001', name: 'Tramo 12', type: 'TRACK_SECTION', trackId: 12, startKp: 12.1, endKp: 13.45,
            sectioning: null, enabled: true},
        executionPackageId: 3, trackId: 12, stationId: null, startKp: 12.1, endKp: 13.45, plannedDate: '2026-09-14', actualStartDate: null,
        actualEndDate: null, team: TEAM_SUMMARY, assignedUser: 'mantenimiento.tecnico', closingNotes: null, cancellationReason: null,
        originInspectionId: null, originDefectId: null, stockProjectId: null, taskCount: 10, completedTaskCount: 3, estimatedMinutes: 450,
        estimatedShifts: 2, audit: null, version: 3, ...extra,
    }
}

function revision(number, operation, author, source, entity) {
    return {
        revision: {revision: number, revisionAt: `2026-09-0${number}T10:00:00Z`, operation, author, source, correlationId: `corr-${number}`},
        entity,
    }
}

/** El JSON de error de mto-maintenance, el mismo que el de mto-stock: no es problem+json. */
function maintenanceError(status, errorCode, message, validationErrors = []) {
    return HttpResponse.json({
        timestamp: '2026-09-21T10:00:00Z', status, error: 'ERROR', message, path: '/api/v1/maintenance', method: 'POST', errorCode,
        correlationId: `corr-${errorCode}`, validationErrors,
    }, {status})
}

function pageOf(rows, url) {
    const number = Number(url.searchParams.get('page') ?? 0)
    const size = Number(url.searchParams.get('size') ?? 20)
    return {
        content: rows.slice(number * size, number * size + size),
        page: {number, size, totalElements: rows.length, totalPages: Math.ceil(rows.length / size), first: number === 0,
            last: (number + 1) * size >= rows.length},
    }
}

/** Ordena como Spring: por cada sort que llega, en su orden, hasta que uno distinga. */
function sorted(rows, url) {
    const orders = url.searchParams.getAll('sort').map((sort) => sort.split(','))
    return [...rows].sort((a, b) => {
        for (const [field, direction] of orders) {
            const left = a[field]
            const right = b[field]
            const compared = typeof left === 'string' ? left.localeCompare(right) : Number(left ?? 0) - Number(right ?? 0)
            if (compared !== 0) {
                return direction === 'desc' ? -compared : compared
            }
        }
        return 0
    })
}

const has = (url, name) => url.searchParams.has(name)
const param = (url, name) => url.searchParams.get(name)

/** Las vías, estaciones y paquetes de mto-configuration, como los pide useReferenceCatalog. */
function serveConfiguration(requests) {
    const lists = {
        'execution-packages': [{id: 3, name: 'PAQ NORTE'}, {id: 5, name: 'PAQ SUR'}],
        tracks: [{id: 12, name: 'VIA 1', executionPackageId: 3}, {id: 14, name: 'VIA 2', executionPackageId: 3}],
        stations: [{id: 4, name: 'Sants', executionPackageId: 3}],
    }
    for (const [path, rows] of Object.entries(lists)) {
        server.use(http.post(`${CONFIGURATION}/${path}/filter`, ({request}) => {
            const url = new URL(request.url)
            requests.push(url)
            return HttpResponse.json(pageOf(rows, url))
        }))
    }
}

/**
 * Los catálogos de mto-stock que nombran lo que mantenimiento solo guarda como id: la búsqueda de un
 * desplegable (por código o nombre, y por activo) y la lectura de una entrada.
 */
function serveStock(requests, {materials = [], warehouses = [], projects = []} = {}) {
    for (const [catalogue, rows] of Object.entries({materials, warehouses, projects})) {
        server.use(
            http.get(`${STOCK}/${catalogue}`, ({request}) => {
                const url = new URL(request.url)
                requests.push(url)
                const search = (param(url, 'search') ?? '').toLowerCase()
                const found = rows.filter((row) => (!has(url, 'active') || String(row.active) === param(url, 'active'))
                    && (!search || `${row.code} ${row.name}`.toLowerCase().includes(search)))
                return HttpResponse.json(pageOf(found, url))
            }),
            http.get(`${STOCK}/${catalogue}/:id`, ({request, params}) => {
                requests.push(new URL(request.url))
                const found = rows.find((row) => row.id === params.id)
                return found ? HttpResponse.json(found) : HttpResponse.json({status: 404, error: 'Not Found', message: `${params.id} was not found`},
                    {status: 404})
            }),
        )
    }
}

/**
 * mto-maintenance en el gateway simulado: los activos filtran por lo que reciben, ordenan por los sort
 * que llegan y paginan; los catálogos llegan enteros. Sin revisiones, el historial es un 404. Las
 * líneas de material de una orden son una lista o, si cambian entre lecturas, una función del número
 * de lectura. Apunta cada lectura, también las de mto-configuration y mto-stock.
 */
function serveMaintenance({
    assets = [], teams = [], taskTypes = [], templates = [], assetOrders = {}, revisions = {}, orders = [], tasks = {}, history = {},
    materials = {}, stock = {}, shifts = [], shiftTasks = {}, shiftProfiles = {}, shiftReports = {}, inspections = [], defects = [],
    defectHistory = {},
} = {}) {
    const requests = []
    const log = (request) => {
        const url = new URL(request.url)
        requests.push(url)
        return url
    }
    serveConfiguration(requests)
    serveStock(requests, stock)
    const materialReads = {}
    server.use(
        http.get(`${BASE}/assets`, ({request}) => {
            const url = log(request)
            const name = (param(url, 'name') ?? '').toLowerCase()
            const rows = assets.filter((row) => (!has(url, 'type') || row.type === param(url, 'type'))
                && (!has(url, 'trackId') || String(row.trackId) === param(url, 'trackId'))
                && (!has(url, 'enabled') || String(row.enabled) === param(url, 'enabled'))
                && (!name || row.name.toLowerCase().includes(name)))
            return HttpResponse.json(pageOf(sorted(rows, url), url))
        }),
        http.get(`${BASE}/assets/:id/orders`, ({request, params}) => {
            const url = log(request)
            return HttpResponse.json(pageOf(sorted(assetOrders[params.id] ?? [], url), url))
        }),
        http.get(`${BASE}/teams`, ({request}) => {
            log(request)
            return HttpResponse.json(teams)
        }),
        http.get(`${BASE}/task-types`, ({request}) => {
            const url = log(request)
            return HttpResponse.json(taskTypes.filter((type) => !has(url, 'functionalGroup') || type.functionalGroup === param(url, 'functionalGroup')))
        }),
        http.get(`${BASE}/inspection-templates`, ({request}) => {
            log(request)
            return HttpResponse.json(templates)
        }),
        http.get(`${BASE}/orders`, ({request}) => {
            const url = log(request)
            const code = (param(url, 'code') ?? '').toLowerCase()
            const rows = orders.filter((row) => ['status', 'type', 'priority', 'trackId', 'executionPackageId']
                .every((name) => !has(url, name) || String(row[name]) === param(url, name))
                && (!has(url, 'teamId') || row.team?.id === param(url, 'teamId'))
                && (!has(url, 'assignedUser') || row.assignedUser?.toLowerCase() === param(url, 'assignedUser').toLowerCase())
                && (!code || row.code.toLowerCase().includes(code))
                && (!has(url, 'plannedFrom') || row.plannedDate >= param(url, 'plannedFrom'))
                && (!has(url, 'plannedTo') || row.plannedDate <= param(url, 'plannedTo')))
            return HttpResponse.json(pageOf(sorted(rows, url), url))
        }),
        http.get(`${BASE}/orders/:id`, ({request, params}) => {
            log(request)
            const found = orders.find((row) => row.id === params.id)
            return found ? HttpResponse.json(found) : maintenanceError(404, 'ORD-404', `Maintenance order with id ${params.id} was not found`)
        }),
        http.get(`${BASE}/orders/:id/tasks`, ({request, params}) => {
            log(request)
            return HttpResponse.json(tasks[params.id] ?? [])
        }),
        http.get(`${BASE}/orders/:id/history`, ({request, params}) => {
            log(request)
            return HttpResponse.json(history[params.id] ?? [])
        }),
        http.get(`${BASE}/orders/:id/materials`, ({request, params}) => {
            log(request)
            materialReads[params.id] = (materialReads[params.id] ?? 0) + 1
            const lines = materials[params.id] ?? []
            return HttpResponse.json(typeof lines === 'function' ? lines(materialReads[params.id]) : lines)
        }),
        http.get(`${BASE}/shifts`, ({request}) => {
            const url = log(request)
            const rows = shifts.filter((row) => ['status', 'possessionType', 'executionPackageId']
                .every((name) => !has(url, name) || String(row[name]) === param(url, name))
                && (!has(url, 'teamId') || row.team?.id === param(url, 'teamId'))
                && (!has(url, 'trackId') || row.trackIds.map(String).includes(param(url, 'trackId')))
                && (!has(url, 'dateFrom') || row.shiftDate >= param(url, 'dateFrom'))
                && (!has(url, 'dateTo') || row.shiftDate <= param(url, 'dateTo')))
            return HttpResponse.json(pageOf(sorted(rows, url), url))
        }),
        http.get(`${BASE}/shifts/:id`, ({request, params}) => {
            log(request)
            const found = shifts.find((row) => row.id === params.id)
            return found ? HttpResponse.json(found) : maintenanceError(404, 'SHF-404', `Maintenance shift with id ${params.id} was not found`)
        }),
        http.get(`${BASE}/shifts/:id/tasks`, ({request, params}) => {
            log(request)
            return HttpResponse.json(shiftTasks[params.id] ?? [])
        }),
        http.get(`${BASE}/shifts/:id/profiles`, ({request, params}) => {
            const url = log(request)
            const profiles = shiftProfiles[params.id] ?? []
            return HttpResponse.json(typeof profiles === 'function' ? profiles(param(url, 'status')) : profiles)
        }),
        http.get(`${BASE}/shifts/:id/report`, ({request, params}) => {
            const url = log(request)
            if (has(url, 'format')) {
                return new HttpResponse(new Uint8Array([80, 75, 3, 4]), {headers: {
                    'content-type': 'application/octet-stream',
                    'content-disposition': `attachment; filename="shift-report-2026-10-05-SH-000001.${param(url, 'format')}"`,
                }})
            }
            return HttpResponse.json(shiftReports[params.id])
        }),
        http.get(`${BASE}/inspections`, ({request}) => {
            const url = log(request)
            const rows = inspections.filter((row) => ['result', 'trackId', 'executionPackageId', 'originOrderId']
                .every((name) => !has(url, name) || String(row[name]) === param(url, name))
                && (!has(url, 'assetType') || row.asset?.type === param(url, 'assetType'))
                && (!has(url, 'inspector') || row.inspector === param(url, 'inspector'))
                && (!has(url, 'inspectionFrom') || row.inspectionDate >= param(url, 'inspectionFrom'))
                && (!has(url, 'inspectionTo') || row.inspectionDate <= param(url, 'inspectionTo')))
            return HttpResponse.json(pageOf(sorted(rows, url), url))
        }),
        http.get(`${BASE}/inspections/:id`, ({request, params}) => {
            log(request)
            const found = inspections.find((row) => row.id === params.id)
            return found ? HttpResponse.json(found) : maintenanceError(404, 'INS-404', `Maintenance inspection with id ${params.id} was not found`)
        }),
        http.get(`${BASE}/defects`, ({request}) => {
            const url = log(request)
            const rows = defects.filter((row) => ['severity', 'status', 'orderId', 'trackId', 'executionPackageId']
                .every((name) => !has(url, name) || String(row[name]) === param(url, name))
                && (!has(url, 'detectedFrom') || new Date(row.detectedAt) >= new Date(param(url, 'detectedFrom')))
                && (!has(url, 'detectedTo') || new Date(row.detectedAt) <= new Date(param(url, 'detectedTo'))))
            return HttpResponse.json(pageOf(sorted(rows, url), url))
        }),
        http.get(`${BASE}/defects/:id`, ({request, params}) => {
            log(request)
            const found = defects.find((row) => row.id === params.id)
            return found ? HttpResponse.json(found) : maintenanceError(404, 'DEF-404', `Catenary defect with id ${params.id} was not found`)
        }),
        http.get(`${BASE}/defects/:id/history`, ({request, params}) => {
            log(request)
            return HttpResponse.json(defectHistory[params.id] ?? [])
        }),
        http.get(`${BASE}/:resource/:id/revisions`, ({request, params}) => {
            const url = log(request)
            const rows = revisions[params.id]
            return rows ? HttpResponse.json(pageOf(rows, url)) : maintenanceError(404, 'AST-404', `CatenaryAsset with id ${params.id} was not found`)
        }),
    )
    return requests
}

/** Las lecturas de una ruta, en su orden. */
function readsOf(requests, path) {
    return requests.filter((url) => url.pathname === path)
}

/** Recoge las escrituras de una ruta (cuerpo y tipo de contenido) y contesta con respond(cuerpo, número de llamada). */
function recordWrites(method, path, respond) {
    const writes = []
    server.use(http[method](path, async ({request}) => {
        const text = await request.text()
        const body = text ? JSON.parse(text) : null
        writes.push({body, contentType: request.headers.get('content-type')})
        return respond(body, writes.length)
    }))
    return writes
}

function table(name) {
    return screen.getByRole('table', {name})
}

/** Las filas con datos de una tabla, cada una como el texto de sus celdas. */
function dataRows(name) {
    return within(table(name)).getAllByRole('row').slice(1)
        .map((row) => within(row).queryAllByRole('cell'))
        .filter((cells) => cells.length > 1)
}

function textsOf(cells) {
    return cells.map((cell) => cell.textContent)
}

function firstColumn(name) {
    return dataRows(name).map((cells) => cells[0].textContent)
}

function rowOf(name, text) {
    return within(table(name)).getAllByRole('row')
        .find((row) => within(row).queryAllByRole('cell').some((cell) => cell.textContent === text))
}

/** Las filas con datos de una tabla, como elementos: para sus acciones, cuando varias se llaman igual. */
function rowElements(name) {
    return within(table(name)).getAllByRole('row').slice(1).filter((row) => within(row).queryAllByRole('cell').length > 1)
}

/** Los nombres de las acciones de una fila, en su orden. */
function actionsOf(row) {
    return within(row).queryAllByRole('button').map((button) => button.getAttribute('aria-label'))
}

async function open(path, session, tableName, expected) {
    const view = renderRoute(path, {session})
    await waitFor(() => expect(firstColumn(tableName)).toHaveLength(expected))
    return view
}

async function choose(user, container, label, option) {
    await user.click(within(container).getByRole('combobox', {name: label}))
    await user.click(await screen.findByRole('option', {name: option}))
}

async function typeInto(user, container, label, text) {
    const field = within(container).getByRole('textbox', {name: label})
    await user.clear(field)
    if (text) {
        await user.type(field, text)
    }
    return field
}

describe('el menú y las rutas', () => {
    it('«Mantenimiento» tiene las órdenes como nodo, y el perfil lee también infraestructura, catálogos, trabajos y almacén', () => {
        const menu = buildMenu(loginAs('mantenimiento.lector'))
        const maintenance = menu.find((item) => item.key === 'mantenimiento')
        expect(maintenance.children.map((child) => [child.label, child.path])).toEqual([
            ['Órdenes', '/mantenimiento'], ['Activos', '/mantenimiento/activos'], ['Turnos', '/mantenimiento/turnos'],
            ['Inspecciones', '/mantenimiento/inspecciones'], ['Defectos', '/mantenimiento/defectos'], ['Informes', '/mantenimiento/informes'],
            ['Equipos', '/mantenimiento/equipos'], ['Tipos de tarea', '/mantenimiento/tipos-de-tarea'],
            ['Plantillas de inspección', '/mantenimiento/plantillas']])
        const keys = menu.map((item) => item.key ?? item.path)
        expect(keys).toEqual(expect.arrayContaining(['infraestructura', 'almacen', '/trabajos']))
        expect(keys).not.toContain('usuarios')
        expect(buildMenu(loginAs('almacen.responsable')).some((item) => item.key === 'mantenimiento')).toBe(false)
    })

    it('un rol de realm llamado como un permiso no abre mantenimiento ni pide nada al servicio', async () => {
        renderRoute('/mantenimiento/activos', {session: sessionWith([P.NOTIFICATION_INBOX], {realmRoles: ['maintenance-read']})})

        expect(await screen.findByText('No tienes permiso para abrir esta pantalla')).toBeInTheDocument()
        expect(screen.getByText('maintenance-read')).toBeInTheDocument()
    })
})

describe('los activos', () => {
    it('se filtran y ordenan en el servicio con el orden físico y su desempate, y quien solo lee no ve controles de escritura', async () => {
        const requests = serveMaintenance({assets: [syncedProfile()]})
        const {user} = await open('/mantenimiento/activos', loginAs('mantenimiento.lector'), 'Activos', 1)
        const lists = () => readsOf(requests, `${BASE}/assets`)

        await waitFor(() => expect(textsOf(dataRows('Activos')[0])).toEqual(['PRF-0001', '12-2.27', 'Perfil', 'VIA 1 (PAQ NORTE)', '12.27',
            'PAQ NORTE', 'S-3', '180 d', formatDateTime('2026-10-01T00:00:00Z'), 'Activo', 'mto-configuration', '']))
        expect(lists()[0].search).toBe('?page=0&size=50&sort=trackId%2Casc&sort=startKp%2Casc&sort=id%2Casc')
        expect(screen.getByText('1 activo')).toBeInTheDocument()

        await choose(user, document.body, 'Tipo', 'Perfil')
        await choose(user, document.body, 'Vía', 'VIA 1 (PAQ NORTE)')
        await choose(user, document.body, 'Estado', 'Activos')
        await typeInto(user, document.body, 'Nombre', '12-2')
        await user.type(screen.getByRole('textbox', {name: 'Preventivo vence hasta'}), '31/10/2026')
        await user.tab()
        await waitFor(() => expect(param(lists().at(-1), 'preventiveDueBefore')).toBe(endOfDayInstant('2026-10-31')))
        const last = lists().at(-1)
        expect([param(last, 'type'), param(last, 'trackId'), param(last, 'enabled'), param(last, 'name'), param(last, 'page')])
            .toEqual(['PROFILE', '12', 'true', '12-2', '0'])

        expect(screen.queryByRole('button', {name: 'Nuevo tramo'})).not.toBeInTheDocument()
        expect(actionsOf(rowOf('Activos', 'PRF-0001'))).toEqual(['Órdenes de PRF-0001 - 12-2.27', 'Historial de PRF-0001 - 12-2.27'])
    })

    it('sin config-read las vías se pintan #id, no se llama a configuración y no se ofrece el alta de un tramo', async () => {
        const requests = serveMaintenance({assets: [syncedProfile()]})
        await open('/mantenimiento/activos', sessionWith([P.MAINTENANCE_READ, P.MAINTENANCE_WRITE]), 'Activos', 1)

        expect(textsOf(dataRows('Activos')[0]).slice(3, 6)).toEqual(['#12', '12.27', '#3'])
        expect(requests.some((url) => url.pathname.startsWith(CONFIGURATION))).toBe(false)
        expect(screen.queryByRole('button', {name: 'Nuevo tramo'})).not.toBeInTheDocument()
        expect(actionsOf(rowOf('Activos', 'PRF-0001'))).toContain('Modificar PRF-0001 - 12-2.27')
    })

    it('un tramo se da de alta con su vía; un rango al revés no llama, y un código repetido deja el diálogo abierto', async () => {
        serveMaintenance()
        const writes = recordWrites('post', `${BASE}/assets`, (body, call) => (call === 1
            ? maintenanceError(409, 'AST-409', "Catenary asset code 'TS-0002' is already in use")
            : HttpResponse.json(ownSection(ASSET_OWN, 'TS-0002', true), {status: 201})))
        const {user} = await open('/mantenimiento/activos', loginAs('mantenimiento.tecnico'), 'Activos', 0)

        await user.click(await screen.findByRole('button', {name: 'Nuevo tramo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Nuevo tramo de vía'})
        await typeInto(user, dialog, 'Código', 'TS-0002')
        await typeInto(user, dialog, 'Nombre', 'Tramo 13')
        await choose(user, dialog, 'Vía', 'VIA 1 (PAQ NORTE)')
        await typeInto(user, dialog, 'Kp inicial', '13.45')
        await typeInto(user, dialog, 'Kp final', '13.00')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('El kp final tiene que ser mayor que el inicial')).toBeInTheDocument()
        expect(writes).toHaveLength(0)

        await typeInto(user, dialog, 'Kp final', '14.2')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await screen.findByText('Ya existe otro con ese código.')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Nuevo tramo de vía'})).toBeInTheDocument()

        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Nuevo tramo de vía'})).not.toBeInTheDocument())
        expect(writes.map((write) => write.body)).toEqual([
            {code: 'TS-0002', name: 'Tramo 13', trackId: 12, startKp: 13.45, endKp: 14.2, trackKind: 'MAIN'},
            {code: 'TS-0002', name: 'Tramo 13', trackId: 12, startKp: 13.45, endKp: 14.2, trackKind: 'MAIN'}])
        expect(await screen.findByText('Guardado TS-0002 - Tramo TS-0002')).toBeInTheDocument()
    })

    it('uno sincronizado solo cambia descripción e intervalo, y desactivarlo avisa de que sobrevive a los datos maestros', async () => {
        serveMaintenance({assets: [syncedProfile()]})
        const disables = recordWrites('delete', `${BASE}/assets/${ASSET_SYNCED}`, () => new HttpResponse(null, {status: 204}))
        const patches = recordWrites('patch', `${BASE}/assets/${ASSET_SYNCED}`, () => HttpResponse.json(syncedProfile()))
        const {user} = await open('/mantenimiento/activos', loginAs('mantenimiento.responsable'), 'Activos', 1)

        await user.click(within(rowOf('Activos', 'PRF-0001')).getByRole('button', {name: 'Desactivar PRF-0001 - 12-2.27'}))
        const confirm = await screen.findByRole('dialog', {name: 'Desactivar PRF-0001 - 12-2.27'})
        expect(confirm).toHaveTextContent('Sigue desactivado aunque mto-configuration lo mande activo.')
        await user.click(within(confirm).getByRole('button', {name: 'Desactivar'}))
        await waitFor(() => expect(disables).toHaveLength(1))
        expect(await screen.findByText('Desactivado PRF-0001 - 12-2.27')).toBeInTheDocument()

        await user.click(within(rowOf('Activos', 'PRF-0001')).getByRole('button', {name: 'Modificar PRF-0001 - 12-2.27'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar PRF-0001 - 12-2.27'})
        expect(dialog).toHaveTextContent('Llega de mto-configuration (perfil PRF-0001 - 12-2.27)')
        expect(within(dialog).queryByRole('textbox', {name: 'Nombre'})).not.toBeInTheDocument()
        await user.clear(within(dialog).getByRole('textbox', {name: /Intervalo preventivo/}))
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(patches).toHaveLength(1))
        expect(patches[0]).toEqual({body: {preventiveIntervalDays: null, version: 7}, contentType: MERGE_PATCH})
    })

    it('modificar sin cambiar nada cierra sin llamar', async () => {
        serveMaintenance({assets: [ownSection(ASSET_OWN, 'TS-0001', true)]})
        const patches = recordWrites('patch', `${BASE}/assets/${ASSET_OWN}`, () => HttpResponse.json(ownSection(ASSET_OWN, 'TS-0001', true)))
        const {user} = await open('/mantenimiento/activos', loginAs('mantenimiento.tecnico'), 'Activos', 1)

        await user.click(within(rowOf('Activos', 'TS-0001')).getByRole('button', {name: 'Modificar TS-0001 - Tramo TS-0001'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar TS-0001 - Tramo TS-0001'})
        expect(within(dialog).getByRole('textbox', {name: 'Kp inicial'})).toHaveValue('12.1')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Modificar TS-0001 - Tramo TS-0001'})).not.toBeInTheDocument())
        expect(patches).toHaveLength(0)
    })

    it('un tramo propio se desactiva con confirmación y se reactiva modificándolo con la versión leída', async () => {
        serveMaintenance({assets: [ownSection(ASSET_OWN, 'TS-0001', true), ownSection(ASSET_OWN_OFF, 'TS-0009', false)]})
        const disables = recordWrites('delete', `${BASE}/assets/${ASSET_OWN}`, () => new HttpResponse(null, {status: 204}))
        const enables = recordWrites('patch', `${BASE}/assets/${ASSET_OWN_OFF}`, () => HttpResponse.json(ownSection(ASSET_OWN_OFF, 'TS-0009', true)))
        const {user} = await open('/mantenimiento/activos', loginAs('mantenimiento.responsable'), 'Activos', 2)

        await user.click(within(rowOf('Activos', 'TS-0001')).getByRole('button', {name: 'Desactivar TS-0001 - Tramo TS-0001'}))
        expect(disables).toHaveLength(0)
        await user.click(within(await screen.findByRole('dialog', {name: 'Desactivar TS-0001 - Tramo TS-0001'})).getByRole('button', {name: 'Desactivar'}))
        expect(await screen.findByText('Desactivado TS-0001 - Tramo TS-0001')).toBeInTheDocument()
        expect(disables).toHaveLength(1)

        await user.click(within(rowOf('Activos', 'TS-0009')).getByRole('button', {name: 'Reactivar TS-0009 - Tramo TS-0009'}))
        expect(await screen.findByText('Reactivado TS-0009 - Tramo TS-0009')).toBeInTheDocument()
        expect(enables).toEqual([{body: {enabled: true, version: 1}, contentType: MERGE_PATCH}])
    })

    it('el estado dice quién desactivó un sincronizado, y solo se reactiva lo desactivado aquí', async () => {
        serveMaintenance({assets: [
            syncedProfile({id: ASSET_OFF_HERE, code: 'PRF-0013', enabledAtSource: true, disabledLocally: true}),
            syncedProfile({id: ASSET_OFF_AT_SOURCE, code: 'PRF-0014', enabledAtSource: false, disabledLocally: false}),
            syncedProfile({id: ASSET_OFF_BOTH, code: 'PRF-0015', enabledAtSource: false, disabledLocally: true}),
        ]})
        await open('/mantenimiento/activos', loginAs('mantenimiento.responsable'), 'Activos', 3)

        const stateActions = (code) => actionsOf(rowOf('Activos', code)).filter((label) => /^(Desactivar|Reactivar) /.test(label))
        expect(textsOf(dataRows('Activos')[0])).toContain('Desactivado aquí')
        expect(textsOf(dataRows('Activos')[1])).toContain('Desactivado en configuración')
        expect(textsOf(dataRows('Activos')[2])).toContain('Desactivado aquí y en configuración')
        expect(stateActions('PRF-0013')).toEqual(['Reactivar PRF-0013 - 12-2.27'])
        expect(stateActions('PRF-0014')).toEqual(['Desactivar PRF-0014 - 12-2.27'])
        expect(stateActions('PRF-0015')).toEqual([])
    })

    it('las órdenes de un activo, la más reciente primero, abren su ficha', async () => {
        const requests = serveMaintenance({assets: [ownSection(ASSET_OWN, 'TS-0001', true)], assetOrders: {[ASSET_OWN]: [order()]},
            orders: [order()]})
        const {user, router} = await open('/mantenimiento/activos', loginAs('mantenimiento.lector'), 'Activos', 1)

        await user.click(within(rowOf('Activos', 'TS-0001')).getByRole('button', {name: 'Órdenes de TS-0001 - Tramo TS-0001'}))
        await waitFor(() => expect(firstColumn('Órdenes de TS-0001 - Tramo TS-0001')).toEqual(['MO-000001']))
        expect(textsOf(dataRows('Órdenes de TS-0001 - Tramo TS-0001')[0]).slice(0, 6))
            .toEqual(['MO-000001', 'Revisión tramo 12', 'Preventiva', 'Planificada', '14/09/2026', '3/10'])
        expect(readsOf(requests, `${BASE}/assets/${ASSET_OWN}/orders`)[0].search).toBe('?page=0&size=50&sort=createdAt%2Cdesc&sort=id%2Casc')

        await user.click(screen.getByRole('button', {name: 'Abrir MO-000001'}))
        expect(await screen.findByRole('heading', {name: 'MO-000001 · Revisión tramo 12'})).toBeInTheDocument()
        expect(router.state.location.pathname).toBe(`/mantenimiento/ordenes/${ORDER1}`)
    })

    it('uno que solo llegó por datos maestros no tiene historial todavía, sin aviso, y un tramo propio sí', async () => {
        const own = ownSection(ASSET_OWN, 'TS-0002', true)
        serveMaintenance({assets: [syncedProfile(), own], revisions: {[ASSET_OWN]: [revision(6, 'UPDATED', 'mantenimiento.tecnico', 'HTTP', own)]}})
        const {user} = await open('/mantenimiento/activos', loginAs('mantenimiento.lector'), 'Activos', 2)

        await user.click(within(rowOf('Activos', 'PRF-0001')).getByRole('button', {name: 'Historial de PRF-0001 - 12-2.27'}))
        const empty = await screen.findByRole('dialog', {name: 'Historial de PRF-0001 - 12-2.27'})
        expect(await within(empty).findByText(/Sin historial todavía/)).toBeInTheDocument()
        expect(within(empty).queryByRole('table')).not.toBeInTheDocument()
        await user.click(within(empty).getAllByRole('button', {name: 'Cerrar'}).at(-1))

        await user.click(within(rowOf('Activos', 'TS-0002')).getByRole('button', {name: 'Historial de TS-0002 - Tramo TS-0002'}))
        await waitFor(() => expect(dataRows('Historial de TS-0002 - Tramo TS-0002')).toHaveLength(1))
        expect(textsOf(dataRows('Historial de TS-0002 - Tramo TS-0002')[0])).toContain('Tramo TS-0002 · KP 12.1 - 13.45 · activo · Tramo propio')
        expect(screen.queryByText(/No existe|Error/)).not.toBeInTheDocument()
    })
})

describe('los catálogos', () => {
    const TEAM = Object.freeze({
        id: TEAM1, code: 'EQ-01', name: 'Brigada norte', baseName: 'Base Norte', vehicle: 'DR-2', active: true,
        executionPackageIds: [5, 3], audit: null,
    })

    it('un equipo se modifica entero: la base vaciada viaja a null y los paquetes ordenados', async () => {
        serveMaintenance({teams: [TEAM]})
        const puts = recordWrites('put', `${BASE}/teams/${TEAM1}`, (body) => HttpResponse.json({...TEAM, ...body}))
        const {user} = await open('/mantenimiento/equipos', loginAs('mantenimiento.tecnico'), 'Equipos', 1)

        await waitFor(() => expect(textsOf(dataRows('Equipos')[0]).slice(0, 6))
            .toEqual(['EQ-01', 'Brigada norte', 'Base Norte', 'DR-2', 'PAQ NORTE, PAQ SUR', 'Activo']))
        await user.click(screen.getByRole('button', {name: 'Modificar EQ-01'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar el equipo EQ-01'})
        await typeInto(user, dialog, 'Base', '')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(puts).toHaveLength(1))
        expect(puts[0].body).toEqual({code: 'EQ-01', name: 'Brigada norte', baseName: null, vehicle: 'DR-2', active: true, executionPackageIds: [3, 5]})
        expect(await screen.findByText('Guardado EQ-01 - Brigada norte')).toBeInTheDocument()
    })

    it('quien solo lee ve los equipos sin alta ni modificar', async () => {
        serveMaintenance({teams: [TEAM]})
        await open('/mantenimiento/equipos', loginAs('mantenimiento.lector'), 'Equipos', 1)
        expect(screen.queryByRole('button', {name: 'Nuevo equipo'})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Modificar EQ-01'})).not.toBeInTheDocument()
    })

    it('los tipos de tarea son de solo lectura, en el orden del plan, y el grupo lo filtra el servicio', async () => {
        const requests = serveMaintenance({taskTypes: [
            {id: 't2', code: 'RG-04', description: 'Revisión del hilo de contacto', functionalGroup: 'OVERHEAD_CONDUCTORS', standardMinutesPerUnit: 12.5,
                unit: 'SPAN', fixedMinutes: null, requiresFullPossession: true, diagnostic: false, active: true, orderIndex: 4},
            {id: 't1', code: 'RG-01', description: 'Revisión visual', functionalGroup: 'STRUCTURAL_SUPPORTS', standardMinutesPerUnit: 10,
                unit: 'PROFILE', fixedMinutes: 2, requiresFullPossession: false, diagnostic: false, active: true, orderIndex: 1},
        ]})
        const {user} = await open('/mantenimiento/tipos-de-tarea', loginAs('mantenimiento.lector'), 'Tipos de tarea', 2)

        expect(firstColumn('Tipos de tarea')).toEqual(['RG-01', 'RG-04'])
        expect(textsOf(dataRows('Tipos de tarea')[1]))
            .toEqual(['RG-04', 'Revisión del hilo de contacto', 'Conductores aéreos', 'Vano', '12.5', '', 'Sí', 'No', 'Sí'])
        await choose(user, document.body, 'Grupo funcional', 'Conductores aéreos')
        await waitFor(() => expect(firstColumn('Tipos de tarea')).toEqual(['RG-04']))
        expect(param(readsOf(requests, `${BASE}/task-types`).at(-1), 'functionalGroup')).toBe('OVERHEAD_CONDUCTORS')
    })

    it('las plantillas enseñan los puntos de la activa al abrir, y los de otra al elegirla', async () => {
        serveMaintenance({templates: [
            {id: 'tpl1', assetType: 'PROFILE', version: 1, name: 'Perfil', active: false, items: []},
            {id: 'tpl2', assetType: 'PROFILE', version: 2, name: 'Perfil', active: true, items: [
                {id: 'i1', code: 'P-01', label: 'Altura del hilo', unit: 'mm', minValue: 5300, maxValue: 5700, requiresMeasure: true, orderIndex: 1}]},
        ]})
        const {user} = await open('/mantenimiento/plantillas', loginAs('mantenimiento.lector'), 'Plantillas de inspección', 2)

        expect(textsOf(dataRows('Plantillas de inspección')[0]).slice(0, 5)).toEqual(['Perfil', '2', 'Perfil', 'Activa', '1'])
        expect(screen.getByRole('heading', {name: 'Puntos de Perfil (versión 2)'})).toBeInTheDocument()
        expect(textsOf(dataRows('Puntos de Perfil (versión 2)')[0])).toEqual(['P-01', 'Altura del hilo', 'Sí', 'mm', '5300', '5700'])

        await user.click(screen.getByRole('button', {name: 'Puntos de Perfil (versión 1)'}))
        expect(await screen.findByText('La plantilla no tiene puntos.')).toBeInTheDocument()
    })
})

const TASK1 = '3c3c3c3c-0000-4000-8000-000000000021'
const TASK2 = '3c3c3c3c-0000-4000-8000-000000000022'
const ITEM1 = '3c3c3c3c-0000-4000-8000-000000000033'
const TEAMS = Object.freeze([{id: TEAM1, code: 'EQ-01', name: 'Brigada norte', baseName: 'Base Norte', vehicle: null, active: true,
    executionPackageIds: [3], audit: null}])
const TASK_TYPES = Object.freeze([
    {id: 't1', code: 'RG-01', description: 'Revisión visual', functionalGroup: 'STRUCTURAL_SUPPORTS', standardMinutesPerUnit: 10, unit: 'PROFILE',
        fixedMinutes: null, requiresFullPossession: false, diagnostic: false, active: true, orderIndex: 1},
    {id: 't2', code: 'RG-04', description: 'Revisión del hilo de contacto', functionalGroup: 'OVERHEAD_CONDUCTORS', standardMinutesPerUnit: 12.5,
        unit: 'SPAN', fixedMinutes: null, requiresFullPossession: true, diagnostic: false, active: true, orderIndex: 4},
])

function task(id, sequence, status, extra = {}) {
    return {
        id, orderId: ORDER1, sequence, description: 'Perfil 12-2.27', status, assignedUser: null,
        asset: {id: ASSET_SYNCED, code: 'PRF-0001', name: '12-2.27', type: 'PROFILE', trackId: 12, startKp: 12.27, endKp: 12.27,
            sectioning: 'S-3', enabled: true},
        shiftId: null, startedAt: null, completedAt: null, defectsFound: null, notes: null, photoRefs: [], taskTypeCodes: ['RG-01'],
        checkItems: [], audit: null, version: 2, ...extra,
    }
}

function checkItem(extra = {}) {
    return {
        id: ITEM1, code: 'P-01', label: 'Altura del hilo', unit: 'mm', minValue: 5300, maxValue: 5700, requiresMeasure: true, measuredValue: null,
        adjusted: null, valueAfterAdjustment: null, itemResult: null, notes: null, orderIndex: 1, outOfRange: false, version: 1, ...extra,
    }
}

/** Una fecha local a unos días de hoy, como la escribe la persona y como viaja. */
function daysFromToday(days) {
    const date = new Date()
    date.setDate(date.getDate() + days)
    const pad = (value) => String(value).padStart(2, '0')
    return {typed: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`,
        iso: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`}
}

async function openOrder(session, current, options = {}) {
    const requests = serveMaintenance({teams: TEAMS, taskTypes: TASK_TYPES, ...options, orders: [current, ...(options.orders ?? [])]})
    const view = renderRoute(`/mantenimiento/ordenes/${current.id}`, {session})
    await screen.findByRole('heading', {name: `${current.code} · ${current.title}`})
    return {...view, requests}
}

const orderStatus = () => screen.getByLabelText('Estado de la orden')

describe('las órdenes', () => {
    it('se filtran en el servicio, la más reciente primero, y una fila abre su ficha, que quien solo lee no puede tocar', async () => {
        const requests = serveMaintenance({teams: TEAMS, orders: [order({status: 'IN_PROGRESS'})]})
        const {user} = await open('/mantenimiento', loginAs('mantenimiento.lector'), 'Órdenes', 1)
        const lists = () => readsOf(requests, `${BASE}/orders`)

        expect(lists()[0].search).toBe('?page=0&size=50&sort=createdAt%2Cdesc&sort=id%2Casc')
        expect(textsOf(dataRows('Órdenes')[0]).slice(0, 13)).toEqual(['MO-000001', 'Revisión tramo 12', 'Preventiva', 'En curso', 'Alta',
            'TS-0001 - Tramo 12', 'VIA 1 (PAQ NORTE)', '12.1 - 13.45', 'PAQ NORTE', '14/09/2026', 'EQ-01 - Brigada norte', '3/10',
            'mantenimiento.tecnico'])
        await choose(user, document.body, 'Estado', 'En curso')
        await choose(user, document.body, 'Tipo', 'Preventiva')
        await choose(user, document.body, 'Prioridad', 'Alta')
        await choose(user, document.body, 'Vía', 'VIA 1 (PAQ NORTE)')
        await choose(user, document.body, 'Paquete', 'PAQ NORTE')
        await choose(user, document.body, 'Equipo', 'EQ-01 - Brigada norte')
        await typeInto(user, document.body, 'Código', 'MO-0000')
        await typeInto(user, document.body, 'Asignada a', 'mantenimiento.tecnico')
        await user.type(screen.getByRole('textbox', {name: 'Prevista desde'}), '01/09/2026')
        await user.type(screen.getByRole('textbox', {name: 'Prevista hasta'}), '30/09/2026')
        await user.tab()
        await waitFor(() => expect(param(lists().at(-1), 'plannedTo')).toBe('2026-09-30'))
        const last = lists().at(-1)
        expect(['status', 'type', 'priority', 'trackId', 'executionPackageId', 'teamId', 'code', 'assignedUser', 'plannedFrom']
            .map((name) => param(last, name)))
            .toEqual(['IN_PROGRESS', 'PREVENTIVE', 'HIGH', '12', '3', TEAM1, 'MO-0000', 'mantenimiento.tecnico', '2026-09-01'])
        await waitFor(() => expect(firstColumn('Órdenes')).toEqual(['MO-000001']))
        expect(screen.queryByRole('button', {name: 'Nueva orden'})).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', {name: 'Abrir MO-000001'}))
        expect(await screen.findByRole('heading', {name: 'MO-000001 · Revisión tramo 12'})).toBeInTheDocument()
        expect(screen.getByLabelText('Resumen de la orden')).toHaveTextContent(
            'Activo: TS-0001 - Tramo 12 · Vía: VIA 1 (PAQ NORTE) · KP 12.1 - 13.45 · Paquete: PAQ NORTE')
        expect(screen.getByLabelText('Resumen de la orden')).toHaveTextContent('Tareas: 3 de 10 completadas · Estimación: 450 min en 2 turnos')
        expect(screen.queryByRole('button', {name: 'Modificar'})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Completar'})).not.toBeInTheDocument()
    })

    it('una orden nueva busca su activo en el servidor entre los activos y abre su ficha', async () => {
        const created = order({status: 'DRAFT', title: 'Revisión tramo 12'})
        const requests = serveMaintenance({teams: TEAMS, assets: [ownSection(ASSET_OWN, 'TS-0001', true)], orders: [created]})
        const posts = recordWrites('post', `${BASE}/orders`, () => HttpResponse.json(created, {status: 201}))
        const {user, router} = await open('/mantenimiento', loginAs('mantenimiento.tecnico'), 'Órdenes', 1)

        await user.click(screen.getByRole('button', {name: 'Nueva orden'}))
        const dialog = await screen.findByRole('dialog', {name: 'Nueva orden'})
        await user.type(within(dialog).getByRole('combobox', {name: 'Activo'}), 'TS')
        await waitFor(() => expect(param(readsOf(requests, `${BASE}/assets`).at(-1), 'name')).toBe('TS'))
        expect(param(readsOf(requests, `${BASE}/assets`).at(-1), 'enabled')).toBe('true')
        await user.click(await screen.findByRole('option', {name: 'TS-0001 - Tramo TS-0001'}))
        await typeInto(user, dialog, 'Título', 'Revisión tramo 12')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        await waitFor(() => expect(router.state.location.pathname).toBe(`/mantenimiento/ordenes/${ORDER1}`))
        expect(posts.map((write) => write.body)).toEqual([{title: 'Revisión tramo 12', type: 'PREVENTIVE', priority: 'MEDIUM', assetId: ASSET_OWN}])
        expect(await screen.findByRole('heading', {name: 'MO-000001 · Revisión tramo 12'})).toBeInTheDocument()
    })

    it('la ficha ofrece lo que admite cada estado: un preventivo en borrador se planifica y una urgente arranca', async () => {
        await openOrder(loginAs('mantenimiento.tecnico'), order({status: 'DRAFT'}))
        expect(screen.getByRole('button', {name: 'Modificar'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Planificar'})).toBeInTheDocument()
        for (const name of ['Iniciar', 'Asignar', 'Completar', 'Cancelar']) {
            expect(screen.queryByRole('button', {name})).not.toBeInTheDocument()
        }
    })

    it('una urgente en borrador arranca sin planificar', async () => {
        await openOrder(loginAs('mantenimiento.tecnico'), order({status: 'DRAFT', type: 'URGENT'}))
        expect(screen.getByRole('button', {name: 'Iniciar'})).toBeInTheDocument()
    })

    it('cancelar pide supervise y un motivo, y una orden cancelada ya no ofrece nada', async () => {
        const cancels = recordWrites('post', `${BASE}/orders/${ORDER1}/cancel`, () => HttpResponse.json(order({status: 'CANCELLED',
            cancellationReason: 'Duplicada'})))
        const {user} = await openOrder(loginAs('mantenimiento.responsable'), order({status: 'ASSIGNED'}))
        for (const name of ['Asignar', 'Iniciar', 'Cancelar']) {
            expect(screen.getByRole('button', {name})).toBeInTheDocument()
        }

        await user.click(screen.getByRole('button', {name: 'Cancelar'}))
        const dialog = await screen.findByRole('dialog', {name: 'Cancelar MO-000001'})
        await user.click(within(dialog).getByRole('button', {name: 'Cancelar la orden'}))
        expect(await within(dialog).findByText('El motivo es obligatorio')).toBeInTheDocument()
        expect(cancels).toHaveLength(0)
        await user.type(within(dialog).getByRole('textbox', {name: 'Motivo'}), 'Duplicada')
        await user.click(within(dialog).getByRole('button', {name: 'Cancelar la orden'}))

        expect(await screen.findByText('MO-000001 cancelada')).toBeInTheDocument()
        expect(cancels.map((write) => write.body)).toEqual([{reason: 'Duplicada'}])
        await waitFor(() => expect(orderStatus()).toHaveTextContent('Cancelada'))
        expect(screen.getByLabelText('Resumen de la orden')).toHaveTextContent('Motivo de la cancelación: Duplicada')
        expect(screen.queryByRole('button', {name: 'Modificar'})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Cancelar'})).not.toBeInTheDocument()
    })

    it('una orden que no existe se dice una vez y vuelve a la lista', async () => {
        serveMaintenance({teams: TEAMS})
        const missing = '3c3c3c3c-0000-4000-8000-0000000000ff'
        const {router} = renderRoute(`/mantenimiento/ordenes/${missing}`, {session: loginAs('mantenimiento.lector')})

        expect(await screen.findByText(`No existe la orden ${missing}`)).toBeInTheDocument()
        await waitFor(() => expect(router.state.location.pathname).toBe('/mantenimiento'))
    })

    it('planificar repinta la orden con lo que devuelve el servicio, y una transición rechazada se avisa con el diálogo abierto', async () => {
        const nextWeek = daysFromToday(7)
        const plans = recordWrites('post', `${BASE}/orders/${ORDER1}/plan`, () => HttpResponse.json(order({status: 'PLANNED',
            plannedDate: nextWeek.iso})))
        recordWrites('post', `${BASE}/orders/${ORDER1}/start`, () => maintenanceError(409, 'TRN-001', 'Order MO-000001 cannot be started from PLANNED'))
        const {user} = await openOrder(loginAs('mantenimiento.tecnico'), order({status: 'DRAFT', plannedDate: null}))

        await user.click(screen.getByRole('button', {name: 'Planificar'}))
        const plan = await screen.findByRole('dialog', {name: 'Planificar MO-000001'})
        expect(plan).toHaveTextContent('Al planificar se reservan en el almacén los materiales de la orden.')
        const date = within(plan).getByRole('textbox', {name: 'Prevista'})
        await user.clear(date)
        await user.type(date, nextWeek.typed)
        await user.click(within(plan).getByRole('button', {name: 'Planificar'}))
        await waitFor(() => expect(plans.map((write) => write.body)).toEqual([{plannedDate: nextWeek.iso}]))
        await waitFor(() => expect(orderStatus()).toHaveTextContent('Planificada'))
        expect(screen.getByRole('button', {name: 'Iniciar'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Asignar'})).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Planificar'})).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', {name: 'Iniciar'}))
        const start = await screen.findByRole('dialog', {name: 'Iniciar MO-000001'})
        await user.click(within(start).getByRole('button', {name: 'Iniciar'}))
        expect(await screen.findByText('El estado actual no permite esta operación. Order MO-000001 cannot be started from PLANNED'))
            .toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Iniciar MO-000001'})).toBeInTheDocument()
    })

    it('asignar pide un equipo, una persona o los dos', async () => {
        const assigns = recordWrites('post', `${BASE}/orders/${ORDER1}/assign`, () => HttpResponse.json(order({status: 'ASSIGNED'})))
        const {user} = await openOrder(loginAs('mantenimiento.tecnico'), order({status: 'PLANNED', team: null, assignedUser: null}))

        await user.click(screen.getByRole('button', {name: 'Asignar'}))
        const dialog = await screen.findByRole('dialog', {name: 'Asignar MO-000001'})
        await user.click(within(dialog).getByRole('button', {name: 'Asignar'}))
        expect(await within(dialog).findByText('Hace falta un equipo, una persona o los dos')).toBeInTheDocument()
        expect(assigns).toHaveLength(0)
        await choose(user, dialog, 'Equipo', 'EQ-01 - Brigada norte')
        await typeInto(user, dialog, 'Comentario para el historial', 'Esta noche')
        await user.click(within(dialog).getByRole('button', {name: 'Asignar'}))
        await waitFor(() => expect(assigns.map((write) => write.body)).toEqual([{teamId: TEAM1, comment: 'Esta noche'}]))
        expect(await screen.findByText('MO-000001: asignada')).toBeInTheDocument()
    })

    it('el editor vacía lo que se vació, con la versión leída, y una versión vieja pide recargar con el diálogo abierto', async () => {
        const patches = recordWrites('patch', `${BASE}/orders/${ORDER1}`, () => maintenanceError(409, 'CON-001',
            'Maintenance order MO-000001 was changed by someone else'))
        const {user} = await openOrder(loginAs('mantenimiento.tecnico'), order({status: 'DRAFT'}))

        await user.click(screen.getByRole('button', {name: 'Modificar'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar MO-000001'})
        await user.clear(within(dialog).getByRole('textbox', {name: 'Prevista'}))
        await choose(user, dialog, 'Equipo', 'EQ-01 - Brigada norte')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        await waitFor(() => expect(patches).toHaveLength(1))
        expect(patches[0]).toEqual({body: {plannedDate: null, teamId: null, version: 3}, contentType: MERGE_PATCH})
        expect(await screen.findByText('Conflicto con otro cambio: recarga y vuelve a intentarlo.')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Modificar MO-000001'})).toBeInTheDocument()
    })

    it('sin stock-read el editor no ofrece el proyecto de almacén, no lo nombra y no lo manda a vaciar', async () => {
        const withProject = order({status: 'DRAFT', stockProjectId: '3c3c3c3c-0000-4000-8000-000000000057'})
        const patches = recordWrites('patch', `${BASE}/orders/${ORDER1}`, () => HttpResponse.json(withProject))
        const {user, requests} = await openOrder(sessionWith([P.MAINTENANCE_READ, P.MAINTENANCE_WRITE, P.CONFIG_READ]), withProject)

        expect(screen.getByLabelText('Resumen de la orden')).toHaveTextContent('Proyecto de almacén: #3c3c3c3c')
        await user.click(screen.getByRole('button', {name: 'Modificar'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar MO-000001'})
        expect(within(dialog).queryByRole('combobox', {name: 'Proyecto de almacén'})).not.toBeInTheDocument()
        await choose(user, dialog, 'Prioridad', 'Crítica')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        await waitFor(() => expect(patches.map((write) => write.body)).toEqual([{priority: 'CRITICAL', version: 3}]))
        expect(requests.some((url) => url.pathname.startsWith('/api/stock'))).toBe(false)
    })

    it('en curso solo cambia lo que el servicio admite, y completar con force pide supervise', async () => {
        const running = order({status: 'IN_PROGRESS'})
        const patches = recordWrites('patch', `${BASE}/orders/${ORDER1}`, () => HttpResponse.json(running))
        const completes = recordWrites('post', `${BASE}/orders/${ORDER1}/complete`, () => HttpResponse.json(order({status: 'COMPLETED'})))
        const technician = await openOrder(loginAs('mantenimiento.tecnico'), running)

        await technician.user.click(screen.getByRole('button', {name: 'Modificar'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar MO-000001'})
        expect(dialog).toHaveTextContent('La orden está en curso: ya solo se cambian la descripción, la prioridad y las notas de cierre.')
        expect(within(dialog).queryByRole('textbox', {name: 'Título'})).not.toBeInTheDocument()
        await choose(technician.user, dialog, 'Prioridad', 'Crítica')
        await technician.user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(patches.map((write) => write.body)).toEqual([{priority: 'CRITICAL', version: 3}]))

        await technician.user.click(screen.getByRole('button', {name: 'Completar'}))
        const complete = await screen.findByRole('dialog', {name: 'Completar MO-000001'})
        expect(within(complete).queryByRole('checkbox', {name: /Completar aunque haya líneas/})).not.toBeInTheDocument()
        await technician.user.click(within(complete).getByRole('button', {name: 'Completar'}))
        await waitFor(() => expect(completes.map((write) => write.body)).toEqual([{}]))
        technician.unmount()

        const manager = await openOrder(loginAs('mantenimiento.responsable'), running)
        await manager.user.click(screen.getByRole('button', {name: 'Completar'}))
        const forced = await screen.findByRole('dialog', {name: 'Completar MO-000001'})
        await manager.user.click(within(forced).getByRole('checkbox', {name: /Completar aunque haya líneas/}))
        await typeInto(manager.user, forced, 'Notas de cierre', 'Sin incidencias')
        await manager.user.click(within(forced).getByRole('button', {name: 'Completar'}))
        await waitFor(() => expect(completes.map((write) => write.body)).toEqual([{}, {closingNotes: 'Sin incidencias', force: true}]))
    })

    it('completar con líneas sin sincronizar dice qué hacer según quién lo pide', async () => {
        recordWrites('post', `${BASE}/orders/${ORDER1}/complete`, () => maintenanceError(409, 'MAT-001',
            'Order MO-000001 has material lines not synchronized with stock'))
        const {user} = await openOrder(loginAs('mantenimiento.tecnico'), order({status: 'IN_PROGRESS'}))

        await user.click(screen.getByRole('button', {name: 'Completar'}))
        await user.click(within(await screen.findByRole('dialog', {name: 'Completar MO-000001'})).getByRole('button', {name: 'Completar'}))
        expect(await screen.findByText(/o pide a quien supervisa que la complete igualmente\./)).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Completar MO-000001'})).toBeInTheDocument()
    })

    it('la pestaña Tareas añade, genera, modifica y cancela solo las abiertas, y cada cambio relee la cabecera', async () => {
        const draft = order({status: 'DRAFT'})
        const generates = recordWrites('post', `${BASE}/orders/${ORDER1}/tasks/generate`, () => HttpResponse.json({createdTasks: 14,
            skippedProfiles: 2, totalTasks: 16, estimatedMinutes: 720.0, estimatedShifts: 3}))
        const creates = recordWrites('post', `${BASE}/orders/${ORDER1}/tasks`, () => HttpResponse.json(task(TASK2, 3, 'PENDING'), {status: 201}))
        const patches = recordWrites('patch', `${BASE}/orders/${ORDER1}/tasks/${TASK1}`, () => HttpResponse.json(task(TASK1, 1, 'PENDING')))
        const cancels = recordWrites('post', `${BASE}/orders/${ORDER1}/tasks/${TASK1}/cancel`, () => HttpResponse.json(task(TASK1, 1, 'CANCELLED')))
        const {user, requests} = await openOrder(loginAs('mantenimiento.tecnico'), draft,
            {tasks: {[ORDER1]: [task(TASK2, 2, 'COMPLETED'), task(TASK1, 1, 'PENDING')]}})

        await waitFor(() => expect(firstColumn('Tareas de MO-000001')).toEqual(['1', '2']))
        expect(textsOf(dataRows('Tareas de MO-000001')[0]).slice(0, 7))
            .toEqual(['1', 'Perfil 12-2.27', 'PRF-0001 - 12-2.27', '12.27', 'RG-01', 'Pendiente', ''])
        expect(actionsOf(rowOf('Tareas de MO-000001', '1'))).toEqual(['Modificar la tarea 1', 'Cancelar la tarea 1'])
        expect(actionsOf(rowOf('Tareas de MO-000001', '2'))).toEqual([])

        await user.click(screen.getByRole('button', {name: 'Generar tareas'}))
        const generate = await screen.findByRole('dialog', {name: 'Generar tareas de MO-000001'})
        expect(generate).toHaveTextContent('Una tarea por cada perfil habilitado entre los KP 12.1 - 13.45 del tramo')
        await user.click(within(generate).getByRole('button', {name: 'Generar'}))
        expect(await screen.findByText('Tareas nuevas: 14; perfiles que ya tenían tarea: 2. Total: 16, unos 720 min en 3 turnos.'))
            .toBeInTheDocument()
        expect(generates.map((write) => write.body)).toEqual([{}])

        await user.click(screen.getByRole('button', {name: 'Añadir tarea'}))
        const add = await screen.findByRole('dialog', {name: 'Nueva tarea en MO-000001'})
        await typeInto(user, add, 'Descripción', 'Revisar la ménsula')
        await choose(user, add, 'Tipos de tarea', 'RG-04 - Revisión del hilo de contacto')
        await user.click(within(add).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(creates.map((write) => write.body)).toEqual([{description: 'Revisar la ménsula', taskTypeCodes: ['RG-04']}]))

        await user.click(screen.getByRole('button', {name: 'Modificar la tarea 1'}))
        const edit = await screen.findByRole('dialog', {name: 'Tarea 1 de MO-000001'})
        await typeInto(user, edit, 'Notas', 'Falta la llave')
        await user.click(within(edit).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(patches).toEqual([{body: {notes: 'Falta la llave', version: 2}, contentType: MERGE_PATCH}]))

        await user.click(screen.getByRole('button', {name: 'Cancelar la tarea 1'}))
        const cancel = await screen.findByRole('dialog', {name: 'Cancelar la tarea 1'})
        await user.type(within(cancel).getByRole('textbox', {name: 'Motivo'}), 'Perfil desmontado')
        await user.click(within(cancel).getByRole('button', {name: 'Cancelar la tarea'}))
        await waitFor(() => expect(cancels.map((write) => write.body)).toEqual([{reason: 'Perfil desmontado'}]))
        expect(await screen.findByText('Tarea 1 cancelada')).toBeInTheDocument()
        await waitFor(() => expect(readsOf(requests, `${BASE}/orders/${ORDER1}`).length).toBeGreaterThanOrEqual(5))
    })

    it('el checklist de una tarea abierta guarda cada punto con su versión y se repinta con lo que devuelve el servicio', async () => {
        const withChecklist = task(TASK1, 1, 'PENDING', {checkItems: [checkItem()]})
        const items = recordWrites('patch', `${BASE}/orders/${ORDER1}/tasks/${TASK1}/check-items/${ITEM1}`, () => HttpResponse.json({
            ...withChecklist, checkItems: [checkItem({measuredValue: 5800, itemResult: 'DEFECT', outOfRange: true, version: 2})],
        }))
        const {user} = await openOrder(loginAs('mantenimiento.tecnico'), order({status: 'IN_PROGRESS'}), {tasks: {[ORDER1]: [withChecklist]}})

        await user.click(await screen.findByRole('button', {name: 'Checklist de la tarea 1'}))
        const dialog = await screen.findByRole('dialog', {name: 'Checklist de la tarea 1'})
        const point = within(dialog).getByRole('group', {name: 'Punto P-01'})
        expect(point).toHaveTextContent('P-01 Altura del hilo (5300 - 5700 mm)')
        await typeInto(user, point, 'Medida', '5800')
        await choose(user, point, 'Resultado', 'Defecto')
        await user.click(within(point).getByRole('button', {name: 'Guardar P-01'}))

        expect(await screen.findByText('Guardado P-01')).toBeInTheDocument()
        expect(items).toEqual([{body: {measuredValue: 5800, itemResult: 'DEFECT', version: 1}, contentType: MERGE_PATCH}])
        expect(await within(dialog).findByText('Fuera de rango')).toBeInTheDocument()
    })

    it('la pestaña Estados se pide al abrirla y nombra los estados', async () => {
        const {user, requests} = await openOrder(loginAs('mantenimiento.lector'), order(), {history: {[ORDER1]: [
            {id: 'h1', previousStatus: null, newStatus: 'DRAFT', changedAt: '2026-09-20T08:00:00Z', changedBy: 'mantenimiento.tecnico',
                comment: 'Order created'},
            {id: 'h2', previousStatus: 'DRAFT', newStatus: 'PLANNED', changedAt: '2026-09-21T08:00:00Z', changedBy: 'mantenimiento.tecnico',
                comment: null},
        ]}})
        expect(readsOf(requests, `${BASE}/orders/${ORDER1}/history`)).toHaveLength(0)

        await user.click(screen.getByRole('tab', {name: 'Estados'}))
        await waitFor(() => expect(dataRows('Estados de MO-000001')).toHaveLength(2))
        expect(textsOf(dataRows('Estados de MO-000001')[0]).slice(1)).toEqual(['', 'Borrador', 'mantenimiento.tecnico', 'Order created'])
        expect(textsOf(dataRows('Estados de MO-000001')[1])[2]).toBe('Planificada')
    })

    it('el historial de una orden dice cómo quedó en cada revisión', async () => {
        const {user} = await openOrder(loginAs('mantenimiento.lector'), order(), {revisions: {[ORDER1]: [
            revision(4, 'UPDATED', 'mantenimiento.tecnico', 'HTTP', order())]}})

        await user.click(screen.getByRole('button', {name: 'Historial'}))
        await waitFor(() => expect(dataRows('Historial de MO-000001')).toHaveLength(1))
        expect(textsOf(dataRows('Historial de MO-000001')[0]))
            .toContain('Revisión tramo 12 · Planificada · prioridad Alta · plan 14/09/2026 · EQ-01 · mantenimiento.tecnico')
    })

    it('la ficha de una orden marca «Órdenes» en el menú', async () => {
        await openOrder(loginAs('mantenimiento.lector'), order())
        const menu = within(screen.getByRole('navigation', {name: 'Menú principal'}))
        expect(menu.getByRole('link', {name: 'Órdenes'})).toHaveAttribute('aria-current', 'page')
    })
})

const MAT1 = '3c3c3c3c-0000-4000-8000-000000000041'
const WH1 = '3c3c3c3c-0000-4000-8000-000000000042'
const LINE_RESERVED = '3c3c3c3c-0000-4000-8000-000000000051'
const LINE_FAILED = '3c3c3c3c-0000-4000-8000-000000000052'
const LINE_CONSUMED = '3c3c3c3c-0000-4000-8000-000000000053'
const PROJECT = '3c3c3c3c-0000-4000-8000-000000000054'
const OTHER_PROJECT = '3c3c3c3c-0000-4000-8000-000000000055'
const LINE_REJECTED = '3c3c3c3c-0000-4000-8000-000000000056'
const LINE_OUTPUT = '3c3c3c3c-0000-4000-8000-000000000058'
const REJECTION = "mto-stock rejected 'reserve' with 422 WH-001: Warehouse WH-000 is inactive"
const STOCK_CATALOGUES = Object.freeze({
    materials: [{id: MAT1, code: 'MAT-001', name: 'Péndola', unitOfMeasure: 'ud', minimumStockLevel: null, active: true}],
    warehouses: [{id: WH1, code: 'WH-000', name: 'Central', active: true}],
    projects: [
        {id: PROJECT, code: 'EP-3', name: 'Paquete norte', active: true, sourceService: 'mto-configuration', synchronizedFromMasterData: true},
        {id: OTHER_PROJECT, code: 'EP-5', name: 'Paquete sur', active: true, sourceService: 'mto-configuration', synchronizedFromMasterData: true},
    ],
})

/** Una línea de material como la del backoffice: cuatro péndolas del almacén central. */
function line(id, status, extra = {}) {
    return {
        id, orderId: ORDER1, taskId: null, materialId: MAT1, materialCode: 'MAT-001', materialDescriptionSnapshot: 'Péndola', warehouseId: WH1,
        plannedQuantity: 4, consumedQuantity: status === 'CONSUMED' ? 4 : 0, unit: 'ud', allowOverConsumption: false,
        stockReservationId: status === 'RESERVED' || status === 'CONSUMED' ? '3c3c3c3c-0000-4000-8000-000000000099' : null,
        stockSyncStatus: status, stockSyncError: {FAILED: 'Stock service unavailable', REJECTED: REJECTION}[status] ?? null,
        stockRequestInDoubt: null, version: 2, audit: null, ...extra,
    }
}

/** Una línea fallida que mandó esa petición al almacén y se quedó sin respuesta. */
function inDoubt(id, request) {
    return line(id, 'FAILED', {stockSyncError: `${request === 'OUTPUT' ? 'consume' : 'reserve'}: Read timed out`, stockRequestInDoubt: request})
}

const MATERIALS = 'Materiales de MO-000001'
const PENDOLA = 'MAT-001 - Péndola'

/** Abre la ficha de una orden en la pestaña Materiales, con la tarea 1 y los catálogos de mto-stock. */
async function openMaterials(session, current, lines, options = {}) {
    const view = await openOrder(session, current, {tasks: {[ORDER1]: [task(TASK1, 1, 'PENDING')]}, materials: {[ORDER1]: lines},
        stock: STOCK_CATALOGUES, ...options})
    await view.user.click(screen.getByRole('tab', {name: 'Materiales'}))
    const expected = typeof lines === 'function' ? lines(1).length : lines.length
    if (expected > 0) {
        await waitFor(() => expect(dataRows(MATERIALS)).toHaveLength(expected))
    } else {
        await screen.findByText('La orden no tiene materiales.')
    }
    return view
}

/** El texto del tooltip de un estado, al pasar por encima. */
async function tooltipOf(user, element) {
    await user.hover(element)
    const tooltip = await screen.findByRole('tooltip')
    const text = tooltip.textContent
    await user.unhover(element)
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
    return text
}

describe('las líneas de material', () => {
    it('la pestaña enseña cada línea con su almacén y ofrece lo que admite cada una', async () => {
        const {user, requests, unmount} = await openMaterials(loginAs('mantenimiento.responsable'), order({status: 'PLANNED'}), [
            line(LINE_RESERVED, 'RESERVED', {taskId: TASK1}), line(LINE_FAILED, 'FAILED'), line(LINE_CONSUMED, 'CONSUMED'),
            line(LINE_REJECTED, 'REJECTED'),
        ])

        await waitFor(() => expect(textsOf(dataRows(MATERIALS)[0]).slice(0, 5)).toEqual([PENDOLA, 'WH-000 - Central', '4 ud', '0 ud', 'Tarea 1']))
        expect(readsOf(requests, `${STOCK}/warehouses/${WH1}`)).toHaveLength(1)
        expect(textsOf(dataRows(MATERIALS)[1])[5]).toBe('Fallida')
        expect(await tooltipOf(user, within(dataRows(MATERIALS)[1][5]).getByText('Fallida'))).toBe('Stock service unavailable')
        expect(textsOf(dataRows(MATERIALS)[2])[5]).toBe('Consumida')
        expect(await tooltipOf(user, within(dataRows(MATERIALS)[3][5]).getByText('Rechazada'))).toBe(REJECTION)

        const rows = rowElements(MATERIALS)
        expect(actionsOf(rows[0])).toEqual([`Modificar ${PENDOLA}`, `Comprobar la reserva de ${PENDOLA} en el almacén`, `Quitar ${PENDOLA}`])
        expect(actionsOf(rows[1])).toEqual([`Modificar ${PENDOLA}`, `Sincronizar ${PENDOLA} con el almacén`, `Quitar ${PENDOLA}`])
        expect(actionsOf(rows[2])).toEqual([])
        expect(actionsOf(rows[3])).toEqual([`Modificar ${PENDOLA}`, `Sincronizar ${PENDOLA} con el almacén`, `Quitar ${PENDOLA}`])
        expect(screen.getByRole('button', {name: 'Añadir material'})).toBeInTheDocument()
        unmount()

        await openMaterials(loginAs('mantenimiento.lector'), order({status: 'PLANNED'}), [line(LINE_FAILED, 'FAILED')])
        expect(actionsOf(rowElements(MATERIALS)[0])).toEqual([])
        expect(screen.queryByRole('button', {name: 'Añadir material'})).not.toBeInTheDocument()
    })

    it('una línea se registra desde el almacén, y de una reservada solo cambia lo consumido', async () => {
        const reserved = line(LINE_RESERVED, 'RESERVED', {taskId: TASK1})
        const posts = recordWrites('post', `${BASE}/orders/${ORDER1}/materials`, () => HttpResponse.json(reserved, {status: 201}))
        const patches = recordWrites('patch', `${BASE}/orders/${ORDER1}/materials/${LINE_RESERVED}`, () => HttpResponse.json(reserved))
        const {user, requests, unmount} = await openMaterials(loginAs('mantenimiento.tecnico'), order({status: 'PLANNED'}), [reserved])

        await user.click(screen.getByRole('button', {name: 'Añadir material'}))
        const add = await screen.findByRole('dialog', {name: 'Nuevo material en MO-000001'})
        expect(add).toHaveTextContent('La orden ya está planificada: la línea se reserva al momento en el almacén.')
        await choose(user, add, 'Material', PENDOLA)
        await choose(user, add, 'Almacén', 'WH-000 - Central')
        expect(readsOf(requests, `${STOCK}/materials`).length).toBeGreaterThan(0)
        expect(readsOf(requests, `${STOCK}/materials`).every((url) => param(url, 'active') === 'true')).toBe(true)
        expect(readsOf(requests, `${STOCK}/warehouses`).every((url) => param(url, 'active') === 'true')).toBe(true)
        await typeInto(user, add, 'Previsto', '4')
        await choose(user, add, 'Tarea', '1 · Perfil 12-2.27')
        await user.click(within(add).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(posts.map((write) => write.body))
            .toEqual([{materialId: MAT1, warehouseId: WH1, plannedQuantity: 4, unit: 'ud', taskId: TASK1}]))
        expect(await screen.findByText('MAT-001 añadido a MO-000001')).toBeInTheDocument()

        await user.click(screen.getByRole('button', {name: `Modificar ${PENDOLA}`}))
        const edit = await screen.findByRole('dialog', {name: `Modificar ${PENDOLA}`})
        expect(within(edit).getByRole('textbox', {name: 'Previsto'})).toHaveAttribute('readonly')
        expect(edit).toHaveTextContent('Tiene reserva en el almacén: para cambiar lo previsto, quita la línea y regístrala de nuevo')
        await typeInto(user, edit, 'Consumido', '3')
        await user.click(within(edit).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(patches).toEqual([{body: {consumedQuantity: 3, version: 2}, contentType: MERGE_PATCH}]))
        unmount()

        const withoutStock = await openMaterials(sessionWith([P.MAINTENANCE_READ, P.MAINTENANCE_WRITE, P.CONFIG_READ]), order({status: 'PLANNED'}),
            [reserved])
        expect(screen.queryByRole('button', {name: 'Añadir material'})).not.toBeInTheDocument()
        expect(screen.getByText('Añadir materiales pide leer el almacén (stock-read).')).toBeInTheDocument()
        expect(textsOf(dataRows(MATERIALS)[0])[1]).toBe('#3c3c3c3c')
        expect(withoutStock.requests.some((url) => url.pathname.startsWith(STOCK))).toBe(false)
    })

    it('el alta exige material, almacén y lo previsto, y no admite una cantidad negativa', async () => {
        const posts = recordWrites('post', `${BASE}/orders/${ORDER1}/materials`, () => HttpResponse.json(line(LINE_FAILED, 'NOT_REQUESTED'),
            {status: 201}))
        const {user} = await openMaterials(loginAs('mantenimiento.tecnico'), order({status: 'DRAFT'}), [])

        await user.click(screen.getByRole('button', {name: 'Añadir material'}))
        const add = await screen.findByRole('dialog', {name: 'Nuevo material en MO-000001'})
        expect(add).not.toHaveTextContent('La orden ya está planificada')
        await typeInto(user, add, 'Previsto', '-1')
        await user.click(within(add).getByRole('button', {name: 'Guardar'}))
        expect(await within(add).findByText('El material es obligatorio')).toBeInTheDocument()
        expect(within(add).getByText('El almacén es obligatorio')).toBeInTheDocument()
        expect(within(add).getByText('No puede ser negativo')).toBeInTheDocument()
        expect(posts).toHaveLength(0)

        await choose(user, add, 'Material', PENDOLA)
        await choose(user, add, 'Almacén', 'WH-000 - Central')
        await typeInto(user, add, 'Previsto', '0')
        await user.click(within(add).getByRole('checkbox', {name: 'Admite consumir más de lo previsto'}))
        await user.click(within(add).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(posts.map((write) => write.body))
            .toEqual([{materialId: MAT1, warehouseId: WH1, plannedQuantity: 0, unit: 'ud', allowOverConsumption: true}]))
    })

    it('quitar una línea reservada avisa de su reserva, el almacén caído se avisa, y sincronizar una fallida dice cómo quedó', async () => {
        const deletes = recordWrites('delete', `${BASE}/orders/${ORDER1}/materials/${LINE_RESERVED}`, (_body, call) => (call === 1
            ? maintenanceError(503, 'STK-503', 'Stock service unavailable')
            : new HttpResponse(null, {status: 204})))
        const syncs = recordWrites('post', `${BASE}/orders/${ORDER1}/materials/${LINE_FAILED}/sync`,
            () => HttpResponse.json(line(LINE_FAILED, 'RESERVED')))
        const {user, requests} = await openMaterials(loginAs('mantenimiento.responsable'), order({status: 'PLANNED'}),
            [line(LINE_RESERVED, 'RESERVED', {taskId: TASK1}), line(LINE_FAILED, 'FAILED')])
        const reads = () => readsOf(requests, `${BASE}/orders/${ORDER1}/materials`).length

        await user.click(within(rowElements(MATERIALS)[0]).getByRole('button', {name: `Quitar ${PENDOLA}`}))
        const confirm = await screen.findByRole('dialog', {name: `Quitar ${PENDOLA}`})
        expect(confirm).toHaveTextContent('Se libera antes su reserva en el almacén, y la línea desaparece (queda en su historial).')
        await user.click(within(confirm).getByRole('button', {name: 'Quitar'}))
        expect(await screen.findByText(
            'El almacén no responde: la línea de material se queda como estaba. Inténtalo más tarde. Stock service unavailable')).toBeInTheDocument()
        await waitFor(() => expect(reads()).toBe(2))

        await user.click(within(rowElements(MATERIALS)[0]).getByRole('button', {name: `Quitar ${PENDOLA}`}))
        await user.click(within(await screen.findByRole('dialog', {name: `Quitar ${PENDOLA}`})).getByRole('button', {name: 'Quitar'}))
        expect(await screen.findByText('Quitado MAT-001')).toBeInTheDocument()
        expect(deletes).toHaveLength(2)
        await waitFor(() => expect(reads()).toBe(3))

        await user.click(within(rowElements(MATERIALS)[1]).getByRole('button', {name: `Sincronizar ${PENDOLA} con el almacén`}))
        expect(await screen.findByText('MAT-001: reservada')).toBeInTheDocument()
        expect(syncs).toHaveLength(1)
        await waitFor(() => expect(reads()).toBe(4))
    })

    it('sincronizar una rechazada dice por qué dijo que no el almacén y relee la línea; terminada la orden, solo queda reintentar', async () => {
        recordWrites('post', `${BASE}/orders/${ORDER1}/materials/${LINE_REJECTED}/sync`, (_body, call) => (call === 1
            ? maintenanceError(422, 'STK-422', REJECTION)
            : maintenanceError(409, 'STK-001', "mto-stock rejected 'reserve' with 409 STK-001: Insufficient stock")))
        const {user, requests, unmount} = await openMaterials(loginAs('mantenimiento.tecnico'), order({status: 'IN_PROGRESS'}),
            [line(LINE_REJECTED, 'REJECTED')])
        const sync = () => user.click(screen.getByRole('button', {name: `Sincronizar ${PENDOLA} con el almacén`}))

        await sync()
        expect(await screen.findByText(`El almacén ha rechazado la operación. ${REJECTION}`)).toBeInTheDocument()
        await waitFor(() => expect(readsOf(requests, `${BASE}/orders/${ORDER1}/materials`)).toHaveLength(2))
        await sync()
        expect(await screen.findByText("No hay stock disponible suficiente. mto-stock rejected 'reserve' with 409 STK-001: Insufficient stock"))
            .toBeInTheDocument()
        unmount()

        await openMaterials(loginAs('mantenimiento.responsable'), order({status: 'COMPLETED'}),
            [line(LINE_REJECTED, 'REJECTED'), line(LINE_RESERVED, 'RESERVED')])
        const rows = rowElements(MATERIALS)
        expect(actionsOf(rows[0])).toEqual([`Sincronizar ${PENDOLA} con el almacén`])
        expect(actionsOf(rows[1])).toEqual([])
    })

    it('un estado o una petición que no se conocen se pintan como «Desconocido» y no abren nada', async () => {
        await openMaterials(loginAs('mantenimiento.responsable'), order({status: 'IN_PROGRESS'}), [
            line(LINE_RESERVED, 'PARTIALLY_CONSUMED'), {...inDoubt(LINE_FAILED, 'RESERVATION'), stockRequestInDoubt: 'RETURN'},
        ])

        expect(textsOf(dataRows(MATERIALS)[0])[5]).toBe('Desconocido')
        expect(textsOf(dataRows(MATERIALS)[1])[5]).toBe('Fallida · Desconocido')
        const rows = rowElements(MATERIALS)
        expect(actionsOf(rows[0])).toEqual([])
        expect(actionsOf(rows[1])).toEqual([`Modificar ${PENDOLA}`, `Sincronizar ${PENDOLA} con el almacén`])
    })

    it('una línea esperando al almacén lo dice y solo ofrece lo que el servicio acepta mientras tanto', async () => {
        const waiting = inDoubt(LINE_FAILED, 'RESERVATION')
        const patches = recordWrites('patch', `${BASE}/orders/${ORDER1}/materials/${LINE_FAILED}`, () => HttpResponse.json(waiting))
        const deletes = recordWrites('delete', `${BASE}/orders/${ORDER1}/materials/${LINE_FAILED}`, () => new HttpResponse(null, {status: 204}))
        const {user} = await openMaterials(loginAs('mantenimiento.responsable'), order({status: 'IN_PROGRESS'}),
            [waiting, inDoubt(LINE_OUTPUT, 'OUTPUT')])

        expect(textsOf(dataRows(MATERIALS)[0])[5]).toBe('Fallida · Reserva sin respuesta')
        expect(await tooltipOf(user, within(dataRows(MATERIALS)[0][5]).getByText('Fallida · Reserva sin respuesta')))
            .toMatch(/^reserve: Read timed out\. El almacén no contestó: se reintenta sola cada 5 minutos/)
        expect(textsOf(dataRows(MATERIALS)[1])[5]).toBe('Fallida · Salida sin respuesta')
        const rows = rowElements(MATERIALS)
        expect(actionsOf(rows[0])).toEqual([`Modificar ${PENDOLA}`, `Sincronizar ${PENDOLA} con el almacén`, `Quitar ${PENDOLA}`])
        expect(actionsOf(rows[1])).toEqual([`Modificar ${PENDOLA}`, `Sincronizar ${PENDOLA} con el almacén`])

        await user.click(within(rows[0]).getByRole('button', {name: `Modificar ${PENDOLA}`}))
        const edit = await screen.findByRole('dialog', {name: `Modificar ${PENDOLA}`})
        expect(within(edit).getByRole('textbox', {name: 'Previsto'})).toHaveAttribute('readonly')
        expect(within(edit).getByRole('textbox', {name: 'Consumido'})).toHaveAttribute('readonly')
        expect(edit).toHaveTextContent('Reserva sin respuesta. El almacén no contestó')
        await user.click(within(edit).getByRole('checkbox', {name: 'Admite consumir más de lo previsto'}))
        await user.click(within(edit).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(patches).toEqual([{body: {allowOverConsumption: true, version: 2}, contentType: MERGE_PATCH}]))

        await user.click(within(rowElements(MATERIALS)[0]).getByRole('button', {name: `Quitar ${PENDOLA}`}))
        const confirm = await screen.findByRole('dialog', {name: `Quitar ${PENDOLA}`})
        expect(confirm).toHaveTextContent('Antes se confirma con el almacén la reserva que se quedó sin respuesta y se libera')
        await user.click(within(confirm).getByRole('button', {name: 'Quitar'}))
        await waitFor(() => expect(deletes).toHaveLength(1))
    })

    it('el proyecto de almacén de una orden no se ofrece mientras una de sus líneas espera al almacén', async () => {
        const planned = order({status: 'PLANNED'})
        const patches = recordWrites('patch', `${BASE}/orders/${ORDER1}`, () => HttpResponse.json(planned))
        const {user} = await openOrder(loginAs('mantenimiento.responsable'), planned, {stock: STOCK_CATALOGUES,
            materials: {[ORDER1]: (read) => [read === 1 ? inDoubt(LINE_FAILED, 'RESERVATION') : line(LINE_FAILED, 'RESERVED')]}})

        await user.click(screen.getByRole('button', {name: 'Modificar'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar MO-000001'})
        const project = await within(dialog).findByRole('combobox', {name: 'Proyecto de almacén'})
        await waitFor(() => expect(project).toHaveAttribute('readonly'))
        expect(dialog).toHaveTextContent('Hay líneas de material esperando respuesta del almacén: el proyecto no cambia hasta que contesten')
        await choose(user, dialog, 'Prioridad', 'Crítica')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(patches.map((write) => write.body)).toEqual([{priority: 'CRITICAL', version: 3}]))

        await user.click(screen.getByRole('button', {name: 'Modificar'}))
        const again = await screen.findByRole('dialog', {name: 'Modificar MO-000001'})
        await waitFor(() => expect(within(again).getByRole('combobox', {name: 'Proyecto de almacén'})).not.toHaveAttribute('readonly'))
    })

    it('la orden lleva su proyecto de almacén con su nombre, y el editor parte de él', async () => {
        const withProject = order({status: 'DRAFT', stockProjectId: PROJECT})
        const patches = recordWrites('patch', `${BASE}/orders/${ORDER1}`, () => HttpResponse.json({...withProject, stockProjectId: OTHER_PROJECT}))
        const {user} = await openOrder(loginAs('mantenimiento.tecnico'), withProject, {stock: STOCK_CATALOGUES})

        await waitFor(() => expect(screen.getByLabelText('Resumen de la orden')).toHaveTextContent('Proyecto de almacén: EP-3 - Paquete norte'))
        await user.click(screen.getByRole('button', {name: 'Modificar'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar MO-000001'})
        expect(within(dialog).getByRole('combobox', {name: 'Proyecto de almacén'})).toHaveValue('EP-3 - Paquete norte')
        await choose(user, dialog, 'Proyecto de almacén', 'EP-5 - Paquete sur')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(patches.map((write) => write.body)).toEqual([{stockProjectId: OTHER_PROJECT, version: 3}]))
    })
})

const SHIFT1 = '3c3c3c3c-0000-4000-8000-000000000031'
const DISC1 = '3c3c3c3c-0000-4000-8000-000000000032'
const ORDER2 = '3c3c3c3c-0000-4000-8000-000000000013'
const TASK3 = '3c3c3c3c-0000-4000-8000-000000000023'
const DISCONNECTOR = Object.freeze({id: DISC1, code: 'DIS-0005', name: 'HSA-NS5', type: 'DISCONNECTOR', trackId: 12, startKp: 12, endKp: 12,
    sectioning: null, enabled: true})

/** Un turno como el del backoffice: la noche del 5 de octubre en la vía 12, con posesión total y un seccionador abierto. */
function shift(status, extra = {}) {
    return {
        id: SHIFT1, code: 'SH-000001', shiftDate: '2026-10-05', team: TEAM_SUMMARY, baseName: 'Base Norte', vehicle: 'DR-2', possessionType: 'FULL',
        plannedStart: null, plannedEnd: null, actualStart: null, actualEnd: null, voltageCutoffAt: null, netWorkMinutes: null,
        blockingDisconnectors: [DISCONNECTOR], earthingPoints: null, parkingPlace: null, executionPackageId: 3, trackIds: [12], startKp: 12,
        endKp: 14, personnel: null, measurementEquipment: null, status, observations: null, audit: null, version: 3, ...extra,
    }
}

async function openShift(session, current, options = {}) {
    const requests = serveMaintenance({teams: TEAMS, taskTypes: TASK_TYPES, ...options, shifts: [current, ...(options.shifts ?? [])]})
    const view = renderRoute(`/mantenimiento/turnos/${current.id}`, {session})
    await screen.findByRole('heading', {name: `${current.code} · 05/10/2026`})
    return {...view, requests}
}

const shiftStatus = () => screen.getByLabelText('Estado del turno')

/** Lo que guarda el navegador al descargar: el nombre de cada fichero. */
function captureDownloads() {
    Object.defineProperty(URL, 'createObjectURL', {value: vi.fn(() => 'blob:mto/1'), configurable: true})
    Object.defineProperty(URL, 'revokeObjectURL', {value: vi.fn(), configurable: true})
    const saved = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
        saved.push(this.download)
    })
    return saved
}

describe('los turnos', () => {
    afterEach(() => {
        delete URL.createObjectURL
        delete URL.revokeObjectURL
    })

    it('se filtran en el servidor, el más reciente primero, y una fila abre su ficha, que quien solo lee no puede tocar', async () => {
        const requests = serveMaintenance({teams: TEAMS, shifts: [shift('IN_PROGRESS')]})
        const {user} = await open('/mantenimiento/turnos', loginAs('mantenimiento.lector'), 'Turnos', 1)
        const lists = () => readsOf(requests, `${BASE}/shifts`)

        expect(lists()[0].search).toBe('?page=0&size=50&sort=shiftDate%2Cdesc&sort=id%2Casc')
        expect(textsOf(dataRows('Turnos')[0]).slice(0, 7))
            .toEqual(['SH-000001', '05/10/2026', 'EQ-01 - Brigada norte', 'Total', 'VIA 1 (PAQ NORTE)', '12 - 14', 'En curso'])
        await user.type(screen.getByRole('textbox', {name: 'Desde'}), '01/10/2026')
        await user.type(screen.getByRole('textbox', {name: 'Hasta'}), '31/10/2026')
        await user.tab()
        await choose(user, document.body, 'Equipo', 'EQ-01 - Brigada norte')
        await choose(user, document.body, 'Vía', 'VIA 1 (PAQ NORTE)')
        await choose(user, document.body, 'Paquete', 'PAQ NORTE')
        await choose(user, document.body, 'Estado', 'En curso')
        await choose(user, document.body, 'Posesión', 'Total')
        await waitFor(() => expect(param(lists().at(-1), 'possessionType')).toBe('FULL'))
        const last = lists().at(-1)
        expect(['dateFrom', 'dateTo', 'teamId', 'trackId', 'executionPackageId', 'status'].map((name) => param(last, name)))
            .toEqual(['2026-10-01', '2026-10-31', TEAM1, '12', '3', 'IN_PROGRESS'])
        await waitFor(() => expect(firstColumn('Turnos')).toEqual(['SH-000001']))
        expect(screen.queryByRole('button', {name: 'Nuevo turno'})).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', {name: 'Abrir SH-000001'}))
        expect(await screen.findByRole('heading', {name: 'SH-000001 · 05/10/2026'})).toBeInTheDocument()
        expect(screen.getByLabelText('Resumen del turno')).toHaveTextContent(
            'Equipo: EQ-01 - Brigada norte · Base: Base Norte · Vehículo: DR-2')
        expect(screen.getByLabelText('Resumen del turno')).toHaveTextContent('Vías: VIA 1 (PAQ NORTE) · KP 12 - 14 · Paquete: PAQ NORTE')
        expect(screen.getByLabelText('Resumen del turno')).toHaveTextContent('Seccionadores abiertos: DIS-0005 - HSA-NS5')
        for (const name of ['Modificar', 'Asignar tareas', 'Cerrar', 'Cancelar']) {
            expect(screen.queryByRole('button', {name})).not.toBeInTheDocument()
        }
    })

    it('un turno nuevo pide una vía y manda sus seccionadores, y abre su ficha', async () => {
        const created = shift('PLANNED')
        const posts = recordWrites('post', `${BASE}/shifts`, () => HttpResponse.json(created, {status: 201}))
        const requests = serveMaintenance({teams: TEAMS, shifts: [created], assets: [DISCONNECTOR]})
        const {user, router} = await open('/mantenimiento/turnos', loginAs('mantenimiento.tecnico'), 'Turnos', 1)

        await user.click(screen.getByRole('button', {name: 'Nuevo turno'}))
        const dialog = await screen.findByRole('dialog', {name: 'Nuevo turno'})
        const date = within(dialog).getByRole('textbox', {name: 'Fecha'})
        await user.clear(date)
        await user.type(date, '05/10/2026')
        await choose(user, dialog, 'Posesión', 'Total')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('Al menos una vía')).toBeInTheDocument()
        expect(posts).toHaveLength(0)

        await choose(user, dialog, 'Vías', 'VIA 1 (PAQ NORTE)')
        await choose(user, dialog, 'Seccionadores que se abren', 'DIS-0005 - HSA-NS5')
        const search = readsOf(requests, `${BASE}/assets`).at(-1)
        expect([param(search, 'type'), param(search, 'enabled')]).toEqual(['DISCONNECTOR', 'true'])
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        await waitFor(() => expect(posts.map((write) => write.body))
            .toEqual([{shiftDate: '2026-10-05', possessionType: 'FULL', blockingDisconnectorIds: [DISC1], trackIds: [12]}]))
        await waitFor(() => expect(router.state.location.pathname).toBe(`/mantenimiento/turnos/${SHIFT1}`))
        expect(await screen.findByRole('heading', {name: 'SH-000001 · 05/10/2026'})).toBeInTheDocument()
    })

    it('sin config-read no se ofrece el alta: no habría vías entre las que elegir', async () => {
        const requests = serveMaintenance({teams: TEAMS, shifts: [shift('PLANNED')]})
        await open('/mantenimiento/turnos', sessionWith([P.MAINTENANCE_READ, P.MAINTENANCE_WRITE]), 'Turnos', 1)

        expect(screen.queryByRole('button', {name: 'Nuevo turno'})).not.toBeInTheDocument()
        expect(textsOf(dataRows('Turnos')[0])[4]).toBe('#12')
        expect(requests.some((request) => request.pathname.startsWith(CONFIGURATION))).toBe(false)
    })

    it('el editor manda solo lo cambiado con la versión leída: las vías enteras y los seccionadores quitados, a null', async () => {
        const patches = recordWrites('patch', `${BASE}/shifts/${SHIFT1}`, () => HttpResponse.json(shift('PLANNED', {trackIds: [12, 14],
            blockingDisconnectors: [], baseName: null, version: 4})))
        const {user} = await openShift(loginAs('mantenimiento.tecnico'), shift('PLANNED'))

        await user.click(screen.getByRole('button', {name: 'Modificar'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar SH-000001'})
        expect(within(dialog).getByRole('textbox', {name: 'Fecha'})).toHaveValue('05/10/2026')
        await typeInto(user, dialog, 'Base', '')
        await choose(user, dialog, 'Vías', 'VIA 2 (PAQ NORTE)')
        await user.click(within(dialog).getByRole('combobox', {name: 'Seccionadores que se abren'}))
        await user.keyboard('{Backspace}')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        await waitFor(() => expect(patches).toHaveLength(1))
        expect(patches[0]).toEqual({body: {baseName: null, blockingDisconnectorIds: null, trackIds: [12, 14], version: 3}, contentType: MERGE_PATCH})
        expect(await screen.findByText('Guardado SH-000001')).toBeInTheDocument()
        await waitFor(() => expect(screen.getByLabelText('Resumen del turno')).toHaveTextContent('Vías: VIA 1 (PAQ NORTE), VIA 2 (PAQ NORTE)'))
        expect(screen.getByLabelText('Resumen del turno')).toHaveTextContent('Seccionadores abiertos: -')
    })

    it('la ficha ofrece lo que admite su estado, e iniciar y cerrar repintan el turno', async () => {
        const starts = recordWrites('post', `${BASE}/shifts/${SHIFT1}/start`, () => HttpResponse.json(shift('IN_PROGRESS', {
            actualStart: '2026-10-05T21:00:00Z'})))
        const closes = recordWrites('post', `${BASE}/shifts/${SHIFT1}/close`, () => HttpResponse.json(shift('CLOSED', {
            actualStart: '2026-10-05T21:00:00Z', actualEnd: '2026-10-06T03:00:00Z', netWorkMinutes: 240})))
        const {user} = await openShift(loginAs('mantenimiento.tecnico'), shift('PLANNED'), {orders: [order({status: 'IN_PROGRESS'})],
            shiftTasks: {[SHIFT1]: [task(TASK1, 1, 'PENDING', {shiftId: SHIFT1})]}})

        for (const name of ['Modificar', 'Asignar tareas', 'Iniciar', 'Cancelar']) {
            expect(screen.getByRole('button', {name})).toBeInTheDocument()
        }
        await waitFor(() => expect(actionsOf(rowElements('Tareas de SH-000001')[0]))
            .toEqual(['Abrir la orden de la tarea 1 de MO-000001', 'Cancelar la tarea 1 de MO-000001']))
        expect(screen.queryByRole('button', {name: 'Cerrar'})).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', {name: 'Iniciar'}))
        const start = await screen.findByRole('dialog', {name: 'Iniciar SH-000001'})
        await user.click(within(start).getByRole('button', {name: 'Iniciar'}))
        await waitFor(() => expect(starts.map((write) => write.body)).toEqual([{}]))
        expect(await screen.findByText('SH-000001: en curso')).toBeInTheDocument()
        await waitFor(() => expect(shiftStatus()).toHaveTextContent('En curso'))
        expect(screen.queryByRole('button', {name: 'Iniciar'})).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', {name: 'Cerrar'}))
        const finish = await screen.findByRole('dialog', {name: 'Cerrar SH-000001'})
        expect(finish).toHaveTextContent('Las tareas que no se terminaron vuelven a su orden, sin cancelarse.')
        await typeInto(user, finish, 'Minutos netos de trabajo', '240')
        await user.click(within(finish).getAllByRole('button', {name: 'Cerrar'}).at(-1))
        await waitFor(() => expect(closes.map((write) => write.body)).toEqual([{netWorkMinutes: 240}]))
        await waitFor(() => expect(shiftStatus()).toHaveTextContent('Cerrado'))
        expect(screen.getByLabelText('Resumen del turno')).toHaveTextContent('Neto: 240 min')
        for (const name of ['Modificar', 'Asignar tareas', 'Cerrar', 'Cancelar']) {
            expect(screen.queryByRole('button', {name})).not.toBeInTheDocument()
        }
    })

    it('cancelar pide un motivo, y un turno que no existe se dice una vez y vuelve a la lista', async () => {
        const cancels = recordWrites('post', `${BASE}/shifts/${SHIFT1}/cancel`, () => HttpResponse.json(shift('CANCELLED', {
            observations: 'Cancelled: Lluvia'})))
        const {user, unmount} = await openShift(loginAs('mantenimiento.tecnico'), shift('PLANNED'))

        await user.click(screen.getByRole('button', {name: 'Cancelar'}))
        const dialog = await screen.findByRole('dialog', {name: 'Cancelar SH-000001'})
        await user.type(within(dialog).getByRole('textbox', {name: 'Motivo'}), 'Lluvia')
        await user.click(within(dialog).getByRole('button', {name: 'Cancelar el turno'}))
        expect(await screen.findByText('SH-000001 cancelado')).toBeInTheDocument()
        expect(cancels.map((write) => write.body)).toEqual([{reason: 'Lluvia'}])
        await waitFor(() => expect(shiftStatus()).toHaveTextContent('Cancelado'))
        expect(screen.getByLabelText('Resumen del turno')).toHaveTextContent('Observaciones: Cancelled: Lluvia')
        unmount()

        serveMaintenance({teams: TEAMS})
        const missing = '3c3c3c3c-0000-4000-8000-0000000000fe'
        const {router} = renderRoute(`/mantenimiento/turnos/${missing}`, {session: loginAs('mantenimiento.lector')})
        expect(await screen.findByText(`No existe el turno ${missing}`)).toBeInTheDocument()
        await waitFor(() => expect(router.state.location.pathname).toBe('/mantenimiento/turnos'))
    })

    it('asignar tareas solo ofrece las órdenes abiertas de la vía y cuenta las que el servicio rechaza', async () => {
        recordWrites('post', `${BASE}/shifts/${SHIFT1}/tasks/${TASK1}`, () => HttpResponse.json(task(TASK1, 1, 'PENDING', {shiftId: SHIFT1})))
        recordWrites('post', `${BASE}/shifts/${SHIFT1}/tasks/${TASK2}`, () => maintenanceError(409, 'SHF-001',
            'Shift SH-000001 has partial possession; the task includes work that needs full track possession'))
        const {user, requests} = await openShift(loginAs('mantenimiento.tecnico'), shift('IN_PROGRESS'), {
            orders: [order({status: 'IN_PROGRESS'}), order({id: ORDER2, code: 'MO-000002', status: 'COMPLETED'})],
            tasks: {[ORDER1]: [task(TASK1, 1, 'PENDING'), task(TASK2, 2, 'PENDING'), task(TASK3, 3, 'COMPLETED')]},
        })

        await user.click(screen.getByRole('button', {name: 'Asignar tareas'}))
        const dialog = await screen.findByRole('dialog', {name: 'Asignar tareas a SH-000001'})
        await user.click(within(dialog).getByRole('combobox', {name: 'Orden'}))
        expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['MO-000001 · Revisión tramo 12 (en curso)'])
        const search = readsOf(requests, `${BASE}/orders`).at(-1)
        expect([param(search, 'trackId'), param(search, 'size'), search.searchParams.getAll('sort')])
            .toEqual(['12', '100', ['plannedDate,asc', 'id,asc']])
        await user.click(screen.getByRole('option', {name: 'MO-000001 · Revisión tramo 12 (en curso)'}))
        await waitFor(() => expect(dataRows('Tareas pendientes para SH-000001')).toHaveLength(2))
        await user.click(within(dialog).getByRole('checkbox', {name: 'Elegir la tarea 1'}))
        await user.click(within(dialog).getByRole('checkbox', {name: 'Elegir la tarea 2'}))
        await user.click(within(dialog).getByRole('button', {name: 'Asignar'}))

        expect(await screen.findByText('Asignadas: 1. Rechazadas: tarea 2 (El turno no admite ese trabajo. Shift SH-000001 has partial '
            + 'possession; the task includes work that needs full track possession)')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Asignar tareas a SH-000001'})).toBeInTheDocument()
    })

    it('una tarea se inicia, se rellena su checklist y se completa en el turno con sus defectos y materiales', async () => {
        const withChecklist = task(TASK1, 1, 'PENDING', {shiftId: SHIFT1, checkItems: [checkItem()]})
        const starts = recordWrites('post', `${BASE}/orders/${ORDER1}/tasks/${TASK1}/start`, () => HttpResponse.json({...withChecklist,
            status: 'IN_PROGRESS'}))
        const items = recordWrites('patch', `${BASE}/orders/${ORDER1}/tasks/${TASK1}/check-items/${ITEM1}`, (_body, call) => (call === 1
            ? maintenanceError(422, 'INS-001', 'Item P-01 is out of range (5250 mm) and cannot be OK unless adjusted into range')
            : HttpResponse.json({...withChecklist, checkItems: [checkItem({measuredValue: 5250, itemResult: 'DEFECT', outOfRange: true, version: 2})]})))
        const completes = recordWrites('post', `${BASE}/orders/${ORDER1}/tasks/${TASK1}/complete`, () => HttpResponse.json({...withChecklist,
            status: 'COMPLETED'}))
        const {user, requests} = await openShift(loginAs('mantenimiento.tecnico'), shift('IN_PROGRESS'), {
            orders: [order({status: 'IN_PROGRESS'})], shiftTasks: {[SHIFT1]: [withChecklist]}, stock: STOCK_CATALOGUES,
        })
        const name = 'la tarea 1 de MO-000001'

        await waitFor(() => expect(firstColumn('Tareas de SH-000001')).toEqual(['MO-000001']))
        expect(readsOf(requests, `${BASE}/orders/${ORDER1}`)).toHaveLength(1)
        await user.click(screen.getByRole('button', {name: `Iniciar ${name}`}))
        await waitFor(() => expect(starts.map((write) => write.body)).toEqual([{shiftId: SHIFT1}]))
        expect(await screen.findByText('Tarea 1 iniciada')).toBeInTheDocument()

        await user.click(screen.getByRole('button', {name: `Checklist de ${name}`}))
        const checklist = await screen.findByRole('dialog', {name: `Checklist de ${name}`})
        const point = within(checklist).getByRole('group', {name: 'Punto P-01'})
        await typeInto(user, point, 'Medida', '5250')
        await choose(user, point, 'Resultado', 'Correcto')
        await user.click(within(point).getByRole('button', {name: 'Guardar P-01'}))
        expect(await screen.findByText('La inspección o su checklist no admiten esta operación. Item P-01 is out of range (5250 mm) and cannot be '
            + 'OK unless adjusted into range')).toBeInTheDocument()
        await choose(user, point, 'Resultado', 'Defecto')
        await user.click(within(point).getByRole('button', {name: 'Guardar P-01'}))
        await waitFor(() => expect(items.at(-1)).toEqual({body: {measuredValue: 5250, itemResult: 'DEFECT', version: 1}, contentType: MERGE_PATCH}))
        await user.click(within(checklist).getAllByRole('button', {name: 'Cerrar'}).at(-1))

        await user.click(screen.getByRole('button', {name: `Completar ${name}`}))
        const complete = await screen.findByRole('dialog', {name: `Completar ${name} · PRF-0001 - 12-2.27`})
        expect(within(complete).getByRole('combobox', {name: 'Turno'})).toHaveValue('SH-000001 · 05/10/2026 · EQ-01 - Brigada norte')
        await user.click(within(complete).getByRole('button', {name: 'Añadir defecto'}))
        const defect = await screen.findByRole('dialog', {name: 'Defecto encontrado'})
        await choose(user, defect, 'Gravedad', 'Alta')
        await user.type(within(defect).getByRole('textbox', {name: 'Descripción'}), 'Péndola rota')
        await user.click(within(defect).getByRole('button', {name: 'Añadir'}))
        await user.click(within(complete).getByRole('button', {name: 'Añadir material'}))
        const material = await screen.findByRole('dialog', {name: 'Material usado'})
        await choose(user, material, 'Material', PENDOLA)
        await choose(user, material, 'Almacén', 'WH-000 - Central')
        await typeInto(user, material, 'Cantidad', '2')
        await user.click(within(material).getByRole('button', {name: 'Añadir'}))
        expect(textsOf(dataRows(`Defectos de ${name}`)[0]).slice(0, 2)).toEqual(['Alta', 'Péndola rota'])
        expect(textsOf(dataRows(`Materiales de ${name}`)[0]).slice(0, 3)).toEqual([PENDOLA, 'WH-000 - Central', '2 ud'])
        await user.click(within(complete).getByRole('checkbox', {name: 'Trabajo terminado en este turno'}))
        await user.type(within(complete).getByRole('textbox', {name: 'Reparación prevista'}), '12/10/2026')
        await user.click(within(complete).getByRole('button', {name: 'Completar'}))

        await waitFor(() => expect(completes.map((write) => write.body)).toEqual([{
            shiftId: SHIFT1, workComplete: false, repairPlannedDate: '2026-10-12',
            inlineDefects: [{severity: 'HIGH', description: 'Péndola rota'}],
            materials: [{materialId: MAT1, warehouseId: WH1, quantity: 2, unit: 'ud'}],
        }]))
        expect(await screen.findByText('Tarea 1 completada')).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByRole('dialog', {name: `Completar ${name} · PRF-0001 - 12-2.27`})).not.toBeInTheDocument())
        // Al entrar, tras iniciar, tras guardar el punto y tras completar: el turno enseña lo que dice el servicio.
        await waitFor(() => expect(readsOf(requests, `${BASE}/shifts/${SHIFT1}/tasks`).length).toBeGreaterThanOrEqual(4))
    })

    it('completar desde la orden elige un turno en curso de su vía, y sin stock-read no se eligen materiales', async () => {
        const completes = recordWrites('post', `${BASE}/orders/${ORDER1}/tasks/${TASK1}/complete`, () => HttpResponse.json(task(TASK1, 1,
            'COMPLETED')))
        const {user, requests} = await openOrder(sessionWith([P.MAINTENANCE_READ, P.MAINTENANCE_WRITE, P.CONFIG_READ]), order({status: 'IN_PROGRESS'}),
            {tasks: {[ORDER1]: [task(TASK1, 1, 'PENDING')]}, shifts: [shift('IN_PROGRESS')]})

        await user.click(await screen.findByRole('button', {name: 'Completar la tarea 1'}))
        const dialog = await screen.findByRole('dialog', {name: 'Completar la tarea 1 · PRF-0001 - 12-2.27'})
        expect(within(dialog).queryByRole('button', {name: 'Añadir material'})).not.toBeInTheDocument()
        expect(dialog).toHaveTextContent('Elegir materiales pide leer el almacén (stock-read).')
        await user.click(within(dialog).getByRole('button', {name: 'Completar'}))
        expect(await within(dialog).findByText('Hace falta un turno en curso de su vía')).toBeInTheDocument()
        expect(completes).toHaveLength(0)

        await choose(user, dialog, 'Turno', 'SH-000001 · 05/10/2026 · EQ-01 - Brigada norte')
        const search = readsOf(requests, `${BASE}/shifts`).at(-1)
        expect([param(search, 'trackId'), param(search, 'status')]).toEqual(['12', 'IN_PROGRESS'])
        await user.click(within(dialog).getByRole('button', {name: 'Completar'}))
        await waitFor(() => expect(completes.map((write) => write.body)).toEqual([{shiftId: SHIFT1}]))
        expect(requests.some((request) => request.pathname.startsWith(STOCK))).toBe(false)
    })

    it('los perfiles empiezan en los ya revisados y se filtran por el estado de su tarea', async () => {
        const profile = {id: ASSET_SYNCED, code: 'PRF-0001', name: '12-2.27', type: 'PROFILE', trackId: 12, startKp: 12.27, endKp: 12.27,
            sectioning: 'S-3', enabled: true}
        const {user, requests} = await openShift(loginAs('mantenimiento.lector'), shift('IN_PROGRESS'), {
            shiftProfiles: {[SHIFT1]: (status) => (status === 'COMPLETED' ? [profile] : [])},
        })

        await user.click(screen.getByRole('tab', {name: 'Perfiles'}))
        await waitFor(() => expect(dataRows('Perfiles de SH-000001')).toHaveLength(1))
        expect(textsOf(dataRows('Perfiles de SH-000001')[0])).toEqual(['12-2.27', 'PRF-0001', '12.27', 'S-3'])
        expect(param(readsOf(requests, `${BASE}/shifts/${SHIFT1}/profiles`)[0], 'status')).toBe('COMPLETED')
        await choose(user, document.body, 'Tareas', 'Pendiente')
        expect(await screen.findByText('Ningún perfil.')).toBeInTheDocument()
        expect(param(readsOf(requests, `${BASE}/shifts/${SHIFT1}/profiles`).at(-1), 'status')).toBe('PENDING')
    })

    it('el parte se pide al abrir su pestaña, enseña lo que compone el servicio y descarga sus ficheros', async () => {
        const closed = shift('CLOSED')
        const row = {number: 1, taskId: TASK1, orderCode: 'MO-000001', executionPackageId: 3, trackId: 12, profileCode: 'PRF-0001',
            profileName: '12-2.27', kp: 12.27, sectioning: 'S-3', switches: [], taskTypeCodes: ['RG-01', 'RG-04'], worksPerformed: 'Revisión general',
            defectsFound: 'DEF-000001', materials: ['MAT-001 2 m'], startedAt: null, completedAt: null, status: 'COMPLETED', workComplete: true,
            repairPlannedDate: null, photoRefs: []}
        const {user, requests} = await openShift(loginAs('mantenimiento.lector'), closed, {shiftReports: {[SHIFT1]: {
            shift: closed, tasksCompleted: 2, tasksPending: 1, profilesReviewed: 2, defectsFound: 1, defectsResolved: 0, rows: [row]}}})
        const saved = captureDownloads()
        expect(readsOf(requests, `${BASE}/shifts/${SHIFT1}/report`)).toHaveLength(0)

        await user.click(screen.getByRole('tab', {name: 'Parte'}))
        expect(await screen.findByLabelText('Resumen del parte')).toHaveTextContent(
            'Tareas: 2 completadas, 1 pendiente · Perfiles revisados: 2 · Defectos: 1 encontrado, 0 resueltos')
        expect(textsOf(dataRows('Parte de SH-000001')[0])).toEqual(['1', 'MO-000001', '12-2.27', '12.27', 'RG-01, RG-04', 'Revisión general',
            'DEF-000001', 'MAT-001 2 m', 'Completada'])
        await user.click(screen.getByRole('button', {name: 'Excel'}))
        await waitFor(() => expect(saved).toEqual(['shift-report-2026-10-05-SH-000001.xlsx']))
        expect(param(readsOf(requests, `${BASE}/shifts/${SHIFT1}/report`).at(-1), 'format')).toBe('xlsx')
        expect(screen.getByRole('button', {name: 'PDF'})).toBeInTheDocument()
    })

    it('el historial de un turno dice cómo quedó en cada revisión', async () => {
        const {user} = await openShift(loginAs('mantenimiento.lector'), shift('CLOSED', {netWorkMinutes: 240}), {revisions: {[SHIFT1]: [
            revision(2, 'UPDATED', 'mantenimiento.tecnico', 'HTTP', shift('CLOSED', {netWorkMinutes: 240}))]}})

        await user.click(screen.getByRole('button', {name: 'Historial'}))
        await waitFor(() => expect(dataRows('Historial de SH-000001')).toHaveLength(1))
        expect(textsOf(dataRows('Historial de SH-000001')[0])).toContain('Cerrado · 05/10/2026 · EQ-01 · ocupación Total · 240 min netos')
    })
})

const INSPECTION1 = '3c3c3c3c-0000-4000-8000-000000000061'
const DEFECT1 = '3c3c3c3c-0000-4000-8000-000000000062'
const INSPECTION_ITEM = '3c3c3c3c-0000-4000-8000-000000000063'
const PROFILE_SUMMARY = Object.freeze({id: ASSET_SYNCED, code: 'PRF-0001', name: '12-2.27', type: 'PROFILE', trackId: 12, startKp: 12.27,
    endKp: 12.27, sectioning: 'S-3', enabled: true})

/** Una inspección como la del backoffice: la técnica de ana sobre el perfil 12-2.27, con un punto sin contestar. */
function inspection(result, extra = {}) {
    return {
        id: INSPECTION1, code: 'INS-000001', asset: PROFILE_SUMMARY, executionPackageId: 3, trackId: 12, stationId: null, kp: 12.27,
        inspectionDate: '2026-09-20', inspector: 'ana', inspectionKind: 'TECHNICAL', templateId: null, result, description: null,
        detectedDefects: 'Péndola rota', recommendedActions: null, generatedDefectId: null, generatedOrderId: null, originOrderId: null,
        shiftId: null, items: [checkItem({id: INSPECTION_ITEM})], audit: null, version: 1, ...extra,
    }
}

/** El defecto que salió de esa inspección. */
function defect(status, extra = {}) {
    return {
        id: DEFECT1, code: 'DEF-000001', asset: PROFILE_SUMMARY, inspectionId: INSPECTION1, orderId: null, severity: 'HIGH', status,
        description: 'Péndola rota', technicalNotes: null, detectedAt: '2026-09-20T00:00:00Z', resolvedAt: null, resolutionNotes: null,
        discardReason: null, executionPackageId: 3, trackId: 12, stationId: null, startKp: 12.27, endKp: 12.27, correctionType: null,
        partsReplaced: null, resolvedInShiftId: null, repairPlannedDate: null, foundInTaskId: null, photoRefs: [], audit: null, version: 1,
        ...extra,
    }
}

async function openInspection(session, current, options = {}) {
    const requests = serveMaintenance({teams: TEAMS, ...options, inspections: [current, ...(options.inspections ?? [])]})
    const view = renderRoute(`/mantenimiento/inspecciones/${current.id}`, {session})
    await screen.findByRole('heading', {name: `${current.code} · 20/09/2026`})
    return {...view, requests}
}

async function openDefect(session, current, options = {}) {
    const requests = serveMaintenance({teams: TEAMS, ...options, defects: [current, ...(options.defects ?? [])]})
    const view = renderRoute(`/mantenimiento/defectos/${current.id}`, {session})
    await screen.findByRole('heading', {name: current.code})
    return {...view, requests}
}

const defectStatus = () => screen.getByLabelText('Estado del defecto')

describe('las inspecciones', () => {
    it('se filtran en el servidor, y la ficha ofrece crear lo que encontró o enlaza a lo que ya generó', async () => {
        const requests = serveMaintenance({teams: TEAMS, inspections: [inspection('MAJOR_DEFECT')]})
        const {user, unmount} = await open('/mantenimiento/inspecciones', loginAs('mantenimiento.tecnico'), 'Inspecciones', 1)
        const lists = () => readsOf(requests, `${BASE}/inspections`)

        expect(lists()[0].search).toBe('?page=0&size=50&sort=inspectionDate%2Cdesc&sort=id%2Casc')
        expect(textsOf(dataRows('Inspecciones')[0]).slice(0, 10)).toEqual(['INS-000001', '20/09/2026', 'PRF-0001 - 12-2.27', 'VIA 1 (PAQ NORTE)',
            '12.27', 'Técnica', 'Defecto grave', 'ana', '', ''])
        await choose(user, document.body, 'Resultado', 'Defecto grave')
        await user.type(screen.getByRole('textbox', {name: 'Desde'}), '01/09/2026')
        await user.tab()
        await typeInto(user, document.body, 'Inspector', 'ana')
        await waitFor(() => expect(param(lists().at(-1), 'inspector')).toBe('ana'))
        expect([param(lists().at(-1), 'result'), param(lists().at(-1), 'inspectionFrom')]).toEqual(['MAJOR_DEFECT', '2026-09-01'])
        await waitFor(() => expect(firstColumn('Inspecciones')).toEqual(['INS-000001']))

        await user.click(screen.getByRole('button', {name: 'Abrir INS-000001'}))
        expect(await screen.findByRole('heading', {name: 'INS-000001 · 20/09/2026'})).toBeInTheDocument()
        expect(screen.getByLabelText('Resumen de la inspección')).toHaveTextContent(
            'Activo: PRF-0001 - 12-2.27 · Vía: VIA 1 (PAQ NORTE) · KP 12.27 · Tipo: Técnica · Inspector: ana')
        expect(screen.getByLabelText('Resumen de la inspección')).toHaveTextContent('Defectos observados: Péndola rota')
        expect(screen.getByRole('button', {name: 'Crear defecto'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Crear orden correctiva'})).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Ver el defecto'})).not.toBeInTheDocument()
        expect(firstColumn('Puntos de INS-000001')).toEqual(['P-01'])
        const defects = recordWrites('post', `${BASE}/inspections/${INSPECTION1}/create-defect`, () => HttpResponse.json(defect('OPEN'),
            {status: 201}))
        await user.click(screen.getByRole('button', {name: 'Crear defecto'}))
        const create = await screen.findByRole('dialog', {name: 'Defecto de INS-000001'})
        expect(within(create).queryByRole('checkbox', {name: 'Registrar como defecto aunque sea leve'})).not.toBeInTheDocument()
        await user.type(within(create).getByRole('textbox', {name: 'Descripción'}), 'Péndola rota en el vano 3')
        await user.click(within(create).getByRole('button', {name: 'Crear el defecto'}))
        await waitFor(() => expect(defects.map((write) => write.body)).toEqual([{description: 'Péndola rota en el vano 3'}]))
        unmount()

        const linked = await openInspection(loginAs('mantenimiento.tecnico'), inspection('MAJOR_DEFECT', {generatedDefectId: DEFECT1,
            generatedOrderId: ORDER1}), {defects: [defect('OPEN')]})
        expect(screen.getByRole('button', {name: 'Ver la orden correctiva'})).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Crear defecto'})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Crear orden correctiva'})).not.toBeInTheDocument()
        await linked.user.click(screen.getByRole('button', {name: 'Ver el defecto'}))
        expect(await screen.findByRole('heading', {name: 'DEF-000001'})).toBeInTheDocument()
        linked.unmount()

        await openInspection(loginAs('mantenimiento.tecnico'), inspection('OK'))
        expect(screen.queryByRole('button', {name: 'Crear defecto'})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Crear orden correctiva'})).not.toBeInTheDocument()
    })

    it('una con defecto leve crea su defecto con force, y su orden correctiva abre la orden', async () => {
        const defects = recordWrites('post', `${BASE}/inspections/${INSPECTION1}/create-defect`, () => HttpResponse.json(defect('OPEN'),
            {status: 201}))
        const orders = recordWrites('post', `${BASE}/inspections/${INSPECTION1}/create-corrective-order`, () => HttpResponse.json(order({
            status: 'DRAFT', type: 'CORRECTIVE'}), {status: 201}))
        const {user, requests, router} = await openInspection(loginAs('mantenimiento.tecnico'), inspection('MINOR_DEFECT'), {
            orders: [order({status: 'DRAFT', type: 'CORRECTIVE'})]})

        await user.click(screen.getByRole('button', {name: 'Crear defecto'}))
        const defectDialog = await screen.findByRole('dialog', {name: 'Defecto de INS-000001'})
        await user.click(within(defectDialog).getByRole('checkbox', {name: 'Registrar como defecto aunque sea leve'}))
        await user.click(within(defectDialog).getByRole('button', {name: 'Crear el defecto'}))
        await waitFor(() => expect(defects.map((write) => write.body)).toEqual([{force: true}]))
        expect(await screen.findByText('Defecto DEF-000001 creado')).toBeInTheDocument()
        await waitFor(() => expect(readsOf(requests, `${BASE}/inspections/${INSPECTION1}`).length).toBeGreaterThanOrEqual(2))

        await user.click(screen.getByRole('button', {name: 'Crear orden correctiva'}))
        const orderDialog = await screen.findByRole('dialog', {name: 'Orden correctiva de INS-000001'})
        await choose(user, orderDialog, 'Prioridad', 'Alta')
        await user.click(within(orderDialog).getByRole('button', {name: 'Crear la orden'}))
        await waitFor(() => expect(orders.map((write) => write.body)).toEqual([{priority: 'HIGH'}]))
        await waitFor(() => expect(router.state.location.pathname).toBe(`/mantenimiento/ordenes/${ORDER1}`))
        expect(await screen.findByRole('heading', {name: 'MO-000001 · Revisión tramo 12'})).toBeInTheDocument()
    })

    it('se da de alta desde una orden de inspección, sobre su activo, y sus puntos se contestan', async () => {
        const created = inspection('OK', {originOrderId: ORDER1})
        const posts = recordWrites('post', `${BASE}/inspections`, () => HttpResponse.json(created, {status: 201}))
        const items = recordWrites('patch', `${BASE}/inspections/${INSPECTION1}/items/${INSPECTION_ITEM}`, () => HttpResponse.json({...created,
            items: [checkItem({id: INSPECTION_ITEM, itemResult: 'OK', version: 2})]}))
        const {user, requests, unmount} = await openOrder(loginAs('mantenimiento.tecnico'), order({status: 'IN_PROGRESS', type: 'INSPECTION'}))

        await user.click(screen.getByRole('tab', {name: 'Inspecciones'}))
        expect(await screen.findByText('La orden no tiene inspecciones.')).toBeInTheDocument()
        expect(param(readsOf(requests, `${BASE}/inspections`)[0], 'originOrderId')).toBe(ORDER1)
        await user.click(screen.getByRole('button', {name: 'Nueva inspección'}))
        const dialog = await screen.findByRole('dialog', {name: 'Nueva inspección'})
        expect(dialog).toHaveTextContent('Inspección de la orden MO-000001 sobre TS-0001 - Tramo 12.')
        expect(within(dialog).queryByRole('combobox', {name: 'Activo'})).not.toBeInTheDocument()
        const date = within(dialog).getByRole('textbox', {name: 'Fecha'})
        await user.clear(date)
        await user.type(date, '20/09/2026')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(posts.map((write) => write.body)).toEqual([{assetId: ASSET_OWN, inspectionDate: '2026-09-20',
            inspectionKind: 'VISUAL', result: 'OK', originOrderId: ORDER1}]))
        expect(await screen.findByText('Guardada INS-000001')).toBeInTheDocument()
        await waitFor(() => expect(readsOf(requests, `${BASE}/inspections`).length).toBeGreaterThanOrEqual(2))
        unmount()

        const detail = await openInspection(loginAs('mantenimiento.tecnico'), created)
        await detail.user.click(screen.getByRole('button', {name: 'Contestar puntos'}))
        const point = within(await screen.findByRole('dialog', {name: 'Puntos de INS-000001'})).getByRole('group', {name: 'Punto P-01'})
        await choose(detail.user, point, 'Resultado', 'Correcto')
        await detail.user.click(within(point).getByRole('button', {name: 'Guardar P-01'}))
        await waitFor(() => expect(items).toEqual([{body: {itemResult: 'OK', version: 1}, contentType: MERGE_PATCH}]))
        expect(await screen.findByText('Guardado P-01')).toBeInTheDocument()
        await waitFor(() => expect(textsOf(dataRows('Puntos de INS-000001')[0])[4]).toBe('Correcto'))
    })

    it('una que no existe se dice una vez y vuelve a la lista, y su historial dice cómo quedó', async () => {
        serveMaintenance({teams: TEAMS})
        const missing = '3c3c3c3c-0000-4000-8000-0000000000fd'
        const {router, unmount} = renderRoute(`/mantenimiento/inspecciones/${missing}`, {session: loginAs('mantenimiento.lector')})
        expect(await screen.findByText(`No existe la inspección ${missing}`)).toBeInTheDocument()
        await waitFor(() => expect(router.state.location.pathname).toBe('/mantenimiento/inspecciones'))
        unmount()

        const {user} = await openInspection(loginAs('mantenimiento.lector'), inspection('MAJOR_DEFECT'), {revisions: {[INSPECTION1]: [
            revision(2, 'UPDATED', 'ana', 'HTTP', inspection('MAJOR_DEFECT'))]}})
        expect(screen.queryByRole('button', {name: 'Modificar'})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Crear defecto'})).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', {name: 'Historial'}))
        await waitFor(() => expect(dataRows('Historial de INS-000001')).toHaveLength(1))
        expect(textsOf(dataRows('Historial de INS-000001')[0])).toContain('Técnica · 20/09/2026 · ana · Defecto grave')
    })
})

describe('los defectos', () => {
    const HISTORY = [{id: 'h1', previousStatus: null, newStatus: 'OPEN', changedAt: '2026-09-20T08:00:00Z', changedBy: 'ana',
        comment: 'Created from inspection INS-000001'}]

    it('se filtran en el servidor, y la ficha ofrece lo que admite su estado a quien puede', async () => {
        const requests = serveMaintenance({teams: TEAMS, defects: [defect('OPEN')], defectHistory: {[DEFECT1]: HISTORY}})
        const {user, unmount} = await open('/mantenimiento/defectos', loginAs('mantenimiento.tecnico'), 'Defectos', 1)
        const lists = () => readsOf(requests, `${BASE}/defects`)

        expect(lists()[0].search).toBe('?page=0&size=50&sort=detectedAt%2Cdesc&sort=id%2Casc')
        expect(textsOf(dataRows('Defectos')[0]).slice(2, 9)).toEqual(['PRF-0001 - 12-2.27', 'VIA 1 (PAQ NORTE)', '12.27', 'Alta', 'Abierto', '',
            'Péndola rota'])
        await choose(user, document.body, 'Gravedad', 'Alta')
        await choose(user, document.body, 'Estado', 'Abierto')
        await user.type(screen.getByRole('textbox', {name: 'Detectado desde'}), '01/09/2026')
        await user.tab()
        await waitFor(() => expect(param(lists().at(-1), 'detectedFrom')).toBe(startOfDayInstant('2026-09-01')))
        expect([param(lists().at(-1), 'severity'), param(lists().at(-1), 'status')]).toEqual(['HIGH', 'OPEN'])
        await waitFor(() => expect(firstColumn('Defectos')).toEqual(['DEF-000001']))

        await user.click(screen.getByRole('button', {name: 'Abrir DEF-000001'}))
        expect(await screen.findByRole('heading', {name: 'DEF-000001'})).toBeInTheDocument()
        await waitFor(() => expect(textsOf(dataRows('Estados de DEF-000001')[0]).slice(1)).toEqual(['', 'Abierto', 'ana',
            'Created from inspection INS-000001']))
        for (const name of ['Modificar', 'Vincular a una orden', 'Ver la inspección']) {
            expect(screen.getByRole('button', {name})).toBeInTheDocument()
        }
        expect(screen.queryByRole('button', {name: 'Resolver'})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Descartar'})).not.toBeInTheDocument()
        unmount()

        const open1 = await openDefect(loginAs('mantenimiento.responsable'), defect('OPEN'))
        expect(screen.getByRole('button', {name: 'Resolver'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Descartar'})).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Cerrar'})).not.toBeInTheDocument()
        open1.unmount()

        await openDefect(loginAs('mantenimiento.responsable'), defect('RESOLVED'))
        expect(screen.getByRole('button', {name: 'Cerrar'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Modificar'})).toBeInTheDocument()
        for (const name of ['Resolver', 'Descartar', 'Vincular a una orden']) {
            expect(screen.queryByRole('button', {name})).not.toBeInTheDocument()
        }
    })

    it('se vincula a una orden abierta de su vía, se resuelve con el turno tras un TRN-001 y se descarta con su motivo', async () => {
        const links = recordWrites('post', `${BASE}/defects/${DEFECT1}/link-order/${ORDER1}`, () => HttpResponse.json(defect('IN_PROGRESS',
            {orderId: ORDER1})))
        const resolves = recordWrites('post', `${BASE}/defects/${DEFECT1}/resolve`, (_body, call) => (call === 1
            ? maintenanceError(409, 'TRN-001', 'Defect DEF-000001 is linked to order MO-000001 which is PLANNED')
            : HttpResponse.json(defect('RESOLVED', {orderId: ORDER1, resolutionNotes: 'Péndola cambiada'}))))
        const discards = recordWrites('post', `${BASE}/defects/${DEFECT1}/discard`, () => HttpResponse.json(defect('DISCARDED',
            {discardReason: 'Duplicado'})))
        const {user, requests, unmount} = await openDefect(loginAs('mantenimiento.responsable'), defect('OPEN'), {
            orders: [order({status: 'PLANNED', type: 'CORRECTIVE'}), order({id: ORDER2, code: 'MO-000009', status: 'CANCELLED'})],
            shifts: [shift('CLOSED')],
        })

        await user.click(screen.getByRole('button', {name: 'Vincular a una orden'}))
        const link = await screen.findByRole('dialog', {name: 'Vincular DEF-000001 a una orden'})
        await user.click(within(link).getByRole('combobox', {name: 'Orden'}))
        expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['MO-000001 · Revisión tramo 12 (planificada)'])
        await user.click(screen.getByRole('option', {name: 'MO-000001 · Revisión tramo 12 (planificada)'}))
        await user.click(within(link).getByRole('button', {name: 'Vincular'}))
        await waitFor(() => expect(links).toHaveLength(1))
        expect(await screen.findByText('DEF-000001 vinculado a MO-000001')).toBeInTheDocument()
        await waitFor(() => expect(defectStatus()).toHaveTextContent('En curso'))
        expect(screen.queryByRole('button', {name: 'Descartar'})).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', {name: 'Resolver'}))
        const resolve = await screen.findByRole('dialog', {name: 'Resolver DEF-000001'})
        await user.click(within(resolve).getByRole('button', {name: 'Resolver'}))
        expect(await within(resolve).findByText('Hay que decir cómo se resolvió')).toBeInTheDocument()
        expect(resolves).toHaveLength(0)
        await user.type(within(resolve).getByRole('textbox', {name: 'Cómo se resolvió'}), 'Péndola cambiada')
        await user.click(within(resolve).getByRole('button', {name: 'Resolver'}))
        expect(await screen.findByText('El estado actual no permite esta operación. Defect DEF-000001 is linked to order MO-000001 which is PLANNED'))
            .toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Resolver DEF-000001'})).toBeInTheDocument()
        await choose(user, resolve, 'Turno en el que se corrigió', 'SH-000001 · 05/10/2026')
        expect(param(readsOf(requests, `${BASE}/shifts`).at(-1), 'trackId')).toBe('12')
        await user.click(within(resolve).getByRole('button', {name: 'Resolver'}))
        await waitFor(() => expect(resolves.map((write) => write.body).at(-1)).toEqual({resolutionNotes: 'Péndola cambiada',
            resolvedInShiftId: SHIFT1}))
        await waitFor(() => expect(defectStatus()).toHaveTextContent('Resuelto'))
        expect(screen.getByLabelText('Resumen del defecto')).toHaveTextContent('Resolución: Péndola cambiada')
        unmount()

        const again = await openDefect(loginAs('mantenimiento.responsable'), defect('OPEN'))
        await again.user.click(screen.getByRole('button', {name: 'Descartar'}))
        const discard = await screen.findByRole('dialog', {name: 'Descartar DEF-000001'})
        await again.user.type(within(discard).getByRole('textbox', {name: 'Motivo'}), 'Duplicado')
        await again.user.click(within(discard).getByRole('button', {name: 'Descartar el defecto'}))
        await waitFor(() => expect(discards.map((write) => write.body)).toEqual([{reason: 'Duplicado'}]))
        expect(await screen.findByText('DEF-000001 descartado')).toBeInTheDocument()
        await waitFor(() => expect(defectStatus()).toHaveTextContent('Descartado'))
    })

    it('el editor vacía la reparación prevista con la versión leída', async () => {
        const patches = recordWrites('patch', `${BASE}/defects/${DEFECT1}`, () => HttpResponse.json(defect('OPEN')))
        const {user} = await openDefect(loginAs('mantenimiento.tecnico'), defect('OPEN', {repairPlannedDate: '2026-10-12'}))

        expect(screen.getByLabelText('Resumen del defecto')).toHaveTextContent('Reparación prevista: 12/10/2026')
        await user.click(screen.getByRole('button', {name: 'Modificar'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar DEF-000001'})
        await user.clear(within(dialog).getByRole('textbox', {name: 'Reparación prevista'}))
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(patches).toEqual([{body: {repairPlannedDate: null, version: 1}, contentType: MERGE_PATCH}]))
        expect(await screen.findByText('Guardado DEF-000001')).toBeInTheDocument()
    })

    it('una orden enseña sus defectos, da de alta uno vinculado a ella y enlaza a su inspección de origen', async () => {
        const posts = recordWrites('post', `${BASE}/defects`, () => HttpResponse.json(defect('IN_PROGRESS', {orderId: ORDER1}), {status: 201}))
        const {user, requests} = await openOrder(loginAs('mantenimiento.tecnico'), order({status: 'IN_PROGRESS', type: 'CORRECTIVE',
            originInspectionId: INSPECTION1}), {defects: [defect('IN_PROGRESS', {orderId: ORDER1})],
            inspections: [inspection('MAJOR_DEFECT', {generatedOrderId: ORDER1})]})
        expect(readsOf(requests, `${BASE}/defects`)).toHaveLength(0)

        await user.click(screen.getByRole('tab', {name: 'Defectos'}))
        await waitFor(() => expect(firstColumn('Defectos de MO-000001')).toEqual(['DEF-000001']))
        expect(param(readsOf(requests, `${BASE}/defects`)[0], 'orderId')).toBe(ORDER1)
        await user.click(screen.getByRole('button', {name: 'Nuevo defecto'}))
        const dialog = await screen.findByRole('dialog', {name: 'Nuevo defecto'})
        expect(dialog).toHaveTextContent('Defecto de la orden MO-000001 sobre TS-0001 - Tramo 12; queda vinculado a ella.')
        expect(within(dialog).queryByRole('combobox', {name: 'Activo'})).not.toBeInTheDocument()
        await choose(user, dialog, 'Gravedad', 'Alta')
        await user.type(within(dialog).getByRole('textbox', {name: 'Descripción'}), 'Péndola rota')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(posts.map((write) => write.body)).toEqual([{assetId: ASSET_OWN, severity: 'HIGH', description: 'Péndola rota',
            orderId: ORDER1}]))
        await waitFor(() => expect(readsOf(requests, `${BASE}/defects`).length).toBeGreaterThanOrEqual(2))

        await user.click(screen.getByRole('tab', {name: 'Inspecciones'}))
        expect(await screen.findByText('La orden no tiene inspecciones.')).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Nueva inspección'})).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', {name: 'Inspección de origen'}))
        expect(await screen.findByRole('heading', {name: 'INS-000001 · 20/09/2026'})).toBeInTheDocument()
    })

    it('uno que no existe se dice una vez y vuelve a la lista, y su historial dice cómo quedó', async () => {
        serveMaintenance({teams: TEAMS})
        const missing = '3c3c3c3c-0000-4000-8000-0000000000fc'
        const {router, unmount} = renderRoute(`/mantenimiento/defectos/${missing}`, {session: loginAs('mantenimiento.lector')})
        expect(await screen.findByText(`No existe el defecto ${missing}`)).toBeInTheDocument()
        await waitFor(() => expect(router.state.location.pathname).toBe('/mantenimiento/defectos'))
        unmount()

        const {user} = await openDefect(loginAs('mantenimiento.lector'), defect('OPEN', {repairPlannedDate: '2026-10-12'}), {revisions: {[DEFECT1]: [
            revision(3, 'UPDATED', 'ana', 'HTTP', defect('OPEN', {repairPlannedDate: '2026-10-12'}))]}})
        expect(screen.queryByRole('button', {name: 'Modificar'})).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', {name: 'Historial'}))
        await waitFor(() => expect(dataRows('Historial de DEF-000001')).toHaveLength(1))
        expect(textsOf(dataRows('Historial de DEF-000001')[0])).toContain('Alta · Abierto · reparar el 12/10/2026')
    })
})
