import {expect, test} from '@playwright/test'
import process from 'node:process'
import {signIn} from './keycloak.js'

/**
 * El recorrido de la fase 4 contra la plataforma real, con usuarios.responsable y una persona de usar
 * y tirar: el alta con un atributo, la lista filtrada por ese atributo, la ficha, un perfil y un rol
 * puestos y quitados, una contraseña temporal, el correo de acciones (que llega a Mailpit), «sacar a la
 * persona» y el borrado. Y los dos catálogos, con lo que concede un perfil y quién lo tiene.
 *
 * Nunca se toca la sesión propia: todo lo que cierra o desactiva es de la persona de usar y tirar.
 */

const SUFFIX = Date.now().toString(36).toLowerCase()
const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025'

async function chooseOption(page, container, label, option) {
    await container.getByRole('combobox', {name: label}).click()
    await page.getByRole('option', {name: option}).click()
}

test('dar de alta a una persona, administrarla desde su ficha, sacarla y borrarla', async ({page}) => {
    const username = `e2e.${SUFFIX}`
    const email = `${username}@mto.local`
    await page.goto('/usuarios')
    await signIn(page, 'usuarios.responsable')
    await expect(page.getByRole('heading', {name: 'Usuarios', level: 2})).toBeVisible()

    await page.getByRole('button', {name: 'Nuevo'}).click()
    const editor = page.getByRole('dialog', {name: 'Alta de usuario'})
    await editor.getByRole('textbox', {name: 'Usuario'}).fill(username)
    await editor.getByRole('textbox', {name: 'Email'}).fill(email)
    await editor.getByRole('textbox', {name: 'Nombre'}).fill('Persona')
    await editor.getByRole('textbox', {name: 'Apellidos'}).fill('De Prueba')
    await editor.getByRole('textbox', {name: 'Atributos (clave=valor por línea)'}).fill(`e2e=${SUFFIX}`)
    await editor.getByRole('button', {name: 'Guardar'}).click()
    await expect(page.getByText(`Guardado ${username}`)).toBeVisible()
    await expect(editor).toBeHidden()

    // El atributo exacto, que el servicio pasa a Keycloak: solo puede salir esta persona.
    await page.getByRole('textbox', {name: 'Atributo clave:valor'}).fill(`e2e:${SUFFIX}`)
    await expect(page.getByText('1 usuario', {exact: true})).toBeVisible()
    await page.getByRole('link', {name: username}).click()
    await expect(page.getByRole('heading', {name: username, level: 2})).toBeVisible()
    await expect(page.getByText(`Atributos: e2e=${SUFFIX}`)).toBeVisible()

    await chooseOption(page, page, 'Perfil', /^mto-users-viewer/)
    await page.getByRole('button', {name: 'Asignar'}).click()
    await expect(page.getByText('Perfil mto-users-viewer asignado')).toBeVisible()
    await page.getByRole('button', {name: 'Quitar el perfil mto-users-viewer'}).click()
    await expect(page.getByText('Perfil mto-users-viewer quitado')).toBeVisible()

    await page.getByRole('tab', {name: 'Roles de cliente'}).click()
    await chooseOption(page, page, 'Cliente', 'API de usuarios MTO')
    await chooseOption(page, page, 'Roles', 'users-read')
    await page.keyboard.press('Escape')
    await page.getByRole('button', {name: 'Asignar'}).click()
    await expect(page.getByText('Rol users-read asignado')).toBeVisible()
    await page.getByRole('button', {name: 'Quitar el rol users-read de mto-users-api'}).click()
    await expect(page.getByText('Rol users-read quitado')).toBeVisible()

    await page.getByRole('button', {name: 'Contraseña temporal'}).click()
    const password = page.getByRole('dialog', {name: `Contraseña para ${username}`})
    await password.getByLabel('Contraseña nueva').fill(`Temporal-${SUFFIX}`)
    await password.getByRole('button', {name: 'Fijar contraseña'}).click()
    await expect(page.getByText(`Contraseña fijada para ${username} (temporal)`)).toBeVisible()
    await expect(page.getByText(/Acciones pendientes al entrar: .*Cambiar la contraseña/)).toBeVisible()
    await page.getByRole('tab', {name: 'Credenciales'}).click()
    await expect(page.getByRole('table', {name: 'Credenciales'}).getByText('Contraseña', {exact: true})).toBeVisible()

    await page.getByRole('button', {name: 'Acciones por correo'}).click()
    const mail = page.getByRole('dialog', {name: `Correo de acciones para ${username}`})
    // «Acciones» no busca: su campo de texto va oculto bajo la caja que lo envuelve, que es la que recibe el
    // clic. Se abre con el teclado; Escape cierra solo el desplegable, no el diálogo.
    await mail.getByRole('combobox', {name: 'Acciones'}).press('ArrowDown')
    await page.getByRole('option', {name: 'Verificar el email'}).click()
    await page.keyboard.press('Escape')
    await mail.getByRole('button', {name: 'Enviar'}).click()
    await expect(page.getByText(`Correo enviado a ${email}`)).toBeVisible()
    await expect.poll(async () => {
        const response = await page.request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
        return response.ok() ? (await response.json()).messages_count : 0
    }, {message: `el correo de acciones llega a Mailpit (${MAILPIT})`, timeout: 15_000}).toBeGreaterThan(0)

    await page.getByRole('button', {name: 'Sacar a la persona'}).click()
    await page.getByRole('dialog', {name: `Sacar a ${username}`}).getByRole('button', {name: 'Sacar'}).click()
    await expect(page.getByText(`${username} fuera: desactivado, sesiones cerradas y sesiones offline revocadas`)).toBeVisible()
    await expect(page.getByText('Desactivado', {exact: true}).first()).toBeVisible()

    await page.getByRole('button', {name: 'Borrar'}).click()
    await page.getByRole('dialog', {name: `Borrar usuario ${username}`}).getByRole('button', {name: 'Borrar'}).click()
    await expect(page.getByText(`Borrado ${username}`)).toBeVisible()
    await expect(page.getByRole('heading', {name: 'Usuarios', level: 2})).toBeVisible()
})

test('los catálogos: lo que concede un perfil, quién lo tiene y los roles de un cliente', async ({page}) => {
    await page.goto('/usuarios/perfiles')
    await signIn(page, 'usuarios.lector')
    await expect(page.getByRole('heading', {name: 'Perfiles de usuario', level: 2})).toBeVisible()

    await page.getByRole('button', {name: 'Ver mto-users-admin'}).click()
    await expect(page.getByRole('heading', {name: 'mto-users-admin', level: 3})).toBeVisible()
    await expect(page.getByRole('table', {name: 'Lo que concede mto-users-admin'}).getByText('users-delete')).toBeVisible()
    await expect(page.getByRole('table', {name: 'Miembros de mto-users-admin'}).getByRole('link', {name: 'usuarios.responsable'}))
        .toBeVisible()

    // Por el menú y no con goto: recargar la página es volver a entrar por el SSO.
    const menu = page.getByRole('navigation', {name: 'Menú principal'})
    const rolesLink = menu.getByRole('link', {name: 'Roles de cliente', exact: true})
    if (!(await rolesLink.isVisible())) {
        await menu.getByRole('button', {name: 'Usuarios'}).click()
    }
    await rolesLink.click()
    await expect(page.getByRole('heading', {name: 'Roles de cliente', level: 2})).toBeVisible()
    await chooseOption(page, page, 'Cliente', 'API de usuarios MTO')
    await page.getByRole('button', {name: 'Ver quién tiene users-read'}).click()
    // Solo las asignaciones directas: quien lo tiene por un perfil aparece en el perfil, no aquí.
    await expect(page.getByRole('heading', {name: 'Miembros de mto-users-api / users-read'})).toBeVisible()
})
