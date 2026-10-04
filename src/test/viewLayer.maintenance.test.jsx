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

function order(extra = {}) {
    return {
        id: ORDER1, code: 'MO-000001', title: 'Preventivo vía 1', description: null, type: 'PREVENTIVE', status: 'PLANNED', priority: 'MEDIUM',
        asset: {id: ASSET_OWN, code: 'TS-0001', name: 'Tramo TS-0001', type: 'TRACK_SECTION', trackId: 12, startKp: 12.1, endKp: 13.45,
            sectioning: null, enabled: true},
        executionPackageId: 3, trackId: 12, stationId: null, startKp: 12.1, endKp: 13.45, plannedDate: '2026-10-05', actualStartDate: null,
        actualEndDate: null, team: null, assignedUser: null, closingNotes: null, cancellationReason: null, originInspectionId: null,
        originDefectId: null, stockProjectId: null, taskCount: 4, completedTaskCount: 1, estimatedMinutes: 120, estimatedShifts: 1,
        audit: null, version: 3, ...extra,
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
function serveMaintenance({assets = [], teams = [], taskTypes = [], templates = [], assetOrders = {}, revisions = {}} = {}) {
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
        const requests = serveMaintenance({assets: [ownSection(ASSET_OWN, 'TS-0001', true)], assetOrders: {[ASSET_OWN]: [order()]}})
        const {user, router} = await open('/mantenimiento/activos', loginAs('mantenimiento.lector'), 'Activos', 1)

        await user.click(within(rowOf('Activos', 'TS-0001')).getByRole('button', {name: 'Órdenes de TS-0001 - Tramo TS-0001'}))
        await waitFor(() => expect(firstColumn('Órdenes de TS-0001 - Tramo TS-0001')).toEqual(['MO-000001']))
        expect(textsOf(dataRows('Órdenes de TS-0001 - Tramo TS-0001')[0]).slice(0, 6))
            .toEqual(['MO-000001', 'Preventivo vía 1', 'Preventiva', 'Planificada', '05/10/2026', '1/4'])
        expect(readsOf(requests, `${BASE}/assets/${ASSET_OWN}/orders`)[0].search).toBe('?page=0&size=50&sort=createdAt%2Cdesc&sort=id%2Casc')

        await user.click(screen.getByRole('button', {name: 'Abrir MO-000001'}))
        await waitFor(() => expect(router.state.location.pathname).toBe(`/mantenimiento/ordenes/${ORDER1}`))
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
