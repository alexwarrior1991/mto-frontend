import process from 'node:process'

/** Entra por el formulario de Keycloak con un usuario de desarrollo (contraseña «local»). */
export async function signIn(page, username, password = process.env.E2E_PASSWORD ?? 'local') {
    await page.locator('#username').fill(username)
    await page.locator('#password').fill(password)
    await page.locator('#kc-login').click()
}
