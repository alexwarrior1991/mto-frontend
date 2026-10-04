import {screen, waitFor, within} from '@testing-library/react'
import {http, HttpResponse} from 'msw'
import {describe, expect, it} from 'vitest'
import {buildMenu} from '../app/navigation.js'
import {P} from '../auth/permissions.js'
import {renderRoute} from './render.jsx'
import {server} from './server.js'
import {loginAs, sessionWith} from './session.js'

/**
 * Las pantallas del marco: Inicio, el menu, lo que pasa sin permiso, las pantallas que aun no han
 * llegado y la sesion caducada. Con la tabla de rutas real y el gateway simulado.
 */

function menu() {
    return within(screen.getByRole('navigation', {name: 'Menú principal'}))
}

describe('Inicio: quien ha entrado y con que', () => {
    it('ensena la persona, las seis audiencias, los permisos por cliente y los roles de realm como informativos', async () => {
        const session = sessionWith([P.CONFIG_READ, P.NOTIFICATION_INBOX], {
            username: 'config.lector',
            realmRoles: ['mto-viewer'],
            aud: ['mto-configuration-api', 'mto-stock-api', 'mto-maintenance-api', 'mto-users-api', 'mto-gateway-api', 'account'],
        })
        const {container} = renderRoute('/', {session})

        expect(await screen.findByRole('heading', {name: 'Inicio'})).toBeInTheDocument()
        expect(screen.getByText('config.lector', {selector: 'strong'})).toBeInTheDocument()
        expect(container.querySelector('[data-audience="mto-stock-api"]')).toHaveAttribute('data-present', 'true')
        expect(container.querySelector('[data-audience="mto-notification-api"]')).toHaveAttribute('data-present', 'false')
        expect(container.querySelector('[data-audience="mto-notification-api"]')).toHaveTextContent('(falta)')
        expect(screen.getByText('account')).toBeInTheDocument()
        const configuration = container.querySelector('[data-client="mto-configuration-api"]')
        expect(within(configuration).getByText('config-read')).toBeInTheDocument()
        expect(within(container.querySelector('[data-client="mto-users-api"]')).getByText('ninguno')).toBeInTheDocument()
        expect(screen.getByText('mto-viewer')).toBeInTheDocument()
        expect(screen.getByText(/un rol de realm no concede ningún permiso/)).toBeInTheDocument()
        await waitFor(() => expect(document.title).toBe('Inicio · MTO'))
    })

    it('la cabecera ensena el entorno y la persona, y «Salir» sale', async () => {
        const {user, authActions} = renderRoute('/', {session: loginAs('config.lector')})

        expect(await screen.findByText('pruebas')).toBeInTheDocument()
        expect(screen.getAllByText('config.lector').length).toBeGreaterThan(0)
        await user.click(screen.getByRole('button', {name: 'Salir'}))
        expect(authActions.signOut).toHaveBeenCalledTimes(1)
    })
})

describe('el menu: solo lo que la persona puede abrir, en el orden del backoffice', () => {
    it('config.responsable ve infraestructura, trabajos, la bandeja, el registro y los catalogos; ni usuarios ni almacen', async () => {
        renderRoute('/', {session: loginAs('config.responsable')})
        await screen.findByRole('heading', {name: 'Inicio'})

        expect(menu().getByRole('link', {name: 'Vías'})).toHaveAttribute('href', '/infraestructura/vias')
        expect(menu().getByRole('link', {name: 'Trabajos'})).toBeInTheDocument()
        expect(menu().getByRole('link', {name: 'Registro de actividad'})).toBeInTheDocument()
        expect(menu().getByRole('button', {name: 'Catálogos'})).toBeInTheDocument()
        expect(menu().queryByRole('button', {name: 'Usuarios'})).not.toBeInTheDocument()
        expect(menu().queryByRole('button', {name: 'Almacén'})).not.toBeInTheDocument()
        expect(menu().queryByRole('link', {name: 'Accesos'})).not.toBeInTheDocument()
        expect(buildMenu(loginAs('config.responsable')).map((item) => item.label))
            .toEqual(['Inicio', 'Infraestructura', 'Trabajos', 'Notificaciones', 'Actividad', 'Catálogos'])
    })

    it('almacen.lector ve el almacen entero y nada de configuracion', () => {
        const items = buildMenu(loginAs('almacen.lector'))

        expect(items.map((item) => item.label)).toEqual(['Inicio', 'Almacén', 'Notificaciones'])
        expect(items[1].children.map((child) => child.label)).toEqual(['Existencias', 'Materiales', 'Almacenes', 'Proveedores',
            'Proyectos', 'Movimientos', 'Reservas', 'Conjuntos'])
    })

    it('un grupo sin su primera entrada sale igual con lo que se puede abrir (Actividad solo con Accesos)', () => {
        const items = buildMenu(sessionWith([P.NOTIFICATION_ACCESS_READ]))

        const activity = items.find((item) => item.key === 'actividad')
        expect(activity.children.map((child) => child.path)).toEqual(['/actividad/accesos'])
    })

    it('los diecisiete catalogos, solo con config-read', () => {
        const catalogues = buildMenu(loginAs('config.lector')).find((item) => item.key === 'catalogos')
        expect(catalogues.children).toHaveLength(17)
        expect(catalogues.children[0]).toMatchObject({path: '/catalogos/anchorages', label: 'Anclajes'})
        expect(buildMenu(loginAs('almacen.lector')).some((item) => item.key === 'catalogos')).toBe(false)
    })

})

describe('rutas: las mismas que el backoffice', () => {
    it('sin permiso se dice cual falta y la URL no se toca (el menu no es la seguridad)', async () => {
        const {router} = renderRoute('/actividad/accesos?username=config.lector', {session: loginAs('config.responsable')})

        expect(await screen.findByText('No tienes permiso para abrir esta pantalla')).toBeInTheDocument()
        expect(screen.getByText('notification-access-read')).toBeInTheDocument()
        expect(router.state.location.pathname).toBe('/actividad/accesos')
        expect(router.state.location.search).toBe('?username=config.lector')
    })

    it('una pantalla que aun no ha llegado dice en que fase llega y abre la misma ruta en el backoffice', async () => {
        renderRoute('/actividad?category=SYSTEM', {session: loginAs('config.responsable')})

        expect(await screen.findByRole('heading', {name: 'Registro de actividad'})).toBeInTheDocument()
        expect(screen.getByText('Llega en la fase 7')).toBeInTheDocument()
        const link = screen.getByRole('link', {name: 'Abrir en el backoffice'})
        expect(link).toHaveAttribute('href', 'http://backoffice.test/actividad?category=SYSTEM')
        expect(link).toHaveAttribute('target', '_blank')
        expect(link.getAttribute('rel')).toContain('noopener')
    })

    it('un catalogo lleva su titulo y ya no esta pendiente, y uno que no existe no existe', async () => {
        server.use(http.get('/api/configuration/pole-types', () => HttpResponse.json([])))
        const first = renderRoute('/catalogos/pole-types', {session: loginAs('config.lector')})
        expect(await screen.findByRole('heading', {name: 'Tipos de poste'})).toBeInTheDocument()
        expect(await screen.findByText('El catálogo está vacío.')).toBeInTheDocument()
        expect(screen.queryByText(/Llega en la fase/)).not.toBeInTheDocument()
        await waitFor(() => expect(document.title).toBe('Tipos de poste · MTO'))
        first.unmount()

        renderRoute('/catalogos/no-existe', {session: loginAs('config.lector')})
        expect(await screen.findByRole('heading', {name: 'Esta pantalla no existe'})).toBeInTheDocument()
    })

    it('una ruta que no existe lo dice y ofrece volver al inicio', async () => {
        renderRoute('/esto/no/existe', {session: loginAs('config.lector')})

        expect(await screen.findByRole('heading', {name: 'Esta pantalla no existe'})).toBeInTheDocument()
        expect(screen.getByRole('link', {name: 'Volver al inicio'})).toHaveAttribute('href', '/')
    })
})

describe('Inicio: comprobar los servicios a traves del gateway', () => {
    it('solo se ofrece lo que la persona puede leer, y una respuesta se ve como «Responde»', async () => {
        server.use(http.get('/api/configuration/profile-statuses', () => HttpResponse.json([])))
        const {user, container} = renderRoute('/', {session: loginAs('config.lector')})
        await screen.findByRole('heading', {name: 'Comprobar servicios'})

        const configuration = container.querySelector('[data-service="mto-configuration"]')
        expect(within(container.querySelector('[data-service="mto-users"]')).getByText('Sin permiso')).toBeInTheDocument()
        await user.click(within(configuration).getByRole('button', {name: 'Comprobar'}))

        expect(await within(configuration).findByText('Responde')).toBeInTheDocument()
    })

    it('un fallo se ve en la fila y en el aviso, con su referencia', async () => {
        server.use(http.get('/api/notifications/inbox/unread-count', () => HttpResponse.json(
            {title: 'Service Unavailable', status: 503, service: 'mto-notification', correlationId: 'corr-probe'},
            {status: 503, headers: {'Content-Type': 'application/problem+json', 'Retry-After': '30'}},
        )))
        const {user, container} = renderRoute('/', {session: loginAs('config.lector')})
        await screen.findByRole('heading', {name: 'Comprobar servicios'})

        const notification = container.querySelector('[data-service="mto-notification"]')
        await user.click(within(notification).getByRole('button', {name: 'Comprobar'}))

        expect(await within(notification).findByText('El servicio no está disponible ahora mismo. Inténtalo en 30 s.')).toBeInTheDocument()
        await waitFor(() => expect(screen.getAllByText('Referencia: corr-probe')).toHaveLength(2))
    })

    it('si el token ya no se puede renovar, se avisa de que la sesion ha caducado y se ofrece volver a entrar', async () => {
        server.use(http.get('/api/configuration/profile-statuses', () => new HttpResponse(null, {status: 401})))
        const {user, container, authActions} = renderRoute('/', {session: loginAs('config.lector'), renewedToken: null})
        await screen.findByRole('heading', {name: 'Comprobar servicios'})

        const configuration = container.querySelector('[data-service="mto-configuration"]')
        await user.click(within(configuration).getByRole('button', {name: 'Comprobar'}))

        expect(await screen.findByText('La sesión ha caducado')).toBeInTheDocument()
        await user.click(screen.getByRole('button', {name: 'Volver a entrar'}))
        expect(authActions.signIn).toHaveBeenCalledTimes(1)
    })
})
