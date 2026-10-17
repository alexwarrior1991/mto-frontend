import {screen, waitFor, within} from '@testing-library/react'
import {http, HttpResponse} from 'msw'
import {describe, expect, it} from 'vitest'
import {buildMenu} from '../app/navigation.js'
import {P} from '../auth/permissions.js'
import {renderRoute} from './render.jsx'
import {server} from './server.js'
import {loginAs, sessionWith} from './session.js'

/**
 * Las pantallas de recursos (recursos/*) con los casos de recursos de ViewLayerTest del backoffice,
 * contra un mto-resources simulado que filtra, ordena y pagina como el de verdad.
 */

const BASE = '/api/resources'
const MERGE_PATCH = 'application/merge-patch+json'

const PERSON1 = '3c4d5e6f-0000-4000-8000-000000000001'
const PERSON2 = '3c4d5e6f-0000-4000-8000-000000000002'

function person(id, code, firstName, lastName, category, active, extra = {}) {
    return {
        id, code, employeeNumber: `E-${code.slice(4)}`, firstName, lastName, fullName: `${firstName} ${lastName}`, username: null, category,
        employer: 'OWN', company: null, phone: '+972 50 000 0000', active, version: 2, audit: null, ...extra,
    }
}

const YOSSI = person(PERSON1, 'PER-000003', 'Yossi', 'Cohen', 'TEAM_LEADER', true)
const DANA = person(PERSON2, 'PER-000004', 'Dana', 'Levi', 'WORKER', false)

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

/** Una fecha a N días de hoy: como se escribe (DD/MM/AAAA) y como viaja (YYYY-MM-DD). */
function daysFromToday(days) {
    const date = new Date()
    date.setDate(date.getDate() + days)
    const pad = (value) => String(value).padStart(2, '0')
    return {typed: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`,
        iso: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`}
}

/**
 * El mto-resources simulado: busca, filtra por categoría repetida y por estado, ordena y pagina. También
 * la ficha de cada persona con sus cualificaciones, el catálogo de tipos y los instrumentos, con sus
 * filtros; qualifications y documents se pueden cambiar en mitad de un caso.
 */
function serveResources({people = [], qualificationTypes = [], qualifications = {}, instruments = []} = {}) {
    const requests = []
    server.use(
        http.get(`${BASE}/people/:id/qualifications`, ({request, params}) => {
            requests.push(new URL(request.url))
            return HttpResponse.json(qualifications[params.id] ?? [])
        }),
        http.get(`${BASE}/people/:id`, ({request, params}) => {
            requests.push(new URL(request.url))
            const found = people.find((row) => row.id === params.id)
            return found ? HttpResponse.json(found) : resourcesError(404, 'PER-404', 'Person not found')
        }),
        http.get(`${BASE}/qualification-types`, ({request}) => {
            const url = new URL(request.url)
            requests.push(url)
            const search = url.searchParams.get('search')?.toLowerCase()
            const kind = url.searchParams.get('kind')
            const active = url.searchParams.get('active')
            const rows = qualificationTypes.filter((row) => (!search || `${row.code} ${row.name}`.toLowerCase().includes(search))
                && (!kind || row.kind === kind) && (active === null || String(row.active) === active))
            return HttpResponse.json(pageOf(sorted(rows, url), url))
        }),
        http.get(`${BASE}/instruments/:id/revisions`, ({request, params}) => {
            requests.push(new URL(request.url))
            const found = instruments.find((row) => row.id === params.id)
            return HttpResponse.json(pageOf([{
                revision: {revision: 2, revisionAt: '2026-10-16T06:00:00Z', operation: 'UPDATED', author: 'recursos.gestor', source: 'HTTP',
                    correlationId: 'c-2'},
                entity: found,
            }], new URL(request.url)))
        }),
        http.get(`${BASE}/instruments`, ({request}) => {
            const url = new URL(request.url)
            requests.push(url)
            const search = url.searchParams.get('search')?.toLowerCase()
            const kind = url.searchParams.get('kind')
            const active = url.searchParams.get('active')
            const before = url.searchParams.get('calibrationExpiresBefore')
            const rows = instruments.filter((row) => (!search || `${row.code} ${row.name}`.toLowerCase().includes(search))
                && (!kind || row.kind === kind) && (active === null || String(row.active) === active)
                && (!before || (row.calibrationExpiresOn !== null && row.calibrationExpiresOn < before)))
            return HttpResponse.json(pageOf(sorted(rows, url), url))
        }),
    )
    server.use(
        http.get(`${BASE}/people`, ({request}) => {
            const url = new URL(request.url)
            requests.push(url)
            const search = url.searchParams.get('search')?.toLowerCase()
            const categories = url.searchParams.getAll('category')
            const active = url.searchParams.get('active')
            const rows = people.filter((row) => (!search || `${row.code} ${row.fullName}`.toLowerCase().includes(search))
                && (categories.length === 0 || categories.includes(row.category))
                && (active === null || String(row.active) === active))
            return HttpResponse.json(pageOf(sorted(rows, url), url))
        }),
        http.get(`${BASE}/people/:id/revisions`, ({request, params}) => {
            requests.push(new URL(request.url))
            const found = people.find((row) => row.id === params.id)
            return HttpResponse.json(pageOf([{
                revision: {revision: 4, revisionAt: '2026-10-16T06:00:00Z', operation: 'UPDATED', author: 'recursos.gestor', source: 'HTTP',
                    correlationId: 'c-4'},
                entity: {...found, category: 'SUPERVISOR'},
            }], new URL(request.url)))
        }),
    )
    return requests
}

/** El JSON de error de mto-resources, el mismo que el de mto-maintenance: no es problem+json. */
function resourcesError(status, errorCode, message, validationErrors = []) {
    return HttpResponse.json({
        timestamp: '2026-10-16T10:00:00Z', status, error: 'ERROR', message, path: '/api/v1/resources', method: 'POST', errorCode,
        correlationId: `corr-${errorCode}`, validationErrors,
    }, {status})
}

/** Recoge las escrituras de una ruta (cuerpo y tipo de contenido) y contesta con respond(cuerpo, número de llamada). */
function recordWrites(method, path, respond) {
    const writes = []
    server.use(http[method](path, async ({request, params}) => {
        const text = await request.text()
        const body = text ? JSON.parse(text) : null
        writes.push({body, contentType: request.headers.get('content-type'), params})
        return respond(body, writes.length)
    }))
    return writes
}

function table(name) {
    return screen.getByRole('table', {name})
}

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
    it('«Recursos» sale con resources-read, y no sin él', () => {
        const resources = buildMenu(loginAs('recursos.lector')).find((item) => item.key === 'recursos')
        expect(resources.children.map((child) => [child.label, child.path])).toEqual([['Personal', '/recursos/personal'],
            ['Organigrama', '/recursos/organigrama'], ['Vehículos', '/recursos/flota'], ['Tablero de la flota', '/recursos/flota/tablero'],
            ['Modelos de vehículo', '/recursos/flota/modelos'],
            ['Sitios de aparcamiento', '/recursos/flota/aparcamientos'], ['Tipos de cualificación', '/recursos/cualificaciones'],
            ['Instrumentos', '/recursos/instrumentos']])
        expect(buildMenu(loginAs('config.lector')).some((item) => item.key === 'recursos')).toBe(false)
        expect(buildMenu(loginAs('mantenimiento.lector')).some((item) => item.key === 'recursos')).toBe(true)
    })

    it('un rol de realm llamado como un permiso, o un perfil de puesto, no abre recursos ni pide nada al servicio', async () => {
        const requests = serveResources({people: [YOSSI]})
        renderRoute('/recursos/personal', {
            session: sessionWith([P.NOTIFICATION_INBOX], {realmRoles: ['resources-read', 'mto-position-team-leader']}),
        })

        expect(await screen.findByText('No tienes permiso para abrir esta pantalla')).toBeInTheDocument()
        expect(screen.getByText('resources-read')).toBeInTheDocument()
        expect(requests).toEqual([])
    })
})

describe('el personal', () => {
    it('se busca y se filtra en el servicio, con la categoría repetida, y quien solo lee ve el historial y nada más', async () => {
        const requests = serveResources({people: [YOSSI, DANA]})
        const {user} = await open('/recursos/personal', loginAs('recursos.lector'), 'Personal', 2)
        const lists = () => requests.filter((url) => url.pathname === `${BASE}/people`)

        expect(textsOf(dataRows('Personal')[0])).toEqual(['PER-000003', 'Yossi Cohen', 'Jefe de equipo', 'Propio', '', 'E-000003',
            '+972 50 000 0000', 'Activa', ''])
        expect(textsOf(dataRows('Personal')[1]).slice(0, 3)).toEqual(['PER-000004', 'Dana Levi', 'Operario'])
        expect(textsOf(dataRows('Personal')[1])[7]).toBe('Inactiva')
        expect(lists()[0].search).toBe('?page=0&size=50&sort=lastName%2Casc&sort=firstName%2Casc&sort=id%2Casc')
        expect(screen.getByText('2 personas')).toBeInTheDocument()

        await typeInto(user, document.body, 'Buscar', 'cohen')
        // Un MultiSelect deja abierta su lista tras elegir: la segunda opción se elige sin volver a abrirla.
        await choose(user, document.body, 'Categoría', 'Operario')
        await user.click(await screen.findByRole('option', {name: 'Jefe de equipo'}))
        await choose(user, document.body, 'Estado', 'Activas')
        await waitFor(() => expect(lists().at(-1).searchParams.getAll('category')).toEqual(['WORKER', 'TEAM_LEADER']))
        const last = lists().at(-1)
        expect([last.searchParams.get('search'), last.searchParams.get('active'), last.searchParams.get('page')]).toEqual(['cohen', 'true', '0'])
        await waitFor(() => expect(firstColumn('Personal')).toEqual(['PER-000003']))

        expect(screen.queryByRole('button', {name: 'Nueva persona'})).not.toBeInTheDocument()
        expect(actionsOf(rowOf('Personal', 'PER-000003'))).toEqual(['Abrir PER-000003', 'Historial de PER-000003'])
    })

    it('el alta exige la empresa de una subcontrata antes de llamar, y un error del servicio cae en su campo con el diálogo abierto', async () => {
        serveResources()
        const writes = recordWrites('post', `${BASE}/people`, (body, call) => (call === 1
            ? resourcesError(400, 'REQ-VALIDATION', 'Validation failed', [{field: 'username', message: 'size must be between 0 and 100'}])
            : HttpResponse.json(person(PERSON1, 'PER-000003', 'Yossi', 'Cohen', 'WORKER', true), {status: 201})))
        const {user} = await open('/recursos/personal', loginAs('recursos.gestor'), 'Personal', 0)

        await user.click(await screen.findByRole('button', {name: 'Nueva persona'}))
        const dialog = await screen.findByRole('dialog', {name: 'Nueva persona'})
        await typeInto(user, dialog, 'Nombre', ' Yossi ')
        await typeInto(user, dialog, 'Apellidos', 'Cohen')
        await choose(user, dialog, 'Categoría', 'Operario')
        await choose(user, dialog, 'Empleo', 'Subcontrata')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('Una persona de subcontrata dice su empresa')).toBeInTheDocument()
        expect(writes).toHaveLength(0)

        await typeInto(user, dialog, 'Empresa', 'Catenarias del Norte')
        await typeInto(user, dialog, 'Usuario', 'equipo.nuevo')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('size must be between 0 and 100')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Nueva persona'})).toBeInTheDocument()

        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Nueva persona'})).not.toBeInTheDocument())
        expect(writes.map((write) => write.body)).toEqual([1, 2].map(() => ({
            firstName: 'Yossi', lastName: 'Cohen', category: 'WORKER', employer: 'SUBCONTRACTOR', company: 'Catenarias del Norte',
            username: 'equipo.nuevo',
        })))
    })

    it('modificar manda lo cambiado, lo vaciado y la versión; una versión vieja deja el diálogo abierto, y sin cambios no se llama', async () => {
        serveResources({people: [YOSSI]})
        const writes = recordWrites('patch', `${BASE}/people/:id`, (body, call) => (call === 1
            ? resourcesError(409, 'CON-001', 'Person PER-000003 was changed by someone else')
            : HttpResponse.json(YOSSI)))
        const {user} = await open('/recursos/personal', loginAs('recursos.gestor'), 'Personal', 1)

        await user.click(within(rowOf('Personal', 'PER-000003')).getByRole('button', {name: 'Modificar PER-000003'}))
        let dialog = await screen.findByRole('dialog', {name: 'Modificar PER-000003 · Yossi Cohen'})
        await choose(user, dialog, 'Categoría', 'Supervisor')
        await typeInto(user, dialog, 'Teléfono', '')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await screen.findByText('Conflicto con otro cambio: recarga y vuelve a intentarlo.')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Modificar PER-000003 · Yossi Cohen'})).toBeInTheDocument()

        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(writes.map((write) => [write.contentType, write.body])).toEqual([1, 2].map(() => [MERGE_PATCH,
            {category: 'SUPERVISOR', phone: null, version: 2}]))

        await user.click(within(rowOf('Personal', 'PER-000003')).getByRole('button', {name: 'Modificar PER-000003'}))
        dialog = await screen.findByRole('dialog', {name: 'Modificar PER-000003 · Yossi Cohen'})
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(writes).toHaveLength(2)
    })

    it('desactivar pide resources-delete y confirmación y la regla de 2 a 6 la dice el servicio; reactivar es un PATCH active=true', async () => {
        const requests = serveResources({people: [YOSSI, DANA]})
        const deletes = recordWrites('delete', `${BASE}/people/:id`, (body, call) => (call === 1
            ? resourcesError(409, 'UNI-001', 'Team EQ-NORTE would have 1 linemen: between 2 and 6')
            : new HttpResponse(null, {status: 204})))
        const patches = recordWrites('patch', `${BASE}/people/:id`, () => HttpResponse.json({...DANA, active: true}))
        const {user} = await open('/recursos/personal', loginAs('recursos.responsable'), 'Personal', 2)

        expect(actionsOf(rowOf('Personal', 'PER-000003'))).toEqual(['Abrir PER-000003', 'Historial de PER-000003', 'Modificar PER-000003',
            'Desactivar PER-000003'])
        expect(actionsOf(rowOf('Personal', 'PER-000004'))).toEqual(['Abrir PER-000004', 'Historial de PER-000004', 'Modificar PER-000004',
            'Reactivar PER-000004'])

        await user.click(within(rowOf('Personal', 'PER-000003')).getByRole('button', {name: 'Desactivar PER-000003'}))
        let confirm = await screen.findByRole('dialog', {name: 'Desactivar PER-000003 · Yossi Cohen'})
        expect(deletes).toHaveLength(0)
        await user.click(within(confirm).getByRole('button', {name: 'Desactivar'}))
        expect(await screen.findByText('El organigrama no admite ese cambio. Team EQ-NORTE would have 1 linemen: between 2 and 6'))
            .toBeInTheDocument()
        await user.click(within(rowOf('Personal', 'PER-000003')).getByRole('button', {name: 'Desactivar PER-000003'}))
        confirm = await screen.findByRole('dialog', {name: 'Desactivar PER-000003 · Yossi Cohen'})
        await user.click(within(confirm).getByRole('button', {name: 'Desactivar'}))
        expect(await screen.findByText('Desactivada PER-000003 · Yossi Cohen')).toBeInTheDocument()
        expect(deletes.map((write) => write.params.id)).toEqual([PERSON1, PERSON1])

        await user.click(within(rowOf('Personal', 'PER-000004')).getByRole('button', {name: 'Reactivar PER-000004'}))
        expect(await screen.findByText('Reactivada PER-000004 · Dana Levi')).toBeInTheDocument()
        expect(patches.map((write) => write.body)).toEqual([{active: true, version: 2}])

        await user.click(within(rowOf('Personal', 'PER-000003')).getByRole('button', {name: 'Historial de PER-000003'}))
        const history = await screen.findByRole('dialog', {name: /Historial de PER-000003/})
        expect(await within(history).findByText('Yossi Cohen · Supervisor · Propio · activa')).toBeInTheDocument()
        expect(requests.some((url) => url.pathname === `${BASE}/people/${PERSON1}/revisions`)).toBe(true)
    })
})

const QTYPE_RAIL = '6a7b8c9d-0000-4000-8000-000000000001'
const QTYPE_LIC_C = '6a7b8c9d-0000-4000-8000-000000000002'
const QTYPE_HEIGHT = '6a7b8c9d-0000-4000-8000-000000000003'
const QTYPE_RR = '6a7b8c9d-0000-4000-8000-000000000004'
const QTYPE_OLD = '6a7b8c9d-0000-4000-8000-000000000005'

function qualificationType(id, code, name, kind, extra = {}) {
    return {id, code, name, kind, drivingLicence: null, validityMonths: null, description: null, active: true, version: 1, audit: null, ...extra}
}

const RAIL_DRIVER = qualificationType(QTYPE_RAIL, 'RAIL-DRIVER', 'Rail auxiliary vehicle driver', 'VEHICLE_OPERATION', {validityMonths: 60})
const LIC_C = qualificationType(QTYPE_LIC_C, 'LIC-C', 'Driving licence C', 'DRIVING_LICENCE', {drivingLicence: 'C', validityMonths: 120, version: 3})
const AT_HEIGHT = qualificationType(QTYPE_HEIGHT, 'ALTURA', 'Trabajos en altura', 'SAFETY')
const RR_OPERATOR = qualificationType(QTYPE_RR, 'RR-OPERATOR', 'Road-rail machine operator', 'VEHICLE_OPERATION')
const RETIRED_TYPE = qualificationType(QTYPE_OLD, 'OLD', 'Antigua', 'MEDICAL', {active: false})

/** Una cualificación de Yossi, con el resumen de su tipo y lo que dice el servicio de su caducidad. */
function heldQualification(n, type, {issuedOn = '2016-01-01', expiresOn = null, reference = null} = {}) {
    return {
        id: `7c8d9e0f-0000-4000-8000-00000000000${n}`, personId: PERSON1,
        qualificationType: {id: type.id, code: type.code, name: type.name, kind: type.kind}, reference, issuedOn, expiresOn, notes: null,
        expired: expiresOn !== null && expiresOn < daysFromToday(0).iso, version: 1, audit: null,
    }
}

async function openPerson(session, heading = 'PER-000003 · Yossi Cohen', personId = PERSON1) {
    const view = renderRoute(`/recursos/personal/${personId}`, {session})
    expect(await screen.findByRole('heading', {name: heading})).toBeInTheDocument()
    return view
}

describe('la ficha de una persona y sus cualificaciones', () => {
    it('Personal la abre con su botón o con doble clic, y cada cualificación dice cómo está; quien solo lee no ve controles', async () => {
        const expired = daysFromToday(-3)
        const soon = daysFromToday(12)
        const later = daysFromToday(400)
        const requests = serveResources({people: [YOSSI, DANA], qualifications: {[PERSON1]: [
            heldQualification(1, AT_HEIGHT, {expiresOn: null}),
            heldQualification(2, LIC_C, {expiresOn: expired.iso, reference: 'C-1234'}),
            heldQualification(3, RAIL_DRIVER, {issuedOn: '2026-03-31', expiresOn: later.iso}),
            heldQualification(4, RR_OPERATOR, {issuedOn: '2026-03-31', expiresOn: soon.iso}),
        ]}})
        const {user} = await open('/recursos/personal', loginAs('recursos.lector'), 'Personal', 2)

        await user.click(within(rowOf('Personal', 'PER-000003')).getByRole('button', {name: 'Abrir PER-000003'}))
        expect(await screen.findByRole('heading', {name: 'PER-000003 · Yossi Cohen'})).toBeInTheDocument()
        expect(screen.getByLabelText('Estado de la persona')).toHaveTextContent('Activa')
        expect(screen.getByLabelText('Resumen de la persona')).toHaveTextContent('Empresa: Propio · Usuario: - · N.º empleado E-000003')
        await waitFor(() => expect(firstColumn('Cualificaciones de PER-000003')).toHaveLength(4))
        expect(dataRows('Cualificaciones de PER-000003').map(textsOf)).toEqual([
            ['ALTURA · Trabajos en altura', 'Seguridad', '', '01/01/2016', '', 'No caduca'],
            ['LIC-C · Driving licence C', 'Permiso de conducir', 'C-1234', '01/01/2016', expired.typed, 'Caducada'],
            ['RAIL-DRIVER · Rail auxiliary vehicle driver', 'Habilitación de vehículo', '', '31/03/2026', later.typed, 'Vigente'],
            ['RR-OPERATOR · Road-rail machine operator', 'Habilitación de vehículo', '', '31/03/2026', soon.typed, 'Caduca en 12 días'],
        ])
        expect(requests.some((url) => url.pathname === `${BASE}/people/${PERSON1}/qualifications`)).toBe(true)
        for (const name of ['Añadir cualificación', 'Modificar', 'Desactivar', 'Reactivar']) {
            expect(screen.queryByRole('button', {name})).not.toBeInTheDocument()
        }

        await user.click(screen.getByRole('button', {name: 'Volver al personal'}))
        await waitFor(() => expect(firstColumn('Personal')).toHaveLength(2))
        await user.dblClick(within(rowOf('Personal', 'PER-000004')).getAllByRole('cell')[1])
        expect(await screen.findByRole('heading', {name: 'PER-000004 · Dana Levi'})).toBeInTheDocument()
        expect(await screen.findByText('No tiene cualificaciones.')).toBeInTheDocument()
    })

    it('añadir ofrece los tipos activos que aún no tiene, comprueba las fechas antes de llamar y deja el diálogo abierto con lo que dice el servicio', async () => {
        const requests = serveResources({people: [YOSSI], qualificationTypes: [RAIL_DRIVER, LIC_C, AT_HEIGHT, RETIRED_TYPE],
            qualifications: {[PERSON1]: [heldQualification(2, LIC_C, {expiresOn: daysFromToday(100).iso})]}})
        const writes = recordWrites('post', `${BASE}/people/:id/qualifications`, (body, call) => {
            if (call === 1) {
                return resourcesError(409, 'QUA-001', 'PER-000003 already holds RAIL-DRIVER')
            }
            return call === 2
                ? resourcesError(400, 'VAL-001', 'Validation failed', [{field: 'expiresOn', message: 'expiresOn must not be before issuedOn'}])
                : HttpResponse.json(heldQualification(3, RAIL_DRIVER, {issuedOn: '2026-10-10', expiresOn: '2031-03-31'}), {status: 201})
        })
        const {user} = await openPerson(loginAs('recursos.gestor'))
        await waitFor(() => expect(firstColumn('Cualificaciones de PER-000003')).toHaveLength(1))
        // Quitar pide resources-delete, que el gestor no tiene.
        expect(actionsOf(rowOf('Cualificaciones de PER-000003', 'Permiso de conducir'))).toEqual(['Modificar LIC-C'])

        await user.click(screen.getByRole('button', {name: 'Añadir cualificación'}))
        const dialog = await screen.findByRole('dialog', {name: 'Nueva cualificación de PER-000003 · Yossi Cohen'})
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('El tipo es obligatorio')).toBeInTheDocument()
        await user.click(within(dialog).getByRole('combobox', {name: 'Tipo'}))
        expect((await screen.findAllByRole('option')).map((option) => option.textContent))
            .toEqual(['ALTURA · Trabajos en altura', 'RAIL-DRIVER · Rail auxiliary vehicle driver'])
        await user.click(screen.getByRole('option', {name: 'RAIL-DRIVER · Rail auxiliary vehicle driver'}))
        expect(within(dialog).getByText('Vacía: no caduca. Vigencia habitual: 60 meses')).toBeInTheDocument()
        await typeInto(user, dialog, 'Expedida', '10/10/2026')
        await typeInto(user, dialog, 'Caduca', '01/10/2026')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('La caducidad no puede ser anterior a la expedición')).toBeInTheDocument()
        expect(writes).toHaveLength(0)

        await typeInto(user, dialog, 'Caduca', '31/03/2031')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await screen.findByText('La persona ya tiene esa cualificación (renovarla es cambiar su caducidad), o el tipo está retirado. '
            + 'PER-000003 already holds RAIL-DRIVER')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Nueva cualificación de PER-000003 · Yossi Cohen'})).toBeInTheDocument()
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('expiresOn must not be before issuedOn')).toBeInTheDocument()
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(writes.map((write) => write.body)).toEqual([1, 2, 3].map(() => ({qualificationTypeId: QTYPE_RAIL, issuedOn: '2026-10-10',
            expiresOn: '2031-03-31'})))
        expect(requests.filter((url) => url.pathname === `${BASE}/people/${PERSON1}/qualifications`).length).toBeGreaterThan(1)
    })

    it('modificar manda lo cambiado y lo vaciado con la versión leída, y quitar pide resources-delete y confirmación', async () => {
        serveResources({people: [YOSSI], qualifications: {[PERSON1]: [
            heldQualification(2, LIC_C, {expiresOn: daysFromToday(100).iso}),
            heldQualification(3, RAIL_DRIVER, {issuedOn: '2026-03-31', expiresOn: '2031-03-31', reference: 'RD-77'}),
        ]}})
        const patches = recordWrites('patch', `${BASE}/people/:id/qualifications/:qualificationId`, (body, call) => (call === 1
            ? resourcesError(409, 'CON-001', 'Person qualification was changed by someone else')
            : HttpResponse.json(heldQualification(3, RAIL_DRIVER))))
        const deletes = recordWrites('delete', `${BASE}/people/:id/qualifications/:qualificationId`, () => new HttpResponse(null, {status: 204}))
        const {user} = await openPerson(loginAs('recursos.responsable'))
        await waitFor(() => expect(firstColumn('Cualificaciones de PER-000003')).toHaveLength(2))
        expect(actionsOf(rowOf('Cualificaciones de PER-000003', 'RD-77'))).toEqual(['Modificar RAIL-DRIVER', 'Quitar RAIL-DRIVER'])

        await user.click(screen.getByRole('button', {name: 'Modificar RAIL-DRIVER'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar RAIL-DRIVER de PER-000003 · Yossi Cohen'})
        const type = within(dialog).getByRole('textbox', {name: 'Tipo'})
        expect(type).toHaveValue('RAIL-DRIVER · Rail auxiliary vehicle driver')
        expect(type).toHaveAttribute('readonly')
        await typeInto(user, dialog, 'Referencia', '')
        await typeInto(user, dialog, 'Caduca', '31/03/2032')
        await user.click(within(dialog).getByRole('textbox', {name: 'Notas'}))
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await screen.findByText('Conflicto con otro cambio: recarga y vuelve a intentarlo.')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Modificar RAIL-DRIVER de PER-000003 · Yossi Cohen'})).toBeInTheDocument()
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(patches.map((write) => [write.contentType, write.params.qualificationId, write.body])).toEqual([1, 2].map(() => [MERGE_PATCH,
            '7c8d9e0f-0000-4000-8000-000000000003', {reference: null, expiresOn: '2032-03-31', version: 1}]))

        await user.click(screen.getByRole('button', {name: 'Quitar LIC-C'}))
        const confirm = await screen.findByRole('dialog', {name: 'Quitar LIC-C de PER-000003 · Yossi Cohen'})
        expect(confirm).toHaveTextContent('renovarla es cambiar su caducidad')
        expect(deletes).toHaveLength(0)
        await user.click(within(confirm).getByRole('button', {name: 'Quitar'}))
        expect(await screen.findByText('Quitada LIC-C de PER-000003')).toBeInTheDocument()
        expect(deletes.map((write) => [write.params.id, write.params.qualificationId])).toEqual([[PERSON1, '7c8d9e0f-0000-4000-8000-000000000002']])
    })

    it('la ficha modifica y desactiva como la lista, y reactiva una persona inactiva', async () => {
        serveResources({people: [YOSSI, DANA]})
        const patches = recordWrites('patch', `${BASE}/people/:id`, () => HttpResponse.json(YOSSI))
        const deletes = recordWrites('delete', `${BASE}/people/:id`, () => new HttpResponse(null, {status: 204}))
        const {user} = await openPerson(loginAs('recursos.responsable'))
        expect(screen.queryByRole('button', {name: 'Reactivar'})).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', {name: 'Modificar'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar PER-000003 · Yossi Cohen'})
        await typeInto(user, dialog, 'Teléfono', '+972 50 111 1111')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(patches.map((write) => write.body)).toEqual([{phone: '+972 50 111 1111', version: 2}]))

        await user.click(screen.getByRole('button', {name: 'Desactivar'}))
        const confirm = await screen.findByRole('dialog', {name: 'Desactivar PER-000003 · Yossi Cohen'})
        expect(confirm).toHaveTextContent('Quien dirige una unidad necesita antes otro jefe.')
        await user.click(within(confirm).getByRole('button', {name: 'Desactivar'}))
        expect(await screen.findByText('Desactivada PER-000003 · Yossi Cohen')).toBeInTheDocument()
        expect(deletes.map((write) => write.params.id)).toEqual([PERSON1])
    })

    it('una persona inactiva se reactiva desde su ficha con la versión leída', async () => {
        serveResources({people: [YOSSI, DANA]})
        const patches = recordWrites('patch', `${BASE}/people/:id`, () => HttpResponse.json({...DANA, active: true}))
        const {user} = await openPerson(loginAs('recursos.responsable'), 'PER-000004 · Dana Levi', PERSON2)
        expect(screen.getByLabelText('Estado de la persona')).toHaveTextContent('Inactiva')
        expect(screen.queryByRole('button', {name: 'Desactivar'})).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', {name: 'Reactivar'}))
        expect(await screen.findByText('Reactivada PER-000004 · Dana Levi')).toBeInTheDocument()
        expect(patches.map((write) => [write.params.id, write.body])).toEqual([[PERSON2, {active: true, version: 2}]])
    })

    it('una persona que no existe se dice y vuelve al personal', async () => {
        serveResources({people: [YOSSI]})
        const missing = '3c4d5e6f-0000-4000-8000-0000000000ff'
        renderRoute(`/recursos/personal/${missing}`, {session: loginAs('recursos.lector')})
        expect(await screen.findByText(`No existe la persona ${missing}`)).toBeInTheDocument()
        expect(await screen.findByRole('table', {name: 'Personal'})).toBeInTheDocument()
    })
})

const CONFIGURATION = '/api/configuration'
const PROJECT_UNIT = '5e6f7081-0000-4000-8000-000000000009'
const DEPARTMENT_UNIT = '5e6f7081-0000-4000-8000-000000000008'
const SUPERVISION_UNIT = '5e6f7081-0000-4000-8000-000000000002'
const TEAM_UNIT = '5e6f7081-0000-4000-8000-000000000001'
const LEADER = {id: PERSON1, code: 'PER-000003', fullName: 'Yossi Cohen', username: 'equipo.jefe', category: 'TEAM_LEADER'}
const SUPERVISOR = {id: PERSON2, code: 'PER-000020', fullName: 'Dana Levi', username: null, category: 'SUPERVISOR'}

function lineman(n) {
    return {id: `3c4d5e6f-0000-4000-8000-00000000001${n}`, code: `PER-00001${n}`, fullName: `Lineman ${n}`, username: null, category: 'WORKER'}
}

function linemen(count) {
    return Array.from({length: count}, (_, n) => ({id: `6f708192-0000-4000-8000-00000000000${n}`, person: lineman(n), joinedOn: '2026-10-01',
        leftOn: null}))
}

function node(id, code, name, kind, discipline, head, executionPackageIds, linemenCount, active, children = []) {
    return {id, code, name, kind, discipline, head, executionPackageIds, linemen: linemenCount, active, children}
}

function organization({teamActive = true} = {}) {
    return [node(PROJECT_UNIT, 'PRJ', 'Proyecto', 'PROJECT', null, null, [], null, true, [
        node(DEPARTMENT_UNIT, 'MNT', 'Mantenimiento', 'DEPARTMENT', 'MAINTENANCE', null, [], null, true, [
            node(SUPERVISION_UNIT, 'SUP-N', 'Supervisión norte', 'SUPERVISION', 'MAINTENANCE', null, [4], null, true, [
                node(TEAM_UNIT, 'A', 'Equipo A', 'TEAM', 'MAINTENANCE', LEADER, [5, 4], 4, teamActive),
            ]),
        ]),
    ])]
}

function teamUnit(count, active = true) {
    const members = active ? linemen(count) : []
    return {
        id: TEAM_UNIT, code: 'A', name: 'Equipo A', kind: 'TEAM', discipline: 'MAINTENANCE',
        parent: {id: SUPERVISION_UNIT, code: 'SUP-N', name: 'Supervisión norte', kind: 'SUPERVISION'}, head: LEADER, executionPackageIds: [4, 5],
        defaultVehicle: null, members, linemen: members.length, complete: members.length >= 2, supervisor: SUPERVISOR, chiefSupervisor: null,
        active, version: 7, audit: null,
    }
}

function supervisionUnit(active = true) {
    return {
        id: SUPERVISION_UNIT, code: 'SUP-N', name: 'Supervisión norte', kind: 'SUPERVISION', discipline: 'MAINTENANCE',
        parent: {id: DEPARTMENT_UNIT, code: 'MNT', name: 'Mantenimiento', kind: 'DEPARTMENT'}, head: SUPERVISOR, executionPackageIds: [4],
        defaultVehicle: null, members: [], linemen: null, complete: null, supervisor: null, chiefSupervisor: null, active, version: 2, audit: null,
    }
}

/**
 * El organigrama simulado: el árbol, cada unidad por su id, sus hijas, sus linemen (los de ahora y,
 * con includeFormer, también los que salieron), su historial y los EP de mto-configuration. units y
 * members se pueden cambiar en mitad de un caso.
 */
function serveOrganization({units = {}, members = {}, former = {}, people = [], teamActive = true} = {}) {
    const requests = serveResources({people})
    server.use(
        http.get(`${BASE}/units/tree`, ({request}) => {
            requests.push(new URL(request.url))
            return HttpResponse.json(organization({teamActive}))
        }),
        http.get(`${BASE}/units/:id/members`, ({request, params}) => {
            const url = new URL(request.url)
            requests.push(url)
            const now = members[params.id] ?? []
            return HttpResponse.json(url.searchParams.get('includeFormer') === 'true' ? [...now, ...(former[params.id] ?? [])] : now)
        }),
        http.get(`${BASE}/units/:id/revisions`, ({request, params}) => {
            requests.push(new URL(request.url))
            return HttpResponse.json(pageOf([{
                revision: {revision: 3, revisionAt: '2026-10-16T06:00:00Z', operation: 'UPDATED', author: 'recursos.gestor', source: 'HTTP',
                    correlationId: 'c-5'},
                entity: units[params.id],
            }], new URL(request.url)))
        }),
        http.get(`${BASE}/units/:id`, ({request, params}) => {
            requests.push(new URL(request.url))
            return units[params.id] ? HttpResponse.json(units[params.id]) : resourcesError(404, 'UNI-404', 'Organization unit not found')
        }),
        http.get(`${BASE}/units`, ({request}) => {
            const url = new URL(request.url)
            requests.push(url)
            const parentId = url.searchParams.get('parentId')
            return HttpResponse.json(pageOf(Object.values(units).filter((unit) => unit.parent?.id === parentId), url))
        }),
        http.post(`${CONFIGURATION}/execution-packages/filter`, ({request}) => {
            const url = new URL(request.url)
            requests.push(url)
            return HttpResponse.json(pageOf([{id: 4, name: 'EP 4'}, {id: 5, name: 'EP 5'}, {id: 6, name: 'EP 6'}], url))
        }),
    )
    return requests
}

function treeRows() {
    return within(screen.getByRole('treegrid', {name: 'Organigrama'})).getAllByRole('row')
        .filter((row) => row.hasAttribute('aria-level'))
}

function treeTexts(row) {
    return within(row).getAllByRole('gridcell').map((cell) => cell.textContent)
}

function treeRowOf(code) {
    return treeRows().find((row) => treeTexts(row)[0].startsWith(`${code} · `) || treeTexts(row)[0] === code)
}

async function openTree(session, expected = 4) {
    const view = renderRoute('/recursos/organigrama', {session})
    await waitFor(() => expect(treeRows()).toHaveLength(expected))
    return view
}

async function openUnit(session, unitId, heading) {
    const view = renderRoute(`/recursos/organigrama/${unitId}`, {session})
    expect(await screen.findByRole('heading', {name: heading})).toBeInTheDocument()
    return view
}

describe('el organigrama', () => {
    it('llega desplegado, con el jefe o «Vacante», los linemen de un equipo y los EP con su nombre; quien solo lee abre las fichas', async () => {
        const requests = serveOrganization({units: {[TEAM_UNIT]: teamUnit(4)}, members: {[TEAM_UNIT]: linemen(4)}})
        const {user} = await openTree(loginAs('recursos.lector'))

        expect(treeRows().map((row) => row.getAttribute('aria-level'))).toEqual(['1', '2', '3', '4'])
        await waitFor(() => expect(treeTexts(treeRowOf('A'))).toEqual(['A · Equipo A', 'Equipo', 'Mantenimiento', 'PER-000003 · Yossi Cohen',
            '4 de 2 a 6', 'EP 4, EP 5', 'Activa', '']))
        expect(treeTexts(treeRowOf('MNT')).slice(3, 5)).toEqual(['Vacante', ''])
        expect(screen.getByText('4 unidades')).toBeInTheDocument()
        expect(requests.find((url) => url.pathname === `${BASE}/units/tree`).search).toBe('?includeInactive=false')
        expect(screen.queryByRole('button', {name: 'Nueva unidad'})).not.toBeInTheDocument()
        expect(actionsOf(treeRowOf('SUP-N'))).toEqual(['Plegar SUP-N · Supervisión norte', 'Abrir SUP-N'])

        await user.click(within(treeRowOf('SUP-N')).getByRole('button', {name: 'Plegar SUP-N · Supervisión norte'}))
        expect(treeRows()).toHaveLength(3)
        expect(treeRowOf('SUP-N')).toHaveAttribute('aria-expanded', 'false')
        await user.click(within(treeRowOf('SUP-N')).getByRole('button', {name: 'Desplegar SUP-N · Supervisión norte'}))
        expect(treeRows()).toHaveLength(4)

        await user.click(screen.getByRole('checkbox', {name: 'Ver también las inactivas'}))
        await waitFor(() => expect(requests.some((url) => url.pathname === `${BASE}/units/tree` && url.search === '?includeInactive=true')).toBe(true))

        await user.click(within(treeRowOf('A')).getByRole('button', {name: 'Abrir A'}))
        expect(await screen.findByRole('heading', {name: 'A · Equipo A'})).toBeInTheDocument()
        expect(screen.getByText('Linemen: 4 de 2 a 6 · Completo: Sí · Supervisor: PER-000020 · Dana Levi · Jefe de supervisores: - · Vehículo: -'))
            .toBeInTheDocument()
        await waitFor(() => expect(firstColumn('Linemen de A')).toHaveLength(4))
        expect(screen.queryByRole('button', {name: 'Añadir lineman'})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Modificar'})).not.toBeInTheDocument()
    })

    it('una unidad que no existe se dice y vuelve al organigrama', async () => {
        serveOrganization()
        const missing = '5e6f7081-0000-4000-8000-0000000000ff'
        renderRoute(`/recursos/organigrama/${missing}`, {session: loginAs('recursos.lector')})

        expect(await screen.findByText(`No existe la unidad ${missing}`)).toBeInTheDocument()
        await waitFor(() => expect(treeRows()).toHaveLength(4))
    })

    it('un equipo nace completo bajo su padre, con su jefe y de 2 a 6 linemen comprobados antes de llamar; un error del servicio cae en su campo', async () => {
        serveOrganization({people: [person(PERSON1, 'PER-000003', 'Yossi', 'Cohen', 'TEAM_LEADER', true),
            person(lineman(1).id, 'PER-000011', 'Lineman', 'Uno', 'WORKER', true),
            person(lineman(2).id, 'PER-000012', 'Lineman', 'Dos', 'WORKER', true)]})
        const writes = recordWrites('post', `${BASE}/units`, (body, call) => (call === 1
            ? resourcesError(400, 'REQ-VALIDATION', 'Validation failed', [{field: 'code', message: 'must match [A-Za-z0-9_-]+'}])
            : HttpResponse.json(teamUnit(2), {status: 201})))
        const {user} = await openTree(loginAs('recursos.gestor'))

        expect(actionsOf(treeRowOf('A'))).toEqual(['Abrir A'])
        await user.click(within(treeRowOf('SUP-N')).getByRole('button', {name: 'Nueva unidad debajo de SUP-N'}))
        const dialog = await screen.findByRole('dialog', {name: 'Nueva unidad'})
        await typeInto(user, dialog, 'Código', 'B')
        await typeInto(user, dialog, 'Nombre', ' Equipo B ')
        await choose(user, dialog, 'Nivel', 'Equipo')
        expect(within(dialog).getByRole('combobox', {name: 'Depende de'})).toHaveValue('SUP-N · Supervisión norte')
        await user.click(within(dialog).getByRole('combobox', {name: 'Depende de'}))
        expect((await screen.findAllByRole('option')).map((option) => option.textContent))
            .toEqual(['PRJ · Proyecto', 'MNT · Mantenimiento', 'SUP-N · Supervisión norte'])
        await user.keyboard('{Escape}')
        const discipline = within(dialog).getByRole('combobox', {name: 'Disciplina'})
        expect(discipline).toHaveValue('Mantenimiento')
        expect(discipline).toHaveAttribute('readonly')

        await choose(user, dialog, 'Linemen', 'PER-000011 · Lineman Uno')
        await user.keyboard('{Escape}')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('Un equipo nace con 2 a 6 linemen, no con 1')).toBeInTheDocument()
        expect(within(dialog).getByText('Un equipo trabaja siempre con su jefe')).toBeInTheDocument()
        expect(writes).toHaveLength(0)

        await choose(user, dialog, 'Jefe', 'PER-000003 · Yossi Cohen')
        await choose(user, dialog, 'Linemen', 'PER-000012 · Lineman Dos')
        await user.keyboard('{Escape}')
        await choose(user, dialog, 'EP', 'EP 6')
        await user.click(await screen.findByRole('option', {name: 'EP 4'}))
        await user.keyboard('{Escape}')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('must match [A-Za-z0-9_-]+')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Nueva unidad'})).toBeInTheDocument()

        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Nueva unidad'})).not.toBeInTheDocument())
        expect(writes.map((write) => write.body)).toEqual([1, 2].map(() => ({
            code: 'B', name: 'Equipo B', kind: 'TEAM', discipline: 'MAINTENANCE', parentId: SUPERVISION_UNIT, headPersonId: PERSON1,
            executionPackageIds: [4, 6], memberPersonIds: [lineman(1).id, lineman(2).id],
        })))
    })

    it('modificar manda los EP como conjunto y el jefe vaciado con la versión leída; una versión vieja deja el diálogo abierto', async () => {
        serveOrganization({units: {[SUPERVISION_UNIT]: supervisionUnit(), [TEAM_UNIT]: teamUnit(4)}})
        const writes = recordWrites('patch', `${BASE}/units/:id`, (body, call) => (call === 1
            ? resourcesError(409, 'CON-001', 'Organization unit SUP-N was changed by someone else')
            : HttpResponse.json(supervisionUnit())))
        const {user} = await openUnit(loginAs('recursos.gestor'), SUPERVISION_UNIT, 'SUP-N · Supervisión norte')

        await waitFor(() => expect(textsOf(dataRows('Unidades de SUP-N')[0])).toEqual(['A · Equipo A', 'Equipo', 'PER-000003 · Yossi Cohen',
            '4 de 2 a 6', 'EP 4, EP 5', 'Activa', '']))
        await user.click(screen.getByRole('button', {name: 'Modificar'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar SUP-N · Supervisión norte'})
        expect(within(dialog).getByRole('textbox', {name: 'Código'})).toHaveAttribute('readonly')
        await user.click(within(dialog).getByRole('combobox', {name: 'Depende de'}))
        expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['PRJ · Proyecto', 'MNT · Mantenimiento'])
        await user.keyboard('{Escape}')
        await choose(user, dialog, 'EP', 'EP 6')
        await user.keyboard('{Escape}')
        await choose(user, dialog, 'Jefe', 'PER-000020 · Dana Levi')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await screen.findByText('Conflicto con otro cambio: recarga y vuelve a intentarlo.')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Modificar SUP-N · Supervisión norte'})).toBeInTheDocument()

        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Modificar SUP-N · Supervisión norte'})).not.toBeInTheDocument())
        expect(writes.map((write) => [write.contentType, write.body])).toEqual([1, 2].map(() => [MERGE_PATCH,
            {headPersonId: null, executionPackageIds: [4, 6], version: 2}]))

        await user.click(screen.getByRole('button', {name: 'Historial'}))
        const history = await screen.findByRole('dialog', {name: /Historial de SUP-N/})
        expect(await within(history).findByText('Supervisión norte · Supervisión · Mantenimiento · en MNT · jefe per-000020 · dana levi · EP 4 · activa'))
            .toBeInTheDocument()
    })

    it('sin config-read los EP se ven como #id, no se pide nada a mto-configuration y no viajan', async () => {
        const requests = serveOrganization({units: {[SUPERVISION_UNIT]: supervisionUnit()}})
        const writes = recordWrites('patch', `${BASE}/units/:id`, () => HttpResponse.json(supervisionUnit()))
        const {user} = await openUnit(sessionWith([P.RESOURCES_READ, P.RESOURCES_WRITE]), SUPERVISION_UNIT, 'SUP-N · Supervisión norte')

        expect(screen.getByText('Disciplina: Mantenimiento · Depende de: MNT · Mantenimiento · Jefe: PER-000020 · Dana Levi · EP: #4'))
            .toBeInTheDocument()
        await user.click(screen.getByRole('button', {name: 'Modificar'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar SUP-N · Supervisión norte'})
        expect(within(dialog).getByRole('textbox', {name: 'EP'})).toHaveValue('#4')
        await typeInto(user, dialog, 'Nombre', 'Supervisión del norte')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(writes).toHaveLength(1))
        expect(writes[0].body).toEqual({name: 'Supervisión del norte', version: 2})
        expect(requests.some((url) => url.pathname.startsWith(CONFIGURATION))).toBe(false)
    })

    it('con 6 linemen no se añade otro, con 2 no sale ninguno, y cambiar varios es la lista entera de una vez', async () => {
        const units = {[TEAM_UNIT]: teamUnit(6)}
        const members = {[TEAM_UNIT]: linemen(6)}
        serveOrganization({units, members, people: [person(lineman(5).id, 'PER-000015', 'Lineman', 'Cinco', 'WORKER', true),
            person(lineman(0).id, 'PER-000010', 'Lineman', '0', 'WORKER', true), person(lineman(3).id, 'PER-000013', 'Lineman', '3', 'WORKER', true)]})
        const view = await openUnit(loginAs('recursos.gestor'), TEAM_UNIT, 'A · Equipo A')
        await waitFor(() => expect(firstColumn('Linemen de A')).toHaveLength(6))
        expect(screen.getByRole('button', {name: 'Añadir lineman'})).toBeDisabled()
        expect(within(rowOf('Linemen de A', 'PER-000010')).getByRole('button', {name: 'Sale del equipo PER-000010 · Lineman 0'})).toBeEnabled()
        view.unmount()

        units[TEAM_UNIT] = teamUnit(2)
        members[TEAM_UNIT] = linemen(2)
        const adds = recordWrites('post', `${BASE}/units/:id/members`, (body, call) => {
            if (call === 1) {
                return resourcesError(409, 'UNI-001', 'Lineman 5 is already a lineman of team B')
            }
            units[TEAM_UNIT] = teamUnit(3)
            members[TEAM_UNIT] = linemen(3)
            return HttpResponse.json(teamUnit(3))
        })
        const {user} = await openUnit(loginAs('recursos.gestor'), TEAM_UNIT, 'A · Equipo A')
        await waitFor(() => expect(firstColumn('Linemen de A')).toHaveLength(2))
        expect(within(rowOf('Linemen de A', 'PER-000010')).getByRole('button', {name: 'Sale del equipo PER-000010 · Lineman 0'})).toBeDisabled()
        await user.click(screen.getByRole('button', {name: 'Añadir lineman'}))
        let dialog = await screen.findByRole('dialog', {name: 'Añadir lineman a A · Equipo A'})
        await user.click(within(dialog).getByRole('button', {name: 'Añadir'}))
        expect(await within(dialog).findByText('Elige quién entra')).toBeInTheDocument()
        await choose(user, dialog, 'Lineman', 'PER-000015 · Lineman Cinco')
        await user.click(within(dialog).getByRole('button', {name: 'Añadir'}))
        expect(await screen.findByText('El organigrama no admite ese cambio. Lineman 5 is already a lineman of team B')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Añadir lineman a A · Equipo A'})).toBeInTheDocument()
        await user.click(within(dialog).getByRole('button', {name: 'Añadir'}))
        await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Añadir lineman a A · Equipo A'})).not.toBeInTheDocument())
        expect(adds.map((write) => write.body)).toEqual([{personId: lineman(5).id}, {personId: lineman(5).id}])

        const leaves = recordWrites('post', `${BASE}/units/:id/members/:personId/leave`, () => {
            members[TEAM_UNIT] = linemen(2)
            units[TEAM_UNIT] = teamUnit(2)
            return HttpResponse.json(teamUnit(2))
        })
        await waitFor(() => expect(firstColumn('Linemen de A')).toHaveLength(3))
        await user.click(within(rowOf('Linemen de A', 'PER-000012')).getByRole('button', {name: 'Sale del equipo PER-000012 · Lineman 2'}))
        dialog = await screen.findByRole('dialog', {name: 'PER-000012 · Lineman 2 sale de A · Equipo A'})
        await user.type(within(dialog).getByRole('textbox', {name: 'Sale el'}), '21/10/2026')
        await user.click(within(dialog).getByRole('button', {name: 'Sale del equipo'}))
        await waitFor(() => expect(leaves).toHaveLength(1))
        expect(leaves[0].params.personId).toBe(lineman(2).id)
        expect(leaves[0].body).toEqual({leftOn: '2026-10-21'})
        await waitFor(() => expect(firstColumn('Linemen de A')).toHaveLength(2))

        const replaces = recordWrites('put', `${BASE}/units/:id/members`, () => HttpResponse.json(teamUnit(3)))
        await user.click(screen.getByRole('button', {name: 'Cambiar los linemen'}))
        dialog = await screen.findByRole('dialog', {name: 'Cambiar los linemen de A · Equipo A'})
        expect(within(dialog).getByLabelText('Linemen elegidos')).toHaveTextContent('2 de 2 a 6')
        // Borrar en el campo vacío quita el último elegido: con 1 no se llama.
        await user.click(within(dialog).getByRole('combobox', {name: 'Linemen'}))
        await user.keyboard('{Backspace}')
        await user.keyboard('{Escape}')
        expect(within(dialog).getByLabelText('Linemen elegidos')).toHaveTextContent('1 de 2 a 6')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('Un equipo trabaja con 2 a 6 linemen, no con 1')).toBeInTheDocument()
        expect(replaces).toHaveLength(0)
        await choose(user, dialog, 'Linemen', 'PER-000013 · Lineman 3')
        await user.keyboard('{Escape}')
        await user.type(within(dialog).getByRole('textbox', {name: 'Desde el'}), '22/10/2026')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(replaces).toHaveLength(1))
        expect(replaces[0].body).toEqual({memberPersonIds: [lineman(0).id, lineman(3).id], effectiveOn: '2026-10-22'})
    })

    it('desactivar pide confirmación y lo que el servicio no deja se dice; un equipo vuelve con sus linemen y otra unidad con un PATCH', async () => {
        const units = {[SUPERVISION_UNIT]: supervisionUnit(), [TEAM_UNIT]: teamUnit(0, false)}
        serveOrganization({units, teamActive: false, people: [person(lineman(1).id, 'PER-000011', 'Lineman', 'Uno', 'WORKER', true),
            person(lineman(2).id, 'PER-000012', 'Lineman', 'Dos', 'WORKER', true)]})
        const deletes = recordWrites('delete', `${BASE}/units/:id`, () => resourcesError(409, 'UNI-001', 'SUP-N has active units under it'))
        let view = await openUnit(loginAs('recursos.responsable'), SUPERVISION_UNIT, 'SUP-N · Supervisión norte')
        await view.user.click(screen.getByRole('button', {name: 'Desactivar'}))
        const confirm = await screen.findByRole('dialog', {name: 'Desactivar SUP-N · Supervisión norte'})
        expect(deletes).toHaveLength(0)
        await view.user.click(within(confirm).getByRole('button', {name: 'Desactivar'}))
        expect(await screen.findByText('El organigrama no admite ese cambio. SUP-N has active units under it')).toBeInTheDocument()
        expect(deletes).toHaveLength(1)
        view.unmount()

        const patches = recordWrites('patch', `${BASE}/units/:id`, (body) => {
            units[TEAM_UNIT] = teamUnit(2)
            return HttpResponse.json(body.memberPersonIds ? teamUnit(2) : supervisionUnit())
        })
        view = await openUnit(loginAs('recursos.responsable'), TEAM_UNIT, 'A · Equipo A')
        expect(screen.queryByRole('button', {name: 'Desactivar'})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Añadir lineman'})).not.toBeInTheDocument()
        await view.user.click(screen.getByRole('button', {name: 'Reactivar'}))
        const dialog = await screen.findByRole('dialog', {name: 'Reactivar A · Equipo A'})
        await view.user.click(within(dialog).getByRole('button', {name: 'Reactivar'}))
        expect(await within(dialog).findByText('Un equipo trabaja con 2 a 6 linemen, no con 0')).toBeInTheDocument()
        expect(patches).toHaveLength(0)
        await choose(view.user, dialog, 'Linemen', 'PER-000011 · Lineman Uno')
        await view.user.click(await screen.findByRole('option', {name: 'PER-000012 · Lineman Dos'}))
        await view.user.keyboard('{Escape}')
        await view.user.click(within(dialog).getByRole('button', {name: 'Reactivar'}))
        await waitFor(() => expect(patches).toHaveLength(1))
        expect(patches[0].body).toEqual({active: true, memberPersonIds: [lineman(1).id, lineman(2).id], version: 7})
        expect(await screen.findByLabelText('Estado de la unidad')).toHaveTextContent('Activa')
        view.unmount()

        units[SUPERVISION_UNIT] = supervisionUnit(false)
        view = await openUnit(loginAs('recursos.responsable'), SUPERVISION_UNIT, 'SUP-N · Supervisión norte')
        await view.user.click(screen.getByRole('button', {name: 'Reactivar'}))
        await waitFor(() => expect(patches).toHaveLength(2))
        expect(patches[1].body).toEqual({active: true, version: 2})
    })

    it('el personal toma la unidad de la URL, la nombra y la quita al pedirlo; un id que no es un UUID no filtra', async () => {
        const requests = serveOrganization({units: {[SUPERVISION_UNIT]: supervisionUnit()}, people: [YOSSI]})
        const {user} = await openUnit(loginAs('recursos.lector'), SUPERVISION_UNIT, 'SUP-N · Supervisión norte')
        const lists = () => requests.filter((url) => url.pathname === `${BASE}/people`)

        await user.click(screen.getByRole('button', {name: 'Ver su personal'}))
        expect(await screen.findByLabelText('Filtro de unidad')).toHaveTextContent('Unidad: SUP-N · Supervisión norte')
        await waitFor(() => expect(lists().at(-1).searchParams.get('unitId')).toBe(SUPERVISION_UNIT))

        await user.click(screen.getByRole('button', {name: 'Quitar el filtro de unidad'}))
        await waitFor(() => expect(screen.queryByLabelText('Filtro de unidad')).not.toBeInTheDocument())
        await waitFor(() => expect(lists().at(-1).searchParams.get('unitId')).toBeNull())
    })

    it('un id de unidad que no es un UUID no filtra el personal', async () => {
        const requests = serveResources({people: [YOSSI]})
        await open('/recursos/personal?unitId=no-es-un-id', loginAs('recursos.lector'), 'Personal', 1)
        expect(screen.queryByLabelText('Filtro de unidad')).not.toBeInTheDocument()
        expect(requests.every((url) => !url.searchParams.has('unitId'))).toBe(true)
    })
})

const VEHICLE_TYPE1 = '7b8c9d0e-0000-4000-8000-000000000001'
const VEHICLE_TYPE2 = '7b8c9d0e-0000-4000-8000-000000000002'
const PARKING_SITE1 = '8c9d0e1f-0000-4000-8000-000000000001'

function unimog(extra = {}) {
    return {
        id: VEHICLE_TYPE1, code: 'UNIMOG-RR', name: 'Unimog bivial', manufacturer: 'Mercedes-Benz', model: 'U423', mobility: 'ROAD_RAIL',
        category: 'ROAD_RAIL_TRUCK', selfPropelled: true, portable: false, lengthM: 6.2, axles: 2, seats: 3, power: 'DIESEL', trackGaugeMm: 1435,
        maxSpeedTrackWorkingKmh: 20, maxSpeedTrackTransportKmh: 40, transportModeAuthorised: false, railGearType: 'RAIL_WHEEL_DRIVE',
        onTrackingMinutes: 10, needsPreparedAccess: null, maxSpeedRoadKmh: 90, requiredLicence: 'C', capabilities: ['CRANE', 'LASER_SCANNER'],
        craneCapacityT: 5, active: true, version: 4, ...extra,
    }
}

function dresina() {
    return {
        id: VEHICLE_TYPE2, code: 'DIC-30', name: 'Plasser DIC-30', manufacturer: 'Plasser', model: 'DIC-30', mobility: 'RAIL_ONLY',
        category: 'CATENARY_TOWER_CAR', selfPropelled: true, portable: false, axles: 4, seats: 6, power: 'DIESEL', trackGaugeMm: 1435,
        transportModeAuthorised: true, capabilities: ['ELEVATING_PLATFORM', 'PANTOGRAPH'], active: true, version: 2,
    }
}

function siding(extra = {}) {
    return {
        id: PARKING_SITE1, code: 'APT-RSH', name: 'Apartadero de Rishpon', kind: 'SIDING', executionPackageId: 4, stationId: 7, trackId: 12,
        kp: 12.3, railAccess: true, roadAccess: false, address: null, latitude: 32.2, longitude: 34.82, notes: null, active: true, version: 2,
        ...extra,
    }
}

/** Los catálogos de la flota simulados, con los tipos de cualificación, y los nombres de mto-configuration (EP, vías y estaciones). */
function serveFleetCatalogues({types = [], sites = [], qualificationTypes = []} = {}) {
    const requests = serveResources({qualificationTypes})
    server.use(
        http.get(`${BASE}/vehicle-types`, ({request}) => {
            const url = new URL(request.url)
            requests.push(url)
            return HttpResponse.json(pageOf(types, url))
        }),
        http.get(`${BASE}/parking-sites`, ({request}) => {
            const url = new URL(request.url)
            requests.push(url)
            return HttpResponse.json(pageOf(sites, url))
        }),
    )
    const lists = {
        'execution-packages': [{id: 4, name: 'EP 4'}, {id: 5, name: 'EP 5'}],
        tracks: [{id: 12, name: 'VIA 1', executionPackageId: 4}, {id: 20, name: 'VIA 9', executionPackageId: 5}],
        stations: [{id: 7, name: 'Rishpon', executionPackageId: 4}],
    }
    for (const [path, rows] of Object.entries(lists)) {
        server.use(http.post(`${CONFIGURATION}/${path}/filter`, ({request}) => {
            const url = new URL(request.url)
            requests.push(url)
            return HttpResponse.json(pageOf(rows, url))
        }))
    }
    return requests
}

describe('los modelos de vehículo', () => {
    it('se filtran en el servicio, con las categorías de la movilidad elegida, y quien solo lee no ve controles', async () => {
        const requests = serveFleetCatalogues({types: [unimog(), dresina()]})
        const {user} = await open('/recursos/flota/modelos', loginAs('recursos.lector'), 'Modelos de vehículo', 2)
        const lists = () => requests.filter((url) => url.pathname === `${BASE}/vehicle-types`)

        expect(textsOf(dataRows('Modelos de vehículo')[0])).toEqual(['UNIMOG-RR', 'Unimog bivial', 'Mercedes-Benz · U423', 'Bivial',
            'Camión bivial', '3', 'Grúa, LASER_SCANNER', 'Activo', ''])
        expect(lists()[0].search).toBe('?page=0&size=50&sort=code%2Casc&sort=id%2Casc')

        await choose(user, document.body, 'Movilidad', 'Solo vía')
        await user.click(screen.getByRole('combobox', {name: 'Categoría'}))
        expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['Dresina de catenaria', 'Tren de tendido',
            'Dresina de vía', 'Vehículo de auscultación', 'Locomotora', 'Vagón o plataforma', 'Vagoneta'])
        await user.click(screen.getByRole('option', {name: 'Dresina de catenaria'}))
        await choose(user, document.body, 'Capacidad', 'Pantógrafo')
        await waitFor(() => expect(lists().at(-1).searchParams.get('capability')).toBe('PANTOGRAPH'))
        expect([lists().at(-1).searchParams.get('mobility'), lists().at(-1).searchParams.get('category')]).toEqual(['RAIL_ONLY', 'CATENARY_TOWER_CAR'])

        expect(screen.queryByRole('button', {name: 'Nuevo modelo'})).not.toBeInTheDocument()
        expect(actionsOf(rowOf('Modelos de vehículo', 'UNIMOG-RR'))).toEqual([])
    })

    it('el alta va por secciones según la movilidad y sus cifras se comprueban con la columna del servicio antes de llamar', async () => {
        serveFleetCatalogues()
        const writes = recordWrites('post', `${BASE}/vehicle-types`, () => HttpResponse.json(unimog(), {status: 201}))
        const {user} = await open('/recursos/flota/modelos', loginAs('recursos.gestor'), 'Modelos de vehículo', 0)

        await user.click(screen.getByRole('button', {name: 'Nuevo modelo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Nuevo modelo de vehículo'})
        await typeInto(user, dialog, 'Código', 'UNIMOG-RR')
        await typeInto(user, dialog, 'Nombre', 'Unimog bivial')
        await choose(user, dialog, 'Movilidad', 'Solo carretera')
        expect(within(dialog).queryByRole('group', {name: 'En vía'})).not.toBeInTheDocument()
        expect(within(dialog).queryByRole('group', {name: 'Bivial'})).not.toBeInTheDocument()
        expect(within(dialog).getByRole('group', {name: 'Por carretera'})).toBeInTheDocument()
        await choose(user, dialog, 'Categoría', 'Furgoneta')

        await choose(user, dialog, 'Movilidad', 'Bivial')
        expect(within(dialog).getByRole('combobox', {name: 'Categoría'})).toHaveValue('')
        expect(within(dialog).getByRole('group', {name: 'En vía'})).toBeInTheDocument()
        expect(within(dialog).getByRole('group', {name: 'Bivial'})).toBeInTheDocument()
        await choose(user, dialog, 'Categoría', 'Camión bivial')
        expect(within(dialog).queryByRole('textbox', {name: 'Grúa: capacidad (t)'})).not.toBeInTheDocument()
        await choose(user, dialog, 'Capacidades', 'Grúa')
        await user.keyboard('{Escape}')
        await typeInto(user, dialog, 'Grúa: capacidad (t)', '5.5')
        await typeInto(user, dialog, 'Largo (m)', '12345')
        await typeInto(user, dialog, 'Ancho de vía (mm)', '1435')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('Como mucho 4 cifras enteras')).toBeInTheDocument()
        expect(within(dialog).getByText('Una bivial dice su equipo ferroviario')).toBeInTheDocument()
        expect(writes).toHaveLength(0)

        await typeInto(user, dialog, 'Largo (m)', '6.20')
        await choose(user, dialog, 'Equipo ferroviario', '9A · tracción en la rueda ferroviaria')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(writes).toHaveLength(1))
        expect(writes[0].body).toEqual({
            code: 'UNIMOG-RR', mobility: 'ROAD_RAIL', name: 'Unimog bivial', category: 'ROAD_RAIL_TRUCK', selfPropelled: true, portable: false,
            lengthM: 6.2, trackGaugeMm: 1435, craneCapacityT: 5.5, transportModeAuthorised: false, railGearType: 'RAIL_WHEEL_DRIVE',
            needsPreparedAccess: false, capabilities: ['CRANE'],
        })
    })

    it('modificar no cambia el código ni la movilidad, quitar una capacidad vacía sus cifras y una desconocida vuelve tal cual', async () => {
        serveFleetCatalogues({types: [unimog()]})
        const writes = recordWrites('patch', `${BASE}/vehicle-types/:id`, (body, call) => (call === 1
            ? resourcesError(400, 'VAL-001', 'Crane figures (craneCapacityT, craneReachM) need the CRANE capability')
            : HttpResponse.json(unimog())))
        const {user} = await open('/recursos/flota/modelos', loginAs('recursos.gestor'), 'Modelos de vehículo', 1)

        await user.click(within(rowOf('Modelos de vehículo', 'UNIMOG-RR')).getByRole('button', {name: 'Modificar UNIMOG-RR'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar UNIMOG-RR · Unimog bivial'})
        expect(within(dialog).getByRole('textbox', {name: 'Código'})).toHaveAttribute('readonly')
        expect(within(dialog).getByRole('combobox', {name: 'Movilidad'})).toHaveAttribute('readonly')
        expect(within(dialog).getByRole('textbox', {name: 'Grúa: capacidad (t)'})).toHaveValue('5')
        // Elegir otra vez una capacidad elegida la quita.
        await choose(user, dialog, 'Capacidades', 'Grúa')
        await user.click(await screen.findByRole('option', {name: 'Remolca'}))
        await user.keyboard('{Escape}')
        expect(within(dialog).queryByRole('textbox', {name: 'Grúa: capacidad (t)'})).not.toBeInTheDocument()
        await typeInto(user, dialog, 'Plazas', '5')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await screen.findByText(/need the CRANE capability/)).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Modificar UNIMOG-RR · Unimog bivial'})).toBeInTheDocument()

        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(writes.map((write) => [write.contentType, write.body])).toEqual([1, 2].map(() => [MERGE_PATCH,
            {seats: 5, craneCapacityT: null, capabilities: ['LASER_SCANNER', 'TOWING'], version: 4}]))
    })

    it('retirar pide resources-delete y confirmación; volver a ofrecerlo es un PATCH active=true', async () => {
        serveFleetCatalogues({types: [dresina(), unimog({active: false})]})
        const deletes = recordWrites('delete', `${BASE}/vehicle-types/:id`, () => new HttpResponse(null, {status: 204}))
        const patches = recordWrites('patch', `${BASE}/vehicle-types/:id`, () => HttpResponse.json(unimog()))
        const {user} = await open('/recursos/flota/modelos', loginAs('recursos.responsable'), 'Modelos de vehículo', 2)

        expect(actionsOf(rowOf('Modelos de vehículo', 'DIC-30'))).toEqual(['Modificar DIC-30', 'Retirar DIC-30'])
        expect(actionsOf(rowOf('Modelos de vehículo', 'UNIMOG-RR'))).toEqual(['Modificar UNIMOG-RR', 'Volver a ofrecer UNIMOG-RR'])
        await user.click(within(rowOf('Modelos de vehículo', 'DIC-30')).getByRole('button', {name: 'Retirar DIC-30'}))
        const confirm = await screen.findByRole('dialog', {name: 'Retirar DIC-30 · Plasser DIC-30'})
        expect(deletes).toHaveLength(0)
        await user.click(within(confirm).getByRole('button', {name: 'Retirar'}))
        await waitFor(() => expect(deletes.map((write) => write.params.id)).toEqual([VEHICLE_TYPE2]))

        await user.click(within(rowOf('Modelos de vehículo', 'UNIMOG-RR')).getByRole('button', {name: 'Volver a ofrecer UNIMOG-RR'}))
        await waitFor(() => expect(patches.map((write) => write.body)).toEqual([{active: true, version: 4}]))
    })

    it('la habilitación del conductor se elige entre los tipos activos y viaja por su id; vaciarla viaja a null, y en el alta vacía no viaja', async () => {
        const requests = serveFleetCatalogues({types: [unimog({requiredDriverQualification: {id: QTYPE_OLD, code: 'OLD', name: 'Antigua',
            kind: 'VEHICLE_OPERATION'}})], qualificationTypes: [RAIL_DRIVER, RR_OPERATOR, RETIRED_TYPE]})
        const patches = recordWrites('patch', `${BASE}/vehicle-types/:id`, () => HttpResponse.json(unimog()))
        const posts = recordWrites('post', `${BASE}/vehicle-types`, () => HttpResponse.json(dresina(), {status: 201}))
        const {user} = await open('/recursos/flota/modelos', loginAs('recursos.gestor'), 'Modelos de vehículo', 1)

        await user.click(within(rowOf('Modelos de vehículo', 'UNIMOG-RR')).getByRole('button', {name: 'Modificar UNIMOG-RR'}))
        let dialog = await screen.findByRole('dialog', {name: 'Modificar UNIMOG-RR · Unimog bivial'})
        const driver = within(dialog).getByRole('combobox', {name: 'Habilitación del conductor'})
        // La leída se ve aunque ya no esté entre las activas: si no, el campo la leería vacía.
        await waitFor(() => expect(driver).toHaveValue('OLD · Antigua'))
        const search = requests.filter((url) => url.pathname === `${BASE}/qualification-types`).at(-1)
        expect(search.search).toBe('?active=true&page=0&size=200&sort=code%2Casc&sort=id%2Casc')
        await user.click(driver)
        expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['OLD · Antigua',
            'RAIL-DRIVER · Rail auxiliary vehicle driver', 'RR-OPERATOR · Road-rail machine operator'])
        await user.click(screen.getByRole('option', {name: 'RR-OPERATOR · Road-rail machine operator'}))
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

        await user.click(within(rowOf('Modelos de vehículo', 'UNIMOG-RR')).getByRole('button', {name: 'Modificar UNIMOG-RR'}))
        dialog = await screen.findByRole('dialog', {name: 'Modificar UNIMOG-RR · Unimog bivial'})
        expect(within(dialog).getByText('Vacía: no exige ninguna')).toBeInTheDocument()
        await waitFor(() => expect(within(dialog).getByRole('combobox', {name: 'Habilitación del conductor'})).toHaveValue('OLD · Antigua'))
        await user.click(within(dialog).getByLabelText('Quitar la habilitación del conductor'))
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(patches).toHaveLength(2))
        expect(patches.map((write) => write.body)).toEqual([{requiredDriverQualificationTypeId: QTYPE_RR, version: 4},
            {requiredDriverQualificationTypeId: null, version: 4}])

        await user.click(screen.getByRole('button', {name: 'Nuevo modelo'}))
        dialog = await screen.findByRole('dialog', {name: 'Nuevo modelo de vehículo'})
        expect(within(dialog).getByText('Vacía: la de su movilidad y su permiso')).toBeInTheDocument()
        await typeInto(user, dialog, 'Código', 'DIC-30')
        await typeInto(user, dialog, 'Nombre', 'Plasser DIC-30')
        await choose(user, dialog, 'Movilidad', 'Solo vía')
        await choose(user, dialog, 'Categoría', 'Dresina de catenaria')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(posts).toHaveLength(1))
        expect(posts[0].body).not.toHaveProperty('requiredDriverQualificationTypeId')
    })
})

describe('los sitios de aparcamiento', () => {
    it('un sitio se alcanza por vía, por carretera o por las dos, con acceso por vía dice su vía, y las coordenadas van juntas', async () => {
        serveFleetCatalogues({sites: [siding()]})
        const writes = recordWrites('post', `${BASE}/parking-sites`, () => HttpResponse.json(siding(), {status: 201}))
        const {user} = await open('/recursos/flota/aparcamientos', loginAs('recursos.gestor'), 'Sitios de aparcamiento', 1)

        await waitFor(() => expect(textsOf(dataRows('Sitios de aparcamiento')[0])).toEqual(['APT-RSH', 'Apartadero de Rishpon', 'Apartadero',
            'EP 4', 'VIA 1 (EP 4) · kp 12.3', 'Vía', 'Activo', '']))
        await user.click(screen.getByRole('button', {name: 'Nuevo sitio'}))
        const dialog = await screen.findByRole('dialog', {name: 'Nuevo sitio de aparcamiento'})
        await typeInto(user, dialog, 'Código', 'APT-RSH')
        await typeInto(user, dialog, 'Nombre', 'Apartadero de Rishpon')
        await choose(user, dialog, 'Tipo', 'Apartadero')
        await user.click(within(dialog).getByRole('checkbox', {name: 'Acceso por carretera'}))
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('Un sitio se alcanza por vía, por carretera o por las dos')).toBeInTheDocument()

        await user.click(within(dialog).getByRole('checkbox', {name: 'Acceso por vía'}))
        await typeInto(user, dialog, 'Latitud', '32.2')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('Con acceso por vía dice su vía')).toBeInTheDocument()
        expect(within(dialog).getByText('Las coordenadas van juntas: latitud y longitud')).toBeInTheDocument()
        expect(writes).toHaveLength(0)

        await choose(user, dialog, 'EP', 'EP 4')
        await user.click(within(dialog).getByRole('combobox', {name: 'Vía'}))
        expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['VIA 1 (EP 4)'])
        await user.click(screen.getByRole('option', {name: 'VIA 1 (EP 4)'}))
        await typeInto(user, dialog, 'Latitud', '')
        await typeInto(user, dialog, 'KP', '12.300')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(writes).toHaveLength(1))
        expect(writes[0].body).toEqual({code: 'APT-RSH', name: 'Apartadero de Rishpon', kind: 'SIDING', executionPackageId: 4, trackId: 12,
            kp: 12.3, railAccess: true, roadAccess: false})
    })

    it('sin config-read su EP, estación y vía se ven como #id, no se pide nada a mto-configuration y no viajan', async () => {
        const requests = serveFleetCatalogues({sites: [siding()]})
        const writes = recordWrites('patch', `${BASE}/parking-sites/:id`, () => HttpResponse.json(siding()))
        const {user} = await open('/recursos/flota/aparcamientos', sessionWith([P.RESOURCES_READ, P.RESOURCES_WRITE]), 'Sitios de aparcamiento', 1)

        expect(textsOf(dataRows('Sitios de aparcamiento')[0]).slice(3, 5)).toEqual(['#4', '#12 · kp 12.3'])
        await user.click(within(rowOf('Sitios de aparcamiento', 'APT-RSH')).getByRole('button', {name: 'Modificar APT-RSH'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar APT-RSH · Apartadero de Rishpon'})
        expect(within(dialog).getByRole('textbox', {name: 'EP, estación y vía'})).toHaveValue('#4 · #7 · #12')
        await user.click(within(dialog).getByRole('checkbox', {name: 'Acceso por carretera'}))
        await typeInto(user, dialog, 'Latitud', '')
        await typeInto(user, dialog, 'Longitud', '')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(writes).toHaveLength(1))
        expect(writes[0].body).toEqual({roadAccess: true, latitude: null, longitude: null, version: 2})
        expect(requests.some((url) => url.pathname.startsWith(CONFIGURATION))).toBe(false)
    })
})

const VEHICLE1 = '9d0e1f20-0000-4000-8000-000000000001'
const VEHICLE2 = '9d0e1f20-0000-4000-8000-000000000002'
const LOCATION_SHIFT = 'a0b1c2d3-0000-4000-8000-000000000001'
const RAIL_MODEL = {id: VEHICLE_TYPE2, code: 'DIC-30', name: 'Plasser DIC-30', mobility: 'RAIL_ONLY', category: 'CATENARY_TOWER_CAR', selfPropelled: true,
    seats: 6, railGearType: null, transportModeAuthorised: true, capabilities: ['PANTOGRAPH']}
const ROAD_RAIL_MODEL = {id: VEHICLE_TYPE1, code: 'UNIMOG-RR', name: 'Unimog bivial', mobility: 'ROAD_RAIL', category: 'ROAD_RAIL_TRUCK',
    selfPropelled: true, seats: 3, railGearType: 'RAIL_WHEEL_DRIVE', transportModeAuthorised: false, capabilities: ['TOWING']}

function location(kind, {trackId = null, kp = null, carrier = null, reference = null} = {}) {
    return {
        id: `b1c2d3e4-0000-4000-8000-${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}`, kind,
        parkingSite: kind === 'PARKED' ? {id: PARKING_SITE1, code: 'APT-RSH', name: 'Apartadero de Rishpon', kind: 'SIDING'} : null,
        executionPackageId: 4, trackId, kp, latitude: null, longitude: null, accessPoint: null, description: null, carrier,
        attachment: carrier ? 'TOWED' : null, source: reference ? 'SHIFT' : 'MANUAL', sourceReference: reference, observedAt: '2026-10-16T03:40:00Z',
        recordedAt: '2026-10-16T03:40:02Z', recordedBy: reference ? 'service-account-mto-maintenance-svc' : 'recursos.gestor',
    }
}

function vehicle(id, code, type, position, active = true, extra = {}) {
    return {
        id, code, name: `Vehículo ${code}`, type, registrationPlate: type.mobility === 'RAIL_ONLY' ? null : '1234-ABC',
        railVehicleNumber: type.mobility === 'ROAD_ONLY' ? null : '99 80 9427 001-1', serialNumber: null, manufactureYear: 2019, owner: 'OWN',
        ownerCompany: null, operationalStatus: 'OPERATIONAL', statusReason: null, available: true, odometerKm: null, engineHours: null, notes: null,
        position, active, version: 6, ...extra,
    }
}

/** La flota simulada: los vehículos, cada uno por su id, sus ubicaciones, sus documentos y los sitios, con los catálogos y los nombres. */
function serveVehicles({vehicles = [], locations = [], types = [], sites = [], documents = {}} = {}) {
    const requests = serveFleetCatalogues({types, sites})
    server.use(
        http.get(`${BASE}/vehicles/:id/documents`, ({request, params}) => {
            requests.push(new URL(request.url))
            return HttpResponse.json(documents[params.id] ?? [])
        }),
    )
    server.use(
        http.get(`${BASE}/vehicles/:id/locations`, ({request}) => {
            const url = new URL(request.url)
            requests.push(url)
            return HttpResponse.json(pageOf(locations, url))
        }),
        http.get(`${BASE}/vehicles/:id`, ({request, params}) => {
            requests.push(new URL(request.url))
            const found = vehicles.find((row) => row.id === params.id)
            return found ? HttpResponse.json(found) : resourcesError(404, 'VEH-404', 'Vehicle not found')
        }),
        http.get(`${BASE}/vehicles`, ({request}) => {
            const url = new URL(request.url)
            requests.push(url)
            return HttpResponse.json(pageOf(vehicles, url))
        }),
    )
    return requests
}

describe('los vehículos', () => {
    it('la lista dice dónde está cada uno y se filtra en el servicio; quien solo lee solo abre las fichas', async () => {
        const requests = serveVehicles({vehicles: [vehicle(VEHICLE1, 'DR-01', RAIL_MODEL, location('PARKED', {trackId: 12, kp: 12.3,
            reference: `mto-maintenance:shift:${LOCATION_SHIFT}`})), vehicle(VEHICLE2, 'UN-01', ROAD_RAIL_MODEL, null, false)]})
        const {user} = await open('/recursos/flota', loginAs('recursos.lector'), 'Vehículos', 2)
        const lists = () => requests.filter((url) => url.pathname === `${BASE}/vehicles`)

        await waitFor(() => expect(textsOf(dataRows('Vehículos')[0])).toEqual(['DR-01', 'Vehículo DR-01', 'DIC-30', 'Solo vía', '', '99 80 9427 001-1',
            'Operativo', 'Aparcado · APT-RSH · VIA 1 (EP 4) · kp 12.3', 'Activo', '']))
        expect(textsOf(dataRows('Vehículos')[1]).slice(7, 9)).toEqual(['Sin ubicación', 'Retirado'])
        expect(lists()[0].search).toBe('?page=0&size=50&sort=code%2Casc&sort=id%2Casc')

        await choose(user, document.body, 'Movilidad', 'Solo vía')
        await choose(user, document.body, 'Disponible', 'Disponibles')
        await waitFor(() => expect(lists().at(-1).searchParams.get('available')).toBe('true'))
        expect(lists().at(-1).searchParams.get('mobility')).toBe('RAIL_ONLY')
        expect(screen.queryByRole('button', {name: 'Nuevo vehículo'})).not.toBeInTheDocument()
        expect(actionsOf(rowOf('Vehículos', 'DR-01'))).toEqual(['Abrir DR-01'])
    })

    it('el editor exige lo que pide su modelo antes de llamar: matrícula, número ferroviario, empresa y motivo', async () => {
        serveVehicles({types: [{...unimog(), transportModeAuthorised: false, capabilities: ['TOWING']}, dresina()]})
        const writes = recordWrites('post', `${BASE}/vehicles`, () => HttpResponse.json(vehicle(VEHICLE1, 'DR-01', RAIL_MODEL, null), {status: 201}))
        const {user} = await open('/recursos/flota', loginAs('recursos.responsable'), 'Vehículos', 0)

        await user.click(screen.getByRole('button', {name: 'Nuevo vehículo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Nuevo vehículo'})
        await typeInto(user, dialog, 'Código (número de flota)', 'DR-01')
        await choose(user, dialog, 'Modelo', 'DIC-30 · Plasser DIC-30')
        expect(within(dialog).queryByRole('textbox', {name: 'Matrícula'})).not.toBeInTheDocument()
        await choose(user, dialog, 'Propiedad', 'Subcontrata')
        await choose(user, dialog, 'Estado operativo', 'En reparación')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('Su modelo va por vía abierta: lleva su número de vehículo ferroviario')).toBeInTheDocument()
        expect(within(dialog).getByText('Uno que no es propio dice de quién es')).toBeInTheDocument()
        expect(within(dialog).getByText('Uno que no está operativo dice por qué')).toBeInTheDocument()

        await choose(user, dialog, 'Modelo', 'UNIMOG-RR · Unimog bivial')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('Va por carretera: lleva su matrícula')).toBeInTheDocument()
        expect(within(dialog).queryByText('Su modelo va por vía abierta: lleva su número de vehículo ferroviario')).not.toBeInTheDocument()
        expect(writes).toHaveLength(0)

        await typeInto(user, dialog, 'Matrícula', '1234-ABC')
        await typeInto(user, dialog, 'Empresa', 'Alquileres del Norte')
        await typeInto(user, dialog, 'Motivo', 'Gato hidráulico')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(writes).toHaveLength(1))
        expect(writes[0].body).toEqual({code: 'DR-01', typeId: VEHICLE_TYPE1, registrationPlate: '1234-ABC', owner: 'SUBCONTRACTOR',
            ownerCompany: 'Alquileres del Norte', operationalStatus: 'UNDER_REPAIR', statusReason: 'Gato hidráulico'})
    })

    it('la ficha dice dónde está, uno remolcado dónde está su portador, y sus ubicaciones se filtran por días con el enlace al turno', async () => {
        const carrier = vehicle(VEHICLE2, 'DR-02', RAIL_MODEL, location('ON_TRACK', {trackId: 12, kp: 10.5}))
        const towed = vehicle(VEHICLE1, 'PL-01', RAIL_MODEL, location('ATTACHED', {carrier: {id: VEHICLE2, code: 'DR-02', name: null,
            mobility: 'RAIL_ONLY', category: 'TRACK_MAINTENANCE_CAR'}}))
        const requests = serveVehicles({vehicles: [towed, carrier], locations: [location('PARKED', {trackId: 12, kp: 12.3,
            reference: `mto-maintenance:shift:${LOCATION_SHIFT}`})]})
        renderRoute(`/recursos/flota/${VEHICLE1}`, {session: loginAs('mantenimiento.jefe')})

        expect(await screen.findByRole('heading', {name: 'PL-01 · Vehículo PL-01'})).toBeInTheDocument()
        const where = screen.getByLabelText('Dónde está')
        expect(within(where).getByText('Remolcado por DR-02')).toBeInTheDocument()
        expect(await within(where).findByText('DR-02 está: En vía · VIA 1 (EP 4) · kp 10.5')).toBeInTheDocument()
        await waitFor(() => expect(textsOf(dataRows('Ubicaciones de PL-01')[0]).slice(1, 5)).toEqual(['Aparcado · APT-RSH · VIA 1 (EP 4) · kp 12.3', '',
            'Turno', 'service-account-mto-maintenance-svc']))
        expect(within(rowOf('Ubicaciones de PL-01', 'Turno')).getByRole('button', {name: 'Ver el turno'})).toBeInTheDocument()

        const historyRequests = () => requests.filter((url) => url.pathname === `${BASE}/vehicles/${VEHICLE1}/locations`)
        expect(historyRequests()[0].search).toBe('?page=0&size=20')
    })

    it('las ubicaciones se filtran por días: «Hasta» viaja como el principio del día siguiente', async () => {
        const requests = serveVehicles({vehicles: [vehicle(VEHICLE1, 'DR-01', RAIL_MODEL, null)], locations: []})
        const {user} = renderRoute(`/recursos/flota/${VEHICLE1}`, {session: loginAs('recursos.lector')})
        expect(await screen.findByRole('heading', {name: 'DR-01 · Vehículo DR-01'})).toBeInTheDocument()
        await user.type(screen.getByRole('textbox', {name: 'Desde'}), '01/10/2026')
        await user.type(screen.getByRole('textbox', {name: 'Hasta'}), '16/10/2026')
        await user.keyboard('{Escape}')
        const last = () => requests.filter((url) => url.pathname === `${BASE}/vehicles/${VEHICLE1}/locations`).at(-1)
        await waitFor(() => expect(last().searchParams.get('to')).toBe(new Date(2026, 9, 17).toISOString()))
        expect(last().searchParams.get('from')).toBe(new Date(2026, 9, 1).toISOString())
    })

    it('una ficha que no existe se dice y vuelve a la flota', async () => {
        serveVehicles()
        const missing = '9d0e1f20-0000-4000-8000-0000000000ff'
        renderRoute(`/recursos/flota/${missing}`, {session: loginAs('recursos.lector')})
        expect(await screen.findByText(`No existe el vehículo ${missing}`)).toBeInTheDocument()
        expect(await screen.findByRole('table', {name: 'Vehículos'})).toBeInTheDocument()
    })

    it('registrar dónde está ofrece lo que admite su movilidad, comprueba lo evidente y deja el diálogo abierto con un VEH-001', async () => {
        const requests = serveVehicles({vehicles: [vehicle(VEHICLE1, 'DR-01', RAIL_MODEL, null)], sites: [siding()]})
        const writes = recordWrites('post', `${BASE}/vehicles/:id/locations`, (body, call) => (call === 1
            ? resourcesError(409, 'VEH-001', 'Vehicle DR-01 is a rail-only vehicle: it is parked on a track')
            : HttpResponse.json(location('ON_TRACK', {trackId: 12, kp: 10.5}), {status: 201})))
        const {user} = renderRoute(`/recursos/flota/${VEHICLE1}`, {session: loginAs('recursos.gestor')})
        expect(await screen.findByRole('heading', {name: 'DR-01 · Vehículo DR-01'})).toBeInTheDocument()

        await user.click(screen.getByRole('button', {name: 'Registrar ubicación'}))
        const dialog = await screen.findByRole('dialog', {name: 'Registrar dónde está DR-01 · Vehículo DR-01'})
        await waitFor(() => expect(requests.some((url) => url.pathname === `${BASE}/parking-sites` && url.searchParams.get('railAccess') === 'true'))
            .toBe(true))
        await user.click(within(dialog).getByRole('combobox', {name: 'Dónde está'}))
        expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['Aparcado', 'En vía', 'En taller',
            'Con otro vehículo', 'Desconocida'])
        await user.keyboard('{Escape}')
        await user.type(within(dialog).getByRole('textbox', {name: 'Descripción'}), 'En la playa de vías')
        await user.click(within(dialog).getByRole('button', {name: 'Registrar'}))
        expect(await within(dialog).findByText('Uno de solo vía se aparca sobre una vía: un sitio con acceso por vía, o una vía y un kp'))
            .toBeInTheDocument()

        await choose(user, dialog, 'Dónde está', 'En vía')
        expect(within(dialog).queryByRole('combobox', {name: 'Sitio'})).not.toBeInTheDocument()
        await user.click(within(dialog).getByRole('button', {name: 'Registrar'}))
        expect(await within(dialog).findByText('En vía dice su vía')).toBeInTheDocument()
        await choose(user, dialog, 'Vía', 'VIA 1 (EP 4)')
        await typeInto(user, dialog, 'KP', '10.5')
        await user.click(within(dialog).getByRole('button', {name: 'Registrar'}))
        expect(await screen.findByText('La flota no admite ese cambio. Vehicle DR-01 is a rail-only vehicle: it is parked on a track'))
            .toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Registrar dónde está DR-01 · Vehículo DR-01'})).toBeInTheDocument()
        await user.click(within(dialog).getByRole('button', {name: 'Registrar'}))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(writes.map((write) => write.body)).toEqual([1, 2].map(() => ({kind: 'ON_TRACK', trackId: 12, kp: 10.5,
            description: 'En la playa de vías'})))
    })

    it('retirar pide confirmación y el vehículo por defecto de un equipo lo dice el servicio; reactivar es un PATCH', async () => {
        serveVehicles({vehicles: [vehicle(VEHICLE1, 'DR-01', RAIL_MODEL, null), vehicle(VEHICLE2, 'DR-02', RAIL_MODEL, null, false)]})
        const deletes = recordWrites('delete', `${BASE}/vehicles/:id`, () => resourcesError(409, 'VEH-001', 'Vehicle DR-01 is the default vehicle of team A'))
        const patches = recordWrites('patch', `${BASE}/vehicles/:id`, () => HttpResponse.json(vehicle(VEHICLE2, 'DR-02', RAIL_MODEL, null)))
        const {user} = await open('/recursos/flota', loginAs('recursos.responsable'), 'Vehículos', 2)

        await user.click(within(rowOf('Vehículos', 'DR-01')).getByRole('button', {name: 'Retirar DR-01'}))
        const confirm = await screen.findByRole('dialog', {name: 'Retirar DR-01 · Vehículo DR-01'})
        await user.click(within(confirm).getByRole('button', {name: 'Retirar'}))
        expect(await screen.findByText('La flota no admite ese cambio. Vehicle DR-01 is the default vehicle of team A')).toBeInTheDocument()
        expect(deletes).toHaveLength(1)
        await user.click(within(rowOf('Vehículos', 'DR-02')).getByRole('button', {name: 'Reactivar DR-02'}))
        await waitFor(() => expect(patches.map((write) => write.body)).toEqual([{active: true, version: 6}]))
    })
})

/** El tablero simulado: las filas tal cual, paginadas, con la URL de cada petición. */
function serveBoard(rows, {vehicles = []} = {}) {
    const requests = serveVehicles({vehicles})
    server.use(http.get(`${BASE}/vehicles/positions`, ({request}) => {
        const url = new URL(request.url)
        requests.push(url)
        return HttpResponse.json(pageOf(rows, url))
    }))
    return requests
}

describe('el tablero de la flota', () => {
    it('va por vía y kp con el vehículo para desempatar, uno remolcado está donde su portador, y se filtra y se actualiza en el servicio', async () => {
        const carrier = vehicle(VEHICLE2, 'DR-02', RAIL_MODEL, location('ON_TRACK', {trackId: 12, kp: 10.5}))
        const towedAt = location('ATTACHED', {carrier: {id: VEHICLE2, code: 'DR-02', name: null, mobility: 'RAIL_ONLY', category: 'TRACK_MAINTENANCE_CAR'}})
        const requests = serveBoard([
            {vehicle: {id: VEHICLE2, code: 'DR-02', name: 'Vehículo DR-02', mobility: 'RAIL_ONLY', category: 'CATENARY_TOWER_CAR'},
                operationalStatus: 'OPERATIONAL', available: true, position: carrier.position, effective: null},
            {vehicle: {id: VEHICLE1, code: 'PL-01', name: 'Vehículo PL-01', mobility: 'RAIL_ONLY', category: 'RAIL_WAGON'},
                operationalStatus: 'LIMITED', available: true, position: towedAt, effective: carrier.position},
        ], {vehicles: [vehicle(VEHICLE1, 'PL-01', RAIL_MODEL, towedAt), carrier]})
        const session = loginAs('recursos.gestor')
        const {user} = await open('/recursos/flota/tablero', session, 'Tablero de la flota', 2)
        const boards = () => requests.filter((url) => url.pathname === `${BASE}/vehicles/positions`)

        await waitFor(() => expect(textsOf(dataRows('Tablero de la flota')[0]).slice(0, 7)).toEqual(['VIA 1 (EP 4)', '10.5', 'DR-02 · Vehículo DR-02',
            'Solo vía', 'En vía', '', 'Operativo']))
        expect(textsOf(dataRows('Tablero de la flota')[1]).slice(0, 7)).toEqual(['VIA 1 (EP 4)', '10.5', 'PL-01 · Vehículo PL-01', 'Solo vía',
            'Remolcado por DR-02', '', 'Limitado'])
        expect(boards()[0].search).toBe('?page=0&size=50&sort=trackId%2Casc&sort=kp%2Casc&sort=vehicleId%2Casc')
        expect(screen.getByText('2 vehículos')).toBeInTheDocument()

        await choose(user, document.body, 'EP', 'EP 4')
        await user.click(screen.getByRole('combobox', {name: 'Vía'}))
        expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['VIA 1 (EP 4)'])
        await user.click(screen.getByRole('option', {name: 'VIA 1 (EP 4)'}))
        await choose(user, document.body, 'Dónde está', 'En vía')
        await waitFor(() => expect(boards().at(-1).searchParams.get('kind')).toBe('ON_TRACK'))
        expect([boards().at(-1).searchParams.get('executionPackageId'), boards().at(-1).searchParams.get('trackId')]).toEqual(['4', '12'])

        const before = boards().length
        await user.click(screen.getByRole('button', {name: 'Actualizar'}))
        await waitFor(() => expect(boards()).toHaveLength(before + 1))
        expect(boards().at(-1).search).toBe(boards().at(-2).search)

        await choose(user, document.body, 'EP', 'EP 5')
        expect(screen.getByRole('combobox', {name: 'Vía'})).toHaveValue('')

        await user.click(within(rowOf('Tablero de la flota', 'PL-01 · Vehículo PL-01')).getByRole('button', {name: 'Registrar dónde está PL-01'}))
        expect(await screen.findByRole('dialog', {name: 'Registrar dónde está PL-01 · Vehículo PL-01'})).toBeInTheDocument()
        expect(requests.some((url) => url.pathname === `${BASE}/vehicles/${VEHICLE1}`)).toBe(true)
    })

    it('quien solo lee abre los vehículos y no registra nada; sin config-read no hay EP ni vía, y la vía es #id', async () => {
        serveBoard([{vehicle: {id: VEHICLE2, code: 'DR-02', name: null, mobility: 'RAIL_ONLY', category: 'CATENARY_TOWER_CAR'},
            operationalStatus: 'OPERATIONAL', available: true, position: location('ON_TRACK', {trackId: 12, kp: 10.5}), effective: null}],
        {vehicles: [{...vehicle(VEHICLE2, 'DR-02', RAIL_MODEL, null), name: null}]})
        const {user} = await open('/recursos/flota/tablero', sessionWith([P.RESOURCES_READ]), 'Tablero de la flota', 1)

        expect(textsOf(dataRows('Tablero de la flota')[0]).slice(0, 3)).toEqual(['#12', '10.5', 'DR-02'])
        expect(screen.queryByRole('combobox', {name: 'EP'})).not.toBeInTheDocument()
        expect(screen.queryByRole('combobox', {name: 'Vía'})).not.toBeInTheDocument()
        expect(actionsOf(rowOf('Tablero de la flota', 'DR-02'))).toEqual(['Abrir DR-02'])
        await user.click(within(rowOf('Tablero de la flota', 'DR-02')).getByRole('button', {name: 'Abrir DR-02'}))
        expect(await screen.findByRole('heading', {name: 'DR-02'})).toBeInTheDocument()
    })
})

describe('el vehículo por defecto de un equipo', () => {
    it('se elige entre los disponibles y viaja en el merge-patch; quitarlo viaja a null, y otra unidad no lo ofrece', async () => {
        const withVehicle = {...teamUnit(2), defaultVehicle: {id: VEHICLE1, code: 'DR-01', name: 'Dresina 1', mobility: 'RAIL_ONLY',
            category: 'CATENARY_TOWER_CAR'}}
        serveOrganization({units: {[TEAM_UNIT]: withVehicle, [SUPERVISION_UNIT]: supervisionUnit()}, members: {[TEAM_UNIT]: linemen(2)}})
        const requests = serveVehicles({vehicles: [vehicle(VEHICLE2, 'DR-02', RAIL_MODEL, null)]})
        const writes = recordWrites('patch', `${BASE}/units/:id`, () => HttpResponse.json(withVehicle))
        const {user} = await openUnit(loginAs('recursos.gestor'), TEAM_UNIT, 'A · Equipo A')

        expect(screen.getByText(/Vehículo: DR-01 · Dresina 1/)).toBeInTheDocument()
        await user.click(screen.getByRole('button', {name: 'Modificar'}))
        let dialog = await screen.findByRole('dialog', {name: 'Modificar A · Equipo A'})
        const picker = within(dialog).getByRole('combobox', {name: 'Vehículo por defecto'})
        expect(picker).toHaveValue('DR-01 · Dresina 1')
        await user.click(picker)
        await user.click(await screen.findByRole('option', {name: 'DR-02 · Vehículo DR-02'}))
        const search = requests.filter((url) => url.pathname === `${BASE}/vehicles`).at(-1)
        expect([search.searchParams.get('available'), search.searchParams.get('active')]).toEqual(['true', 'true'])
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

        await user.click(screen.getByRole('button', {name: 'Modificar'}))
        dialog = await screen.findByRole('dialog', {name: 'Modificar A · Equipo A'})
        // El botón de vaciar de Mantine va con aria-hidden (el teclado vacía borrando): se busca por su etiqueta.
        await user.click(within(dialog).getByLabelText('Quitar el vehículo por defecto'))
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(writes).toHaveLength(2))
        expect(writes.map((write) => write.body)).toEqual([{defaultVehicleId: VEHICLE2, version: 7}, {defaultVehicleId: null, version: 7}])
    })

    it('una unidad que no es un equipo no lleva vehículo, ni en el editor ni en el merge-patch', async () => {
        serveOrganization({units: {[SUPERVISION_UNIT]: supervisionUnit(), [TEAM_UNIT]: teamUnit(4)}})
        const {user} = await openUnit(loginAs('recursos.gestor'), SUPERVISION_UNIT, 'SUP-N · Supervisión norte')
        await user.click(screen.getByRole('button', {name: 'Modificar'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar SUP-N · Supervisión norte'})
        expect(within(dialog).queryByRole('combobox', {name: 'Vehículo por defecto'})).not.toBeInTheDocument()
    })
})

describe('los tipos de cualificación', () => {
    it('se filtran en el servicio, la clase desconocida se dice «Desconocido», y quien solo lee no ve controles', async () => {
        const requests = serveResources({qualificationTypes: [RAIL_DRIVER, LIC_C, AT_HEIGHT, RETIRED_TYPE]})
        const {user} = await open('/recursos/cualificaciones', loginAs('recursos.lector'), 'Tipos de cualificación', 4)
        const lists = () => requests.filter((url) => url.pathname === `${BASE}/qualification-types`)

        expect(dataRows('Tipos de cualificación').map(textsOf)).toEqual([
            ['ALTURA', 'Trabajos en altura', 'Seguridad', '', '', 'Activo', ''],
            ['LIC-C', 'Driving licence C', 'Permiso de conducir', 'C', '120 meses', 'Activo', ''],
            ['OLD', 'Antigua', 'Desconocido', '', '', 'Retirado', ''],
            ['RAIL-DRIVER', 'Rail auxiliary vehicle driver', 'Habilitación de vehículo', '', '60 meses', 'Activo', ''],
        ])
        expect(lists()[0].search).toBe('?page=0&size=50&sort=code%2Casc&sort=id%2Casc')

        await typeInto(user, document.body, 'Buscar', 'licence')
        await choose(user, document.body, 'Clase', 'Permiso de conducir')
        await choose(user, document.body, 'Estado', 'Activos')
        await waitFor(() => expect([lists().at(-1).searchParams.get('search'), lists().at(-1).searchParams.get('kind'),
            lists().at(-1).searchParams.get('active')]).toEqual(['licence', 'DRIVING_LICENCE', 'true']))
        await waitFor(() => expect(firstColumn('Tipos de cualificación')).toEqual(['LIC-C']))
        expect(screen.queryByRole('button', {name: 'Nuevo tipo'})).not.toBeInTheDocument()
        expect(actionsOf(rowOf('Tipos de cualificación', 'LIC-C'))).toEqual([])
    })

    it('el alta pide el permiso solo en un permiso de conducir, comprueba la vigencia antes de llamar, y un código repetido deja el diálogo abierto', async () => {
        serveResources()
        const writes = recordWrites('post', `${BASE}/qualification-types`, (body, call) => (call === 1
            ? resourcesError(409, 'QTY-409', 'Qualification type LIC-D already exists')
            : HttpResponse.json(qualificationType('nuevo', 'LIC-D', 'Driving licence D', 'DRIVING_LICENCE'), {status: 201})))
        const {user} = await open('/recursos/cualificaciones', loginAs('recursos.gestor'), 'Tipos de cualificación', 0)

        await user.click(screen.getByRole('button', {name: 'Nuevo tipo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Nuevo tipo de cualificación'})
        await typeInto(user, dialog, 'Código', 'LIC-D')
        await typeInto(user, dialog, 'Nombre', 'Driving licence D')
        await choose(user, dialog, 'Clase', 'Seguridad')
        expect(within(dialog).queryByRole('combobox', {name: 'Permiso de conducir'})).not.toBeInTheDocument()
        await choose(user, dialog, 'Clase', 'Permiso de conducir')
        await typeInto(user, dialog, 'Vigencia habitual (meses)', '0')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('Un permiso de conducir dice cuál')).toBeInTheDocument()
        expect(within(dialog).getByText('Como mínimo 1')).toBeInTheDocument()
        expect(writes).toHaveLength(0)

        await choose(user, dialog, 'Permiso de conducir', 'C+E')
        await typeInto(user, dialog, 'Vigencia habitual (meses)', '120')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await screen.findByText('Ya existe otro con ese código.')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Nuevo tipo de cualificación'})).toBeInTheDocument()
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(writes.map((write) => write.body)).toEqual([1, 2].map(() => ({code: 'LIC-D', name: 'Driving licence D', kind: 'DRIVING_LICENCE',
            drivingLicence: 'C_E', validityMonths: 120})))
    })

    it('modificar a otra clase vacía el permiso, y la vigencia vaciada viaja a null con la versión; retirar pide confirmación y volver a ofrecerlo es un PATCH', async () => {
        serveResources({qualificationTypes: [LIC_C, RETIRED_TYPE]})
        const patches = recordWrites('patch', `${BASE}/qualification-types/:id`, () => HttpResponse.json(LIC_C))
        const deletes = recordWrites('delete', `${BASE}/qualification-types/:id`, () => new HttpResponse(null, {status: 204}))
        const {user} = await open('/recursos/cualificaciones', loginAs('recursos.responsable'), 'Tipos de cualificación', 2)

        expect(actionsOf(rowOf('Tipos de cualificación', 'LIC-C'))).toEqual(['Modificar LIC-C', 'Retirar LIC-C'])
        expect(actionsOf(rowOf('Tipos de cualificación', 'OLD'))).toEqual(['Modificar OLD', 'Volver a ofrecer OLD'])
        await user.dblClick(within(rowOf('Tipos de cualificación', 'LIC-C')).getAllByRole('cell')[1])
        const dialog = await screen.findByRole('dialog', {name: 'Modificar LIC-C · Driving licence C'})
        expect(within(dialog).getByRole('textbox', {name: 'Código'})).toHaveAttribute('readonly')
        expect(within(dialog).getByRole('combobox', {name: 'Permiso de conducir'})).toHaveValue('C')
        await choose(user, dialog, 'Clase', 'Habilitación de vehículo')
        expect(within(dialog).queryByRole('combobox', {name: 'Permiso de conducir'})).not.toBeInTheDocument()
        await typeInto(user, dialog, 'Vigencia habitual (meses)', '')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(patches).toHaveLength(1))
        expect(patches[0]).toMatchObject({contentType: MERGE_PATCH,
            body: {kind: 'VEHICLE_OPERATION', drivingLicence: null, validityMonths: null, version: 3}})

        await user.click(within(rowOf('Tipos de cualificación', 'LIC-C')).getByRole('button', {name: 'Retirar LIC-C'}))
        const confirm = await screen.findByRole('dialog', {name: 'Retirar LIC-C · Driving licence C'})
        expect(confirm).toHaveTextContent('quien ya lo tiene lo conserva')
        await user.click(within(confirm).getByRole('button', {name: 'Retirar'}))
        await waitFor(() => expect(deletes.map((write) => write.params.id)).toEqual([QTYPE_LIC_C]))

        await user.click(within(rowOf('Tipos de cualificación', 'OLD')).getByRole('button', {name: 'Volver a ofrecer OLD'}))
        await waitFor(() => expect(patches.map((write) => write.body).at(-1)).toEqual({active: true, version: 1}))
    })
})

const INSTRUMENT1 = 'ab0c1d2e-0000-4000-8000-000000000001'
const INSTRUMENT2 = 'ab0c1d2e-0000-4000-8000-000000000002'
const INSTRUMENT3 = 'ab0c1d2e-0000-4000-8000-000000000003'
const INSTRUMENT4 = 'ab0c1d2e-0000-4000-8000-000000000004'

function instrument(id, code, name, kind, calibrationExpiresOn, extra = {}) {
    return {
        id, code, name, kind, serialNumber: `SN-${code}`, calibratedOn: calibrationExpiresOn ? '2025-10-01' : null, calibrationExpiresOn,
        calibrationExpired: calibrationExpiresOn !== null && calibrationExpiresOn < daysFromToday(0).iso, notes: null, active: true, version: 2,
        audit: null, ...extra,
    }
}

describe('los instrumentos', () => {
    const expired = daysFromToday(-3)
    const soon = daysFromToday(12)
    const later = daysFromToday(200)
    const instruments = () => [
        instrument(INSTRUMENT1, 'PT-01', 'Pértiga 1', 'EARTHING_POLE', expired.iso),
        instrument(INSTRUMENT2, 'DT-02', 'Detector 2', 'VOLTAGE_DETECTOR', soon.iso),
        instrument(INSTRUMENT3, 'MED-03', 'Telurómetro', 'MEASURING', later.iso),
        instrument(INSTRUMENT4, 'X-04', 'Láser', 'LASER', null, {active: false}),
    ]

    it('la lista dice cómo está cada calibración y se filtra en el servicio, también por «calibración caduca antes de»; quien solo lee ve el historial', async () => {
        const requests = serveResources({instruments: instruments()})
        const {user} = await open('/recursos/instrumentos', loginAs('recursos.lector'), 'Instrumentos', 4)
        const lists = () => requests.filter((url) => url.pathname === `${BASE}/instruments`)

        expect(dataRows('Instrumentos').map(textsOf)).toEqual([
            ['DT-02', 'Detector 2', 'Detector de tensión', 'SN-DT-02', '01/10/2025', soon.typed, 'Caduca en 12 días', 'Activo', ''],
            ['MED-03', 'Telurómetro', 'Equipo de medida', 'SN-MED-03', '01/10/2025', later.typed, 'Vigente', 'Activo', ''],
            ['PT-01', 'Pértiga 1', 'Pértiga de puesta a tierra', 'SN-PT-01', '01/10/2025', expired.typed, 'Caducada', 'Activo', ''],
            ['X-04', 'Láser', 'Desconocido', 'SN-X-04', '', '', 'Sin calibración', 'Retirado', ''],
        ])
        expect(lists()[0].search).toBe('?page=0&size=50&sort=code%2Casc&sort=id%2Casc')
        expect(screen.queryByRole('button', {name: 'Nuevo instrumento'})).not.toBeInTheDocument()
        expect(actionsOf(rowOf('Instrumentos', 'PT-01'))).toEqual(['Historial de PT-01'])
        await user.click(screen.getByRole('button', {name: 'Historial de PT-01'}))
        const history = await screen.findByRole('dialog', {name: /Historial de PT-01/})
        expect(await within(history).findByText(`Pértiga 1 · Pértiga de puesta a tierra · n.º SN-PT-01 · calibrado hasta el ${expired.typed} · activo`))
            .toBeInTheDocument()
        expect(requests.some((url) => url.pathname === `${BASE}/instruments/${INSTRUMENT1}/revisions`)).toBe(true)
        // La X de la cabecera y el botón del pie se llaman igual: vale el último.
        await user.click(within(history).getAllByRole('button', {name: 'Cerrar'}).at(-1))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

        await user.type(screen.getByRole('textbox', {name: 'Calibración caduca antes de'}), soon.typed)
        await user.keyboard('{Escape}')
        await waitFor(() => expect(lists().at(-1).searchParams.get('calibrationExpiresBefore')).toBe(soon.iso))
        await waitFor(() => expect(firstColumn('Instrumentos')).toEqual(['PT-01']))
        await choose(user, document.body, 'Tipo', 'Detector de tensión')
        await waitFor(() => expect(lists().at(-1).searchParams.get('kind')).toBe('VOLTAGE_DETECTOR'))
        expect(await screen.findByText('Ningún instrumento coincide con los filtros.')).toBeInTheDocument()
    })

    it('el alta comprueba la calibración antes de llamar, y un código repetido deja el diálogo abierto', async () => {
        serveResources()
        const writes = recordWrites('post', `${BASE}/instruments`, (body, call) => (call === 1
            ? resourcesError(409, 'INT-409', 'Instrument PT-05 already exists')
            : HttpResponse.json(instrument('nuevo', 'PT-05', 'Pértiga 5', 'EARTHING_POLE', '2027-10-01'), {status: 201})))
        const {user} = await open('/recursos/instrumentos', loginAs('recursos.gestor'), 'Instrumentos', 0)

        await user.click(screen.getByRole('button', {name: 'Nuevo instrumento'}))
        const dialog = await screen.findByRole('dialog', {name: 'Nuevo instrumento'})
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('El código es obligatorio')).toBeInTheDocument()
        expect(within(dialog).getByText('El tipo es obligatorio')).toBeInTheDocument()
        await typeInto(user, dialog, 'Código', 'PT-05')
        await typeInto(user, dialog, 'Nombre', 'Pértiga 5')
        await choose(user, dialog, 'Tipo', 'Pértiga de puesta a tierra')
        await typeInto(user, dialog, 'Número de serie', ' SN-555 ')
        await typeInto(user, dialog, 'Calibrado', '01/10/2026')
        await typeInto(user, dialog, 'Calibración hasta', '01/09/2026')
        await user.click(within(dialog).getByRole('textbox', {name: 'Notas'}))
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('La calibración no puede caducar antes de hacerse')).toBeInTheDocument()
        expect(writes).toHaveLength(0)

        await typeInto(user, dialog, 'Calibración hasta', '01/10/2027')
        await user.click(within(dialog).getByRole('textbox', {name: 'Notas'}))
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await screen.findByText('Ya existe otro con ese código.')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Nuevo instrumento'})).toBeInTheDocument()
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(writes.map((write) => write.body)).toEqual([1, 2].map(() => ({code: 'PT-05', name: 'Pértiga 5', kind: 'EARTHING_POLE',
            serialNumber: 'SN-555', calibratedOn: '2026-10-01', calibrationExpiresOn: '2027-10-01'})))
    })

    it('modificar manda la calibración nueva y lo vaciado con la versión; retirar pide resources-delete y confirmación, y reactivar es un PATCH', async () => {
        serveResources({instruments: instruments()})
        const patches = recordWrites('patch', `${BASE}/instruments/:id`, () => HttpResponse.json(instruments()[0]))
        const deletes = recordWrites('delete', `${BASE}/instruments/:id`, () => new HttpResponse(null, {status: 204}))
        const {user} = await open('/recursos/instrumentos', loginAs('recursos.responsable'), 'Instrumentos', 4)

        expect(actionsOf(rowOf('Instrumentos', 'PT-01'))).toEqual(['Historial de PT-01', 'Modificar PT-01', 'Retirar PT-01'])
        expect(actionsOf(rowOf('Instrumentos', 'X-04'))).toEqual(['Historial de X-04', 'Modificar X-04', 'Reactivar X-04'])
        await user.dblClick(within(rowOf('Instrumentos', 'PT-01')).getAllByRole('cell')[1])
        const dialog = await screen.findByRole('dialog', {name: 'Modificar PT-01 · Pértiga 1'})
        expect(within(dialog).getByRole('textbox', {name: 'Código'})).toHaveAttribute('readonly')
        await typeInto(user, dialog, 'Calibrado', '05/10/2026')
        await typeInto(user, dialog, 'Calibración hasta', '05/10/2027')
        await typeInto(user, dialog, 'Número de serie', '')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(patches).toHaveLength(1))
        expect(patches[0]).toMatchObject({contentType: MERGE_PATCH,
            body: {serialNumber: null, calibratedOn: '2026-10-05', calibrationExpiresOn: '2027-10-05', version: 2}})

        await user.click(within(rowOf('Instrumentos', 'PT-01')).getByRole('button', {name: 'Retirar PT-01'}))
        const confirm = await screen.findByRole('dialog', {name: 'Retirar PT-01 · Pértiga 1'})
        await user.click(within(confirm).getByRole('button', {name: 'Retirar'}))
        await waitFor(() => expect(deletes.map((write) => write.params.id)).toEqual([INSTRUMENT1]))

        await user.click(within(rowOf('Instrumentos', 'X-04')).getByRole('button', {name: 'Reactivar X-04'}))
        await waitFor(() => expect(patches.map((write) => [write.params.id, write.body]).at(-1)).toEqual([INSTRUMENT4, {active: true, version: 2}]))
    })
})

describe('los documentos de un vehículo', () => {
    function vehicleDocument(n, kind, expiresOn, extra = {}) {
        return {id: `bc1d2e3f-0000-4000-8000-00000000000${n}`, vehicleId: VEHICLE1, kind, reference: `REF-${n}`, issuedOn: '2026-01-15', expiresOn,
            notes: null, expired: expiresOn < daysFromToday(0).iso, version: 1, audit: null, ...extra}
    }

    it('la pestaña se pide al abrirla y dice cómo está cada uno; quien solo lee no los toca', async () => {
        const expired = daysFromToday(-1)
        const soon = daysFromToday(20)
        const requests = serveVehicles({vehicles: [vehicle(VEHICLE1, 'DR-01', RAIL_MODEL, null)], documents: {[VEHICLE1]: [
            vehicleDocument(1, 'INSURANCE', expired.iso), vehicleDocument(2, 'RAIL_INSPECTION', soon.iso), vehicleDocument(3, 'NOISE', '2030-01-01'),
        ]}})
        const {user} = renderRoute(`/recursos/flota/${VEHICLE1}`, {session: loginAs('recursos.lector')})
        expect(await screen.findByRole('heading', {name: 'DR-01 · Vehículo DR-01'})).toBeInTheDocument()
        expect(requests.some((url) => url.pathname === `${BASE}/vehicles/${VEHICLE1}/documents`)).toBe(false)

        await user.click(screen.getByRole('tab', {name: 'Documentos'}))
        await waitFor(() => expect(firstColumn('Documentos de DR-01')).toHaveLength(3))
        expect(dataRows('Documentos de DR-01').map(textsOf)).toEqual([
            ['Seguro', 'REF-1', '15/01/2026', expired.typed, 'Caducado'],
            ['Inspección ferroviaria', 'REF-2', '15/01/2026', soon.typed, 'Caduca en 20 días'],
            ['Desconocido', 'REF-3', '15/01/2026', '01/01/2030', 'Vigente'],
        ])
        expect(screen.queryByRole('button', {name: 'Añadir documento'})).not.toBeInTheDocument()
    })

    it('añadir ofrece los tipos que aún no tiene y exige su caducidad; modificar va con la versión y quitar, con confirmación', async () => {
        serveVehicles({vehicles: [vehicle(VEHICLE1, 'DR-01', RAIL_MODEL, null)], documents: {[VEHICLE1]: [
            vehicleDocument(1, 'INSURANCE', '2027-01-15'), vehicleDocument(2, 'ROAD_INSPECTION', '2027-02-28'), vehicleDocument(3, 'NOISE', '2030-01-01'),
        ]}})
        const posts = recordWrites('post', `${BASE}/vehicles/:id/documents`, (body, call) => (call === 1
            ? resourcesError(409, 'VDO-409', 'DR-01 already has a RAIL_INSPECTION document')
            : HttpResponse.json(vehicleDocument(4, 'RAIL_INSPECTION', '2027-06-30'), {status: 201})))
        const patches = recordWrites('patch', `${BASE}/vehicles/:id/documents/:documentId`, () => HttpResponse.json(vehicleDocument(1, 'INSURANCE', '2028-01-15')))
        const deletes = recordWrites('delete', `${BASE}/vehicles/:id/documents/:documentId`, () => new HttpResponse(null, {status: 204}))
        const {user} = renderRoute(`/recursos/flota/${VEHICLE1}`, {session: loginAs('recursos.responsable')})
        await user.click(await screen.findByRole('tab', {name: 'Documentos'}))
        await waitFor(() => expect(firstColumn('Documentos de DR-01')).toHaveLength(3))
        expect(actionsOf(rowOf('Documentos de DR-01', 'Seguro'))).toEqual(['Modificar Seguro', 'Quitar Seguro'])
        // Uno de un tipo que esta aplicación no conoce no se toca aquí.
        expect(actionsOf(rowOf('Documentos de DR-01', 'Desconocido'))).toEqual([])

        await user.click(screen.getByRole('button', {name: 'Añadir documento'}))
        const dialog = await screen.findByRole('dialog', {name: 'Nuevo documento de DR-01 · Vehículo DR-01'})
        await user.click(within(dialog).getByRole('combobox', {name: 'Tipo'}))
        expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['Inspección ferroviaria', 'Certificado de la grúa',
            'Certificado de la plataforma', 'Otro'])
        await user.click(screen.getByRole('option', {name: 'Inspección ferroviaria'}))
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('La caducidad es obligatoria')).toBeInTheDocument()
        expect(posts).toHaveLength(0)
        await typeInto(user, dialog, 'Caduca', '30/06/2027')
        await typeInto(user, dialog, 'Referencia', 'IF-2026-7')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await screen.findByText('El vehículo ya tiene un documento de ese tipo: renovarlo es cambiar su caducidad. '
            + 'DR-01 already has a RAIL_INSPECTION document')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Nuevo documento de DR-01 · Vehículo DR-01'})).toBeInTheDocument()
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(posts.map((write) => write.body)).toEqual([1, 2].map(() => ({kind: 'RAIL_INSPECTION', reference: 'IF-2026-7', expiresOn: '2027-06-30'})))

        await user.click(screen.getByRole('button', {name: 'Modificar Seguro'}))
        const editor = await screen.findByRole('dialog', {name: 'Modificar Seguro de DR-01 · Vehículo DR-01'})
        expect(within(editor).getByRole('textbox', {name: 'Tipo'})).toHaveValue('Seguro')
        await typeInto(user, editor, 'Caduca', '15/01/2028')
        await typeInto(user, editor, 'Expedido', '')
        await user.click(within(editor).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(patches).toHaveLength(1))
        expect(patches[0]).toMatchObject({contentType: MERGE_PATCH, params: {documentId: 'bc1d2e3f-0000-4000-8000-000000000001'},
            body: {issuedOn: null, expiresOn: '2028-01-15', version: 1}})

        await user.click(screen.getByRole('button', {name: 'Quitar Inspección técnica (ITV)'}))
        const confirm = await screen.findByRole('dialog', {name: 'Quitar Inspección técnica (ITV) de DR-01 · Vehículo DR-01'})
        await user.click(within(confirm).getByRole('button', {name: 'Quitar'}))
        await waitFor(() => expect(deletes.map((write) => write.params.documentId)).toEqual(['bc1d2e3f-0000-4000-8000-000000000002']))
    })
})
