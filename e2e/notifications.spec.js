import {expect, test} from '@playwright/test'
import {signIn} from './keycloak.js'

/**
 * El recorrido de la fase 7 contra la plataforma real, con usuarios.responsable, cuyo perfil
 * (mto-users-admin) recibe los avisos de las cuentas y lee el registro y los accesos. Lo que avisa es de
 * verdad: una persona de usar y tirar dada de alta y borrada desde Usuarios, que mto-users publica y
 * mto-notification convierte en notificaciones. Así se ven:
 *
 * - la campana y la bandeja, que abre con las no leídas;
 * - abrir una notificación, que la marca y sigue su enlace: a la ficha de la persona y al registro con
 *   sus filtros;
 * - el detalle de una línea del registro, con sus datos publicados;
 * - los accesos de la propia cuenta, que mto-notification lee de Keycloak cada 20 s;
 * - y «Marcar todas como leídas».
 *
 * Y notificacion.lector, que lee el registro y no los accesos.
 */

const SUFFIX = Date.now().toString(36).toLowerCase()

/** Lo que llega por el broker tarda un poco: se recarga la lista hasta que aparece. */
async function reloadUntilVisible(page, locator, timeout = 30_000) {
    await expect(async () => {
        await page.getByRole('button', {name: 'Recargar'}).click()
        await expect(locator).toBeVisible({timeout: 2_000})
    }).toPass({timeout})
}

/** La campana de la barra; su nombre lleva el número cuando ya lo sabe («Notificaciones: 2 sin leer»). */
function bell(page) {
    return page.getByRole('link', {name: /^Notificaciones: /})
}

async function openInbox(page) {
    await bell(page).click()
    await expect(page.getByRole('heading', {name: 'Notificaciones', level: 2})).toBeVisible()
}

/** Por el menú y no con goto: recargar la página es volver a entrar por el SSO. */
async function openFromMenu(page, name, group) {
    const menu = page.getByRole('navigation', {name: 'Menú principal'})
    const link = menu.getByRole('link', {name, exact: true})
    if (!(await link.isVisible())) {
        await menu.getByRole('button', {name: group}).click()
    }
    await link.click()
    await expect(page.getByRole('heading', {name, level: 2})).toBeVisible()
}

test('un alta y una baja de usuario avisan a quien administra las cuentas: la bandeja, el registro y los accesos', async ({page}) => {
    // Lo que llega por el broker y la lectura de los accesos de Keycloak, que en el peor caso tarda dos
    // minutos en una plataforma recién levantada (y con todo en la misma máquina, en el CI).
    test.setTimeout(240_000)
    const username = `e2e.aviso.${SUFFIX}`
    await page.goto('/usuarios')
    await signIn(page, 'usuarios.responsable')
    await expect(page.getByRole('heading', {name: 'Usuarios', level: 2})).toBeVisible()
    await expect(bell(page)).toBeVisible()

    await page.getByRole('button', {name: 'Nuevo'}).click()
    const editor = page.getByRole('dialog', {name: 'Alta de usuario'})
    await editor.getByRole('textbox', {name: 'Usuario'}).fill(username)
    await editor.getByRole('textbox', {name: 'Email'}).fill(`${username}@mto.local`)
    await editor.getByRole('textbox', {name: 'Nombre'}).fill('Aviso')
    await editor.getByRole('textbox', {name: 'Apellidos'}).fill('De Prueba')
    await editor.getByRole('button', {name: 'Guardar'}).click()
    await expect(page.getByText(`Guardado ${username}`)).toBeVisible()

    // La bandeja abre con las no leídas, y abrir una la marca y sigue su enlace: la ficha de la persona.
    await openInbox(page)
    await expect(page.getByRole('checkbox', {name: 'Solo no leídas'})).toBeChecked()
    const inbox = page.getByRole('table', {name: 'Notificaciones'})
    const created = `Alta de usuario: ${username}`
    await reloadUntilVisible(page, inbox.getByRole('row').filter({hasText: created}))
    await page.getByRole('button', {name: `Abrir ${created}`}).click()
    await expect(page.getByRole('heading', {name: username, level: 2})).toBeVisible()

    await page.getByRole('button', {name: 'Borrar'}).click()
    await page.getByRole('dialog', {name: `Borrar usuario ${username}`}).getByRole('button', {name: 'Borrar'}).click()
    await expect(page.getByText(`Borrado ${username}`)).toBeVisible()

    // La de la baja enlaza al registro con sus filtros: las líneas de esa persona.
    await openInbox(page)
    const deleted = `Baja de usuario: ${username}`
    await reloadUntilVisible(page, inbox.getByRole('row').filter({hasText: deleted}))
    await expect(inbox.getByRole('row').filter({hasText: created})).toHaveCount(0)
    await page.getByRole('button', {name: `Abrir ${deleted}`}).click()
    await expect(page.getByRole('heading', {name: 'Registro de actividad', level: 2})).toBeVisible()
    await expect(page.getByRole('combobox', {name: 'Categoría'})).toHaveValue('Usuarios')
    const log = page.getByRole('table', {name: 'Registro de actividad'})
    await expect(log.getByRole('cell', {name: 'users.user.created', exact: true})).toBeVisible()
    await expect(log.getByRole('cell', {name: 'users.user.deleted', exact: true})).toBeVisible()

    // La lista no trae los datos publicados: el detalle los pide a su línea.
    await page.getByRole('button', {name: 'Detalle de users.user.deleted'}).click()
    const detail = page.getByRole('dialog', {name: 'users.user.deleted'})
    await expect(detail.getByRole('table', {name: 'Datos publicados'}).getByRole('row')
        .filter({hasText: 'targetUsername'}).filter({hasText: username})).toBeVisible()
    await detail.getByRole('button', {name: 'Cerrar'}).last().click()

    // Los accesos de la propia cuenta: el de este recorrido llega con la siguiente lectura de Keycloak. El
    // filtro se aplica al dejar de escribir, así que se espera a una fila de esta cuenta, no a la primera.
    await openFromMenu(page, 'Accesos', 'Actividad')
    await page.getByRole('textbox', {name: 'Usuario'}).fill('usuarios.responsable')
    const own = page.getByRole('table', {name: 'Accesos'}).getByRole('row')
        .filter({has: page.getByRole('cell', {name: 'access.login', exact: true})})
        .filter({has: page.getByRole('cell', {name: 'usuarios.responsable', exact: true})})
        .first()
    await reloadUntilVisible(page, own, 120_000)
    await own.getByRole('button', {name: 'Detalle de access.login'}).click()
    const access = page.getByRole('dialog', {name: 'access.login'})
    await expect(access.getByRole('table', {name: 'Cabecera de la línea'}).getByText('usuarios.responsable')).toBeVisible()
    await access.getByRole('button', {name: 'Cerrar'}).last().click()

    await openInbox(page)
    await page.getByRole('button', {name: 'Marcar todas como leídas'}).click()
    await expect(page.getByText('Todas las notificaciones quedan como leídas')).toBeVisible()
    await expect(page.getByRole('link', {name: 'Notificaciones: nada sin leer'})).toBeVisible()
})

test('quien lee el registro sin el permiso de los accesos no los ve ni en el menú ni como categoría', async ({page}) => {
    await page.goto('/actividad')
    await signIn(page, 'notificacion.lector')
    await expect(page.getByRole('heading', {name: 'Registro de actividad', level: 2})).toBeVisible()
    await expect(bell(page)).toBeVisible()

    await page.getByRole('combobox', {name: 'Categoría'}).click()
    await expect(page.getByRole('option', {name: 'Usuarios', exact: true})).toBeVisible()
    await expect(page.getByRole('option', {name: 'Accesos', exact: true})).toHaveCount(0)
    await page.keyboard.press('Escape')

    const menu = page.getByRole('navigation', {name: 'Menú principal'})
    await expect(menu.getByRole('link', {name: 'Registro de actividad', exact: true})).toBeVisible()
    await expect(menu.getByRole('link', {name: 'Accesos', exact: true})).toHaveCount(0)
})
