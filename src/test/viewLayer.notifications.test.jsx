import {act, screen, waitFor, within} from '@testing-library/react'
import {http, HttpResponse} from 'msw'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {buildMenu} from '../app/navigation.js'
import {P} from '../auth/permissions.js'
import {UNREAD_REFRESH_MS} from '../features/notifications/useNotifications.js'
import {renderRoute} from './render.jsx'
import {server} from './server.js'
import {loginAs, sessionWith} from './session.js'

/**
 * Las notificaciones y la actividad (notificaciones, actividad y actividad/accesos) con los casos de
 * notificaciones de ViewLayerTest del backoffice: la campana con su número, cada 30 s y tras su
 * permiso; el menú con cada pantalla tras el suyo; la bandeja que abre con las no leídas, filtra y
 * ordena en el servicio; abrir una notificación, que la marca antes de seguir su enlace con sus
 * filtros; marcar todas; el NTF-404; la línea del registro detrás de una notificación; el registro
 * filtrado y ordenado en el servicio sin ofrecer los accesos; y los accesos desde el enlace de una regla.
 * Y lo que el backoffice no hacía: el detalle de una línea pide su payload, que la lista no trae; un
 * enlace absoluto se abre en otra pestaña y uno de otro esquema no abre nada; una notificación de
 * accesos no ofrece la línea del registro; una IP a medio escribir no se pide; y los filtros de la URL
 * que no se conocen se ignoran.
 */

const BASE = '/api/notifications'

const N1 = '5e6f7a8b-0000-4000-8000-000000000501'
const N2 = '5e6f7a8b-0000-4000-8000-000000000502'
const EVENT1 = '5e6f7a8b-0000-4000-8000-000000000511'
const EVENT2 = '5e6f7a8b-0000-4000-8000-000000000512'
const ORDER1 = '5e6f7a8b-0000-4000-8000-000000000521'
const AT = '2026-09-28T06:07:00Z'

function notification(id, title, link, read, severity, category, extra = {}) {
    return {
        id, ruleKey: `rule-${id}`, category, severity, title, body: `Detalle de ${title}`, link, subjectType: 'order', subjectId: 'MO-000012',
        activityEventId: EVENT1, createdAt: AT, read, readAt: read ? '2026-09-28T07:07:00Z' : null, ...extra,
    }
}

function activityEvent(id, category, type, severity, extra = {}) {
    return {
        id, seq: 118, sourceService: 'mto-maintenance', sourceEventId: 'f0000000-0000-4000-8000-000000000001', category, type, severity,
        occurredAt: AT, recordedAt: '2026-09-28T06:07:01Z', actor: {kind: 'PERSON', username: 'mantenimiento.tecnico', id: 'a-1'},
        subject: {type: 'order', id: 'MO-000012', label: null}, correlationId: 'corr-1', eventCount: 1, payload: null, supersededBy: null,
        ...extra,
    }
}

function accessEvent(id, type, outcome, severity, count) {
    return {
        id, seq: 7, type, severity, outcome, occurredAt: AT, recordedAt: '2026-09-28T06:07:20Z', username: 'config.lector', userId: 'a-41',
        ipAddress: '10.0.0.7', correlationId: null, eventCount: count, payload: {error: 'invalid_user_credentials'},
    }
}

/** El JSON de error de mto-notification, el de mto-maintenance. */
function notificationError(status, errorCode, message) {
    return HttpResponse.json({
        timestamp: AT, status, error: 'ERROR', message, path: '/api/v1/notifications', method: 'GET', errorCode,
        correlationId: `corr-${errorCode}`, validationErrors: [],
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

/**
 * mto-notification en el gateway simulado: la bandeja filtra por lo que recibe, el contador responde lo
 * que toca en cada vuelta (el último se repite), las marcas responden la notificación leída, el registro
 * y los accesos devuelven sus filas y el detalle, la línea de cada id. Cada petición queda apuntada.
 */
function serveNotifications({
    inbox = [], unread = [{count: 0, capped: false}], activity = [], events = {}, access = [], markRead = null,
} = {}) {
    const requests = []
    let unreadCalls = 0
    const note = async (request) => {
        const url = new URL(request.url)
        requests.push({method: request.method, path: url.pathname, url, body: request.method === 'GET' ? null : await request.text()})
        return url
    }
    server.use(
        http.get(`${BASE}/inbox/unread-count`, async ({request}) => {
            await note(request)
            const answer = unread[Math.min(unreadCalls, unread.length - 1)]
            unreadCalls += 1
            return typeof answer === 'function' ? answer() : HttpResponse.json(answer)
        }),
        http.get(`${BASE}/inbox`, async ({request}) => {
            const url = await note(request)
            const unreadOnly = url.searchParams.get('unread') === 'true'
            const category = url.searchParams.get('category')
            const severity = url.searchParams.get('severity')
            const rows = inbox.filter((item) => (!unreadOnly || !item.read) && (!category || item.category === category)
                && (!severity || item.severity === severity))
            return HttpResponse.json(pageOf(rows, url))
        }),
        http.post(`${BASE}/inbox/read-all`, async ({request}) => {
            await note(request)
            return HttpResponse.json({allReadUntil: AT})
        }),
        http.post(`${BASE}/inbox/:id/read`, async ({request, params}) => {
            await note(request)
            if (markRead) {
                return markRead(params.id)
            }
            const item = inbox.find((candidate) => candidate.id === params.id)
            return HttpResponse.json({...item, read: true, readAt: '2026-09-28T06:08:00Z'})
        }),
        http.get(`${BASE}/activity`, async ({request}) => HttpResponse.json(pageOf(activity, await note(request)))),
        http.get(`${BASE}/activity/:id`, async ({request, params}) => {
            await note(request)
            return events[params.id]
                ? HttpResponse.json(events[params.id])
                : notificationError(404, 'ACT-404', `Activity event with id ${params.id} was not found`)
        }),
        http.get(`${BASE}/access`, async ({request}) => HttpResponse.json(pageOf(access, await note(request)))),
    )
    return requests
}

const requestsTo = (requests, path, method = 'GET') => requests.filter((request) => request.path === `${BASE}${path}` && request.method === method)
const lastTo = (requests, path) => requestsTo(requests, path).at(-1)

function bell(name) {
    return screen.getByRole('link', {name})
}

function table(name) {
    return screen.getByRole('table', {name})
}

/** Las filas con datos de una tabla, sin la cabecera ni la de «cargando». */
function dataRows(name) {
    return within(table(name)).getAllByRole('row').slice(1).filter((row) => within(row).queryAllByRole('cell').length > 1)
}

function cells(row) {
    return within(row).getAllByRole('cell').map((cell) => cell.textContent)
}

function rowOf(name, text) {
    return dataRows(name).find((row) => cells(row).some((cell) => cell.includes(text)))
}

async function choose(user, label, option) {
    await user.click(screen.getByRole('combobox', {name: label}))
    await user.click(await screen.findByRole('option', {name: option}))
}

afterEach(() => {
    vi.useRealTimers()
})

describe('la campana', () => {
    it('dice cuántas hay sin leer y abre la bandeja', async () => {
        serveNotifications({unread: [{count: 3, capped: false}], inbox: [notification(N1, 'Una', null, false, 'INFO', 'MAINTENANCE')]})
        const session = loginAs('mantenimiento.tecnico')
        const {user, router} = renderRoute('/', {session})

        const opened = await screen.findByRole('link', {name: 'Notificaciones: 3 sin leer'})
        const labels = buildMenu(session).flatMap((item) => [item.label, ...(item.children ?? []).map((child) => child.label)])
        expect(labels).toContain('Notificaciones')
        expect(labels).not.toContain('Registro de actividad')
        expect(labels).not.toContain('Accesos')

        await user.click(opened)
        expect(await screen.findByRole('heading', {name: 'Notificaciones', level: 2})).toBeInTheDocument()
        expect(router.state.location.pathname).toBe('/notificaciones')
    })

    it('solo la tiene quien puede leer su bandeja: un rol de realm con su nombre no la da', async () => {
        const requests = serveNotifications()
        const session = sessionWith([P.CONFIG_READ], {realmRoles: ['notification-inbox']})
        renderRoute('/notificaciones', {session})

        expect(await screen.findByText('No tienes permiso para abrir esta pantalla')).toBeInTheDocument()
        expect(screen.queryByRole('link', {name: /^Notificaciones/})).not.toBeInTheDocument()
        expect(requests).toEqual([])
        expect(buildMenu(session).some((item) => item.label === 'Notificaciones')).toBe(false)
    })

    it('sin nada sin leer no lleva número; se vuelve a pedir cada 30 s, y un fallo deja el número como estaba', async () => {
        vi.useFakeTimers({shouldAdvanceTime: true})
        const requests = serveNotifications({unread: [
            {count: 0, capped: false},
            {count: 100, capped: true},
            () => notificationError(503, 'NTF-503', 'Directory unavailable'),
        ]})
        renderRoute('/', {session: loginAs('almacen.responsable')})

        expect(await screen.findByRole('link', {name: 'Notificaciones: nada sin leer'})).toBeInTheDocument()
        expect(screen.queryByText('0')).not.toBeInTheDocument()

        await act(() => vi.advanceTimersByTimeAsync(UNREAD_REFRESH_MS))
        expect(await screen.findByRole('link', {name: 'Notificaciones: 100+ sin leer'})).toBeInTheDocument()
        expect(screen.getByText('100+')).toBeInTheDocument()

        await act(() => vi.advanceTimersByTimeAsync(UNREAD_REFRESH_MS))
        await waitFor(() => expect(requestsTo(requests, '/inbox/unread-count')).toHaveLength(3))
        expect(bell('Notificaciones: 100+ sin leer')).toBeInTheDocument()
        expect(screen.queryByText(/no está disponible/)).not.toBeInTheDocument()
    })
})

describe('el menú', () => {
    it('ofrece la bandeja, el registro y los accesos, cada uno con su permiso', () => {
        const session = loginAs('notificacion.auditor')
        const items = buildMenu(session)
        expect(items.some((item) => item.label === 'Notificaciones' && item.path === '/notificaciones')).toBe(true)
        const activity = items.find((item) => item.key === 'actividad')
        expect(activity.children.map((child) => [child.label, child.path])).toEqual([
            ['Registro de actividad', '/actividad'], ['Accesos', '/actividad/accesos']])
    })

    it('los accesos tienen su permiso aparte, que el registro no da', async () => {
        serveNotifications()
        const session = sessionWith([P.NOTIFICATION_ACTIVITY_READ])
        const activity = buildMenu(session).find((item) => item.key === 'actividad')
        expect(activity.children.map((child) => child.label)).toEqual(['Registro de actividad'])
        expect(buildMenu(session).some((item) => item.label === 'Notificaciones')).toBe(false)

        renderRoute('/actividad/accesos', {session})
        expect(await screen.findByText('No tienes permiso para abrir esta pantalla')).toBeInTheDocument()
        expect(screen.getByText('notification-access-read')).toBeInTheDocument()
    })

    it('un rol de realm llamado como un permiso no abre ni el registro ni los accesos', async () => {
        const requests = serveNotifications()
        const session = sessionWith([], {realmRoles: ['notification-activity-read', 'notification-access-read']})

        const first = renderRoute('/actividad', {session})
        expect(await screen.findByText('No tienes permiso para abrir esta pantalla')).toBeInTheDocument()
        first.unmount()
        renderRoute('/actividad/accesos', {session})
        expect(await screen.findByText('No tienes permiso para abrir esta pantalla')).toBeInTheDocument()
        expect(requests).toEqual([])
    })
})

describe('la bandeja', () => {
    const urgent = notification(N1, 'Orden urgente MO-000012', `/mantenimiento/ordenes/${ORDER1}`, false, 'CRITICAL', 'MAINTENANCE')
    const lowStock = notification(N2, 'Material GA70 bajo mínimo', '/almacen/materiales', true, 'WARNING', 'STOCK')

    it('abre con las no leídas y filtra y ordena en el servicio', async () => {
        const requests = serveNotifications({inbox: [urgent, {...lowStock, read: false}]})
        const {user} = renderRoute('/notificaciones', {session: loginAs('mantenimiento.responsable')})

        await waitFor(() => expect(dataRows('Notificaciones')).toHaveLength(2))
        expect(lastTo(requests, '/inbox').url.search).toBe('?unread=true&page=0&size=20&sort=createdAt%2Cdesc')
        const row = cells(rowOf('Notificaciones', 'Orden urgente MO-000012'))
        expect(row).toEqual(expect.arrayContaining(['Nueva', 'Crítica', 'Mantenimiento', 'Orden urgente MO-000012',
            'Detalle de Orden urgente MO-000012']))
        expect(screen.getByText('2 sin leer')).toBeInTheDocument()

        await user.click(screen.getByRole('checkbox', {name: 'Solo no leídas'}))
        await waitFor(() => expect(lastTo(requests, '/inbox').url.search).toBe('?page=0&size=20&sort=createdAt%2Cdesc'))
        expect(await screen.findByText('2 notificaciones')).toBeInTheDocument()

        await choose(user, 'Categoría', 'Almacén')
        await choose(user, 'Gravedad', 'Aviso')
        await waitFor(() => expect(lastTo(requests, '/inbox').url.search)
            .toBe('?category=STOCK&severity=WARNING&page=0&size=20&sort=createdAt%2Cdesc'))

        // Con una columna, createdAt desempata: el servicio no admite el id.
        await user.click(within(table('Notificaciones')).getByRole('button', {name: 'Gravedad'}))
        await waitFor(() => expect(lastTo(requests, '/inbox').url.searchParams.getAll('sort')).toEqual(['severity,asc', 'createdAt,desc']))
        expect(within(table('Notificaciones')).queryByRole('button', {name: 'Estado'})).not.toBeInTheDocument()
    })

    it('una leída lleva su marca vacía, y sin filtros ni nada sin leer lo dice', async () => {
        serveNotifications({inbox: [lowStock]})
        const {user} = renderRoute('/notificaciones', {session: loginAs('almacen.responsable')})

        expect(await screen.findByText('No tienes nada sin leer.')).toBeInTheDocument()
        expect(screen.getByText('0 sin leer')).toBeInTheDocument()
        await user.click(screen.getByRole('checkbox', {name: 'Solo no leídas'}))
        await waitFor(() => expect(dataRows('Notificaciones')).toHaveLength(1))
        expect(cells(dataRows('Notificaciones')[0])[0]).toBe('')
        expect(screen.getByText('1 notificación')).toBeInTheDocument()
    })

    it('abrir una notificación la marca, relee la campana y sigue su enlace con sus filtros', async () => {
        const stalled = notification(N1, 'Fuente parada', '/actividad?category=SYSTEM&type=system.source.stalled', false, 'CRITICAL', 'SYSTEM')
        const requests = serveNotifications({inbox: [stalled], unread: [{count: 1, capped: false}, {count: 0, capped: false}]})
        const {user, router} = renderRoute('/notificaciones', {session: loginAs('config.responsable')})

        expect(await screen.findByRole('link', {name: 'Notificaciones: 1 sin leer'})).toBeInTheDocument()
        await user.click(await screen.findByRole('button', {name: 'Abrir Fuente parada'}))

        await waitFor(() => expect(router.state.location.pathname).toBe('/actividad'))
        expect(requestsTo(requests, `/inbox/${N1}/read`, 'POST')).toHaveLength(1)
        expect(requestsTo(requests, `/inbox/${N1}/read`, 'POST')[0].body).toBe('')
        expect(await screen.findByRole('heading', {name: 'Registro de actividad', level: 2})).toBeInTheDocument()
        expect(screen.getByRole('combobox', {name: 'Categoría'})).toHaveValue('Sistema')
        expect(screen.getByRole('textbox', {name: 'Tipo'})).toHaveValue('system.source.stalled')
        await waitFor(() => expect(lastTo(requests, '/activity').url.search)
            .toBe('?category=SYSTEM&type=system.source.stalled&page=0&size=50&sort=occurredAt%2Cdesc&sort=seq%2Cdesc'))
        expect(await screen.findByRole('link', {name: 'Notificaciones: nada sin leer'})).toBeInTheDocument()
    })

    it('una leída no se vuelve a marcar, y marcar una sin enlace no abre nada', async () => {
        const alreadyRead = notification(N1, 'Ya leída', '/', true, 'INFO', 'CONFIGURATION')
        const withoutLink = notification(N2, 'Sin enlace', null, false, 'INFO', 'CONFIGURATION')
        const requests = serveNotifications({inbox: [alreadyRead, withoutLink]})
        const {user, router} = renderRoute('/notificaciones', {session: loginAs('config.lector')})
        await user.click(await screen.findByRole('checkbox', {name: 'Solo no leídas'}))
        await waitFor(() => expect(dataRows('Notificaciones')).toHaveLength(2))

        const readRow = within(rowOf('Notificaciones', 'Ya leída'))
        expect(readRow.queryByRole('button', {name: 'Marcar como leída Ya leída'})).not.toBeInTheDocument()
        expect(readRow.queryByRole('button', {name: /^Línea del registro/})).not.toBeInTheDocument()
        const unreadRow = within(rowOf('Notificaciones', 'Sin enlace'))
        expect(unreadRow.queryByRole('button', {name: 'Abrir Sin enlace'})).not.toBeInTheDocument()

        const listed = requestsTo(requests, '/inbox').length
        await user.click(unreadRow.getByRole('button', {name: 'Marcar como leída Sin enlace'}))
        await waitFor(() => expect(requestsTo(requests, `/inbox/${N2}/read`, 'POST')).toHaveLength(1))
        await waitFor(() => expect(requestsTo(requests, '/inbox').length).toBeGreaterThan(listed))
        expect(router.state.location.pathname).toBe('/notificaciones')

        await user.click(readRow.getByRole('button', {name: 'Abrir Ya leída'}))
        await waitFor(() => expect(router.state.location.pathname).toBe('/'))
        expect(requestsTo(requests, `/inbox/${N1}/read`, 'POST')).toHaveLength(0)
    })

    it('marcar todas va al servicio y relee la lista y la campana', async () => {
        const requests = serveNotifications({inbox: [notification(N1, 'Una', null, false, 'INFO', 'USERS')]})
        const {user} = renderRoute('/notificaciones', {session: loginAs('config.lector')})
        await waitFor(() => expect(dataRows('Notificaciones')).toHaveLength(1))
        const listed = requestsTo(requests, '/inbox').length
        const counted = requestsTo(requests, '/inbox/unread-count').length

        await user.click(screen.getByRole('button', {name: 'Marcar todas como leídas'}))

        expect(await screen.findByText('Todas las notificaciones quedan como leídas')).toBeInTheDocument()
        expect(requestsTo(requests, '/inbox/read-all', 'POST')).toHaveLength(1)
        expect(requestsTo(requests, '/inbox/read-all', 'POST')[0].body).toBe('')
        await waitFor(() => expect(requestsTo(requests, '/inbox').length).toBeGreaterThan(listed))
        await waitFor(() => expect(requestsTo(requests, '/inbox/unread-count').length).toBeGreaterThan(counted))
    })

    it('una notificación que ya no es mía se dice como tal y no se abre nada', async () => {
        serveNotifications({
            inbox: [notification(N1, 'Ajena', '/', false, 'INFO', 'USERS')],
            markRead: (id) => notificationError(404, 'NTF-404', `Notification ${id} is not addressed to config.lector`),
        })
        const {user, router} = renderRoute('/notificaciones', {session: loginAs('config.lector')})

        await user.click(await screen.findByRole('button', {name: 'Abrir Ajena'}))

        expect(await screen.findByText('Esa notificación ya no existe o no va dirigida a ti.')).toBeInTheDocument()
        expect(screen.getByText('Referencia: corr-NTF-404')).toBeInTheDocument()
        expect(router.state.location.pathname).toBe('/notificaciones')
    })

    it('la línea del registro que la causó se abre con su payload, y solo con activity-read', async () => {
        const created = activityEvent(EVENT1, 'MAINTENANCE', 'maintenance.order.created', 'CRITICAL',
            {payload: {type: 'URGENT', code: 'MO-000012'}})
        const login = notification(N2, 'Racha de fallos', '/actividad/accesos?username=config.lector', true, 'CRITICAL', 'ACCESS',
            {activityEventId: EVENT2})
        const requests = serveNotifications({
            inbox: [notification(N1, 'Orden urgente', null, true, 'CRITICAL', 'MAINTENANCE'), login],
            events: {[EVENT1]: created},
        })
        const {user} = renderRoute('/notificaciones', {session: loginAs('config.responsable')})
        await user.click(await screen.findByRole('checkbox', {name: 'Solo no leídas'}))
        await waitFor(() => expect(dataRows('Notificaciones')).toHaveLength(2))

        // Un acceso nunca sale por /activity: su línea sería siempre un 404.
        expect(within(rowOf('Notificaciones', 'Racha de fallos')).queryByRole('button', {name: /^Línea del registro/})).not.toBeInTheDocument()
        await user.click(within(rowOf('Notificaciones', 'Orden urgente')).getByRole('button', {name: 'Línea del registro de Orden urgente'}))

        const dialog = await screen.findByRole('dialog', {name: 'maintenance.order.created'})
        expect(requestsTo(requests, `/activity/${EVENT1}`)).toHaveLength(1)
        expect(within(dialog).getByText('mantenimiento.tecnico (Persona)')).toBeInTheDocument()
        expect(within(dialog).getByText('order MO-000012')).toBeInTheDocument()
        const payload = within(dialog).getByRole('table', {name: 'Datos publicados'})
        expect(within(payload).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent)))
            .toEqual([['code', 'MO-000012'], ['type', 'URGENT']])
    })

    it('sin activity-read no se ofrece la línea del registro', async () => {
        serveNotifications({inbox: [notification(N1, 'Orden urgente', null, true, 'CRITICAL', 'MAINTENANCE')]})
        const {user} = renderRoute('/notificaciones', {session: loginAs('mantenimiento.tecnico')})
        await user.click(await screen.findByRole('checkbox', {name: 'Solo no leídas'}))
        await waitFor(() => expect(dataRows('Notificaciones')).toHaveLength(1))

        expect(within(dataRows('Notificaciones')[0]).queryByRole('button', {name: /^Línea del registro/})).not.toBeInTheDocument()
    })

    it('un enlace absoluto se abre en otra pestaña, y uno de otro esquema no se ofrece', async () => {
        const opened = vi.spyOn(window, 'open').mockImplementation(() => null)
        serveNotifications({inbox: [
            notification(N1, 'Incidencia', 'https://estado.example/incidencia/7', true, 'WARNING', 'SYSTEM'),
            notification(N2, 'Rara', 'javascript:alert(1)', true, 'WARNING', 'SYSTEM'),
        ]})
        const {user, router} = renderRoute('/notificaciones', {session: loginAs('config.lector')})
        await user.click(await screen.findByRole('checkbox', {name: 'Solo no leídas'}))
        await waitFor(() => expect(dataRows('Notificaciones')).toHaveLength(2))

        expect(within(rowOf('Notificaciones', 'Rara')).queryByRole('button', {name: 'Abrir Rara'})).not.toBeInTheDocument()
        await user.click(within(rowOf('Notificaciones', 'Incidencia')).getByRole('button', {name: 'Abrir Incidencia'}))

        expect(opened).toHaveBeenCalledWith('https://estado.example/incidencia/7', '_blank', 'noopener')
        expect(router.state.location.pathname).toBe('/notificaciones')
    })
})

describe('el registro de actividad', () => {
    const created = activityEvent(EVENT1, 'MAINTENANCE', 'maintenance.order.created', 'CRITICAL')
    const burst = activityEvent(EVENT2, 'FIELD', 'configuration.profile.updated', 'INFO', {
        seq: 119, sourceService: 'mto-configuration', sourceEventId: 'burst:7', actor: {kind: 'SYSTEM', username: null, id: null},
        subject: {type: 'profile', id: null, label: null}, correlationId: 'job-1', eventCount: 12645, supersededBy: EVENT1,
    })

    it('se filtra y se ordena en el servicio, y nunca ofrece los accesos', async () => {
        const requests = serveNotifications({activity: [created, burst]})
        const {user} = renderRoute('/actividad', {session: loginAs('notificacion.lector')})

        await waitFor(() => expect(dataRows('Registro de actividad')).toHaveLength(2))
        expect(lastTo(requests, '/activity').url.search).toBe('?page=0&size=50&sort=occurredAt%2Cdesc&sort=seq%2Cdesc')
        expect(screen.getByText('2 eventos')).toBeInTheDocument()
        expect(cells(dataRows('Registro de actividad')[0])).toEqual(expect.arrayContaining(['Mantenimiento', 'maintenance.order.created',
            'Crítica', 'mantenimiento.tecnico', 'order MO-000012', 'mto-maintenance']))
        const second = cells(dataRows('Registro de actividad')[1])
        expect(second).toEqual(expect.arrayContaining(['Desconocido', 'Sistema', 'profile', 'x12645']))
        expect(within(dataRows('Registro de actividad')[1]).getByText('Fundida')).toBeInTheDocument()

        await user.click(screen.getByRole('combobox', {name: 'Categoría'}))
        const offered = (await screen.findAllByRole('option')).map((option) => option.textContent)
        expect(offered).toEqual(['Usuarios', 'Configuración', 'Mantenimiento', 'Almacén', 'Sistema'])
        await user.keyboard('{Escape}')

        await choose(user, 'Gravedad', 'Crítica')
        await user.type(screen.getByRole('textbox', {name: 'Quién'}), 'mantenimiento.tecnico')
        await user.type(screen.getByRole('textbox', {name: 'Origen'}), ' mto-maintenance ')
        await user.click(screen.getByRole('checkbox', {name: /Incluir los fundidos/}))
        await waitFor(() => expect(lastTo(requests, '/activity').url.search).toBe('?actorUsername=mantenimiento.tecnico&severity=CRITICAL'
            + '&sourceService=mto-maintenance&includeSuperseded=true&page=0&size=50&sort=occurredAt%2Cdesc&sort=seq%2Cdesc'))

        await user.click(within(table('Registro de actividad')).getByRole('button', {name: 'Tipo'}))
        await waitFor(() => expect(lastTo(requests, '/activity').url.searchParams.getAll('sort')).toEqual(['type,asc', 'seq,desc']))
    })

    it('abrir una línea pide su detalle, que trae el payload que la lista no trae', async () => {
        const requests = serveNotifications({
            activity: [created],
            events: {[EVENT1]: {...created, payload: {sampleIds: [1, 2], code: 'MO-000012', draft: false}}},
        })
        const {user} = renderRoute('/actividad', {session: loginAs('notificacion.lector')})
        await waitFor(() => expect(dataRows('Registro de actividad')).toHaveLength(1))

        await user.click(screen.getByRole('button', {name: 'Detalle de maintenance.order.created'}))

        const dialog = await screen.findByRole('dialog', {name: 'maintenance.order.created'})
        expect(requestsTo(requests, `/activity/${EVENT1}`)).toHaveLength(1)
        expect(within(dialog).getByText('corr-1')).toBeInTheDocument()
        const payload = within(dialog).getByRole('table', {name: 'Datos publicados'})
        expect(within(payload).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent)))
            .toEqual([['code', 'MO-000012'], ['draft', 'false'], ['sampleIds', '[1,2]']])
        await user.click(within(dialog).getAllByRole('button', {name: 'Cerrar'}).at(-1))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('una línea sin payload lo dice, y una que ya no existe lo dice en su diálogo', async () => {
        serveNotifications({activity: [created, {...burst, supersededBy: null}], events: {[EVENT1]: {...created, payload: {}}}})
        const {user} = renderRoute('/actividad', {session: loginAs('notificacion.lector')})
        await waitFor(() => expect(dataRows('Registro de actividad')).toHaveLength(2))

        await user.click(screen.getByRole('button', {name: 'Detalle de maintenance.order.created'}))
        const dialog = await screen.findByRole('dialog', {name: 'maintenance.order.created'})
        expect(within(dialog).getByText('Sin datos publicados')).toBeInTheDocument()
        expect(within(dialog).queryByRole('table', {name: 'Datos publicados'})).not.toBeInTheDocument()
        await user.click(within(dialog).getAllByRole('button', {name: 'Cerrar'}).at(-1))

        await user.click(screen.getByRole('button', {name: 'Detalle de configuration.profile.updated'}))
        const missing = await screen.findByRole('dialog', {name: 'Línea del registro'})
        expect(await within(missing).findByText('Esa línea del registro ya no existe.')).toBeInTheDocument()
        expect(within(missing).getByText('Referencia: corr-ACT-404')).toBeInTheDocument()
    })

    it('aplica los filtros de la URL que conoce e ignora los demás', async () => {
        const requests = serveNotifications({activity: [created]})
        renderRoute('/actividad?category=ACCESS&severity=FATAL&type=users.user.created&subjectType=user&subjectId=u-1&includeSuperseded=true',
            {session: loginAs('notificacion.lector')})

        await waitFor(() => expect(dataRows('Registro de actividad')).toHaveLength(1))
        expect(lastTo(requests, '/activity').url.search).toBe('?type=users.user.created&subjectType=user&subjectId=u-1&includeSuperseded=true'
            + '&page=0&size=50&sort=occurredAt%2Cdesc&sort=seq%2Cdesc')
        expect(screen.getByRole('combobox', {name: 'Categoría'})).toHaveValue('')
        expect(screen.getByRole('checkbox', {name: /Incluir los fundidos/})).toBeChecked()
    })
})

describe('los accesos', () => {
    const failed = accessEvent(EVENT1, 'access.login.failed', 'FAILURE', 'WARNING', 1)
    const streak = accessEvent(EVENT2, 'access.login.streak', 'BLOCKED', 'CRITICAL', 3)

    it('se listan con el usuario del enlace de una regla y se filtran en el servicio', async () => {
        const requests = serveNotifications({access: [failed, streak]})
        const {user} = renderRoute('/actividad/accesos?username=config.lector', {session: loginAs('usuarios.responsable')})

        await waitFor(() => expect(dataRows('Accesos')).toHaveLength(2))
        expect(screen.getByRole('textbox', {name: 'Usuario'})).toHaveValue('config.lector')
        expect(lastTo(requests, '/access').url.search).toBe('?username=config.lector&page=0&size=50&sort=occurredAt%2Cdesc&sort=seq%2Cdesc')
        expect(cells(dataRows('Accesos')[0])).toEqual(expect.arrayContaining(['access.login.failed', 'Fallido', 'config.lector', '10.0.0.7',
            'Aviso']))
        expect(cells(dataRows('Accesos')[1])).toEqual(expect.arrayContaining(['Desconocido', 'x3']))
        expect(screen.getByText('2 accesos')).toBeInTheDocument()

        await choose(user, 'Resultado', 'Fallido')
        await user.type(screen.getByRole('textbox', {name: 'IP'}), '10.0.0.7')
        await waitFor(() => expect(lastTo(requests, '/access').url.search)
            .toBe('?username=config.lector&ipAddress=10.0.0.7&outcome=FAILURE&page=0&size=50&sort=occurredAt%2Cdesc&sort=seq%2Cdesc'))

        await user.click(screen.getAllByRole('button', {name: 'Detalle de access.login.failed'})[0])
        const dialog = await screen.findByRole('dialog', {name: 'access.login.failed'})
        expect(within(dialog).getByText('10.0.0.7')).toBeInTheDocument()
        expect(within(dialog).getByText('Fallido')).toBeInTheDocument()
        const payload = within(dialog).getByRole('table', {name: 'Datos publicados'})
        expect(within(within(payload).getAllByRole('row')[1]).getAllByRole('cell').map((cell) => cell.textContent))
            .toEqual(['error', 'invalid_user_credentials'])
        expect(requestsTo(requests, '/activity')).toHaveLength(0)
    })

    it('una IP a medio escribir no se pide: el servicio solo admite una IP literal', async () => {
        const requests = serveNotifications({access: [failed]})
        const {user} = renderRoute('/actividad/accesos', {session: loginAs('notificacion.auditor')})
        await waitFor(() => expect(dataRows('Accesos')).toHaveLength(1))

        await user.type(screen.getByRole('textbox', {name: 'IP'}), '10.0.')
        expect(await screen.findByText('Una IPv4 o IPv6 completa, como 10.0.0.7 o ::1')).toBeInTheDocument()
        expect(await screen.findByText('Escribe una IP completa para buscar sus accesos.')).toBeInTheDocument()
        expect(requests.some((request) => request.url.searchParams.has('ipAddress'))).toBe(false)

        await user.type(screen.getByRole('textbox', {name: 'IP'}), '0.7')
        await waitFor(() => expect(lastTo(requests, '/access').url.searchParams.get('ipAddress')).toBe('10.0.0.7'))
        expect(screen.queryByText('Una IPv4 o IPv6 completa, como 10.0.0.7 o ::1')).not.toBeInTheDocument()
    })
})

describe('abrir una fila', () => {
    it('una notificación, una línea del registro o un acceso se abren con doble clic; un clic no abre nada', async () => {
        const stalled = notification(N1, 'Fuente parada', '/actividad?category=SYSTEM&type=system.source.stalled', false, 'CRITICAL', 'SYSTEM')
        const created = activityEvent(EVENT1, 'MAINTENANCE', 'maintenance.order.created', 'CRITICAL')
        const failed = accessEvent(EVENT2, 'access.login.failed', 'FAILURE', 'WARNING', 1)
        const requests = serveNotifications({inbox: [stalled], unread: [{count: 1, capped: false}, {count: 0, capped: false}],
            activity: [created], events: {[EVENT1]: created}, access: [failed]})

        const inbox = renderRoute('/notificaciones', {session: loginAs('config.responsable')})
        await waitFor(() => expect(dataRows('Notificaciones')).toHaveLength(1))
        await inbox.user.click(rowOf('Notificaciones', 'Fuente parada'))
        expect(inbox.router.state.location.pathname).toBe('/notificaciones')
        expect(requestsTo(requests, `/inbox/${N1}/read`, 'POST')).toHaveLength(0)
        await inbox.user.dblClick(rowOf('Notificaciones', 'Fuente parada'))
        await waitFor(() => expect(inbox.router.state.location.pathname).toBe('/actividad'))
        expect(requestsTo(requests, `/inbox/${N1}/read`, 'POST')).toHaveLength(1)
        inbox.unmount()

        const activity = renderRoute('/actividad', {session: loginAs('notificacion.lector')})
        await waitFor(() => expect(dataRows('Registro de actividad')).toHaveLength(1))
        await activity.user.click(rowOf('Registro de actividad', 'maintenance.order.created'))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        await activity.user.dblClick(rowOf('Registro de actividad', 'maintenance.order.created'))
        expect(await screen.findByRole('dialog', {name: 'maintenance.order.created'})).toBeInTheDocument()
        expect(requestsTo(requests, `/activity/${EVENT1}`)).toHaveLength(1)
        activity.unmount()

        const access = renderRoute('/actividad/accesos', {session: loginAs('usuarios.responsable')})
        await waitFor(() => expect(dataRows('Accesos')).toHaveLength(1))
        await access.user.click(rowOf('Accesos', 'access.login.failed'))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        await access.user.dblClick(rowOf('Accesos', 'access.login.failed'))
        expect(await screen.findByRole('dialog', {name: 'access.login.failed'})).toBeInTheDocument()
    })
})
