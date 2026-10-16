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

/** El mto-resources simulado: busca, filtra por categoría repetida y por estado, ordena y pagina. */
function serveResources({people = []} = {}) {
    const requests = []
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
        expect(resources.children.map((child) => [child.label, child.path])).toEqual([['Personal', '/recursos/personal']])
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
        expect(actionsOf(rowOf('Personal', 'PER-000003'))).toEqual(['Historial de PER-000003'])
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

        await user.dblClick(within(rowOf('Personal', 'PER-000003')).getAllByRole('cell')[1])
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

        expect(actionsOf(rowOf('Personal', 'PER-000003'))).toEqual(['Historial de PER-000003', 'Modificar PER-000003', 'Desactivar PER-000003'])
        expect(actionsOf(rowOf('Personal', 'PER-000004'))).toEqual(['Historial de PER-000004', 'Modificar PER-000004', 'Reactivar PER-000004'])

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
