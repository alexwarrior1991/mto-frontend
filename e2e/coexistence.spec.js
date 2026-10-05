import {expect, test} from '@playwright/test'
import process from 'node:process'
import {signIn} from './keycloak.js'

/**
 * La convivencia con el backoffice, contra la plataforma real con los dos frontales: «Abrir en el
 * backoffice» lleva a la misma pantalla allí, con su query, y «Abrir en mto-frontend» trae de vuelta.
 * Ninguno de los dos saltos pide entrar otra vez: las dos aplicaciones entran por el mismo SSO de
 * Keycloak, y la sesión que abrió esta pestaña vale para el backoffice (OIDC en el servidor) y para la
 * pestaña nueva de la SPA (con su propio token en memoria). Si el SSO no valiera, la pestaña nueva se
 * quedaría en el formulario de Keycloak y su pantalla no llegaría nunca.
 */

const BACKOFFICE_URL = process.env.E2E_BACKOFFICE_URL ?? 'http://localhost:8085'
// Lo que pueda añadir detrás la redirección de vuelta del login (el «continue» de Spring Security) no
// cuenta: lo que importa es la ruta y su filtro.
const ACTIVITY = /\/actividad\?category=SYSTEM(&|$)/
// La primera visita a cada aplicación pasa por Keycloak y, en el backoffice, crea la sesión de Vaadin.
const FIRST_VISIT = {timeout: 60_000}

test('la misma pantalla en el backoffice y de vuelta, con su filtro y sin volver a entrar', async ({page, context}) => {
    await page.goto('/actividad?category=SYSTEM')
    await signIn(page, 'notificacion.lector')
    await expect(page.getByRole('heading', {name: 'Registro de actividad', level: 2})).toBeVisible()
    await expect(page.getByRole('combobox', {name: 'Categoría'})).toHaveValue('Sistema')

    // Otra pestaña, con noopener: se espera en el contexto, no como popup de esta página.
    const [backoffice] = await Promise.all([
        context.waitForEvent('page'),
        page.getByRole('link', {name: 'Abrir en el backoffice'}).click(),
    ])
    await expect(backoffice.getByRole('heading', {name: 'Actividad', level: 2})).toBeVisible(FIRST_VISIT)
    expect(backoffice.url().startsWith(BACKOFFICE_URL)).toBe(true)
    await expect(backoffice).toHaveURL(ACTIVITY)
    await expect(backoffice.getByRole('combobox', {name: 'Categoria'})).toHaveValue('Sistema')

    const [spa] = await Promise.all([
        context.waitForEvent('page'),
        backoffice.getByRole('link', {name: 'Abrir en mto-frontend'}).click(),
    ])
    await expect(spa.getByRole('heading', {name: 'Registro de actividad', level: 2})).toBeVisible(FIRST_VISIT)
    await expect(spa).toHaveURL(ACTIVITY)
    await expect(spa.getByRole('combobox', {name: 'Categoría'})).toHaveValue('Sistema')
})
