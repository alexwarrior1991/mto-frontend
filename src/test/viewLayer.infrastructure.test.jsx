import {screen, waitFor, within} from '@testing-library/react'
import {http, HttpResponse} from 'msw'
import {describe, expect, it} from 'vitest'
import {buildMenu} from '../app/navigation.js'
import {P} from '../auth/permissions.js'
import {
    armDirection, insulatorX, MARGIN, normalizeSchematic, STEP, width, xOf,
} from '../features/infrastructure/schematicLayout.js'
import {renderRoute} from './render.jsx'
import {server} from './server.js'
import {loginAs, sessionWith} from './session.js'

/**
 * Las pantallas de infraestructura (infraestructura/*) con los casos de maestros de ViewLayerTest del
 * backoffice: la lista paginada, buscada, filtrada y ordenada en el servicio; lo que ve quien solo lee;
 * la modificación sobre la fila leída, con lo desconocido, la versión y los hijos a null; los errores
 * del servicio; el borrado; el alta y las ménsulas de un perfil; las agujas de un aislador; el perfil
 * de un seccionador; y el esquema de una vía. Y lo que el backoffice no hacía: vaciar una referencia
 * a catálogo de verdad ({}) y no ofrecer cambiar el seccionador desde el perfil.
 */

const BASE = '/api/configuration'
const WRITER = [P.CONFIG_READ, P.CONFIG_WRITE]
const MANAGER = [P.CONFIG_READ, P.CONFIG_WRITE, P.CONFIG_DELETE]

const PACKAGES = [
    {
        id: 100, name: 'EP4', companyId: 1, startDate: '2026-01-01', endDate: '2026-12-31', length: 12000,
        initialPackage: false, enabled: true, tracks: null, stations: null, versionNumber: 2,
    },
]
const STATIONS = [
    {id: 12, name: 'ATOCHA', executionPackageId: 100, tracks: null, disconnectors: null, sectionInsulators: null, versionNumber: 1},
    {id: 13, name: 'CHAMARTIN', executionPackageId: 100, tracks: null, disconnectors: null, sectionInsulators: null, versionNumber: 1},
]
const COMPANIES = [{id: 1, identificationNumber: 'A12345678', name: 'Constructora Norte', code: 'CN'}]

function threeTracks() {
    return [
        {
            id: 3, name: 'VIA 1', enabled: true, executionPackageId: 100, stationIds: [12, 13], profiles: null,
            versionNumber: 7, versionDate: '2026-08-02T11:00:00', fieldOfTomorrow: 1,
        },
        {id: 4, name: 'VIA 2', enabled: true, executionPackageId: 100, stationIds: [], profiles: null, versionNumber: 1},
        {id: 5, name: 'VIA MUERTA', enabled: false, executionPackageId: 100, stationIds: [12], profiles: null, versionNumber: 1},
    ]
}

const CATALOGUES = Object.freeze({
    'profile-statuses': [{id: 2, code: 'OK', description: 'Correcto', enabled: true}, {id: 3, code: 'REV', description: 'En revisión', enabled: true}],
    'pole-types': [{id: 5, code: 'PT1', description: 'Poste tipo 1', enabled: true}, {id: 6, code: 'PT2', description: 'Poste tipo 2', enabled: true}],
    foundations: [],
    'anchorage-foundations': [],
    portals: [],
    'return-supports': [],
    'support-types': [],
    'assembly-configurations': [],
    sectionings: [{id: 1, code: 'A/S', description: 'Aguja', enabled: true}],
    anchorages: [],
    'disconnector-functions': [{id: 9, code: 'Disc', description: 'Seccionador', enabled: true}, {id: 10, code: 'FEED', description: 'Alimentación', enabled: true}],
    'cantilever-types': [{id: 4, code: 'CT1', description: 'Ménsula tipo 1', enabled: true}, {id: 8, code: 'CT2', description: 'Ménsula tipo 2', enabled: true}],
    'steady-arm-types': [{id: 6, code: 'SA1', description: 'Brazo tipo 1', enabled: true}],
})

/** Los filtros que entiende el servicio simulado, como el de verdad: solo filtran si vienen. */
const FILTERS = Object.freeze({
    enabled: (row, value) => row.enabled === value,
    onLoad: (row, value) => row.onLoad === value,
    trackId: (row, value) => row.trackId === value,
    installationType: (row, value) => row.installationType === value,
    profileStatusCode: (row, value) => row.profileStatus?.code === value,
})

/**
 * Un maestro en el gateway simulado: pagina con page y size, busca searchText en el nombre (o en el
 * identificador de un perfil) y aplica los filtros. Apunta cada petición, también las de las
 * referencias (size=1000).
 */
function serveMaster(path, rows) {
    const requests = []
    server.use(http.post(`${BASE}/${path}/filter`, async ({request}) => {
        const url = new URL(request.url)
        const body = JSON.parse((await request.text()) || '{}')
        requests.push({url, body})
        const number = Number(url.searchParams.get('page') ?? 0)
        const size = Number(url.searchParams.get('size') ?? 20)
        const text = String(body.searchText ?? '').toLowerCase()
        const matching = rows.filter((row) => (!text || String(row.name ?? row.profileId ?? '').toLowerCase().includes(text))
            && Object.entries(FILTERS).every(([key, test]) => body[key] === undefined || test(row, body[key])))
        return HttpResponse.json({
            content: matching.slice(number * size, number * size + size),
            page: {number, size, totalElements: matching.length, totalPages: Math.ceil(matching.length / size)},
        })
    }))
    return requests
}

/** El gateway con todo lo que piden las pantallas: los seis maestros, las empresas y los catálogos. */
function serveGateway({
    packages = PACKAGES, stations = STATIONS, tracks = threeTracks(), profiles = [], disconnectors = [], insulators = [],
} = {}) {
    const requests = {
        packages: serveMaster('execution-packages', packages),
        stations: serveMaster('stations', stations),
        tracks: serveMaster('tracks', tracks),
        profiles: serveMaster('profiles', profiles),
        disconnectors: serveMaster('disconnectors', disconnectors),
        insulators: serveMaster('section-insulators', insulators),
    }
    server.use(http.get(`${BASE}/business-entities`, () => HttpResponse.json(COMPANIES)))
    for (const [path, entries] of Object.entries(CATALOGUES)) {
        server.use(http.get(`${BASE}/${path}`, () => HttpResponse.json(entries)))
    }
    return requests
}

/** Las peticiones de la lista de la pantalla (las de las referencias piden 1000 filas). */
function listRequests(requests) {
    return requests.filter((request) => request.url.searchParams.get('size') === '50')
}

/** Recoge los cuerpos que llegan a una escritura y contesta con respond(cuerpo). */
function recordWrites(method, path, respond) {
    const bodies = []
    server.use(http[method](path, async ({request}) => {
        const text = await request.text()
        const body = text ? JSON.parse(text) : null
        bodies.push(body)
        return respond(body)
    }))
    return bodies
}

function problem(status, body) {
    return HttpResponse.json(body, {status, headers: {'Content-Type': 'application/problem+json'}})
}

function table(name) {
    return screen.getByRole('table', {name})
}

/** El texto de la primera columna de cada fila con datos, en su orden. */
function firstColumn(name) {
    return within(table(name)).getAllByRole('row').slice(1)
        .map((row) => within(row).queryAllByRole('cell'))
        .filter((cells) => cells.length > 1)
        .map((cells) => cells[0].textContent)
}

function rowOf(name, text) {
    return within(table(name)).getAllByRole('row')
        .find((row) => within(row).queryAllByRole('cell').some((cell) => cell.textContent === text))
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
    it('los seis maestros salen bajo «Infraestructura» para quien lee la configuración, y ya no están pendientes', async () => {
        serveGateway()
        const infrastructure = buildMenu(loginAs('config.lector')).find((item) => item.key === 'infraestructura')
        expect(infrastructure.children.map((child) => child.label)).toEqual(['Paquetes de ejecución', 'Estaciones', 'Vías',
            'Perfiles', 'Seccionadores', 'Aisladores de sección'])
        expect(buildMenu(loginAs('almacen.lector')).some((item) => item.key === 'infraestructura')).toBe(false)

        renderRoute('/infraestructura/aisladores', {session: loginAs('config.lector')})
        expect(await screen.findByRole('heading', {name: 'Aisladores de sección'})).toBeInTheDocument()
        expect(screen.queryByText(/Llega en la fase/)).not.toBeInTheDocument()
        await waitFor(() => expect(document.title).toBe('Aisladores de sección · MTO'))
    })
})

describe('la lista de un maestro', () => {
    it('se busca, se filtra y se ordena en el servicio, con los nombres de sus referencias', async () => {
        const requests = serveGateway()
        const {user} = await open('/infraestructura/vias', loginAs('config.lector'), 'Vías', 3)

        expect(firstColumn('Vías')).toEqual(['VIA 1', 'VIA 2', 'VIA MUERTA'])
        expect(screen.getByText('3 vías')).toBeInTheDocument()
        expect(rowOf('Vías', 'VIA 1')).toHaveTextContent('EP4')
        expect(within(rowOf('Vías', 'VIA 1')).getByText('ATOCHA (EP4), CHAMARTIN (EP4)')).toBeInTheDocument()
        expect(within(rowOf('Vías', 'VIA 1')).getByText('02/08/2026 11:00')).toBeInTheDocument()
        expect(within(rowOf('Vías', 'VIA MUERTA')).getByText('No')).toBeInTheDocument()
        const first = listRequests(requests.tracks)[0]
        expect(first.url.search).toBe('?page=0&size=50')
        expect(first.body).toEqual({})

        await user.type(screen.getByRole('textbox', {name: 'Buscar'}), 'muerta')
        await waitFor(() => expect(firstColumn('Vías')).toEqual(['VIA MUERTA']))
        expect(screen.getByText('1 vía')).toBeInTheDocument()
        expect(listRequests(requests.tracks).at(-1).body).toEqual({searchText: 'muerta'})

        await user.click(screen.getByRole('button', {name: 'Borrar la búsqueda'}))
        await waitFor(() => expect(firstColumn('Vías')).toHaveLength(3))
        await choose(user, document.body, 'Estado', 'Activas')
        await waitFor(() => expect(firstColumn('Vías')).toEqual(['VIA 1', 'VIA 2']))
        expect(listRequests(requests.tracks).at(-1).body).toEqual({enabled: true})

        await user.click(screen.getByRole('button', {name: 'Nombre'}))
        await waitFor(() => expect(listRequests(requests.tracks).at(-1).url.searchParams.get('sort')).toBe('name,asc'))
        await user.click(screen.getByRole('button', {name: 'Nombre'}))
        await waitFor(() => expect(listRequests(requests.tracks).at(-1).url.searchParams.get('sort')).toBe('name,desc'))
        await user.click(screen.getByRole('button', {name: 'Nombre'}))
        await waitFor(() => expect(listRequests(requests.tracks).at(-1).url.searchParams.has('sort')).toBe(false))
        await user.click(screen.getByRole('button', {name: 'Paquete de ejecución'}))
        await waitFor(() => expect(listRequests(requests.tracks).at(-1).url.searchParams.get('sort')).toBe('executionPackage.name,asc'))
    })

    it('las páginas se piden al servicio, y otra búsqueda vuelve a la primera', async () => {
        const profiles = Array.from({length: 120}, (_, index) => ({
            id: index + 1, profileId: `P-${String(index + 1).padStart(3, '0')}`, kp: `${index + 1}.000`, trackId: 3,
            profileStatus: {id: 2, code: 'OK'}, cantilevers: [], disconnector: null, versionNumber: 1,
        }))
        const requests = serveGateway({profiles})
        const {user} = await open('/infraestructura/perfiles', loginAs('config.lector'), 'Perfiles', 50)

        expect(screen.getByText('120 perfiles')).toBeInTheDocument()
        await user.click(screen.getByRole('button', {name: 'Página 2'}))
        await waitFor(() => expect(firstColumn('Perfiles')[0]).toBe('P-051'))
        expect(listRequests(requests.profiles).at(-1).url.searchParams.get('page')).toBe('1')
        expect(within(rowOf('Perfiles', 'P-051')).getByText('VIA 1 (EP4)')).toBeInTheDocument()

        await user.type(screen.getByRole('textbox', {name: 'Buscar'}), 'P-1')
        await waitFor(() => expect(listRequests(requests.profiles).at(-1).body).toEqual({searchText: 'P-1'}))
        expect(listRequests(requests.profiles).at(-1).url.searchParams.get('page')).toBe('0')

        await choose(user, document.body, 'Estado', 'REV · En revisión')
        await waitFor(() => expect(listRequests(requests.profiles).at(-1).body).toEqual({searchText: 'P-1', profileStatusCode: 'REV'}))
        expect(await screen.findByText('Nada coincide con la búsqueda.')).toBeInTheDocument()
    })

    it('quien solo lee no ve controles de escritura, pero cada vía ofrece su esquema', async () => {
        serveGateway()
        const {user} = await open('/infraestructura/vias', loginAs('config.lector'), 'Vías', 3)

        expect(screen.queryByRole('button', {name: 'Nuevo'})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Modificar VIA 1'})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Borrar VIA 1'})).not.toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Esquema VIA 1'})).toBeInTheDocument()
        await user.dblClick(rowOf('Vías', 'VIA 1'))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('una referencia que no está en lo cargado se enseña como #id, no como vacía', async () => {
        serveGateway({stations: [...STATIONS, {id: 14, name: 'HUERFANA', executionPackageId: 999, versionNumber: 1}]})
        await open('/infraestructura/estaciones', loginAs('config.lector'), 'Estaciones', 3)

        expect(within(rowOf('Estaciones', 'ATOCHA')).getByText('EP4')).toBeInTheDocument()
        expect(within(rowOf('Estaciones', 'HUERFANA')).getByText('#999')).toBeInTheDocument()
    })
})

describe('el editor de un maestro', () => {
    it('modificar una vía manda la fila leída entera: lo desconocido, la versión y los perfiles a null', async () => {
        const requests = serveGateway()
        const updates = recordWrites('put', `${BASE}/tracks/3`, (body) => HttpResponse.json({...body, versionNumber: 8}))
        const {user} = await open('/infraestructura/vias', sessionWith(WRITER), 'Vías', 3)
        const reads = listRequests(requests.tracks).length

        await user.click(screen.getByRole('button', {name: 'Modificar VIA 1'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar vía'})
        await typeInto(user, dialog, 'Nombre', 'VIA PRINCIPAL')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        expect(await screen.findByText('Guardado')).toBeInTheDocument()
        expect(updates).toEqual([{...threeTracks()[0], name: 'VIA PRINCIPAL', profiles: null}])
        expect(updates[0]).toMatchObject({fieldOfTomorrow: 1, versionNumber: 7, stationIds: [12, 13], executionPackageId: 100})
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        await waitFor(() => expect(listRequests(requests.tracks).length).toBeGreaterThan(reads))
    })

    it('un error del servicio cae en su desplegable y el diálogo sigue abierto', async () => {
        serveGateway()
        server.use(http.put(`${BASE}/tracks/3`, () => problem(400, {
            title: 'Petición inválida', status: 400, code: 'VAL-000', traceId: 't-2',
            errors: [{field: 'executionPackageId', code: 'VAL-001', message: 'El paquete no existe'}],
        })))
        const {user} = await open('/infraestructura/vias', sessionWith(WRITER), 'Vías', 3)

        await user.click(screen.getByRole('button', {name: 'Modificar VIA 1'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar vía'})
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        expect(await within(dialog).findByText('El paquete no existe')).toBeInTheDocument()
        expect(within(dialog).getByRole('combobox', {name: 'Paquete de ejecución'})).toHaveAttribute('aria-invalid', 'true')
        expect(screen.getByRole('dialog', {name: 'Modificar vía'})).toBeInTheDocument()
    })

    it('una versión vieja (CON-001) pide recargar y deja el diálogo abierto con lo escrito', async () => {
        serveGateway()
        server.use(http.put(`${BASE}/tracks/3`, () => problem(409, {title: 'Conflicto', status: 409, code: 'CON-001', traceId: 't-409'})))
        const {user} = await open('/infraestructura/vias', sessionWith(WRITER), 'Vías', 3)

        await user.click(screen.getByRole('button', {name: 'Modificar VIA 1'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar vía'})
        await typeInto(user, dialog, 'Nombre', 'VIA PRINCIPAL')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        expect(await screen.findByText('Conflicto con otro cambio: recarga y vuelve a intentarlo.')).toBeInTheDocument()
        expect(screen.getByText('Referencia: t-409')).toBeInTheDocument()
        expect(within(dialog).getByRole('textbox', {name: 'Nombre'})).toHaveValue('VIA PRINCIPAL')
    })

    it('borrar pide confirmación y dice lo que pasa: desaparece de las listas y lo que cuelga se queda', async () => {
        serveGateway()
        const deletes = recordWrites('delete', `${BASE}/tracks/3`, () => new HttpResponse(null, {status: 204}))
        const {user} = await open('/infraestructura/vias', sessionWith(MANAGER), 'Vías', 3)

        await user.click(screen.getByRole('button', {name: 'Borrar VIA 1'}))
        const confirm = await screen.findByRole('dialog', {name: 'Borrar vía VIA 1'})
        expect(confirm).toHaveTextContent('Desaparece de las listas: el servicio la marca como borrada y desde aquí no se puede recuperar.')
        expect(confirm).toHaveTextContent('Lo que cuelga de ella no se borra: sus perfiles.')
        expect(deletes).toHaveLength(0)
        await user.click(within(confirm).getByRole('button', {name: 'Borrar'}))

        expect(await screen.findByText('Borrada VIA 1')).toBeInTheDocument()
        expect(deletes).toEqual([null])
    })

    it('alta de un paquete con su empresa, sus fechas escritas DD/MM/AAAA y lo obligatorio antes de llamar', async () => {
        serveGateway()
        const creates = recordWrites('post', `${BASE}/execution-packages`, (body) => HttpResponse.json({...body, id: 101}, {status: 201}))
        const {user} = await open('/infraestructura/paquetes', sessionWith(WRITER), 'Paquetes de ejecución', 1)
        expect(within(rowOf('Paquetes de ejecución', 'EP4')).getByText('Constructora Norte (A12345678)')).toBeInTheDocument()

        await user.click(screen.getByRole('button', {name: 'Nuevo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Alta de paquete de ejecución'})
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('El nombre es obligatorio')).toBeInTheDocument()
        expect(within(dialog).getByText('La empresa es obligatoria')).toBeInTheDocument()
        expect(creates).toHaveLength(0)

        await typeInto(user, dialog, 'Nombre', 'EP5')
        await choose(user, dialog, 'Empresa', 'Constructora Norte (A12345678)')
        await typeInto(user, dialog, 'Longitud', '8500')
        await typeInto(user, dialog, 'Inicio', '01/02/2026')
        await typeInto(user, dialog, 'Fin', '31/12/2026')
        await user.click(within(dialog).getByRole('checkbox', {name: 'Paquete inicial'}))
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        await waitFor(() => expect(creates).toEqual([{
            name: 'EP5', companyId: 1, length: 8500, startDate: '2026-02-01', endDate: '2026-12-31',
            initialPackage: true, enabled: true, tracks: null, stations: null,
        }]))
    })
})

describe('los perfiles', () => {
    function profileWithOneCantilever() {
        return {
            id: 7, profileId: 'P-007', kp: '12.345', trackId: 3, orderInTrack: 4, versionNumber: 2,
            profileStatus: {id: 2, code: 'OK', description: 'Correcto', versionNumber: 1},
            poleType: {id: 5, code: 'PT1', description: 'Poste tipo 1'}, portal: null,
            sectionings: [{id: 1, code: 'A/S', description: 'Aguja'}], anchorages: [], sectioningFeedings: [],
            span: 47.97, railPoleDistance: -4960,
            cantilevers: [{
                id: 21, cantileverType: {id: 4, code: 'CT1'}, cwHeight: 5.3, stagger: 200, profileId: 7, versionNumber: 3,
                steadyArm: {id: 31, length: 1200, steadyArmType: {id: 6, code: 'SA1'}, cantileverId: 21, versionNumber: 1},
            }],
            disconnector: {id: 5, name: 'SEC-1', onLoad: true, stationId: 12, profileId: 7, versionNumber: 6,
                disconnectorFunction: {id: 9, code: 'Disc'}},
        }
    }

    it('alta con sus referencias a catálogo y su vía; los catálogos múltiples sin tocar van vacíos y las ménsulas a null', async () => {
        serveGateway()
        const creates = recordWrites('post', `${BASE}/profiles`, (body) => HttpResponse.json({...body, id: 99}, {status: 201}))
        const {user} = renderRoute('/infraestructura/perfiles', {session: sessionWith(WRITER)})
        await screen.findByText('No hay perfiles.')

        await user.click(screen.getByRole('button', {name: 'Nuevo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Alta de perfil'})
        await typeInto(user, dialog, 'Identificador', 'P-9')
        await typeInto(user, dialog, 'KP', '10.500')
        await choose(user, dialog, 'Vía', 'VIA 1 (EP4)')
        await choose(user, dialog, 'Estado', 'OK · Correcto')
        await choose(user, dialog, 'Tipo de poste', 'PT1 · Poste tipo 1')
        await typeInto(user, dialog, 'Vano hasta el siguiente (m)', '47.970')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        await waitFor(() => expect(creates).toHaveLength(1))
        expect(creates[0]).toEqual({
            profileId: 'P-9', kp: '10.500', trackId: 3,
            profileStatus: {id: 2, code: 'OK'}, poleType: {id: 5, code: 'PT1'}, foundation: null, anchorageFoundation: null,
            portal: null, returnSupport: null, supportType: null, assemblyConfiguration: null,
            sectionings: [], anchorages: [], sectioningFeedings: [],
            span: 47.97, heightCantileverSupport: null, poleGaugeLocation: null, railPoleDistance: null,
            cantilevers: null,
        })
        expect(creates[0]).not.toHaveProperty('disconnector')
    })

    it('un KP con letras no llega al servicio', async () => {
        serveGateway()
        const creates = recordWrites('post', `${BASE}/profiles`, () => HttpResponse.json({}, {status: 201}))
        const {user} = renderRoute('/infraestructura/perfiles', {session: sessionWith(WRITER)})
        await screen.findByText('No hay perfiles.')

        await user.click(screen.getByRole('button', {name: 'Nuevo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Alta de perfil'})
        await typeInto(user, dialog, 'Identificador', 'P-9')
        await typeInto(user, dialog, 'KP', '10,5 km')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        expect(await within(dialog).findByText('Número con punto decimal, como 10.500')).toBeInTheDocument()
        expect(creates).toHaveLength(0)
    })

    it('las ménsulas van a null sin tocar y enteras al tocarlas, con su brazo; quitar el brazo lo manda a null', async () => {
        serveGateway({profiles: [profileWithOneCantilever()]})
        const updates = recordWrites('put', `${BASE}/profiles/7`, (body) => HttpResponse.json(body))
        const {user} = await open('/infraestructura/perfiles', sessionWith(WRITER), 'Perfiles', 1)

        await user.click(screen.getByRole('button', {name: 'Modificar P-007 (kp 12.345)'}))
        let dialog = await screen.findByRole('dialog', {name: 'Modificar perfil'})
        expect(within(dialog).getByRole('table', {name: 'Ménsulas'})).toHaveTextContent('SA1 1200 mm')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(updates).toHaveLength(1))
        expect(updates[0].cantilevers).toBeNull()
        expect(updates[0].disconnector).toEqual(profileWithOneCantilever().disconnector)
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

        await user.click(screen.getByRole('button', {name: 'Modificar P-007 (kp 12.345)'}))
        dialog = await screen.findByRole('dialog', {name: 'Modificar perfil'})
        await user.click(within(dialog).getByRole('button', {name: 'Añadir'}))
        let cantilever = await screen.findByRole('dialog', {name: 'Nueva ménsula'})
        await choose(user, cantilever, 'Tipo de ménsula', 'CT2 · Ménsula tipo 2')
        await typeInto(user, cantilever, 'Descentramiento (mm)', '-200')
        await typeInto(user, cantilever, 'Altura del hilo de contacto (m)', '5.300')
        await user.click(within(cantilever).getByRole('checkbox', {name: 'Lleva brazo de atirantado'}))
        await choose(user, cantilever, 'Tipo de brazo', 'SA1 · Brazo tipo 1')
        await typeInto(user, cantilever, 'Longitud del brazo (mm)', '900')
        await user.click(within(cantilever).getByRole('button', {name: 'Aceptar'}))
        await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Nueva ménsula'})).not.toBeInTheDocument())

        await user.click(within(dialog).getByRole('button', {name: 'Modificar ménsula 1 (CT1)'}))
        cantilever = await screen.findByRole('dialog', {name: 'Modificar ménsula'})
        await user.click(within(cantilever).getByRole('checkbox', {name: 'Lleva brazo de atirantado'}))
        await user.click(within(cantilever).getByRole('button', {name: 'Aceptar'}))
        await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Modificar ménsula'})).not.toBeInTheDocument())
        expect(within(dialog).getByRole('table', {name: 'Ménsulas'})).toHaveTextContent('Sin brazo')
        expect(within(dialog).getByRole('button', {name: 'Añadir'})).toBeEnabled()
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        await waitFor(() => expect(updates).toHaveLength(2))
        const [read] = profileWithOneCantilever().cantilevers
        expect(updates[1].cantilevers).toEqual([
            {...read, steadyArm: null, cwElevation: null, windDeflection: null, armAngle: null, catenaryHeight: null},
            {
                cantileverType: {id: 8, code: 'CT2'}, cwHeight: 5.3, stagger: -200, catenaryHeight: null, cwElevation: null,
                windDeflection: null, armAngle: null, steadyArm: {length: 900, steadyArmType: {id: 6, code: 'SA1'}},
            },
        ])
    })

    it('vaciar un catálogo opcional viaja como {}; el seccionador se enseña y vuelve como se leyó', async () => {
        serveGateway({profiles: [profileWithOneCantilever()]})
        const updates = recordWrites('put', `${BASE}/profiles/7`, (body) => HttpResponse.json(body))
        const {user} = await open('/infraestructura/perfiles', sessionWith(WRITER), 'Perfiles', 1)

        await user.click(screen.getByRole('button', {name: 'Modificar P-007 (kp 12.345)'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar perfil'})
        const disconnector = within(dialog).getByRole('textbox', {name: 'Seccionador'})
        expect(disconnector).toHaveValue('SEC-1 (Disc)')
        expect(disconnector).toHaveAttribute('readonly')
        expect(within(dialog).getByRole('textbox', {name: 'Orden en la vía'})).toHaveValue('4')
        // Deseleccionar la opción elegida es como se vacía un desplegable.
        await choose(user, dialog, 'Tipo de poste', 'PT1 · Poste tipo 1')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        await waitFor(() => expect(updates).toHaveLength(1))
        expect(updates[0].poleType).toEqual({})
        expect(updates[0].portal).toBeNull()
        expect(updates[0].profileStatus).toEqual(profileWithOneCantilever().profileStatus)
        expect(updates[0].sectionings).toEqual(profileWithOneCantilever().sectionings)
        expect(updates[0].disconnector).toEqual(profileWithOneCantilever().disconnector)
        expect(updates[0]).toMatchObject({orderInTrack: 4, span: 47.97, railPoleDistance: -4960, versionNumber: 2})
    })
})

describe('los seccionadores', () => {
    const known = {
        id: 5, name: 'SEC-1', onLoad: true, stationId: 12, profileId: 7, profileCode: 'P-007', profileKp: '12.345',
        disconnectorFunction: {id: 9, code: 'Disc', description: 'Seccionador'}, versionNumber: 4,
    }
    const bare = {id: 6, name: 'SEC-2', onLoad: false, stationId: 13, profileId: 8, versionNumber: 1}

    it('la lista nombra el perfil por su código y su KP, y sin código por su id', async () => {
        serveGateway({disconnectors: [known, bare]})
        await open('/infraestructura/seccionadores', loginAs('config.lector'), 'Seccionadores', 2)

        expect(within(rowOf('Seccionadores', 'SEC-1')).getByText('P-007 (kp 12.345)')).toBeInTheDocument()
        expect(within(rowOf('Seccionadores', 'SEC-1')).getByText('Disc')).toBeInTheDocument()
        expect(within(rowOf('Seccionadores', 'SEC-2')).getByText('#8')).toBeInTheDocument()
    })

    it('el perfil se busca en el servidor y cambiarlo manda su id; lo demás vuelve como se leyó', async () => {
        const requests = serveGateway({
            disconnectors: [known],
            profiles: [{id: 20, profileId: 'P-020', kp: '30.000', trackId: 3, cantilevers: []}],
        })
        const updates = recordWrites('put', `${BASE}/disconnectors/5`, (body) => HttpResponse.json(body))
        const {user} = await open('/infraestructura/seccionadores', sessionWith(WRITER), 'Seccionadores', 1)

        await user.click(screen.getByRole('button', {name: 'Modificar SEC-1'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar seccionador'})
        const profile = within(dialog).getByRole('combobox', {name: 'Perfil'})
        expect(profile).toHaveValue('P-007 (kp 12.345)')
        await user.clear(profile)
        await user.type(profile, 'P-02')
        await user.click(await screen.findByRole('option', {name: 'P-020 (kp 30.000)'}))
        const search = requests.profiles.at(-1)
        expect(search.url.search).toBe('?page=0&size=50&sort=profileId%2Casc')
        expect(search.body).toEqual({searchText: 'P-02'})
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        await waitFor(() => expect(updates).toEqual([{...known, profileId: 20}]))
    })
})

describe('los aisladores de sección', () => {
    function insulatorWithOneSwitch() {
        return {
            id: 9, name: 'B7', stationId: 12, kp: 110176, installationType: 'TRACK_CONNECTION', trackId: 3,
            connectedTrackId: 4, enabled: true, versionNumber: 1,
            switches: [{id: 41, code: 'W31', kp: 110176, turnoutDenominator: 9, trackId: 3, enabled: true, versionNumber: 2}],
        }
    }

    it('las agujas van a null sin tocar y enteras al tocarlas; el código tiene forma fija', async () => {
        serveGateway({insulators: [insulatorWithOneSwitch()]})
        const updates = recordWrites('put', `${BASE}/section-insulators/9`, (body) => HttpResponse.json(body))
        const {user} = await open('/infraestructura/aisladores', sessionWith(WRITER), 'Aisladores de sección', 1)
        expect(within(rowOf('Aisladores de sección', 'B7')).getByText('Conexión de vías')).toBeInTheDocument()
        expect(within(rowOf('Aisladores de sección', 'B7')).getByText('VIA 2 (EP4)')).toBeInTheDocument()

        await user.click(screen.getByRole('button', {name: 'Modificar B7'}))
        let dialog = await screen.findByRole('dialog', {name: 'Modificar aislador de sección'})
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(updates).toHaveLength(1))
        expect(updates[0].switches).toBeNull()
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

        await user.click(screen.getByRole('button', {name: 'Modificar B7'}))
        dialog = await screen.findByRole('dialog', {name: 'Modificar aislador de sección'})
        expect(within(dialog).getByRole('table', {name: 'Agujas'})).toHaveTextContent('1:9')
        await user.click(within(dialog).getByRole('button', {name: 'Añadir'}))
        const aguja = await screen.findByRole('dialog', {name: 'Nueva aguja'})
        await typeInto(user, aguja, 'Código', 'X1')
        await user.click(within(aguja).getByRole('button', {name: 'Aceptar'}))
        expect(await within(aguja).findByText('W y hasta cuatro cifras, como W31')).toBeInTheDocument()
        await typeInto(user, aguja, 'Código', 'W41')
        await typeInto(user, aguja, 'KP (m)', '110249')
        await typeInto(user, aguja, 'Denominador de la tangente (1:n)', '12')
        await choose(user, aguja, 'Vía', 'VIA 2 (EP4)')
        await user.click(within(aguja).getByRole('button', {name: 'Aceptar'}))
        await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Nueva aguja'})).not.toBeInTheDocument())
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        await waitFor(() => expect(updates).toHaveLength(2))
        expect(updates[1].switches).toEqual([
            insulatorWithOneSwitch().switches[0],
            {code: 'W41', kp: 110249, turnoutDenominator: 12, trackId: 4, enabled: true},
        ])
    })

    it('la vía conectada solo cuenta en una conexión de vías: pasar a «En una vía» la vacía', async () => {
        serveGateway({insulators: [insulatorWithOneSwitch()]})
        const updates = recordWrites('put', `${BASE}/section-insulators/9`, (body) => HttpResponse.json(body))
        const {user} = await open('/infraestructura/aisladores', sessionWith(WRITER), 'Aisladores de sección', 1)

        await user.click(screen.getByRole('button', {name: 'Modificar B7'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar aislador de sección'})
        expect(within(dialog).getByRole('combobox', {name: 'Vía conectada'})).toBeEnabled()
        await choose(user, dialog, 'Instalación', 'En una vía')
        expect(within(dialog).getByRole('combobox', {name: 'Vía conectada'})).toBeDisabled()
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        await waitFor(() => expect(updates).toHaveLength(1))
        expect(updates[0]).toMatchObject({installationType: 'IN_TRACK', connectedTrackId: null, trackId: 3, switches: null})
    })
})

describe('el esquema de una vía', () => {
    function schematicOfVia1() {
        return {
            trackId: 3, trackName: 'VIA 1', enabled: true, executionPackageName: 'EP4', stations: ['ATOCHA', 'CHAMARTIN'],
            profiles: [
                {
                    id: 1, code: 'P-001', kp: '10.000', orderInTrack: 1, span: '55.000', poleType: 'HEB', profileStatus: 'OK',
                    railPoleDistance: '-2500', sectionings: ['S1'],
                    cantilevers: [{id: 21, type: 'PT1', stagger: '-200', cwHeight: '5.300', catenaryHeight: '1.400',
                        steadyArmType: 'SA1', steadyArmLength: 1200}],
                },
                {
                    id: 2, code: 'P-002', kp: '20.000', orderInTrack: 2, railPoleDistance: '2500', sectionings: [], cantilevers: [],
                    disconnector: {id: 40, name: 'SEC-40', onLoad: true, function: 'FEED', station: 'ATOCHA'},
                },
            ],
            sectionInsulators: [{
                id: 50, name: 'AIS-50', kp: '15.000', installationType: 'TRACK_CONNECTION', enabled: true, station: 'ATOCHA',
                track: 'VIA 1', connectedTrack: 'VIA 2', switches: [{id: 60, code: 'W31', kp: '15.500', turnoutDenominator: 9, track: 'VIA 1'}],
            }],
        }
    }

    function serveSchematic(trackId, respond) {
        const calls = {count: 0}
        server.use(http.get(`${BASE}/tracks/${trackId}/schematic`, () => {
            calls.count += 1
            return respond()
        }))
        return calls
    }

    it('se abre desde su fila en una llamada y dibuja lo que mandó el servicio, en su orden', async () => {
        serveGateway()
        const calls = serveSchematic(3, () => HttpResponse.json(schematicOfVia1()))
        const {user} = await open('/infraestructura/vias', loginAs('config.lector'), 'Vías', 3)

        await user.click(screen.getByRole('button', {name: 'Esquema VIA 1'}))
        const dialog = await screen.findByRole('dialog', {name: 'Esquema · VIA 1 (EP4)'})
        expect(calls.count).toBe(1)
        expect(dialog).toHaveTextContent('2 perfiles · 1 ménsula · 1 seccionador · 1 aislador · Estaciones: ATOCHA, CHAMARTIN')
        const drawing = within(dialog).getByRole('img', {name: 'Esquema de la vía VIA 1'})
        expect([...drawing.querySelectorAll('[data-kind="pole"]')].map((pole) => pole.dataset.id)).toEqual(['1', '2'])
        for (const text of ['P-001', 'KP 10.000', 'HEB · OK', 'PT1', 'S1', 'P-002', 'KP 20.000', 'SEC-40', 'AIS-50',
            'conexión de vías · ↔ VIA 2 · ATOCHA', 'W31 1:9']) {
            expect(within(drawing).getByText(text)).toBeInTheDocument()
        }
        expect(drawing.querySelector('[data-kind="arm"] title')).toHaveTextContent(
            'Ménsula PT1 · descentramiento -200 · altura hilo 5.300 · altura catenaria 1.400 · brazo SA1 1200 mm')
        expect(drawing.querySelector('[data-kind="disconnector"] title')).toHaveTextContent(
            'Seccionador SEC-40 · en carga · función FEED · estación ATOCHA')
        expect(within(dialog).getByText(/Un poste por perfil/)).toBeInTheDocument()

        // La X de la ventana también se llama «Cerrar»; el del pie es el segundo.
        await user.click(within(dialog).getAllByRole('button', {name: 'Cerrar'}).at(-1))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('lo que manda el servicio se pinta como texto, nunca como HTML', async () => {
        serveGateway()
        serveSchematic(3, () => HttpResponse.json({
            trackId: 3, trackName: 'VIA "1" & <b>', enabled: true, stations: [],
            profiles: [{id: 9, code: '<script>P</script>', kp: '1.000', sectionings: ['<b>'], cantilevers: [],
                disconnector: {id: 1, name: '"SEC" & co'}}],
            sectionInsulators: [],
        }))
        const {user} = await open('/infraestructura/vias', loginAs('config.lector'), 'Vías', 3)

        await user.click(screen.getByRole('button', {name: 'Esquema VIA 1'}))
        const dialog = await screen.findByRole('dialog', {name: 'Esquema · VIA "1" & <b>'})
        const drawing = within(dialog).getByRole('img', {name: 'Esquema de la vía VIA "1" & <b>'})
        expect(within(drawing).getByText('<script>P</script>')).toBeInTheDocument()
        expect(within(drawing).getByText('"SEC" & co')).toBeInTheDocument()
        expect(drawing.querySelector('script')).toBeNull()
        expect(drawing.querySelector('b')).toBeNull()
    })

    it('si el esquema falla se avisa con su referencia y no se abre ninguna ventana', async () => {
        serveGateway()
        serveSchematic(4, () => problem(404, {title: 'Recurso no encontrado', status: 404, code: 'NOT-001', traceId: 't-9'}))
        const {user} = await open('/infraestructura/vias', loginAs('config.lector'), 'Vías', 3)

        await user.click(screen.getByRole('button', {name: 'Esquema VIA 2'}))

        expect(await screen.findByText('Referencia: t-9')).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('una vía sin perfiles lo dice en vez de dibujar', async () => {
        serveGateway()
        serveSchematic(4, () => HttpResponse.json({trackId: 4, trackName: 'VIA 2', enabled: false, executionPackageName: 'EP4',
            stations: null, profiles: null, sectionInsulators: null}))
        const {user} = await open('/infraestructura/vias', loginAs('config.lector'), 'Vías', 3)

        await user.click(screen.getByRole('button', {name: 'Esquema VIA 2'}))
        const dialog = await screen.findByRole('dialog', {name: 'Esquema · VIA 2 (EP4)'})
        expect(within(dialog).getByText('Esta vía no tiene perfiles: no hay nada que dibujar.')).toBeInTheDocument()
        expect(within(dialog).queryByRole('img', {name: 'Esquema de la vía VIA 2'})).not.toBeInTheDocument()
        expect(dialog).toHaveTextContent('0 perfiles · 0 ménsulas · 0 seccionadores · 0 aisladores · sin estaciones · vía inactiva')
    })

    it('el reparto del dibujo: postes a la misma distancia, cada aislador entre sus vecinos por KP y los brazos al lado del poste', () => {
        const {profiles} = normalizeSchematic(schematicOfVia1())

        expect(xOf(0)).toBe(MARGIN)
        expect(xOf(1)).toBe(MARGIN + STEP)
        expect(width(600)).toBe(2 * MARGIN + STEP * 599)
        expect(width(1)).toBe(480)
        expect(insulatorX(profiles, '15.000')).toBeCloseTo(MARGIN + STEP / 2)
        expect(insulatorX(profiles, '12.500')).toBeCloseTo(MARGIN + STEP * 0.25)
        expect(insulatorX(profiles, '99.000')).toBeCloseTo(xOf(1) + STEP / 2)
        expect(insulatorX(profiles, '1.000')).toBeCloseTo(Math.max(MARGIN / 3, xOf(0) - STEP / 2))
        expect(insulatorX(profiles, null)).toBeCloseTo(xOf(1) + STEP / 2)
        expect(insulatorX(profiles, 'diez')).toBeCloseTo(xOf(1) + STEP / 2)
        expect(armDirection(profiles[0])).toBe(-1)
        expect(armDirection(profiles[1])).toBe(1)

        // Dos tramos con la kilometración reiniciada: el aislador cae en el primer tramo que lo contiene.
        const restart = {id: 3, code: 'P-003', kp: '5.000', sectionings: [], cantilevers: []}
        const twoSections = [...profiles, restart]
        expect(insulatorX(twoSections, '15.000')).toBeCloseTo(xOf(0) + STEP * 0.5)
        expect(insulatorX(twoSections, '8.000')).toBeCloseTo(xOf(1) + STEP * (20 - 8) / (20 - 5))
    })
})
