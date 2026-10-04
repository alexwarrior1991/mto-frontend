import {screen, waitFor, within} from '@testing-library/react'
import {http, HttpResponse} from 'msw'
import {describe, expect, it} from 'vitest'
import {endOfDayInstant} from '../api/dates.js'
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
        tracks: [{id: 12, name: 'VIA 1', executionPackageId: 3}],
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
 * mto-maintenance en el gateway simulado: los activos filtran por lo que reciben, ordenan por los sort
 * que llegan y paginan; los catálogos llegan enteros. Sin revisiones, el historial es un 404. Apunta
 * cada lectura, también las de mto-configuration.
 */
function serveMaintenance({
    assets = [], teams = [], taskTypes = [], templates = [], assetOrders = {}, revisions = {}, orders = [], tasks = {}, history = {},
    materials = {},
} = {}) {
    const requests = []
    const log = (request) => {
        const url = new URL(request.url)
        requests.push(url)
        return url
    }
    serveConfiguration(requests)
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
            return HttpResponse.json(materials[params.id] ?? [])
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
