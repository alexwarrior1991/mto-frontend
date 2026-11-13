import {act, screen, waitFor, within} from '@testing-library/react'
import {http, HttpResponse} from 'msw'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {buildMenu} from '../app/navigation.js'
import {P} from '../auth/permissions.js'
import {UNREAD_REFRESH_MS} from '../features/notifications/useNotifications.js'
import {formatDateTime} from '../ui/format.js'
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
 * que no se conocen se ignoran. Y la administración del servicio (notificaciones/administracion), con
 * los casos de «Fase 6» de ViewLayerTest: el menú, cada pestaña pidiendo lo suyo al abrirse, las fuentes,
 * las colas de mensajes muertos con mirar y reprocesar, las entregas con su reintento, las reglas y los
 * avisos manuales.
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
        // La bandeja es la primera entrada de su grupo, del que cuelga la administración de quien la tiene.
        const inbox = items.find((item) => item.key === 'notificaciones')
        expect(inbox.label).toBe('Notificaciones')
        expect(inbox.children.map((child) => [child.label, child.path])).toEqual([['Notificaciones', '/notificaciones']])
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
    const burst = activityEvent(EVENT2, 'TELEMETRY', 'configuration.profile.updated', 'INFO', {
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
        expect(offered).toEqual(['Usuarios', 'Configuración', 'Mantenimiento', 'Almacén', 'Campo', 'Recursos', 'Sistema'])
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

describe('la administración de notificaciones', () => {
    const ADMIN = '/notificaciones/administracion'
    const ADMIN_API = `${BASE}/admin`
    const DLQ = 'mto.notification.maintenance.queue.dlq'

    const queue = (source, messages) => ({source, queue: `mto.notification.${source}.queue`,
        deadLetterQueue: `mto.notification.${source}.queue.dlq`, messages})
    const delivery = (id, status, extra = {}) => ({
        id, notificationId: N1, channel: 'email', scope: 'RECIPIENT', audienceKey: null, recipient: 'ops@mto.local',
        recipientUsername: 'config.ops', status, attempts: 3, maxAttempts: 5, nextAttemptAt: null, sentAt: null, lastError: null,
        createdAt: AT, ...extra,
    })
    const rule = (key, extra = {}) => ({
        key, events: ['maintenance.order.created'], when: null, severity: null, audiences: ['PROFILE:mto-ops'], channels: ['inbox'],
        title: `Título de ${key}`, body: 'Cuerpo', link: null, throttleWindow: null, throttleKey: null, ...extra,
    })
    const created = (title, audiences) => ({id: N2, ruleKey: 'manual-broadcast', category: 'SYSTEM', severity: 'INFO', title, body: null,
        link: null, audiences, createdAt: AT, createdBy: 'notificacion.responsable'})

    /**
     * La administración en el gateway simulado. Cada respuesta es un valor o una función (llamada, url,
     * cuerpo) → valor o respuesta; cada petición queda apuntada.
     */
    function serveAdmin({
        sources = {cursors: [], inbox: [], openBursts: 0, deliveries: {}}, queues = {enabled: true, queues: []}, peek = null,
        reprocess = null, deliveries = [], retry = null, rules = {source: 'classpath:notification-rules.yml', variables: {}, rules: []},
        testEmail = null, broadcast = null,
    } = {}) {
        const requests = []
        const calls = {}
        const answer = async (request, key, value, fallbackStatus = 200) => {
            const url = new URL(request.url)
            const text = request.method === 'GET' ? '' : await request.text()
            requests.push({method: request.method, path: url.pathname, url, body: text ? JSON.parse(text) : null})
            calls[key] = (calls[key] ?? 0) + 1
            const result = typeof value === 'function' ? value(calls[key], url, text ? JSON.parse(text) : null) : value
            return result instanceof Response ? result : HttpResponse.json(result, {status: fallbackStatus})
        }
        server.use(
            http.get(`${ADMIN_API}/sources`, ({request}) => answer(request, 'sources', sources)),
            http.get(`${ADMIN_API}/dead-letters`, ({request}) => answer(request, 'queues', queues)),
            http.get(`${ADMIN_API}/dead-letters/:source`, ({request}) => answer(request, 'peek', peek)),
            http.post(`${ADMIN_API}/dead-letters/:source/reprocess`, ({request}) => answer(request, 'reprocess', reprocess)),
            http.get(`${ADMIN_API}/deliveries`, ({request}) => answer(request, 'deliveries', (call, url) => {
                const rows = typeof deliveries === 'function' ? deliveries(call, url) : deliveries
                if (rows instanceof Response) {
                    return rows
                }
                const status = url.searchParams.get('status')
                return pageOf(rows.filter((row) => !status || row.status === status), url)
            })),
            http.post(`${ADMIN_API}/deliveries/:id/retry`, ({request}) => answer(request, 'retry', retry)),
            http.get(`${ADMIN_API}/rules`, ({request}) => answer(request, 'rules', rules)),
            http.post(`${ADMIN_API}/test-email`, ({request}) => answer(request, 'testEmail', testEmail, 202)),
            http.post(`${ADMIN_API}/broadcasts`, ({request}) => answer(request, 'broadcast', broadcast, 201)),
        )
        return requests
    }

    const adminCalls = (requests) => requests.map((request) => `${request.method} ${request.path.slice(ADMIN_API.length)}${request.url.search}`)
    const to = (requests, path, method = 'GET') => requests.filter((request) => request.path === `${ADMIN_API}${path}` && request.method === method)
    const headers = (name) => within(table(name)).getAllByRole('columnheader').map((header) => header.textContent)
    const textRows = (name) => dataRows(name).map(cells)
    const actionsOf = (row) => within(row).queryAllByRole('button').map((button) => button.getAttribute('aria-label'))
    const adminSession = () => sessionWith([P.NOTIFICATION_ADMIN])

    async function openTab(user, name) {
        await user.click(screen.getByRole('tab', {name}))
    }

    async function openAdmin(options, tab = null) {
        const requests = serveAdmin(options)
        const view = renderRoute(ADMIN, {session: adminSession()})
        await screen.findByRole('heading', {name: 'Administración de notificaciones'})
        await waitFor(() => expect(to(requests, '/sources')).toHaveLength(1))
        if (tab) {
            await openTab(view.user, tab)
        }
        return {...view, requests}
    }

    it('cuelga de la bandeja en el menú, solo con su rol de cliente', async () => {
        const requests = serveAdmin()
        const both = sessionWith([P.NOTIFICATION_INBOX, P.NOTIFICATION_ADMIN])
        const group = buildMenu(both).find((item) => item.key === 'notificaciones')
        expect(group.label).toBe('Notificaciones')
        expect(group.children.map((child) => [child.label, child.path])).toEqual([
            ['Notificaciones', '/notificaciones'], ['Administración', ADMIN]])
        // Sin la bandeja, el grupo es una etiqueta con la administración dentro.
        expect(buildMenu(adminSession()).find((item) => item.key === 'notificaciones').children.map((child) => child.label))
            .toEqual(['Administración'])

        const opened = renderRoute(ADMIN, {session: both})
        expect(await screen.findByRole('heading', {name: 'Administración de notificaciones', level: 2})).toBeInTheDocument()
        await waitFor(() => expect(document.title).toBe('Administración de notificaciones · MTO'))
        expect(screen.getByRole('link', {name: 'Administración'})).toHaveAttribute('aria-current', 'page')
        await waitFor(() => expect(to(requests, '/sources')).toHaveLength(1))
        opened.unmount()

        // Un rol de realm que se llame igual no la abre, ni la pone en el menú, ni llama a nada.
        requests.length = 0
        const realm = sessionWith([P.NOTIFICATION_INBOX, P.NOTIFICATION_ACTIVITY_READ], {realmRoles: ['notification-admin']})
        expect(buildMenu(realm).find((item) => item.key === 'notificaciones').children.map((child) => child.label)).toEqual(['Notificaciones'])
        renderRoute(ADMIN, {session: realm})
        expect(await screen.findByText('No tienes permiso para abrir esta pantalla')).toBeInTheDocument()
        expect(screen.getByText('notification-admin')).toBeInTheDocument()
        expect(requests).toEqual([])
    })

    it('cada pestaña pide lo suyo la primera vez que se abre, y no al volver a ella', async () => {
        const {user, requests} = await openAdmin()

        expect(screen.getAllByRole('tab').map((tab) => tab.textContent))
            .toEqual(['Fuentes', 'Mensajes muertos (DLQ)', 'Entregas', 'Reglas', 'Avisos manuales'])
        expect(screen.getByRole('tab', {name: 'Fuentes'})).toHaveAttribute('aria-selected', 'true')
        expect(adminCalls(requests)).toEqual(['GET /sources'])

        await openTab(user, 'Mensajes muertos (DLQ)')
        await waitFor(() => expect(adminCalls(requests)).toEqual(['GET /sources', 'GET /dead-letters']))
        await openTab(user, 'Entregas')
        await waitFor(() => expect(adminCalls(requests)).toHaveLength(3))
        expect(adminCalls(requests).at(-1)).toBe('GET /deliveries?page=0&size=50&sort=createdAt%2Cdesc')
        await openTab(user, 'Reglas')
        await waitFor(() => expect(adminCalls(requests).at(-1)).toBe('GET /rules'))
        await openTab(user, 'Avisos manuales')
        expect(await screen.findByRole('button', {name: 'Aviso general'})).toBeInTheDocument()

        for (const name of ['Fuentes', 'Mensajes muertos (DLQ)', 'Entregas', 'Reglas']) {
            await openTab(user, name)
        }
        expect(await screen.findByRole('table', {name: 'Reglas'})).toBeInTheDocument()
        expect(adminCalls(requests)).toHaveLength(4)
    })

    it('las fuentes enseñan lo que cuenta el servicio y se vuelven a pedir con «Actualizar»', async () => {
        const first = {
            cursors: [
                {kind: 'KEYCLOAK_LOGIN', lastEventTime: AT, leaseOwner: 'pod-1', leaseUntil: AT, lastPollAt: AT, lastSuccessAt: AT, lastError: null},
                {kind: 'KEYCLOAK_ADMIN', lastEventTime: null, leaseOwner: 'pod-2', leaseUntil: null, lastPollAt: null, lastSuccessAt: null,
                    lastError: 'Keycloak 503'},
            ],
            inbox: [{sourceService: 'mto-maintenance', status: 'PROCESSED', total: 1204}, {sourceService: 'mto-stock', status: 'PARKED', total: 2}],
            openBursts: 3,
            deliveries: {SKIPPED: 5, PENDING: 1, IN_PROGRESS: 0, SENT: 40, FAILED: 2, DEFERRED: 7},
        }
        const {user, requests} = await openAdmin({
            sources: (call) => (call === 1 ? first
                : call === 2 ? {cursors: [], inbox: [], openBursts: null, deliveries: null}
                    : notificationError(503, 'NTF-503', 'Database unavailable')),
        })

        expect(await screen.findByText('Ráfagas abiertas: 3 · Entregas: Pendiente 1 · En curso 0 · Enviada 40 · Fallida 2 · Omitida 5 · DEFERRED 7'))
            .toBeInTheDocument()
        expect(headers('Inbox por fuente y estado')).toEqual(['Fuente', 'Estado', 'Mensajes'])
        expect(textRows('Inbox por fuente y estado')).toEqual([['mto-maintenance', 'Procesado', '1204'], ['mto-stock', 'Desconocido', '2']])
        expect(headers('Lector de Keycloak')).toEqual(['Lector', 'Leído hasta', 'Último sondeo', 'Último éxito', 'Arrendado por', 'Último error'])
        const when = formatDateTime(AT)
        expect(textRows('Lector de Keycloak')).toEqual([
            ['Accesos de Keycloak', when, when, when, `pod-1 hasta ${when}`, ''],
            ['Administración de Keycloak', '', '', '', 'pod-2', 'Keycloak 503'],
        ])

        await user.click(screen.getByRole('button', {name: 'Actualizar'}))
        expect(await screen.findByText('Ráfagas abiertas: 0')).toBeInTheDocument()
        expect(to(requests, '/sources')).toHaveLength(2)

        // Un fallo se avisa y deja el resumen y las dos tablas vacíos.
        await user.click(screen.getByRole('button', {name: 'Actualizar'}))
        expect(await screen.findByText(/El servicio no está disponible ahora mismo/)).toBeInTheDocument()
        expect(screen.getByText(/Referencia: corr-NTF-503/)).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByText(/Ráfagas abiertas/)).not.toBeInTheDocument())
        expect(textRows('Inbox por fuente y estado')).toEqual([])
        expect(textRows('Lector de Keycloak')).toEqual([])
    })

    it('las colas de mensajes muertos ofrecen mirar y reprocesar solo donde hay mensajes', async () => {
        const {user, requests} = await openAdmin({
            queues: (call) => (call === 1 ? {enabled: true, queues: [queue('maintenance', 3), queue('stock', 0), queue('field', null)]}
                : call === 2 ? {enabled: false, queues: []}
                    : notificationError(503, 'SRC-503', 'The broker is unavailable')),
        }, 'Mensajes muertos (DLQ)')

        await waitFor(() => expect(textRows('Colas de mensajes muertos')).toHaveLength(3))
        expect(screen.getByText('Lo que una fuente publicó y no se pudo aplicar. Mirar no saca nada de la cola; reprocesar sí.')).toBeInTheDocument()
        expect(headers('Colas de mensajes muertos')).toEqual(['Fuente', 'Cola', 'Cola de mensajes muertos', 'Mensajes', 'Acciones'])
        expect(textRows('Colas de mensajes muertos').map((row) => row.slice(0, 4))).toEqual([
            ['maintenance', 'mto.notification.maintenance.queue', DLQ, '3'],
            ['stock', 'mto.notification.stock.queue', 'mto.notification.stock.queue.dlq', '0'],
            ['field', 'mto.notification.field.queue', 'mto.notification.field.queue.dlq', 'Sin cola en el broker'],
        ])
        expect(dataRows('Colas de mensajes muertos').map(actionsOf)).toEqual([
            ['Mirar los mensajes de maintenance', 'Reprocesar los mensajes de maintenance'], [], []])

        // RabbitMQ apagado en el despliegue: se dice, sin tabla ni acciones.
        await user.click(screen.getByRole('button', {name: 'Actualizar'}))
        expect(await screen.findByText('RabbitMQ está apagado en este despliegue: no hay colas de mensajes muertos que mirar ni reprocesar.'))
            .toBeInTheDocument()
        expect(screen.queryByRole('table', {name: 'Colas de mensajes muertos'})).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', {name: 'Actualizar'}))
        expect(await screen.findByText('RabbitMQ no responde ahora: la cola se queda como estaba. Inténtalo más tarde.')).toBeInTheDocument()
        await waitFor(() => expect(textRows('Colas de mensajes muertos')).toEqual([]))
        expect(screen.queryByText(/RabbitMQ está apagado/)).not.toBeInTheDocument()
        expect(to(requests, '/dead-letters')).toHaveLength(3)
    })

    it('mirar una cola enseña sus primeros mensajes sin sacarlos, y un fallo no abre nada', async () => {
        const {user, requests} = await openAdmin({
            queues: {enabled: true, queues: [queue('maintenance', 3), queue('users', 1)]},
            peek: (_call, url) => (url.pathname.endsWith('/users')
                ? notificationError(404, 'SRC-404', 'Source users is not configured')
                : {
                    source: 'maintenance', deadLetterQueue: DLQ, messages: 3,
                    peeked: [
                        {
                            message: {messageId: 'm-1', sourceService: 'mto-maintenance', eventType: 'MAINTENANCE_ORDER_CREATED',
                                aggregateType: 'order', aggregateId: 'o-1', exchange: 'mto.maintenance.exchange',
                                routingKey: 'mto.maintenance.order.created', deathReason: 'rejected', deathCount: 2, deadLetteredAt: AT,
                                payloadBytes: 812, problem: null},
                            inbox: {status: 'FAILED', attempts: 3, failedAt: AT, failureReason: 'No rule engine'},
                        },
                        {message: {messageId: 'm-2', deathReason: 'expired', deathCount: 1, problem: 'La firma no es válida'}, inbox: null},
                    ],
                }),
        }, 'Mensajes muertos (DLQ)')
        await waitFor(() => expect(textRows('Colas de mensajes muertos')).toHaveLength(2))

        await user.click(screen.getByRole('button', {name: 'Mirar los mensajes de maintenance'}))
        const dialog = await screen.findByRole('dialog', {name: 'Mensajes muertos de maintenance'})
        expect(within(dialog).getByText(`${DLQ}: 3 en la cola; se enseñan los primeros 2, que siguen en ella. `
            + 'El cuerpo de un mensaje no se enseña nunca.')).toBeInTheDocument()
        expect(headers('Mensajes muertos de maintenance')).toEqual(['Mensaje', 'Tipo', 'Clave de enrutado', 'Exchange', 'Origen', 'Agregado',
            'Motivo del broker', 'Apartado', 'Tamaño', 'Problema', 'Inbox'])
        const when = formatDateTime(AT)
        expect(textRows('Mensajes muertos de maintenance')).toEqual([
            ['m-1', 'MAINTENANCE_ORDER_CREATED', 'mto.maintenance.order.created', 'mto.maintenance.exchange', 'mto-maintenance', 'order o-1',
                'rejected x2', when, '812 B', '', `Fallido · 3 intentos · falló el ${when} · No rule engine`],
            ['m-2', '', '', '', '', '', 'expired', '', '', 'La firma no es válida', 'Sin registro en el inbox'],
        ])
        expect(to(requests, '/dead-letters/maintenance').map((request) => request.url.search)).toEqual(['?max=20'])
        await user.click(within(dialog).getAllByRole('button', {name: 'Cerrar'}).at(-1))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        // Mirar no cambia nada: ni reprocesa ni relee las colas.
        expect(requests.filter((request) => request.method === 'POST')).toEqual([])
        expect(to(requests, '/dead-letters')).toHaveLength(1)

        await user.click(screen.getByRole('button', {name: 'Mirar los mensajes de users'}))
        expect(await screen.findByText('Esa fuente no existe en mto-notification.')).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('reprocesar pregunta cuántos, enseña qué fue de cada uno en el mismo diálogo y relee las colas', async () => {
        const {user, requests} = await openAdmin({
            queues: {enabled: true, queues: [queue('maintenance', 3)]},
            reprocess: (call) => (call === 1
                ? {source: 'maintenance', deadLetterQueue: DLQ, requested: 20, fetched: 3, processed: 1, duplicates: 1, failed: 1, remaining: 1,
                    stoppedBy: 'EMPTY', results: [
                        {messageId: 'm-1', eventType: 'MAINTENANCE_ORDER_CREATED', routingKey: 'mto.maintenance.order.created',
                            outcome: 'PROCESSED', reason: null},
                        {messageId: 'm-2', eventType: 'MAINTENANCE_ORDER_CREATED', routingKey: 'mto.maintenance.order.created',
                            outcome: 'DUPLICATE', reason: null},
                        {messageId: 'm-3', eventType: 'X', routingKey: 'k', outcome: 'FAILED', reason: 'No rule engine'},
                    ]}
                : call === 2
                    ? {source: 'maintenance', deadLetterQueue: DLQ, requested: 5, fetched: null, processed: null, duplicates: null,
                        failed: null, remaining: null, stoppedBy: 'BROKER_GONE', results: [
                            {messageId: 'm-9', eventType: 'X', routingKey: 'k', outcome: 'PARKED', reason: null}]}
                    : notificationError(409, 'SRC-409', 'Queue does not exist')),
        }, 'Mensajes muertos (DLQ)')
        await waitFor(() => expect(textRows('Colas de mensajes muertos')).toHaveLength(1))

        await user.click(screen.getByRole('button', {name: 'Reprocesar los mensajes de maintenance'}))
        const dialog = await screen.findByRole('dialog', {name: 'Reprocesar los mensajes muertos de maintenance'})
        expect(within(dialog).getByText(`Pasa los primeros mensajes de ${DLQ} otra vez por el consumidor de maintenance, cada uno una vez. `
            + 'Los que se aplican, y los que ya estaban aplicados, salen de la cola; los que vuelven a fallar se quedan en ella, con su motivo. '
            + 'No se republica nada, y lo que se aplique puede generar avisos, como cualquier evento.')).toBeInTheDocument()
        const max = within(dialog).getByRole('textbox', {name: 'Máximo de mensajes'})
        expect(max).toHaveValue('20')
        const run = within(dialog).getByRole('button', {name: 'Reprocesar'})

        // Fuera de 1..100, o vacío, no se llama.
        for (const wrong of ['0', '101', '']) {
            await user.clear(max)
            if (wrong) {
                await user.type(max, wrong)
            }
            await user.click(run)
            expect(await within(dialog).findAllByText('Entre 1 y 100 mensajes')).toHaveLength(2)
        }
        expect(to(requests, '/dead-letters/maintenance/reprocess', 'POST')).toHaveLength(0)

        await user.clear(max)
        await user.type(max, '20')
        expect(within(dialog).getAllByText('Entre 1 y 100 mensajes')).toHaveLength(1)
        await user.click(run)
        expect(await within(dialog).findByText('Pedidos 20 · sacados 3 · procesados 1 · duplicados 1 · fallidos 1 · quedan 1 en la cola · '
            + 'paró porque la cola se quedó sin mensajes')).toBeInTheDocument()
        expect(headers('Resultado del reproceso')).toEqual(['Mensaje', 'Tipo', 'Clave de enrutado', 'Resultado', 'Motivo'])
        expect(textRows('Resultado del reproceso').map((row) => [row[0], row[3], row[4]])).toEqual([
            ['m-1', 'Procesado', ''], ['m-2', 'Duplicado', ''], ['m-3', 'Fallido', 'No rule engine']])
        const posts = to(requests, '/dead-letters/maintenance/reprocess', 'POST')
        expect(posts.map((request) => [request.url.search, request.body])).toEqual([['?max=20', null]])
        // El diálogo sigue abierto y las colas se han releído una vez.
        await waitFor(() => expect(to(requests, '/dead-letters')).toHaveLength(2))

        // Un motivo de parada y un resultado que esta versión no conoce no rompen el resumen.
        await user.clear(max)
        await user.type(max, '5')
        await user.click(run)
        expect(await within(dialog).findByText('Pedidos 5 · sacados 0 · procesados 0 · duplicados 0 · fallidos 0 · '
            + 'paró por un motivo que esta versión no conoce')).toBeInTheDocument()
        expect(textRows('Resultado del reproceso').map((row) => [row[0], row[3]])).toEqual([['m-9', 'Desconocido']])
        await waitFor(() => expect(to(requests, '/dead-letters')).toHaveLength(3))

        // Un fallo se avisa con el diálogo abierto, y las colas no se releen.
        await user.click(run)
        expect(await screen.findByText('RabbitMQ está apagado en este despliegue, o esa cola de mensajes muertos no existe en el broker. '
            + 'Queue does not exist')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Reprocesar los mensajes muertos de maintenance'})).toBeInTheDocument()
        expect(to(requests, '/dead-letters')).toHaveLength(3)
    })

    it('las entregas se filtran y se ordenan en el servicio, y solo una fallida o una omitida ofrece reintentar', async () => {
        const rows = [
            delivery('d-1', 'FAILED', {lastError: 'Connection refused'}),
            delivery('d-2', 'SKIPPED', {recipientUsername: null, recipient: 'guardia@mto.local'}),
            delivery('d-3', 'SENT', {scope: 'AUDIENCE', recipient: null, recipientUsername: null, audienceKey: 'PROFILE:mto-ops', sentAt: AT}),
            delivery('d-4', 'BOUNCED', {scope: 'TOPIC'}),
        ]
        const {user, requests} = await openAdmin({deliveries: rows}, 'Entregas')
        await waitFor(() => expect(textRows('Entregas')).toHaveLength(4))
        const lastList = () => to(requests, '/deliveries').at(-1).url.searchParams

        expect(headers('Entregas')).toEqual(['Creada', 'Canal', 'Ámbito', 'Para', 'Estado', 'Intentos', 'Próximo intento', 'Enviada',
            'Último error', 'Notificación', 'Acciones'])
        const when = formatDateTime(AT)
        expect(textRows('Entregas').map((row) => row.slice(0, 10))).toEqual([
            [when, 'email', 'Destinatario', 'ops@mto.local (config.ops)', 'Fallida', '3/5', '', '', 'Connection refused', N1],
            [when, 'email', 'Destinatario', 'guardia@mto.local', 'Omitida', '3/5', '', '', '', N1],
            [when, 'email', 'Audiencia', 'PROFILE:mto-ops', 'Enviada', '3/5', '', when, '', N1],
            [when, 'email', 'Desconocido', 'ops@mto.local (config.ops)', 'Desconocido', '3/5', '', '', '', N1],
        ])
        expect(screen.getByText('4 entregas')).toBeInTheDocument()
        expect(dataRows('Entregas').map(actionsOf)).toEqual([
            ['Reintentar la entrega a ops@mto.local (config.ops)'], ['Reintentar la entrega a guardia@mto.local'], [], []])

        // El estado, sin «Desconocido»; lo que no se filtra no viaja.
        await user.click(screen.getByRole('combobox', {name: 'Estado'}))
        expect((await screen.findAllByRole('option')).map((option) => option.textContent))
            .toEqual(['Pendiente', 'En curso', 'Enviada', 'Fallida', 'Omitida'])
        await user.click(screen.getByRole('option', {name: 'Fallida'}))
        expect(await screen.findByText('1 entrega')).toBeInTheDocument()
        expect([...lastList().keys()]).toEqual(['status', 'page', 'size', 'sort'])
        expect(lastList().get('status')).toBe('FAILED')

        // El canal viaja recortado.
        await user.type(screen.getByRole('textbox', {name: 'Canal'}), ' email ')
        await waitFor(() => expect(lastList().get('channel')).toBe('email'))

        // Un id de notificación a medias no pide nada y se marca; entero, sí.
        const before = to(requests, '/deliveries').length
        const id = screen.getByRole('textbox', {name: 'Notificación (id)'})
        await user.type(id, N1.slice(0, 13))
        expect(await screen.findByText('El id entero de una notificación (un UUID)')).toBeInTheDocument()
        expect(to(requests, '/deliveries')).toHaveLength(before)
        await user.type(id, N1.slice(13))
        await waitFor(() => expect(lastList().get('notificationId')).toBe(N1))
        expect(screen.queryByText('El id entero de una notificación (un UUID)')).not.toBeInTheDocument()

        // El orden por estado viaja, con createdAt para desempatar.
        await user.click(within(table('Entregas')).getByRole('button', {name: 'Estado'}))
        await waitFor(() => expect(lastList().getAll('sort')).toEqual(['status,asc', 'createdAt,desc']))
        await user.click(within(table('Entregas')).getByRole('button', {name: 'Creada'}))
        await waitFor(() => expect(lastList().getAll('sort')).toEqual(['createdAt,asc']))
        expect(within(table('Entregas')).queryByRole('button', {name: 'Para'})).not.toBeInTheDocument()
    })

    it('reintentar una entrega la devuelve a la cola y relee la lista, también si el servicio dice que no', async () => {
        const {user, requests} = await openAdmin({
            deliveries: [delivery('d-1', 'FAILED')],
            retry: (call) => (call === 1 ? delivery('d-1', 'PENDING') : notificationError(409, 'DLV-409', 'Delivery d-1 is SENT')),
        }, 'Entregas')
        await waitFor(() => expect(textRows('Entregas')).toHaveLength(1))

        // Sin confirmación: no hay nada que perder.
        await user.click(screen.getByRole('button', {name: 'Reintentar la entrega a ops@mto.local (config.ops)'}))
        expect(await screen.findByText('Entrega en cola otra vez')).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        const posts = to(requests, '/deliveries/d-1/retry', 'POST')
        expect(posts.map((request) => request.body)).toEqual([null])
        await waitFor(() => expect(to(requests, '/deliveries')).toHaveLength(2))

        await waitFor(() => expect(screen.getByRole('button', {name: 'Reintentar la entrega a ops@mto.local (config.ops)'})).toBeEnabled())
        await user.click(screen.getByRole('button', {name: 'Reintentar la entrega a ops@mto.local (config.ops)'}))
        expect(await screen.findByText('La entrega ya no admite el reintento: solo se reintenta una fallida o una omitida.')).toBeInTheDocument()
        await waitFor(() => expect(to(requests, '/deliveries')).toHaveLength(3))
    })

    it('las reglas cargadas son de solo lectura y se filtran sin llamar', async () => {
        const {user, requests} = await openAdmin({rules: {
            source: 'classpath:notification-rules.yml',
            variables: {'maintenance-service-account': 'service-account-mto-maintenance-svc', 'large-burst-threshold': 50},
            rules: [
                rule('maintenance-order-urgent', {
                    events: ['maintenance.order.created', 'maintenance.order.status-changed'], when: "payload.type == 'URGENT'",
                    severity: 'CRITICAL', audiences: ['PROFILE:mto-maintenance-manager', 'USER:#{payload.assignedUser}'],
                    channels: ['inbox', 'email'], title: 'Orden urgente #{payload.code}', link: '/mantenimiento/ordenes/#{event.subjectId}',
                    throttleWindow: 'PT30M', throttleKey: '#{payload.code}',
                }),
                rule('stock-below-minimum', {events: ['stock.material.below-minimum'], throttleWindow: 'P1DT2H', title: 'Bajo mínimo'}),
                rule('users-access-streak', {events: ['access.login.failed-streak'], severity: 'FATAL', throttleWindow: '30m', title: 'Racha'}),
            ],
        }}, 'Reglas')
        await waitFor(() => expect(textRows('Reglas')).toHaveLength(3))

        expect(screen.getByText('Cargadas de classpath:notification-rules.yml')).toBeInTheDocument()
        expect(screen.getByText('Variables: large-burst-threshold = 50 · maintenance-service-account = service-account-mto-maintenance-svc'))
            .toBeInTheDocument()
        expect(headers('Reglas')).toEqual(['Clave', 'Eventos', 'Condición', 'Gravedad', 'Audiencias', 'Canales', 'Título', 'Enlace', 'Freno'])
        expect(textRows('Reglas')).toEqual([
            ['maintenance-order-urgent', 'maintenance.order.created, maintenance.order.status-changed', "payload.type == 'URGENT'", 'Crítica',
                'PROFILE:mto-maintenance-manager, USER:#{payload.assignedUser}', 'inbox, email', 'Orden urgente #{payload.code}',
                '/mantenimiento/ordenes/#{event.subjectId}', 'Uno cada 30 min por #{payload.code}'],
            ['stock-below-minimum', 'stock.material.below-minimum', '', 'La del evento', 'PROFILE:mto-ops', 'inbox', 'Bajo mínimo', '',
                'Uno cada 1 d 2 h'],
            ['users-access-streak', 'access.login.failed-streak', '', 'Desconocido', 'PROFILE:mto-ops', 'inbox', 'Racha', '', 'Uno cada 30m'],
        ])
        expect(screen.getByText('3 reglas')).toBeInTheDocument()
        // Ningún botón que escriba: solo «Actualizar» y las pestañas.
        expect(within(table('Reglas')).queryAllByRole('button')).toEqual([])
        expect(screen.queryByRole('button', {name: /Nuev|Modificar|Borrar|Guardar/})).not.toBeInTheDocument()

        await user.type(screen.getByRole('textbox', {name: 'Filtrar las reglas'}), 'MINIMO')
        await waitFor(() => expect(textRows('Reglas').map((row) => row[0])).toEqual(['stock-below-minimum']))
        expect(screen.getByText('1 de 3 reglas')).toBeInTheDocument()
        await user.click(screen.getByRole('button', {name: 'Borrar el filtro'}))
        await user.type(screen.getByRole('textbox', {name: 'Filtrar las reglas'}), 'EMAIL')
        await waitFor(() => expect(textRows('Reglas').map((row) => row[0])).toEqual(['maintenance-order-urgent']))
        expect(to(requests, '/rules')).toHaveLength(1)
    })

    it('un correo de prueba comprueba la dirección, lleva el error del servicio a su campo y relee las entregas', async () => {
        const {user, requests} = await openAdmin({
            testEmail: (call) => (call === 1
                ? HttpResponse.json({
                    timestamp: AT, status: 400, error: 'Bad Request', message: 'Validation failed', errorCode: 'REQ-VALIDATION',
                    correlationId: 'corr-val', validationErrors: [{field: 'to', message: 'El dominio no acepta correo'}],
                }, {status: 400})
                : {...created('Correo de prueba de mto-notification', ['USER:notificacion.responsable']), ruleKey: 'test-email'}),
        }, 'Entregas')
        await waitFor(() => expect(to(requests, '/deliveries')).toHaveLength(1))
        await openTab(user, 'Avisos manuales')
        expect(screen.getByText(/El correo de prueba manda un mensaje a la dirección que digas/)).toBeInTheDocument()

        await user.click(screen.getByRole('button', {name: 'Correo de prueba'}))
        const dialog = await screen.findByRole('dialog', {name: 'Correo de prueba'})
        const field = within(dialog).getByRole('textbox', {name: 'Para'})
        expect(field).toHaveAttribute('placeholder', 'ops@mto.local')
        const send = within(dialog).getByRole('button', {name: 'Enviar'})

        await user.type(field, '   ')
        await user.click(send)
        expect(await within(dialog).findByText('La dirección es obligatoria')).toBeInTheDocument()
        await user.clear(field)
        await user.type(field, 'ops@')
        await user.click(send)
        expect(await within(dialog).findByText('No tiene forma de email')).toBeInTheDocument()
        await user.clear(field)
        await user.click(field)
        await user.paste(`${'a'.repeat(315)}@mto.local`)
        await user.click(send)
        expect(await within(dialog).findByText('Como mucho 320 caracteres')).toBeInTheDocument()
        expect(to(requests, '/test-email', 'POST')).toHaveLength(0)

        // El error del servicio, en su campo y con el diálogo abierto.
        await user.clear(field)
        await user.type(field, '  ops@mto.local ')
        await user.click(send)
        expect(await within(dialog).findByText('El dominio no acepta correo')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Correo de prueba'})).toBeInTheDocument()
        expect(to(requests, '/deliveries')).toHaveLength(1)

        // Sin confirmación: se envía recortado, se cierra y avisa.
        await user.click(send)
        expect(await screen.findByText('Correo de prueba en cola para ops@mto.local: cómo le va se ve en Entregas')).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(to(requests, '/test-email', 'POST').map((request) => request.body)).toEqual([{to: 'ops@mto.local'}, {to: 'ops@mto.local'}])
        expect(screen.getByText(`Último enviado: «Correo de prueba de mto-notification», el ${formatDateTime(AT)}, a USER:notificacion.responsable`))
            .toBeInTheDocument()
        // Las entregas, que ya se habían abierto, se releen.
        await waitFor(() => expect(to(requests, '/deliveries')).toHaveLength(2))
    })

    it('un aviso general se comprueba antes de llamar, se confirma diciendo a quién va y viaja sin lo vacío', async () => {
        const {user, requests} = await openAdmin({
            broadcast: created('Parada programada del sábado', ['CLIENT_ROLE:mto-notification-api:notification-inbox', 'PROFILE:mto-ops']),
        }, 'Avisos manuales')

        await user.click(screen.getByRole('button', {name: 'Aviso general'}))
        const dialog = await screen.findByRole('dialog', {name: 'Aviso general'})
        const title = within(dialog).getByRole('textbox', {name: 'Título'})
        const link = within(dialog).getByRole('textbox', {name: 'Enlace'})
        const audiences = within(dialog).getByRole('textbox', {name: 'Audiencias'})
        const channels = within(dialog).getByRole('combobox', {name: 'Canales'})
        const send = within(dialog).getByRole('button', {name: 'Enviar'})

        // Lo que se ofrece y los valores de partida.
        expect(within(dialog).getByRole('combobox', {name: 'Gravedad'})).toHaveValue('Información')
        // De partida, solo la bandeja (el valor del desplegable múltiple).
        expect([...dialog.querySelectorAll('input[type="hidden"]')].map((input) => input.value)).toContain('inbox')
        expect(within(dialog).getByText('Una por línea, CLASE:clave: USER:nombre.de.usuario, USER_ID:id-de-keycloak, PROFILE:mto-admin, '
            + 'CLIENT_ROLE:mto-stock-api:stock-read')).toBeInTheDocument()
        await user.click(within(dialog).getByRole('combobox', {name: 'Gravedad'}))
        expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['Información', 'Aviso', 'Crítica'])
        await user.click(screen.getByRole('option', {name: 'Aviso'}))

        // Sin lo evidente no hay confirmación.
        await user.click(send)
        expect(await within(dialog).findByText('El título es obligatorio')).toBeInTheDocument()
        expect(within(dialog).getByText('Al menos una audiencia')).toBeInTheDocument()
        expect(screen.queryByRole('dialog', {name: 'Enviar el aviso general'})).not.toBeInTheDocument()

        await user.type(title, '  Parada programada del sábado ')
        await user.type(link, 'notificaciones')
        for (const [written, problem] of [
            ['mto-ops', '«mto-ops» no es CLASE:clave'],
            ['TEAM:a', '«TEAM:a»: la clase es USER, USER_ID, PROFILE o CLIENT_ROLE'],
            ['CLIENT_ROLE:notification-inbox', '«CLIENT_ROLE:notification-inbox»: un rol de cliente es CLIENT_ROLE:cliente:rol'],
        ]) {
            await user.clear(audiences)
            await user.type(audiences, written)
            await user.click(send)
            expect(await within(dialog).findByText(problem)).toBeInTheDocument()
        }
        expect(within(dialog).getAllByText('Una ruta de la aplicación (/notificaciones) o una dirección http(s)')).toHaveLength(2)
        await user.clear(link)

        // Sin canales, tampoco.
        await user.clear(audiences)
        await user.click(audiences)
        await user.paste('PROFILE:mto-ops\n\n CLIENT_ROLE:mto-notification-api:notification-inbox \nPROFILE:mto-ops')
        await user.click(channels)
        await user.keyboard('{Backspace}{Escape}')
        await user.click(send)
        expect(await within(dialog).findByText('Al menos un canal')).toBeInTheDocument()
        expect(screen.queryByRole('dialog', {name: 'Enviar el aviso general'})).not.toBeInTheDocument()

        // Los dos canales, elegidos al revés: viajan en el orden del servicio.
        await user.click(channels)
        await user.click(await screen.findByRole('option', {name: 'Correo'}))
        await user.click(await screen.findByRole('option', {name: 'Bandeja'}))
        await user.keyboard('{Escape}')
        await user.click(send)

        const confirmation = await screen.findByRole('dialog', {name: 'Enviar el aviso general'})
        expect(within(confirmation).getByText('«Parada programada del sábado» se envía a 2 audiencias (PROFILE:mto-ops, '
            + 'CLIENT_ROLE:mto-notification-api:notification-inbox) por Bandeja y Correo. Llega a personas de verdad y no se puede retirar. '
            + '¿Enviar?')).toBeInTheDocument()
        // Hasta confirmar no se llama; «Volver» deja el aviso como estaba.
        expect(to(requests, '/broadcasts', 'POST')).toHaveLength(0)
        await user.click(within(confirmation).getByRole('button', {name: 'Volver'}))
        await waitFor(() => expect(screen.queryByRole('dialog', {name: 'Enviar el aviso general'})).not.toBeInTheDocument())
        expect(to(requests, '/broadcasts', 'POST')).toHaveLength(0)

        await user.click(send)
        await user.click(within(await screen.findByRole('dialog', {name: 'Enviar el aviso general'})).getByRole('button', {name: 'Enviar'}))
        expect(await screen.findByText('Aviso enviado a 2 audiencias')).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(to(requests, '/broadcasts', 'POST').map((request) => request.body)).toEqual([{
            title: 'Parada programada del sábado', severity: 'WARNING',
            audiences: ['PROFILE:mto-ops', 'CLIENT_ROLE:mto-notification-api:notification-inbox'], channels: ['inbox', 'email'],
        }])
        expect(screen.getByText(/^Último enviado: «Parada programada del sábado», el .*, a CLIENT_ROLE:mto-notification-api:notification-inbox, PROFILE:mto-ops$/))
            .toBeInTheDocument()
        // La pestaña de entregas no se había abierto: no se pide.
        expect(to(requests, '/deliveries')).toHaveLength(0)
    })

    it('un aviso general que el servicio rechaza deja el diálogo abierto, con cada error en su campo', async () => {
        const {user, requests} = await openAdmin({
            broadcast: (call) => (call === 1
                ? HttpResponse.json({
                    timestamp: AT, status: 400, error: 'Bad Request', message: 'Validation failed', errorCode: 'REQ-VALIDATION',
                    correlationId: 'corr-val', validationErrors: [
                        {field: 'title', message: 'El título no puede llevar saltos de línea'},
                        {field: 'audiences[0]', message: 'La audiencia no puede estar en blanco'},
                    ],
                }, {status: 400})
                : notificationError(422, 'NTF-422', 'Unknown channel sms')),
        }, 'Avisos manuales')

        await user.click(screen.getByRole('button', {name: 'Aviso general'}))
        const dialog = await screen.findByRole('dialog', {name: 'Aviso general'})
        await user.type(within(dialog).getByRole('textbox', {name: 'Título'}), 'Aviso')
        await user.type(within(dialog).getByRole('textbox', {name: 'Audiencias'}), 'USER:config.ops')
        const sendAndConfirm = async () => {
            await user.click(within(dialog).getByRole('button', {name: 'Enviar'}))
            await user.click(within(await screen.findByRole('dialog', {name: 'Enviar el aviso general'})).getByRole('button', {name: 'Enviar'}))
        }

        await sendAndConfirm()
        expect(await within(dialog).findByText('El título no puede llevar saltos de línea')).toBeInTheDocument()
        expect(within(dialog).getByText('La audiencia no puede estar en blanco')).toBeInTheDocument()
        expect(within(dialog).getByRole('textbox', {name: 'Audiencias'})).toHaveAttribute('aria-invalid', 'true')
        expect(screen.queryByRole('dialog', {name: 'Enviar el aviso general'})).not.toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Aviso general'})).toBeInTheDocument()

        await sendAndConfirm()
        expect(await screen.findByText('El aviso nombra una audiencia o un canal que el servicio no conoce. Unknown channel sms')).toBeInTheDocument()
        expect(screen.getByText(/Referencia: corr-NTF-422/)).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Aviso general'})).toBeInTheDocument()
        expect(within(dialog).getByRole('textbox', {name: 'Título'})).toHaveValue('Aviso')
        expect(to(requests, '/broadcasts', 'POST')).toHaveLength(2)
        expect(screen.queryByText(/Último enviado/)).not.toBeInTheDocument()
    })
})
