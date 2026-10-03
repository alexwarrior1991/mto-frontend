import {screen, waitFor, within} from '@testing-library/react'
import {http, HttpResponse} from 'msw'
import {describe, expect, it} from 'vitest'
import {buildMenu} from '../app/navigation.js'
import {P} from '../auth/permissions.js'
import {formatAttributes, readAttributes} from '../features/users/userAttributes.js'
import {listFilter} from '../features/users/useUsers.js'
import {renderRoute} from './render.jsx'
import {server} from './server.js'
import {loginAs, sessionWith} from './session.js'

/**
 * Las pantallas de usuarios (usuarios, usuarios/:userId, usuarios/perfiles y usuarios/roles) con los
 * casos de usuarios de ViewLayerTest del backoffice:
 * - la lista paginada con first y max y filtrada en el servicio, la exclusión entre búsqueda y atributo,
 *   y los controles según los permisos;
 * - el alta, los errores del servicio campo a campo, la modificación con solo lo cambiado, activar sin
 *   confirmación, el borrado confirmado y el parser de atributos;
 * - la ficha: la cabecera, las pestañas que piden sus datos al abrirse, el usuario que no existe, cada
 *   botón tras su permiso, perfiles y roles pintando la respuesta, la contraseña temporal, el correo de
 *   acciones, las sesiones, las credenciales y «sacar a la persona»;
 * - los catálogos de perfiles y de roles, con sus miembros paseados sin total.
 *
 * Y lo que el backoffice no hacía: el KC-400 de verdad (sin errores por campo) en el campo de la
 * contraseña, una modificación sin cambios que no llama, pintar la respuesta en vez de releer la
 * cabecera, y un id con «:» codificado en la ruta.
 *
 * Los manejadores llevan ids concretos (/api/users/<id>), nunca /api/users/:userId, para no tapar
 * /api/users/profiles ni /api/users/roles. Las fechas se construyen en la hora local de quien corre el
 * test, para que se pinten con esas cifras en cualquier zona.
 */

const BASE = '/api/users'
const ANA_ID = '0d5f1d1a-1111-4e43-9a5b-000000000001'
const BRUNO_ID = '0d5f1d1a-1111-4e43-9a5b-000000000002'
const CARLA_ID = '0d5f1d1a-1111-4e43-9a5b-000000000003'
const ANA_PATH = `/usuarios/${ANA_ID}`

const VIEWER = {name: 'mto-users-viewer', description: 'Solo lectura de usuarios'}
const MANAGER = {name: 'mto-users-manager', description: 'Gestión de usuarios'}
const ADMIN = {name: 'mto-users-admin', description: null}
const USERS_API = {clientId: 'mto-users-api', name: 'MTO Users API', description: null}
const CONFIGURATION_API = {clientId: 'mto-configuration-api', name: null, description: null}
const ANA_REALM_ROLES = ['mto-users-viewer', 'default-roles-mto']

/** Una fecha en la hora local, como la manda el servicio (ISO en UTC): se pinta con esas cifras. */
function local(year, month, day, hour = 0, minute = 0) {
    return new Date(year, month - 1, day, hour, minute).toISOString()
}

function user(id, username, firstName, lastName, email, enabled, attributes = {}, extra = {}) {
    return {
        id, username, firstName, lastName, email, emailVerified: email !== null, enabled, createdAt: local(2026, 9, 1, 10, 30),
        attributes, requiredActions: [], ...extra,
    }
}

function threeUsers() {
    return [
        user(ANA_ID, 'ana', 'Ana', 'Alvarez', 'ana@mto.local', true, {dept: ['taller']}),
        user(BRUNO_ID, 'bruno', 'Bruno', 'Blanco', 'bruno@mto.local', true),
        user(CARLA_ID, 'carla', 'Carla', null, null, false, {dept: ['oficina']}),
    ]
}

function ana(extra = {}) {
    return {...threeUsers()[0], ...extra}
}

function anaRoles(...usersApiRoles) {
    return {realmRoles: ANA_REALM_ROLES, clientRoles: [{clientId: 'mto-users-api', roles: usersApiRoles}]}
}

const SESSIONS = [
    {
        id: 's1', username: 'ana', ipAddress: '10.0.0.7', startedAt: local(2026, 9, 21, 9, 0), lastAccessAt: local(2026, 9, 21, 9, 45),
        clients: ['mto-backoffice'],
    },
    {
        id: 's2', username: 'ana', ipAddress: '10.0.0.8', startedAt: local(2026, 9, 21, 10, 0), lastAccessAt: null,
        clients: ['mto-frontend', 'mto-gateway'],
    },
]
const OFFLINE = [
    {
        id: 'o1', username: 'ana', ipAddress: null, startedAt: local(2026, 9, 1, 11, 0), lastAccessAt: local(2026, 9, 20, 11, 0),
        clients: ['mto-frontend'],
    },
]
const CREDENTIALS = [
    {id: 'c1', type: 'password', userLabel: null, createdAt: local(2026, 9, 1, 10, 30)},
    {id: 'c2', type: 'otp', userLabel: 'Móvil', createdAt: local(2026, 9, 2, 10, 30)},
]

function problem(status, body, headers = {}) {
    return HttpResponse.json(body, {status, headers: {'Content-Type': 'application/problem+json', ...headers}})
}

function fullName(dto) {
    return `${dto.firstName ?? ''} ${dto.lastName ?? ''}`.trim() || dto.username
}

/**
 * La lista en el servicio simulado: filtra por texto, atributo y estado, y pagina con first y max como
 * el de verdad, que también rechaza search junto a attribute (400 SEARCH-400). Apunta cada petición.
 */
function serveUsers(all) {
    const requests = []
    server.use(http.get(BASE, ({request}) => {
        const url = new URL(request.url)
        requests.push(url)
        const search = url.searchParams.get('search')
        const attributes = url.searchParams.getAll('attribute')
        const first = Number(url.searchParams.get('first'))
        const max = Number(url.searchParams.get('max'))
        if (search && attributes.length > 0) {
            return problem(400, {status: 400, title: 'Bad Request', errorCode: 'SEARCH-400', detail: 'search y attribute no van juntos'})
        }
        if (max > 200) {
            return problem(400, {status: 400, title: 'Bad Request', errorCode: 'REQ-VALIDATION', detail: 'max'})
        }
        const enabled = url.searchParams.get('enabled')
        const text = (search ?? '').toLowerCase()
        const matching = all
            .filter((dto) => !text || dto.username.includes(text) || fullName(dto).toLowerCase().includes(text))
            .filter((dto) => enabled === null || String(dto.enabled) === enabled)
            .filter((dto) => attributes.every((pair) => {
                const [key, value] = [pair.slice(0, pair.indexOf(':')), pair.slice(pair.indexOf(':') + 1)]
                return (dto.attributes[key] ?? []).includes(value)
            }))
        return HttpResponse.json({content: matching.slice(first, first + max), first, max, total: matching.length})
    }))
    return requests
}

/**
 * El servicio simulado detrás de una ficha: el usuario, sus perfiles y roles, sus sesiones y
 * credenciales, y los catálogos. Cuenta lo que se pide de cada cosa.
 */
function serveDetail(dto) {
    const counts = {user: 0, profiles: 0, roles: 0, sessions: 0, offline: 0, credentials: 0, catalogue: 0, clients: 0, clientRoles: 0}
    const counted = (key, body) => () => {
        counts[key] += 1
        return HttpResponse.json(typeof body === 'function' ? body(counts[key]) : body)
    }
    const path = `${BASE}/${dto.id}`
    server.use(
        http.get(path, counted('user', dto)),
        http.get(`${path}/profiles`, counted('profiles', [VIEWER])),
        http.get(`${path}/roles`, counted('roles', anaRoles('users-read'))),
        http.get(`${path}/sessions`, counted('sessions', SESSIONS)),
        http.get(`${path}/offline-sessions`, counted('offline', OFFLINE)),
        http.get(`${path}/credentials`, counted('credentials', CREDENTIALS)),
        http.get(`${BASE}/profiles`, counted('catalogue', [VIEWER, MANAGER, ADMIN])),
        http.get(`${BASE}/roles/clients`, counted('clients', [USERS_API, CONFIGURATION_API])),
        http.get(`${BASE}/roles/clients/mto-users-api`, counted('clientRoles', [
            {name: 'users-read', description: null, composite: false},
            {name: 'users-write', description: null, composite: false},
            {name: 'users-delete', description: null, composite: false},
        ])),
    )
    return counts
}

/** Recoge las peticiones de una escritura (su ruta y su cuerpo) y contesta con respond(cuerpo, n). */
function recordWrites(method, path, respond) {
    const requests = []
    server.use(http[method](path, async ({request}) => {
        const text = await request.text()
        const body = text ? JSON.parse(text) : null
        requests.push({path: new URL(request.url).pathname, body})
        return respond(body, requests.length)
    }))
    return requests
}

function table(name) {
    return screen.getByRole('table', {name})
}

/** Las filas con datos de una tabla, cada una como el texto de sus celdas (sin la de acciones, que son botones). */
function rows(name) {
    return within(table(name)).getAllByRole('row').slice(1)
        .map((row) => within(row).queryAllByRole('cell').filter((cell) => !cell.querySelector('button')).map((cell) => cell.textContent))
        .filter((cells) => cells.length > 1)
}

function firstColumn(name) {
    return rows(name).map((cells) => cells[0])
}

function rowOf(name, text) {
    return within(table(name)).getAllByRole('row')
        .find((row) => within(row).queryAllByRole('cell').some((cell) => cell.textContent === text))
}

async function openList(session, users = threeUsers()) {
    const requests = serveUsers(users)
    const view = renderRoute('/usuarios', {session})
    await waitFor(() => expect(firstColumn('Usuarios').length).toBeGreaterThan(0))
    return {...view, requests}
}

async function openDetail(session, dto = ana()) {
    const counts = serveDetail(dto)
    const view = renderRoute(`/usuarios/${encodeURIComponent(dto.id)}`, {session})
    expect(await screen.findByRole('heading', {name: dto.username, level: 2})).toBeInTheDocument()
    return {...view, counts}
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

async function openTab(user, name) {
    await user.click(screen.getByRole('tab', {name}))
}

describe('el menú y las rutas', () => {
    it('las tres pantallas cuelgan de «Usuarios», con users-read y sin nada de infraestructura', async () => {
        const users = buildMenu(loginAs('usuarios.lector')).find((item) => item.key === 'usuarios')
        expect(users.children.map((child) => [child.label, child.path])).toEqual([
            ['Usuarios', '/usuarios'], ['Perfiles de usuario', '/usuarios/perfiles'], ['Roles de cliente', '/usuarios/roles']])
        const keys = buildMenu(loginAs('usuarios.lector')).map((item) => item.key ?? item.path)
        expect(keys).not.toContain('infraestructura')
        expect(keys).not.toContain('catalogos')
        expect(buildMenu(loginAs('config.responsable')).some((item) => item.key === 'usuarios')).toBe(false)

        await openList(loginAs('usuarios.lector'))
        expect(screen.getByRole('heading', {name: 'Usuarios', level: 2})).toBeInTheDocument()
        expect(screen.queryByText(/Llega en la fase/)).not.toBeInTheDocument()
    })

    it('un rol de realm llamado como un permiso no abre la lista ni pide nada al servicio', async () => {
        renderRoute('/usuarios', {session: sessionWith([P.NOTIFICATION_INBOX], {realmRoles: ['users-read', 'mto-users-admin']})})

        expect(await screen.findByText('No tienes permiso para abrir esta pantalla')).toBeInTheDocument()
        expect(screen.getByText('users-read')).toBeInTheDocument()
    })

    it('las rutas literales ganan a la de parámetro: usuarios/perfiles y usuarios/roles no son la ficha de nadie', async () => {
        server.use(
            http.get(`${BASE}/profiles`, () => HttpResponse.json([VIEWER])),
            http.get(`${BASE}/roles/clients`, () => HttpResponse.json([USERS_API])),
        )
        const profiles = renderRoute('/usuarios/perfiles', {session: loginAs('usuarios.lector')})
        expect(await screen.findByRole('heading', {name: 'Perfiles de usuario'})).toBeInTheDocument()
        expect(await screen.findByText('mto-users-viewer')).toBeInTheDocument()
        profiles.unmount()

        renderRoute('/usuarios/roles', {session: loginAs('usuarios.lector')})
        expect(await screen.findByRole('heading', {name: 'Roles de cliente'})).toBeInTheDocument()
        expect(screen.getByText('Elige un rol para ver quién lo tiene.')).toBeInTheDocument()
    })
})

describe('la lista de usuarios', () => {
    it('se pagina con first y max en una sola petición por página, sin orden, y se filtra en el servicio', async () => {
        const many = Array.from({length: 120}, (_, index) => user(`id-${index}`, `user${String(index).padStart(3, '0')}`, 'Nombre',
            `Apellido ${index}`, `user${index}@mto.local`, index % 3 !== 0, {dept: [index % 2 === 0 ? 'taller' : 'oficina']}))
        const {user: person, requests} = await openList(loginAs('usuarios.lector'), many)

        expect(firstColumn('Usuarios')).toHaveLength(50)
        expect(firstColumn('Usuarios')[0]).toBe('user000')
        expect(screen.getByText('120 usuarios')).toBeInTheDocument()
        expect(requests.map((url) => url.search)).toEqual(['?first=0&max=50'])
        expect(within(table('Usuarios')).getAllByRole('columnheader').filter((header) => header.hasAttribute('aria-sort'))).toEqual([])

        await person.click(screen.getByRole('button', {name: 'Página 2'}))
        await waitFor(() => expect(firstColumn('Usuarios')[0]).toBe('user050'))
        expect(requests.at(-1).search).toBe('?first=50&max=50')
        expect(firstColumn('Usuarios')[27]).toBe('user077')

        await person.type(screen.getByRole('textbox', {name: 'Buscar por usuario, email o nombre'}), 'user01')
        // Pintar 50 filas en cada tecla es lento en jsdom: la búsqueda llega, pero más tarde que el segundo de waitFor.
        await waitFor(() => expect(firstColumn('Usuarios')).toHaveLength(10), {timeout: 4000})
        expect(requests.at(-1).search).toBe('?search=user01&first=0&max=50')

        await choose(person, document.body, 'Estado', 'Desactivados')
        await waitFor(() => expect(firstColumn('Usuarios')).toEqual(['user012', 'user015', 'user018']))
        expect(requests.at(-1).search).toBe('?search=user01&enabled=false&first=0&max=50')
        expect(screen.getByText('3 usuarios')).toBeInTheDocument()
    })

    it('la búsqueda y el atributo se excluyen: lo deshabilitado no viaja, y un atributo mal formado no pide nada', async () => {
        const {user: person, requests} = await openList(loginAs('usuarios.lector'))
        const search = screen.getByRole('textbox', {name: 'Buscar por usuario, email o nombre'})
        const attribute = screen.getByRole('textbox', {name: 'Atributo clave:valor'})

        await person.type(attribute, 'dept:taller')
        expect(search).toBeDisabled()
        await waitFor(() => expect(firstColumn('Usuarios')).toEqual(['ana']))
        expect(requests.at(-1).search).toBe('?attribute=dept%3Ataller&first=0&max=50')

        const sent = requests.length
        await person.clear(attribute)
        await person.type(attribute, 'sin separador')
        expect(await screen.findByText('clave:valor, sin espacios')).toBeInTheDocument()
        expect(attribute).toHaveAttribute('aria-invalid', 'true')
        expect(firstColumn('Usuarios')).toEqual(['ana'])
        expect(requests).toHaveLength(sent)

        await person.clear(attribute)
        expect(search).toBeEnabled()
        await person.type(search, 'bru')
        expect(attribute).toBeDisabled()
        await waitFor(() => expect(firstColumn('Usuarios')).toEqual(['bruno']))
        expect(requests.some((url) => url.searchParams.has('search') && url.searchParams.has('attribute'))).toBe(false)
    })

    it('lo que pide la lista: con texto en los dos, gana la búsqueda; un atributo mal formado no pide nada', () => {
        expect(listFilter({search: ' ana ', attribute: 'dept:taller', enabled: true})).toEqual({search: 'ana', attributes: [], enabled: true})
        expect(listFilter({search: '  ', attribute: ' dept:taller '})).toEqual({search: null, attributes: ['dept:taller'], enabled: null})
        expect(listFilter({attribute: 'sin separador', enabled: false})).toBeNull()
        expect(listFilter()).toEqual({search: null, attributes: [], enabled: null})
    })

    it('quien solo lee ve los usuarios y abre su ficha, sin ningún control de escritura', async () => {
        await openList(loginAs('usuarios.lector'))

        expect(rows('Usuarios')[0]).toEqual(['ana', 'Ana Alvarez', 'ana@mto.local', 'Sí', 'Sí', '01/09/2026 10:30'])
        expect(rows('Usuarios')[2]).toEqual(['carla', 'Carla', '', 'No', 'No', '01/09/2026 10:30'])
        expect(screen.getByText('3 usuarios')).toBeInTheDocument()
        expect(within(rowOf('Usuarios', 'ana')).getByRole('link', {name: 'ana'})).toHaveAttribute('href', ANA_PATH)
        expect(screen.getByRole('button', {name: 'Abrir la ficha de ana'})).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Nuevo'})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Modificar ana'})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Desactivar ana'})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Borrar ana'})).not.toBeInTheDocument()
    })

    it('quien gestiona sin users-delete lo ve todo menos la papelera', async () => {
        await openList(loginAs('usuarios.gestor'))

        expect(screen.getByRole('button', {name: 'Nuevo'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Modificar ana'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Desactivar ana'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Activar carla'})).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Borrar ana'})).not.toBeInTheDocument()
    })

    it('la fila abre la ficha con su botón y con doble clic', async () => {
        serveDetail(ana())
        const {user: person, router} = await openList(loginAs('usuarios.lector'))

        await person.click(screen.getByRole('button', {name: 'Abrir la ficha de ana'}))
        expect(await screen.findByRole('heading', {name: 'ana', level: 2})).toBeInTheDocument()
        expect(router.state.location.pathname).toBe(ANA_PATH)
        expect(screen.queryByRole('table', {name: 'Usuarios'})).not.toBeInTheDocument()
    })
})

describe('el editor de un usuario', () => {
    it('el alta manda lo escrito, con la contraseña temporal y las acciones, y no sale sin lo obligatorio', async () => {
        const creates = recordWrites('post', BASE, (body) => HttpResponse.json(
            user('new-id', body.username, body.firstName, null, body.email, true, body.attributes), {status: 201}))
        const {user: person} = await openList(loginAs('usuarios.gestor'))

        await person.click(screen.getByRole('button', {name: 'Nuevo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Alta de usuario'})
        await person.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('El usuario es obligatorio')).toBeInTheDocument()

        await typeInto(person, dialog, 'Usuario', 'dario.diaz')
        await typeInto(person, dialog, 'Nombre', 'Dario')
        await typeInto(person, dialog, 'Email', 'dario@mto.local')
        const password = within(dialog).getByLabelText('Contraseña temporal')
        await person.type(password, 'corta')
        await person.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('Al menos 8 caracteres')).toBeInTheDocument()
        expect(creates).toHaveLength(0)

        await person.clear(password)
        await person.type(password, 'Temporal-2026')
        await choose(person, dialog, 'Acciones requeridas al entrar', 'Cambiar la contraseña')
        await person.type(within(dialog).getByRole('textbox', {name: 'Atributos (clave=valor por línea)'}), 'dept=taller{Enter}dept=noche')
        await person.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        expect(await screen.findByText('Guardado dario.diaz')).toBeInTheDocument()
        expect(creates.map((request) => request.body)).toEqual([{
            username: 'dario.diaz', firstName: 'Dario', email: 'dario@mto.local', emailVerified: false, enabled: true,
            temporaryPassword: 'Temporal-2026', requiredActions: ['UPDATE_PASSWORD'], attributes: {dept: ['taller', 'noche']},
        }])
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('los errores del servicio caen en sus campos, el diálogo sigue abierto y no hay nada que avisar', async () => {
        server.use(http.post(BASE, () => problem(400, {
            title: 'Bad Request', status: 400, errorCode: 'REQ-VALIDATION', correlationId: 'corr-u2',
            validationErrors: [
                {field: 'email', message: 'must be a well-formed email address'},
                {field: 'temporaryPassword', message: 'la política pide un dígito'},
            ],
        })))
        const {user: person} = await openList(loginAs('usuarios.gestor'))

        await person.click(screen.getByRole('button', {name: 'Nuevo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Alta de usuario'})
        await typeInto(person, dialog, 'Usuario', 'elena')
        await typeInto(person, dialog, 'Email', 'elena@mto.local')
        await person.type(within(dialog).getByLabelText('Contraseña temporal'), 'sinDigitos')
        await person.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        expect(await within(dialog).findByText('must be a well-formed email address')).toBeInTheDocument()
        expect(within(dialog).getByText('la política pide un dígito')).toBeInTheDocument()
        expect(within(dialog).getByRole('textbox', {name: 'Email'})).toHaveAttribute('aria-invalid', 'true')
        expect(screen.getByRole('dialog', {name: 'Alta de usuario'})).toBeInTheDocument()
        expect(screen.queryByText(/Referencia/)).not.toBeInTheDocument()
    })

    it('un usuario repetido es un 409 USR-409 que no pide recargar, con el diálogo abierto', async () => {
        server.use(http.post(BASE, () => problem(409, {
            status: 409, title: 'Conflict', detail: 'User exists with same username', errorCode: 'USR-409', correlationId: 'corr-409',
        })))
        const {user: person} = await openList(loginAs('usuarios.gestor'))

        await person.click(screen.getByRole('button', {name: 'Nuevo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Alta de usuario'})
        await typeInto(person, dialog, 'Usuario', 'ana')
        await person.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        expect(await screen.findByText('Ya existe un usuario con ese nombre de usuario o ese email. User exists with same username'))
            .toBeInTheDocument()
        expect(screen.getByText('Referencia: corr-409')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Alta de usuario'})).toBeInTheDocument()
    })

    it('modificar manda solo lo que cambió y nunca el nombre de usuario; sin cambios, no llama', async () => {
        const updates = recordWrites('put', `${BASE}/${ANA_ID}`, () => HttpResponse.json(ana({lastName: 'Alvarez Arias', email: null})))
        const {user: person} = await openList(loginAs('usuarios.gestor'))

        await person.click(screen.getByRole('button', {name: 'Modificar ana'}))
        let dialog = await screen.findByRole('dialog', {name: 'Modificar usuario ana'})
        expect(within(dialog).getByRole('textbox', {name: 'Usuario'})).toHaveValue('ana')
        expect(within(dialog).getByRole('textbox', {name: 'Usuario'})).toHaveAttribute('readonly')
        expect(within(dialog).queryByLabelText('Contraseña temporal')).not.toBeInTheDocument()
        expect(within(dialog).getByRole('textbox', {name: 'Atributos (clave=valor por línea)'})).toHaveValue('dept=taller')
        await person.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(updates).toHaveLength(0)

        await person.click(screen.getByRole('button', {name: 'Modificar ana'}))
        dialog = await screen.findByRole('dialog', {name: 'Modificar usuario ana'})
        await typeInto(person, dialog, 'Apellidos', 'Alvarez Arias')
        await typeInto(person, dialog, 'Email', '')
        await person.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        expect(await screen.findByText('Guardado ana')).toBeInTheDocument()
        expect(updates.map((request) => request.body)).toEqual([{lastName: 'Alvarez Arias', email: ''}])
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('activar y desactivar son un PATCH sin confirmación, y la lista se relee', async () => {
        const patches = recordWrites('patch', `${BASE}/${ANA_ID}/enabled`, (body) => HttpResponse.json(ana({enabled: body.enabled})))
        const {user: person, requests} = await openList(loginAs('usuarios.gestor'))
        const reads = requests.length

        await person.click(screen.getByRole('button', {name: 'Desactivar ana'}))

        expect(await screen.findByText('Desactivado ana')).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(patches.map((request) => request.body)).toEqual([{enabled: false}])
        await waitFor(() => expect(requests.length).toBeGreaterThan(reads))
    })

    it('borrar pide confirmación, dice lo que se lleva y después llama', async () => {
        const deletes = recordWrites('delete', `${BASE}/${ANA_ID}`, () => new HttpResponse(null, {status: 204}))
        const {user: person} = await openList(loginAs('usuarios.responsable'))

        await person.click(screen.getByRole('button', {name: 'Borrar ana'}))
        const confirm = await screen.findByRole('dialog', {name: 'Borrar usuario ana'})
        expect(confirm).toHaveTextContent('Se borra en Keycloak con sus roles, perfiles, sesiones y credenciales. No se puede deshacer.')
        expect(deletes).toHaveLength(0)
        await person.click(within(confirm).getByRole('button', {name: 'Borrar'}))

        expect(await screen.findByText('Borrado ana')).toBeInTheDocument()
        expect(deletes.map((request) => request.path)).toEqual([`${BASE}/${ANA_ID}`])
    })

    it('los atributos son una línea clave=valor por valor, y lo que no se entiende se dice con su línea', () => {
        expect(readAttributes(' dept = taller \n\ndept=noche\nturno=\n')).toEqual({value: {dept: ['taller', 'noche'], turno: ['']}, error: null})
        expect(readAttributes('url=http://x/a=b').value).toEqual({url: ['http://x/a=b']})
        expect(readAttributes(null)).toEqual({value: {}, error: null})
        expect(readAttributes('  \n ').value).toEqual({})
        expect(readAttributes('dept=taller\r\nsin separador')).toEqual({value: null, error: 'Línea 2: se esperaba clave=valor'})
        expect(readAttributes('=valor').error).toBe('Línea 1: se esperaba clave=valor')
        expect(readAttributes('__proto__=x').value).toEqual(JSON.parse('{"__proto__": ["x"]}'))

        const attributes = {turno: [''], dept: ['noche', 'taller']}
        expect(formatAttributes(attributes)).toBe('dept=noche\ndept=taller\nturno=')
        expect(formatAttributes(null)).toBe('')
        expect(formatAttributes(readAttributes(formatAttributes(attributes)).value)).toBe('dept=noche\ndept=taller\nturno=')
    })
})

describe('la ficha de un usuario', () => {
    it('enseña la cabecera y pide cada pestaña la primera vez que se abre, y no otra vez al volver a ella', async () => {
        const dto = ana({attributes: {dept: ['taller', 'noche']}, requiredActions: ['UPDATE_PASSWORD', 'CUSTOM_ACTION']})
        const {user: person, counts} = await openDetail(loginAs('usuarios.lector'), dto)

        expect(screen.getByText('Activo')).toBeInTheDocument()
        expect(screen.getByText('Email verificado')).toBeInTheDocument()
        expect(screen.getByText('Ana Alvarez · ana@mto.local · creado el 01/09/2026 10:30')).toBeInTheDocument()
        expect(screen.getByText('Acciones pendientes al entrar: Cambiar la contraseña, CUSTOM_ACTION')).toBeInTheDocument()
        expect(screen.getByText('Atributos: dept=taller|noche')).toBeInTheDocument()
        await waitFor(() => expect(firstColumn('Perfiles asignados')).toEqual(['mto-users-viewer']))
        expect(counts).toMatchObject({user: 1, profiles: 1, roles: 0, sessions: 0, credentials: 0})

        await openTab(person, 'Roles de cliente')
        await waitFor(() => expect(rows('Roles de cliente asignados')).toEqual([['mto-users-api', 'users-read']]))
        expect(screen.getByText('Roles de realm (los perfiles están entre ellos): mto-users-viewer, default-roles-mto')).toBeInTheDocument()

        await openTab(person, 'Perfiles')
        await openTab(person, 'Roles de cliente')
        expect(counts).toMatchObject({user: 1, profiles: 1, roles: 1, sessions: 0, offline: 0, credentials: 0})
    })

    it('un usuario que no existe vuelve a la lista con su aviso', async () => {
        serveUsers(threeUsers())
        server.use(http.get(`${BASE}/nope`, () => problem(404, {status: 404, title: 'Not Found', detail: 'User nope not found', errorCode: 'USR-404'})))
        const {router} = renderRoute('/usuarios/nope', {session: loginAs('usuarios.lector')})

        expect(await screen.findByText('No existe el usuario nope')).toBeInTheDocument()
        await waitFor(() => expect(router.state.location.pathname).toBe('/usuarios'))
        expect(await screen.findByRole('heading', {name: 'Usuarios', level: 2})).toBeInTheDocument()
    })

    it('un id con «:» (un usuario federado) viaja codificado y la ficha lo enseña', async () => {
        const federated = ana({id: 'f:ldap:ana'})
        const reads = []
        server.use(http.get(`${BASE}/:userId`, ({request}) => {
            reads.push(new URL(request.url).pathname)
            return HttpResponse.json(federated)
        }), http.get(`${BASE}/:userId/profiles`, () => HttpResponse.json([])))
        const {router} = renderRoute('/usuarios/f%3Aldap%3Aana', {session: loginAs('usuarios.lector')})

        expect(await screen.findByRole('heading', {name: 'ana', level: 2})).toBeInTheDocument()
        expect(reads).toEqual(['/api/users/f%3Aldap%3Aana'])
        expect(router.state.location.pathname).toBe('/usuarios/f%3Aldap%3Aana')
    })

    it('quien solo lee ve la ficha sin ninguna acción y sin pedir los catálogos', async () => {
        const {user: person, counts} = await openDetail(loginAs('usuarios.lector'))

        for (const name of ['Modificar', 'Desactivar', 'Contraseña temporal', 'Acciones por correo', 'Sacar a la persona', 'Borrar']) {
            expect(screen.queryByRole('button', {name})).not.toBeInTheDocument()
        }
        expect(screen.getByRole('button', {name: 'Volver a la lista'})).toBeInTheDocument()
        await waitFor(() => expect(firstColumn('Perfiles asignados')).toEqual(['mto-users-viewer']))
        expect(screen.queryByRole('combobox', {name: 'Perfil'})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Quitar el perfil mto-users-viewer'})).not.toBeInTheDocument()
        await openTab(person, 'Roles de cliente')
        await waitFor(() => expect(rows('Roles de cliente asignados')).toHaveLength(1))
        expect(screen.queryByRole('combobox', {name: 'Cliente'})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Quitar el rol users-read de mto-users-api'})).not.toBeInTheDocument()
        expect(counts).toMatchObject({catalogue: 0, clients: 0})
    })

    it('cada acción de la ficha pide su propio permiso', async () => {
        const session = sessionWith([P.USERS_READ, P.USERS_PASSWORD_RESET, P.USERS_PROFILES_WRITE, P.USERS_DELETE])
        const {user: person} = await openDetail(session)

        expect(screen.getByRole('button', {name: 'Contraseña temporal'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Borrar'})).toBeInTheDocument()
        for (const name of ['Modificar', 'Desactivar', 'Acciones por correo', 'Sacar a la persona']) {
            expect(screen.queryByRole('button', {name})).not.toBeInTheDocument()
        }
        expect(await screen.findByRole('combobox', {name: 'Perfil'})).toBeInTheDocument()
        await openTab(person, 'Roles de cliente')
        await waitFor(() => expect(rows('Roles de cliente asignados')).toHaveLength(1))
        expect(screen.queryByRole('combobox', {name: 'Cliente'})).not.toBeInTheDocument()
    })

    it('asignar y quitar un perfil pintan lo que devuelve el servicio, sin volver a pedirlo', async () => {
        const changes = []
        server.use(
            http.put(`${BASE}/${ANA_ID}/profiles/mto-users-manager`, async ({request}) => {
                changes.push(['PUT', await request.text()])
                return HttpResponse.json([VIEWER, MANAGER])
            }),
            http.delete(`${BASE}/${ANA_ID}/profiles/mto-users-viewer`, () => {
                changes.push(['DELETE'])
                return HttpResponse.json([MANAGER])
            }),
        )
        const {user: person, counts} = await openDetail(sessionWith([P.USERS_READ, P.USERS_PROFILES_WRITE]))
        await waitFor(() => expect(firstColumn('Perfiles asignados')).toEqual(['mto-users-viewer']))

        const assign = screen.getByRole('button', {name: 'Asignar'})
        expect(assign).toBeDisabled()
        await person.click(screen.getByRole('combobox', {name: 'Perfil'}))
        expect((await screen.findAllByRole('option')).map((option) => option.textContent))
            .toEqual(['mto-users-manager (Gestión de usuarios)', 'mto-users-admin'])
        await person.click(screen.getByRole('option', {name: 'mto-users-manager (Gestión de usuarios)'}))
        await person.click(assign)

        expect(await screen.findByText('Perfil mto-users-manager asignado')).toBeInTheDocument()
        expect(firstColumn('Perfiles asignados')).toEqual(['mto-users-viewer', 'mto-users-manager'])
        await person.click(screen.getByRole('combobox', {name: 'Perfil'}))
        expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['mto-users-admin'])
        await person.keyboard('{Escape}')

        await person.click(screen.getByRole('button', {name: 'Quitar el perfil mto-users-viewer'}))
        expect(await screen.findByText('Perfil mto-users-viewer quitado')).toBeInTheDocument()
        expect(firstColumn('Perfiles asignados')).toEqual(['mto-users-manager'])
        expect(changes).toEqual([['PUT', ''], ['DELETE']])
        expect(counts.profiles).toBe(1)
    })

    it('los roles de cliente se añaden con un PUT y se quitan con un DELETE con cuerpo, pintando la respuesta', async () => {
        const puts = recordWrites('put', `${BASE}/${ANA_ID}/roles/clients/mto-users-api`, () => HttpResponse.json(anaRoles('users-read', 'users-write')))
        const deletes = recordWrites('delete', `${BASE}/${ANA_ID}/roles/clients/mto-users-api`, () => HttpResponse.json(anaRoles('users-write')))
        const {user: person, counts} = await openDetail(sessionWith([P.USERS_READ, P.USERS_ROLES_WRITE]))
        await openTab(person, 'Roles de cliente')
        await waitFor(() => expect(rows('Roles de cliente asignados')).toHaveLength(1))

        expect(screen.getByRole('combobox', {name: 'Roles'})).toBeDisabled()
        await person.click(screen.getByRole('combobox', {name: 'Cliente'}))
        expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['MTO Users API', 'mto-configuration-api'])
        await person.click(screen.getByRole('option', {name: 'MTO Users API'}))
        await waitFor(() => expect(counts.clientRoles).toBe(1))
        await person.click(screen.getByRole('combobox', {name: 'Roles'}))
        expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['users-write', 'users-delete'])
        expect(screen.getByRole('button', {name: 'Asignar'})).toBeDisabled()
        await person.click(screen.getByRole('option', {name: 'users-write'}))
        await person.keyboard('{Escape}')
        await person.click(screen.getByRole('button', {name: 'Asignar'}))

        expect(await screen.findByText('Rol users-write asignado')).toBeInTheDocument()
        expect(puts.map((request) => request.body)).toEqual([{roles: ['users-write']}])
        expect(rows('Roles de cliente asignados')).toEqual([['mto-users-api', 'users-read'], ['mto-users-api', 'users-write']])

        await person.click(screen.getByRole('button', {name: 'Quitar el rol users-read de mto-users-api'}))
        expect(await screen.findByText('Rol users-read quitado')).toBeInTheDocument()
        expect(deletes.map((request) => request.body)).toEqual([{roles: ['users-read']}])
        expect(rows('Roles de cliente asignados')).toEqual([['mto-users-api', 'users-write']])
        expect(counts.roles).toBe(1)
    })

    it('la contraseña es temporal por defecto, obligatoria y de 8 o más; después se releen la cabecera y las credenciales', async () => {
        const resets = recordWrites('post', `${BASE}/${ANA_ID}/reset-password`, () => new HttpResponse(null, {status: 204}))
        const {user: person, counts} = await openDetail(loginAs('usuarios.gestor'))

        await person.click(screen.getByRole('button', {name: 'Contraseña temporal'}))
        const dialog = await screen.findByRole('dialog', {name: 'Contraseña para ana'})
        expect(within(dialog).getByRole('checkbox', {name: 'Temporal: la persona tiene que cambiarla al entrar'})).toBeChecked()
        await person.click(within(dialog).getByRole('button', {name: 'Fijar contraseña'}))
        expect(await within(dialog).findByText('La contraseña es obligatoria')).toBeInTheDocument()
        const password = within(dialog).getByLabelText('Contraseña nueva', {exact: false})
        await person.type(password, 'corta')
        await person.click(within(dialog).getByRole('button', {name: 'Fijar contraseña'}))
        expect(await within(dialog).findByText('Al menos 8 caracteres')).toBeInTheDocument()
        expect(resets).toHaveLength(0)

        await person.clear(password)
        await person.type(password, 'Temporal-2026')
        await person.click(within(dialog).getByRole('button', {name: 'Fijar contraseña'}))

        expect(await screen.findByText('Contraseña fijada para ana (temporal)')).toBeInTheDocument()
        expect(resets.map((request) => request.body)).toEqual([{password: 'Temporal-2026', temporary: true}])
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        await waitFor(() => expect(counts.user).toBe(2))
        expect(counts.credentials).toBe(0)
    })

    it('la política de contraseñas del realm (un KC-400 sin errores por campo) cae en el campo de la contraseña', async () => {
        server.use(http.post(`${BASE}/${ANA_ID}/reset-password`, () => problem(400, {
            status: 400, title: 'Bad Request', detail: 'Invalid password: must contain at least 1 numerical digits.', errorCode: 'KC-400',
            correlationId: 'corr-u5',
        })))
        const {user: person} = await openDetail(loginAs('usuarios.gestor'))

        await person.click(screen.getByRole('button', {name: 'Contraseña temporal'}))
        const dialog = await screen.findByRole('dialog', {name: 'Contraseña para ana'})
        await person.click(within(dialog).getByRole('checkbox', {name: 'Temporal: la persona tiene que cambiarla al entrar'}))
        const password = within(dialog).getByLabelText('Contraseña nueva', {exact: false})
        await person.type(password, 'sinDigitosAqui')
        await person.click(within(dialog).getByRole('button', {name: 'Fijar contraseña'}))

        expect(await within(dialog).findByText('Keycloak ha rechazado la petición. Invalid password: must contain at least 1 numerical digits.'))
            .toBeInTheDocument()
        // PasswordInput marca el error con data-invalid, no con aria-invalid.
        expect(password).toHaveAttribute('data-invalid', 'true')
        expect(screen.getByRole('dialog', {name: 'Contraseña para ana'})).toBeInTheDocument()
    })

    it('el correo de acciones exige una acción y una validez de 60 s o nada, y un 502 se dice con su detalle', async () => {
        const emails = recordWrites('post', `${BASE}/${ANA_ID}/execute-actions-email`, (_body, count) => (count === 1
            ? problem(502, {
                status: 502, title: 'Bad Gateway', detail: 'Keycloak no ha podido enviar el correo: SMTP no configurado en el realm',
                errorCode: 'KC-502', correlationId: 'corr-u6',
            })
            : new HttpResponse(null, {status: 202})))
        const {user: person} = await openDetail(loginAs('usuarios.gestor'))

        await person.click(screen.getByRole('button', {name: 'Acciones por correo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Correo de acciones para ana'})
        expect(dialog).toHaveTextContent('Keycloak manda a ana@mto.local un enlace con las acciones elegidas')
        await person.click(within(dialog).getByRole('button', {name: 'Enviar'}))
        expect(await within(dialog).findByText('Elige al menos una acción')).toBeInTheDocument()
        await choose(person, dialog, 'Acciones', 'Cambiar la contraseña')
        await person.keyboard('{Escape}')
        await person.type(within(dialog).getByRole('textbox', {name: 'Validez del enlace (segundos)'}), '30')
        await person.click(within(dialog).getByRole('button', {name: 'Enviar'}))
        expect(await within(dialog).findByText('Al menos 60 segundos')).toBeInTheDocument()
        expect(emails).toHaveLength(0)

        await typeInto(person, dialog, 'Validez del enlace (segundos)', '3600')
        await person.click(within(dialog).getByRole('button', {name: 'Enviar'}))
        expect(await screen.findByText('El servicio no ha podido completar la operación. Keycloak no ha podido enviar el correo: SMTP no configurado en el realm'))
            .toBeInTheDocument()
        expect(screen.getByText('Referencia: corr-u6')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Correo de acciones para ana'})).toBeInTheDocument()

        await person.click(within(dialog).getByRole('button', {name: 'Enviar'}))
        expect(await screen.findByText('Correo enviado a ana@mto.local')).toBeInTheDocument()
        expect(emails.map((request) => request.body)).toEqual([
            {actions: ['UPDATE_PASSWORD'], lifespanSeconds: 3600}, {actions: ['UPDATE_PASSWORD'], lifespanSeconds: 3600}])
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('sin email no se puede mandar el correo de acciones', async () => {
        const {user: person} = await openDetail(loginAs('usuarios.gestor'), threeUsers()[2])

        await person.click(screen.getByRole('button', {name: 'Acciones por correo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Correo de acciones para carla'})
        expect(dialog).toHaveTextContent('El usuario no tiene email: Keycloak no tiene a quién mandar el enlace.')
        expect(within(dialog).getByRole('button', {name: 'Enviar'})).toBeDisabled()
    })

    it('modificar desde la ficha pinta lo que devuelve el servicio, sin volver a pedir la cabecera', async () => {
        const updates = recordWrites('put', `${BASE}/${ANA_ID}`, () => HttpResponse.json(ana({lastName: 'Alvarez Arias'})))
        const {user: person, counts} = await openDetail(loginAs('usuarios.gestor'))

        await person.click(screen.getByRole('button', {name: 'Modificar'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar usuario ana'})
        await typeInto(person, dialog, 'Apellidos', 'Alvarez Arias')
        await person.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        expect(await screen.findByText('Ana Alvarez Arias · ana@mto.local · creado el 01/09/2026 10:30')).toBeInTheDocument()
        expect(updates.map((request) => request.body)).toEqual([{lastName: 'Alvarez Arias'}])
        expect(counts.user).toBe(1)
    })

    it('desactivar desde la ficha repinta la insignia y el botón, sin confirmación', async () => {
        const patches = recordWrites('patch', `${BASE}/${ANA_ID}/enabled`, (body) => HttpResponse.json(ana({enabled: body.enabled})))
        const {user: person} = await openDetail(loginAs('usuarios.gestor'))

        await person.click(screen.getByRole('button', {name: 'Desactivar'}))

        expect(await screen.findByText('Desactivado ana')).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(patches.map((request) => request.body)).toEqual([{enabled: false}])
        expect(screen.getByText('Desactivado', {selector: '.mantine-Badge-label'})).toBeInTheDocument()
        expect(screen.getByRole('button', {name: 'Activar'})).toBeInTheDocument()
    })

    it('borrar desde la ficha confirma y vuelve a la lista', async () => {
        serveUsers(threeUsers().slice(1))
        const deletes = recordWrites('delete', `${BASE}/${ANA_ID}`, () => new HttpResponse(null, {status: 204}))
        const {user: person, router, counts} = await openDetail(loginAs('usuarios.responsable'))

        await person.click(screen.getByRole('button', {name: 'Borrar'}))
        const confirm = await screen.findByRole('dialog', {name: 'Borrar usuario ana'})
        expect(deletes).toHaveLength(0)
        await person.click(within(confirm).getByRole('button', {name: 'Borrar'}))

        expect(await screen.findByText('Borrado ana')).toBeInTheDocument()
        await waitFor(() => expect(router.state.location.pathname).toBe('/usuarios'))
        await waitFor(() => expect(firstColumn('Usuarios')).toEqual(['bruno', 'carla']))
        expect(deletes).toHaveLength(1)
        expect(counts.user).toBe(1)
    })
})

describe('sesiones, credenciales y «sacar a la persona»', () => {
    it('la pestaña de sesiones lista las dos clases al abrirse, y cerrarlas pide su permiso', async () => {
        const {user: person, counts} = await openDetail(loginAs('usuarios.lector'))
        expect(counts.sessions).toBe(0)

        await openTab(person, 'Sesiones')

        await waitFor(() => expect(rows('Sesiones')).toHaveLength(2))
        expect(rows('Sesiones')[0]).toEqual(['21/09/2026 09:00', '21/09/2026 09:45', '10.0.0.7', 'mto-backoffice'])
        expect(rows('Sesiones')[1]).toEqual(['21/09/2026 10:00', '', '10.0.0.8', 'mto-frontend, mto-gateway'])
        expect(rows('Sesiones offline')).toEqual([['01/09/2026 11:00', '20/09/2026 11:00', '', 'mto-frontend']])
        expect(screen.getByText('2 sesiones')).toBeInTheDocument()
        expect(screen.getByText('1 sesión offline')).toBeInTheDocument()
        expect(counts).toMatchObject({sessions: 1, offline: 1})
        expect(screen.queryByRole('button', {name: /^Cerrar la sesión/})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Cerrar todas las sesiones'})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Revocar todas las sesiones offline'})).not.toBeInTheDocument()
    })

    it('una sesión se cierra sin preguntar y todas con confirmación, en las dos clases; cada cierre relee las dos listas', async () => {
        const deletes = recordWrites('delete', `${BASE}/${ANA_ID}/*`, () => new HttpResponse(null, {status: 204}))
        const {user: person, counts} = await openDetail(sessionWith([P.USERS_READ, P.USERS_SESSIONS_WRITE]))
        await openTab(person, 'Sesiones')
        await waitFor(() => expect(rows('Sesiones')).toHaveLength(2))

        await person.click(screen.getByRole('button', {name: 'Cerrar la sesión de 10.0.0.7 (21/09/2026 09:00)'}))
        expect(await screen.findByText('Sesión cerrada')).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        await waitFor(() => expect(counts).toMatchObject({sessions: 2, offline: 2}))

        await person.click(screen.getByRole('button', {name: 'Cerrar todas las sesiones'}))
        let confirm = await screen.findByRole('dialog', {name: 'Cerrar todas las sesiones'})
        expect(confirm).toHaveTextContent('Las sesiones offline no se tocan.')
        expect(deletes).toHaveLength(1)
        await person.click(within(confirm).getByRole('button', {name: 'Cerrar todas'}))
        expect(await screen.findByText('Sesiones cerradas')).toBeInTheDocument()

        await person.click(screen.getByRole('button', {name: 'Revocar la sesión offline de IP desconocida (01/09/2026 11:00)'}))
        expect(await screen.findByText('Sesión offline revocada')).toBeInTheDocument()

        await person.click(screen.getByRole('button', {name: 'Revocar todas las sesiones offline'}))
        confirm = await screen.findByRole('dialog', {name: 'Revocar todas las sesiones offline'})
        await person.click(within(confirm).getByRole('button', {name: 'Revocar todas'}))
        expect(await screen.findByText('Sesiones offline revocadas')).toBeInTheDocument()

        expect(deletes.map((request) => request.path.replace(`${BASE}/${ANA_ID}/`, ''))).toEqual([
            'sessions/s1', 'sessions', 'offline-sessions/o1', 'offline-sessions'])
        await waitFor(() => expect(counts).toMatchObject({sessions: 5, offline: 5}))
    })

    it('una sesión que no es de esta persona se avisa así, y las listas se releen igual', async () => {
        server.use(http.delete(`${BASE}/${ANA_ID}/sessions/s1`, () => problem(404, {
            status: 404, title: 'Not Found', detail: 'Session s1 does not belong to user', errorCode: 'SES-404', correlationId: 'corr-u7',
        })))
        const {user: person, counts} = await openDetail(sessionWith([P.USERS_READ, P.USERS_SESSIONS_WRITE]))
        await openTab(person, 'Sesiones')
        await waitFor(() => expect(rows('Sesiones')).toHaveLength(2))

        await person.click(screen.getByRole('button', {name: 'Cerrar la sesión de 10.0.0.7 (21/09/2026 09:00)'}))

        expect(await screen.findByText('Esa sesión ya no existe o no es de este usuario.')).toBeInTheDocument()
        expect(screen.getByText('Referencia: corr-u7')).toBeInTheDocument()
        await waitFor(() => expect(counts).toMatchObject({sessions: 2, offline: 2}))
    })

    it('quitar una credencial avisa de lo que supone y después llama; la lista se relee', async () => {
        const deletes = recordWrites('delete', `${BASE}/${ANA_ID}/credentials/*`, () => new HttpResponse(null, {status: 204}))
        const {user: person, counts} = await openDetail(sessionWith([P.USERS_READ, P.USERS_CREDENTIALS_WRITE]))
        await openTab(person, 'Credenciales')

        await waitFor(() => expect(rows('Credenciales')).toHaveLength(2))
        expect(rows('Credenciales')).toEqual([['Contraseña', '', '01/09/2026 10:30'], ['Segundo factor (OTP)', 'Móvil', '02/09/2026 10:30']])

        await person.click(screen.getByRole('button', {name: 'Quitar Contraseña'}))
        let confirm = await screen.findByRole('dialog', {name: 'Quitar Contraseña'})
        expect(confirm).toHaveTextContent('Sin contraseña la persona no podrá entrar hasta que alguien le fije una temporal.')
        expect(deletes).toHaveLength(0)
        await person.click(within(confirm).getByRole('button', {name: 'Quitar'}))
        expect(await screen.findByText('Credencial quitada: Contraseña')).toBeInTheDocument()
        await waitFor(() => expect(counts.credentials).toBe(2))

        await person.click(screen.getByRole('button', {name: 'Quitar Segundo factor (OTP) (Móvil)'}))
        confirm = await screen.findByRole('dialog', {name: 'Quitar Segundo factor (OTP)'})
        expect(confirm).toHaveTextContent('Se quita Segundo factor (OTP) (Móvil); la persona sigue entrando con lo demás.')
        await person.click(within(confirm).getByRole('button', {name: 'Cancelar'}))
        expect(deletes.map((request) => request.path)).toEqual([`${BASE}/${ANA_ID}/credentials/c1`])
    })

    it('quien solo lee ve las credenciales sin la papelera', async () => {
        const {user: person} = await openDetail(loginAs('usuarios.lector'))
        await openTab(person, 'Credenciales')

        await waitFor(() => expect(rows('Credenciales')).toHaveLength(2))
        expect(screen.queryByRole('button', {name: /^Quitar /})).not.toBeInTheDocument()
    })

    it('«Sacar a la persona» pide users-write y users-sessions-write a la vez', async () => {
        await openDetail(sessionWith([P.USERS_READ, P.USERS_WRITE, P.USERS_DELETE, P.USERS_PASSWORD_RESET]))

        expect(screen.getByRole('button', {name: 'Modificar'})).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Sacar a la persona'})).not.toBeInTheDocument()
    })

    it('sacar a alguien son tres llamadas en su orden; después se releen la cabecera y las sesiones abiertas', async () => {
        const calls = []
        const logged = (respond) => async ({request}) => {
            calls.push(`${request.method} ${new URL(request.url).pathname.replace(`${BASE}/${ANA_ID}`, '')} ${await request.text()}`.trim())
            return respond()
        }
        server.use(
            http.patch(`${BASE}/${ANA_ID}/enabled`, logged(() => HttpResponse.json(ana({enabled: false})))),
            http.delete(`${BASE}/${ANA_ID}/sessions`, logged(() => new HttpResponse(null, {status: 204}))),
            http.delete(`${BASE}/${ANA_ID}/offline-sessions`, logged(() => new HttpResponse(null, {status: 204}))),
        )
        const counts = serveDetail(ana())
        server.use(http.get(`${BASE}/${ANA_ID}`, () => {
            counts.user += 1
            return HttpResponse.json(ana({enabled: counts.user > 1 ? false : true}))
        }))
        const {user: person} = renderRoute(ANA_PATH, {session: loginAs('usuarios.gestor')})
        expect(await screen.findByRole('heading', {name: 'ana', level: 2})).toBeInTheDocument()
        await openTab(person, 'Sesiones')
        await waitFor(() => expect(counts.sessions).toBe(1))

        await person.click(screen.getByRole('button', {name: 'Sacar a la persona'}))
        const confirm = await screen.findByRole('dialog', {name: 'Sacar a ana'})
        expect(confirm).toHaveTextContent('Se desactiva, se cierran sus sesiones y se revocan sus sesiones offline, en ese orden.')
        expect(calls).toEqual([])
        await person.click(within(confirm).getByRole('button', {name: 'Sacar'}))

        expect(await screen.findByText('ana fuera: desactivado, sesiones cerradas y sesiones offline revocadas')).toBeInTheDocument()
        expect(calls).toEqual(['PATCH /enabled {"enabled":false}', 'DELETE /sessions', 'DELETE /offline-sessions'])
        expect(await screen.findByText('Desactivado', {selector: '.mantine-Badge-label'})).toBeInTheDocument()
        await waitFor(() => expect(counts).toMatchObject({sessions: 2, offline: 2}))
    })

    it('sacar a alguien para en el primer fallo y dice qué paso falló, lo hecho y por qué, con su referencia', async () => {
        const calls = []
        server.use(
            http.patch(`${BASE}/${ANA_ID}/enabled`, () => {
                calls.push('disable')
                return HttpResponse.json(ana({enabled: false}))
            }),
            http.delete(`${BASE}/${ANA_ID}/sessions`, () => {
                calls.push('sessions')
                return problem(503, {status: 503, title: 'Service Unavailable', detail: 'Keycloak no responde', errorCode: 'KC-503',
                    correlationId: 'corr-u8'}, {'Retry-After': '10'})
            }),
            http.delete(`${BASE}/${ANA_ID}/offline-sessions`, () => {
                calls.push('offline')
                return new HttpResponse(null, {status: 204})
            }),
        )
        // Las sesiones no se abren: si «sacar» las releyera sin su pestaña, la llamada no tendría manejador.
        const {user: person} = await openDetail(loginAs('usuarios.gestor'))

        await person.click(screen.getByRole('button', {name: 'Sacar a la persona'}))
        await person.click(within(await screen.findByRole('dialog', {name: 'Sacar a ana'})).getByRole('button', {name: 'Sacar'}))

        expect(await screen.findByText('No se ha podido sacar a ana: fallo al cerrar las sesiones (hecho: desactivar). '
            + 'El servicio no está disponible ahora mismo. Inténtalo en 10 s.')).toBeInTheDocument()
        expect(screen.getByText('Referencia: corr-u8')).toBeInTheDocument()
        expect(calls).toEqual(['disable', 'sessions'])
    })
})

describe('los catálogos de perfiles y de roles de cliente', () => {
    it('el de perfiles enseña lo que concede uno y pasea sus miembros sin total; el filtro es local y quita la selección', async () => {
        const admins = Array.from({length: 53}, (_, index) => user(`admin-${index}`, `admin${String(index).padStart(2, '0')}`, 'Admin',
            String(index), null, true))
        const members = []
        let catalogueReads = 0
        server.use(
            http.get(`${BASE}/profiles`, () => {
                catalogueReads += 1
                return HttpResponse.json([VIEWER, MANAGER, ADMIN])
            }),
            http.get(`${BASE}/profiles/mto-users-admin`, () => HttpResponse.json({
                name: 'mto-users-admin', description: 'Todo sobre usuarios', realmRoles: ['default-roles-mto'],
                clientRoles: [{clientId: 'mto-users-api', roles: ['users-read', 'users-write', 'users-delete']}],
            })),
            http.get(`${BASE}/profiles/mto-users-admin/users`, ({request}) => {
                const url = new URL(request.url)
                members.push(url.search)
                const first = Number(url.searchParams.get('first'))
                return HttpResponse.json(admins.slice(first, first + Number(url.searchParams.get('max'))))
            }),
        )
        const {user: person} = renderRoute('/usuarios/perfiles', {session: loginAs('usuarios.lector')})

        await waitFor(() => expect(firstColumn('Perfiles')).toEqual(['mto-users-viewer', 'mto-users-manager', 'mto-users-admin']))
        expect(screen.getByText('3 perfiles')).toBeInTheDocument()
        expect(screen.getByText('Elige un perfil para ver lo que concede y quién lo tiene.')).toBeInTheDocument()

        await person.click(screen.getByRole('button', {name: 'Ver mto-users-admin'}))
        expect(await screen.findByRole('heading', {name: 'mto-users-admin', level: 3})).toBeInTheDocument()
        expect(rows('Lo que concede mto-users-admin')).toEqual([
            ['mto-users-api', 'users-read'], ['mto-users-api', 'users-write'], ['mto-users-api', 'users-delete']])
        expect(screen.getByText('Roles de realm: default-roles-mto')).toBeInTheDocument()
        await waitFor(() => expect(firstColumn('Miembros de mto-users-admin')).toHaveLength(50))
        expect(members).toEqual(['?first=0&max=50'])
        const next = screen.getByRole('button', {name: 'Siguientes'})
        const previous = screen.getByRole('button', {name: 'Anteriores'})
        expect(next).toBeEnabled()
        expect(previous).toBeDisabled()
        expect(screen.getByText('Página 1')).toBeInTheDocument()

        await person.click(next)
        await waitFor(() => expect(firstColumn('Miembros de mto-users-admin')).toEqual(['admin50', 'admin51', 'admin52']))
        expect(members.at(-1)).toBe('?first=50&max=50')
        expect(screen.getByRole('button', {name: 'Siguientes'})).toBeDisabled()
        expect(screen.getByRole('button', {name: 'Anteriores'})).toBeEnabled()
        expect(screen.getByText('Página 2')).toBeInTheDocument()

        await person.click(screen.getByRole('button', {name: 'Anteriores'}))
        await waitFor(() => expect(firstColumn('Miembros de mto-users-admin')).toHaveLength(50))

        await person.type(screen.getByRole('textbox', {name: 'Filtrar por nombre o descripción'}), 'gestion')
        expect(firstColumn('Perfiles')).toEqual(['mto-users-manager'])
        expect(screen.getByText('1 de 3 perfiles')).toBeInTheDocument()
        expect(screen.queryByRole('table', {name: 'Miembros de mto-users-admin'})).not.toBeInTheDocument()
        expect(catalogueReads).toBe(1)
    })

    it('el de roles lista los de cada cliente y quién tiene uno; el filtro es local', async () => {
        let clientReads = 0
        const members = []
        server.use(
            http.get(`${BASE}/roles/clients`, () => {
                clientReads += 1
                return HttpResponse.json([USERS_API, CONFIGURATION_API])
            }),
            http.get(`${BASE}/roles/clients/mto-users-api`, () => HttpResponse.json([
                {name: 'users-read', description: 'Leer usuarios', composite: false},
                {name: 'users-write', description: 'Escribir usuarios', composite: false},
                {name: 'users-delete', description: null, composite: true},
            ])),
            http.get(`${BASE}/roles/clients/mto-users-api/users-read/users`, ({request}) => {
                members.push(new URL(request.url).search)
                return HttpResponse.json([threeUsers()[0], threeUsers()[1]])
            }),
        )
        const {user: person} = renderRoute('/usuarios/roles', {session: loginAs('usuarios.lector')})

        expect(await screen.findByText('Elige un cliente para ver sus roles.')).toBeInTheDocument()
        await person.click(screen.getByRole('combobox', {name: 'Cliente'}))
        expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['MTO Users API', 'mto-configuration-api'])
        await person.click(screen.getByRole('option', {name: 'MTO Users API'}))

        await waitFor(() => expect(firstColumn('Roles')).toEqual(['users-read', 'users-write', 'users-delete']))
        expect(screen.getByText('3 roles')).toBeInTheDocument()
        expect(rows('Roles')[0]).toEqual(['users-read', 'Leer usuarios', 'No'])
        expect(rows('Roles')[2]).toEqual(['users-delete', '', 'Sí'])

        await person.type(screen.getByRole('textbox', {name: 'Filtrar por nombre o descripción'}), 'write')
        expect(firstColumn('Roles')).toEqual(['users-write'])
        expect(screen.getByText('1 de 3 roles')).toBeInTheDocument()
        await person.clear(screen.getByRole('textbox', {name: 'Filtrar por nombre o descripción'}))
        expect(firstColumn('Roles')).toHaveLength(3)

        await person.click(screen.getByRole('button', {name: 'Ver quién tiene users-read'}))
        expect(await screen.findByRole('heading', {name: 'Miembros de mto-users-api / users-read'})).toBeInTheDocument()
        await waitFor(() => expect(firstColumn('Miembros de mto-users-api / users-read')).toEqual(['ana', 'bruno']))
        expect(members).toEqual(['?first=0&max=50'])
        expect(screen.getByRole('button', {name: 'Siguientes'})).toBeDisabled()
        expect(screen.getByRole('button', {name: 'Anteriores'})).toBeDisabled()
        expect(clientReads).toBe(1)
    })

    it('un miembro enlaza a su ficha', async () => {
        server.use(
            http.get(`${BASE}/roles/clients`, () => HttpResponse.json([USERS_API])),
            http.get(`${BASE}/roles/clients/mto-users-api`, () => HttpResponse.json([{name: 'users-read', description: null, composite: false}])),
            http.get(`${BASE}/roles/clients/mto-users-api/users-read/users`, () => HttpResponse.json([threeUsers()[0]])),
        )
        serveDetail(ana())
        const {user: person, router} = renderRoute('/usuarios/roles', {session: loginAs('usuarios.lector')})

        await choose(person, document.body, 'Cliente', 'MTO Users API')
        await person.click(await screen.findByRole('button', {name: 'Ver quién tiene users-read'}))
        await person.click(await screen.findByRole('link', {name: 'ana'}))

        expect(await screen.findByRole('heading', {name: 'ana', level: 2})).toBeInTheDocument()
        expect(router.state.location.pathname).toBe(ANA_PATH)
    })
})
