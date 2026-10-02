import {expect, test} from '@playwright/test'
import {signIn} from './keycloak.js'

/**
 * El recorrido de la fase 0 contra la plataforma real: entrar conservando la URL, el diagnostico de
 * Inicio, el menu por permisos, el token fuera del almacenamiento, la API por el mismo origen, un
 * error con su referencia y salir.
 */

const AUDIENCES = ['mto-configuration-api', 'mto-users-api', 'mto-stock-api', 'mto-maintenance-api',
    'mto-notification-api', 'mto-gateway-api']

test('un enlace profundo sobrevive a la entrada, y sin permiso se dice cual falta', async ({page}) => {
    await page.goto('/actividad/accesos?username=config.lector')
    await signIn(page, 'config.responsable')

    await expect(page).toHaveURL(/\/actividad\/accesos\?username=config\.lector$/)
    await expect(page.getByText('No tienes permiso para abrir esta pantalla')).toBeVisible()
    await expect(page.getByText('notification-access-read')).toBeVisible()
})

test('Inicio ensena las seis audiencias y el menu depende de los permisos', async ({page}) => {
    await page.goto('/')
    await signIn(page, 'config.responsable')

    for (const audience of AUDIENCES) {
        await expect(page.locator(`[data-audience="${audience}"]`)).toHaveAttribute('data-present', 'true')
    }
    const menu = page.getByRole('navigation', {name: 'Menú principal'})
    await expect(menu.getByRole('link', {name: 'Vías'})).toBeVisible()
    await expect(menu.getByRole('button', {name: 'Almacén'})).toHaveCount(0)
})

test('el token no se guarda en el navegador y la API va por el mismo origen', async ({page}) => {
    const apiHosts = new Set()
    page.on('request', (request) => {
        const url = new URL(request.url())
        if (url.pathname.startsWith('/api/')) {
            apiHosts.add(url.host)
        }
    })
    await page.goto('/')
    await signIn(page, 'config.responsable')

    const configuration = page.locator('[data-service="mto-configuration"]')
    await configuration.getByRole('button', {name: 'Comprobar'}).click()
    await expect(configuration.getByText('Responde')).toBeVisible()

    const storage = await page.evaluate(() => ({local: Object.keys(window.localStorage), session: Object.keys(window.sessionStorage)}))
    expect(storage.local).toEqual([])
    expect(storage.session.filter((key) => key.startsWith('oidc.user'))).toEqual([])
    expect([...apiHosts]).toEqual([new URL(page.url()).host])
})

test('un fallo del servicio se avisa con su referencia', async ({page}) => {
    await page.route('**/api/stock/warehouses**', (route) => route.fulfill({
        status: 503,
        contentType: 'application/problem+json',
        headers: {'X-Correlation-Id': 'e2e-referencia', 'Retry-After': '30'},
        body: JSON.stringify({title: 'Service Unavailable', status: 503, service: 'mto-stock'}),
    }))
    await page.goto('/')
    await signIn(page, 'mantenimiento.lector')

    await page.locator('[data-service="mto-stock"]').getByRole('button', {name: 'Comprobar'}).click()

    await expect(page.getByText('Referencia: e2e-referencia').first()).toBeVisible()
})

test('«Salir» cierra la sesion de Keycloak', async ({page}) => {
    await page.goto('/')
    await signIn(page, 'config.lector')
    await expect(page.getByRole('heading', {name: 'Inicio'})).toBeVisible()

    await page.getByRole('button', {name: 'Salir'}).click()

    await expect(page.locator('#username')).toBeVisible()
})
