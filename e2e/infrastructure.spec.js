import {expect, test} from '@playwright/test'
import process from 'node:process'
import {apiAs} from './api.js'
import {signIn} from './keycloak.js'

/**
 * El recorrido de la fase 2 contra la plataforma real, con un paquete, una estación y una vía de usar
 * y tirar: el alta de los tres con sus referencias, la vía buscada en su lista, su esquema y el borrado
 * de los tres, que es lógico. Necesita al menos una empresa en business-entities; la migración V19 de
 * mto-configuration siembra una.
 *
 * El esquema se mira dos veces. Primero vacío, y después con un perfil y su ménsula que
 * config.responsable pone por la API (el editor de perfiles es largo y lo prueban sus tests de vista).
 * Con el perfil se dibuja un poste, en la SPA y en el backoffice, con lo que devuelve el servicio: el
 * código, el estado, el KP y el tipo de la ménsula.
 *
 * El perfil se borra al acabar. Su estado y su tipo de ménsula son entradas fijas de sus catálogos
 * (E2E-OK y E2E-PT): se crean la primera vez y se reutilizan después, porque el servicio no borra una
 * entrada que usa un perfil, aunque el perfil esté borrado.
 */

const SUFFIX = Date.now().toString(36).toUpperCase()
const BACKOFFICE_URL = process.env.E2E_BACKOFFICE_URL ?? 'http://localhost:8085'
// La primera visita al backoffice pasa por Keycloak y crea la sesión de Vaadin.
const FIRST_VISIT = {timeout: 60_000}
/** El perfil del esquema, con lo que el dibujo escribe de él. */
const PROFILE = {code: `E2E-P-${SUFFIX}`, kp: '12.345', status: 'E2E-OK', armType: 'E2E-PT'}
const DRAWN = [PROFILE.code, PROFILE.status, `KP ${PROFILE.kp}`, PROFILE.armType]

function menu(page) {
    return page.getByRole('navigation', {name: 'Menú principal'})
}

/** Cambia de maestro por el menú, sin recargar: el token vive en memoria. */
async function openMaster(page, title) {
    const link = menu(page).getByRole('link', {name: title, exact: true})
    if (!(await link.isVisible())) {
        await menu(page).getByRole('button', {name: 'Infraestructura'}).click()
    }
    await link.click()
    await expect(page.getByRole('heading', {name: title})).toBeVisible()
}

async function choose(page, dialog, label, option) {
    await dialog.getByRole('combobox', {name: label}).fill(option)
    await page.getByRole('option', {name: option, exact: true}).click()
}

async function deleteNamed(page, name, singular, done) {
    await page.getByRole('textbox', {name: 'Buscar'}).fill(name)
    await page.getByRole('button', {name: `Borrar ${name}`}).click()
    await page.getByRole('dialog', {name: `Borrar ${singular} ${name}`}).getByRole('button', {name: 'Borrar'}).click()
    await expect(page.getByText(`${done} ${name}`)).toBeVisible()
    await expect(page.getByRole('cell', {name, exact: true})).toHaveCount(0)
}

/** La entrada de un catálogo con ese código: la de una pasada anterior o, la primera vez, una nueva. */
async function catalogueEntry(api, catalogue, code, description) {
    const entries = await api.get(`/api/configuration/${catalogue}`)
    return entries.find((entry) => entry.code === code)
        ?? api.post(`/api/configuration/${catalogue}`, {code, description, enabled: true})
}

/** El perfil del esquema en la vía, con su ménsula: el estado y el tipo viajan por su código. */
async function createProfile(api, trackName) {
    const [track] = (await api.post('/api/configuration/tracks/filter?page=0&size=1', {searchText: trackName})).content
    if (!track) {
        throw new Error(`La vía ${trackName} no sale en su lista`)
    }
    const status = await catalogueEntry(api, 'profile-statuses', PROFILE.status, 'Estado de las pruebas e2e')
    const armType = await catalogueEntry(api, 'cantilever-types', PROFILE.armType, 'Ménsula de las pruebas e2e')
    const profile = await api.post('/api/configuration/profiles', {
        profileId: PROFILE.code, kp: PROFILE.kp, trackId: track.id,
        profileStatus: {id: status.id, code: status.code},
        cantilevers: [{cantileverType: {id: armType.id, code: armType.code}}],
    })
    return {track, profile}
}

test('un paquete, una estación y una vía de usar y tirar: alta, esquema vacío y con un poste, y borrado', async ({page, context, playwright}) => {
    // Con el salto al backoffice, que en su primera visita entra por Keycloak y crea su sesión.
    test.setTimeout(180_000)
    const packageName = `E2E-EP-${SUFFIX}`
    const stationName = `E2E-ST-${SUFFIX}`
    const trackName = `E2E-TR-${SUFFIX}`
    await page.goto('/infraestructura/paquetes')
    await signIn(page, 'config.responsable')
    await expect(page.getByRole('heading', {name: 'Paquetes de ejecución'})).toBeVisible()

    await page.getByRole('button', {name: 'Nuevo'}).click()
    const newPackage = page.getByRole('dialog', {name: 'Alta de paquete de ejecución'})
    await newPackage.getByRole('textbox', {name: 'Nombre'}).fill(packageName)
    await newPackage.getByRole('combobox', {name: 'Empresa'}).click()
    await page.getByRole('option').first().click()
    await newPackage.getByRole('textbox', {name: 'Longitud'}).fill('1000')
    await newPackage.getByRole('textbox', {name: 'Inicio'}).fill('01/01/2026')
    await newPackage.getByRole('textbox', {name: 'Fin'}).fill('31/12/2026')
    // El calendario de la fecha se queda abierto encima de los botones hasta salir del campo.
    await newPackage.getByRole('textbox', {name: 'Fin'}).press('Tab')
    await newPackage.getByRole('button', {name: 'Guardar'}).click()
    await expect(newPackage).toBeHidden()

    await openMaster(page, 'Estaciones')
    await page.getByRole('button', {name: 'Nuevo'}).click()
    const newStation = page.getByRole('dialog', {name: 'Alta de estación'})
    await newStation.getByRole('textbox', {name: 'Nombre'}).fill(stationName)
    await choose(page, newStation, 'Paquete de ejecución', packageName)
    await newStation.getByRole('button', {name: 'Guardar'}).click()
    await expect(newStation).toBeHidden()

    await openMaster(page, 'Vías')
    await page.getByRole('button', {name: 'Nuevo'}).click()
    const newTrack = page.getByRole('dialog', {name: 'Alta de vía'})
    await newTrack.getByRole('textbox', {name: 'Nombre'}).fill(trackName)
    await choose(page, newTrack, 'Paquete de ejecución', packageName)
    await newTrack.getByRole('combobox', {name: 'Estaciones que atraviesa'}).fill(stationName)
    await page.getByRole('option', {name: `${stationName} (${packageName})`}).click()
    await newTrack.getByRole('button', {name: 'Guardar'}).click()
    await expect(newTrack).toBeHidden()

    await page.getByRole('textbox', {name: 'Buscar'}).fill(trackName)
    await expect(page.getByRole('cell', {name: trackName, exact: true})).toBeVisible()
    await expect(page.getByRole('cell', {name: `${stationName} (${packageName})`})).toBeVisible()
    await page.getByRole('button', {name: `Esquema ${trackName}`}).click()
    const schematic = page.getByRole('dialog', {name: `Esquema · ${trackName} (${packageName})`})
    await expect(schematic.getByText('Esta vía no tiene perfiles: no hay nada que dibujar.')).toBeVisible()
    await expect(schematic).toContainText(`Estaciones: ${stationName}`)
    await schematic.getByRole('button', {name: 'Cerrar'}).last().click()
    await expect(schematic).toBeHidden()

    const api = await apiAs(playwright, 'config.responsable')
    let profile = null
    try {
        const created = await createProfile(api, trackName)
        profile = created.profile

        // La misma vía con su perfil: un poste, con su ménsula. El servicio vacía su caché del esquema
        // al guardar el perfil, así que lo que se ve ya es lo nuevo.
        await page.getByRole('button', {name: `Esquema ${trackName}`}).click()
        const drawn = page.getByRole('dialog', {name: `Esquema · ${trackName} (${packageName})`})
        await expect(drawn).toContainText(`1 perfil · 1 ménsula · 0 seccionadores · 0 aisladores · Estaciones: ${stationName}`)
        const drawing = drawn.getByRole('img', {name: `Esquema de la vía ${trackName}`})
        await expect(drawing.locator('[data-kind="pole"]')).toHaveCount(1)
        await expect(drawing.locator('[data-kind="arm"]')).toHaveCount(1)
        for (const text of DRAWN) {
            await expect(drawing.getByText(text, {exact: true})).toBeVisible()
        }
        await drawn.getByRole('button', {name: 'Cerrar'}).last().click()
        await expect(drawn).toBeHidden()

        // El backoffice dibuja el mismo poste. Se llega por «Abrir en el backoffice», a la misma
        // pantalla y sin volver a entrar; su botón de la fila lleva el id de la vía.
        const [backoffice] = await Promise.all([
            context.waitForEvent('page'),
            page.getByRole('link', {name: 'Abrir en el backoffice'}).click(),
        ])
        await expect(backoffice.getByRole('heading', {name: 'Vias', level: 2})).toBeVisible(FIRST_VISIT)
        expect(backoffice.url().startsWith(BACKOFFICE_URL)).toBe(true)
        // La búsqueda de la lista no tiene etiqueta, solo su texto de ayuda.
        await backoffice.locator('input[placeholder="Buscar"]').fill(trackName)
        await backoffice.locator(`#schematic-${created.track.id}`).click()
        await expect(backoffice.locator('#schematic-summary')).toHaveText(
            `1 perfil · 1 mensula · 0 seccionadores · 0 aisladores · Estaciones: ${stationName}`)
        await expect(backoffice.locator(`#pole-${profile.id}`)).toHaveCount(1)
        for (const text of DRAWN) {
            await expect(backoffice.getByText(text, {exact: true})).toBeVisible()
        }
        await backoffice.close()
    } finally {
        if (profile) {
            await api.delete(`/api/configuration/profiles/${profile.id}`)
        }
        await api.dispose()
    }

    await deleteNamed(page, trackName, 'vía', 'Borrada')
    await openMaster(page, 'Estaciones')
    await deleteNamed(page, stationName, 'estación', 'Borrada')
    await openMaster(page, 'Paquetes de ejecución')
    await deleteNamed(page, packageName, 'paquete de ejecución', 'Borrado')
})
