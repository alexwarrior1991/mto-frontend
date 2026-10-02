import {expect, test} from '@playwright/test'
import {signIn} from './keycloak.js'

/**
 * El recorrido de la fase 2 contra la plataforma real, con un paquete, una estación y una vía de usar
 * y tirar: el alta de los tres con sus referencias, la vía buscada en su lista, su esquema (una vía
 * sin perfiles) y el borrado de los tres, que es lógico. Necesita al menos una empresa en
 * business-entities; la migración V19 de mto-configuration siembra una.
 */

const SUFFIX = Date.now().toString(36).toUpperCase()

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

test('un paquete, una estación y una vía de usar y tirar: alta, esquema y borrado', async ({page}) => {
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

    await deleteNamed(page, trackName, 'vía', 'Borrada')
    await openMaster(page, 'Estaciones')
    await deleteNamed(page, stationName, 'estación', 'Borrada')
    await openMaster(page, 'Paquetes de ejecución')
    await deleteNamed(page, packageName, 'paquete de ejecución', 'Borrado')
})
