import {expect, test} from '@playwright/test'
import {existsSync} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {signIn} from './keycloak.js'

/**
 * El recorrido de la fase 3 contra la plataforma real: una vía de usar y tirar, con su paquete, que se
 * exporta hasta «Terminado» y se descarga con el token; y, si está a mano el maestro de LOV de
 * mto-configuration (el repo hermano al lado de este), su importación en simulación hasta el informe,
 * que no escribe nada. El paquete y la vía se borran al final (el borrado es lógico).
 */

const SUFFIX = Date.now().toString(36).toUpperCase()
const LOV_MASTER = path.resolve(process.cwd(), '../mto-configuration/data/lov-master.xlsx')
// Lo que tarda un trabajo en cola y en curso en la plataforma local, con margen; en el CI, con la
// plataforma entera en la misma máquina, más.
const JOB_TIMEOUT_MS = process.env.CI ? 120_000 : 45_000

function menu(page) {
    return page.getByRole('navigation', {name: 'Menú principal'})
}

async function openMenuEntry(page, title, group = null) {
    const link = menu(page).getByRole('link', {name: title, exact: true})
    if (group && !(await link.isVisible())) {
        await menu(page).getByRole('button', {name: group}).click()
    }
    await link.click()
    await expect(page.getByRole('heading', {name: title, level: 2})).toBeVisible()
}

async function choose(page, container, label, option) {
    await container.getByRole('combobox', {name: label}).fill(option)
    await page.getByRole('option', {name: option, exact: true}).click()
}

async function deleteNamed(page, name, singular, done) {
    await page.getByRole('textbox', {name: 'Buscar'}).fill(name)
    await page.getByRole('button', {name: `Borrar ${name}`}).click()
    await page.getByRole('dialog', {name: `Borrar ${singular} ${name}`}).getByRole('button', {name: 'Borrar'}).click()
    await expect(page.getByText(`${done} ${name}`)).toBeVisible()
}

/** La fila del historial de un trabajo de esta pestaña, por su etiqueta. */
function jobRow(page, label) {
    return page.getByRole('table', {name: 'Historial de trabajos'}).getByRole('row').filter({hasText: label})
}

test('exportar los perfiles de una vía hasta «Terminado» y descargar el CSV', async ({page}) => {
    const packageName = `E2E-EP-${SUFFIX}`
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

    await openMenuEntry(page, 'Vías', 'Infraestructura')
    await page.getByRole('button', {name: 'Nuevo'}).click()
    const newTrack = page.getByRole('dialog', {name: 'Alta de vía'})
    await newTrack.getByRole('textbox', {name: 'Nombre'}).fill(trackName)
    await choose(page, newTrack, 'Paquete de ejecución', packageName)
    await newTrack.getByRole('button', {name: 'Guardar'}).click()
    await expect(newTrack).toBeHidden()

    await openMenuEntry(page, 'Trabajos')
    const exporter = page.getByRole('region', {name: 'Exportar los perfiles de una vía'})
    const track = `${trackName} (${packageName})`
    await choose(page, exporter, 'Vía', track)
    await exporter.getByRole('button', {name: 'Exportar'}).click()
    const label = `Exportación de ${track}`
    await expect(page.getByText(`Trabajo encolado: ${label}`)).toBeVisible()

    const row = jobRow(page, label)
    await expect(row.getByText('Terminado', {exact: true})).toBeVisible({timeout: JOB_TIMEOUT_MS})
    await expect(page.getByText(`${label}: Terminado`)).toBeVisible()
    const download = page.waitForEvent('download')
    await row.getByRole('button', {name: `Descargar ${label}`}).click()
    expect((await download).suggestedFilename()).toMatch(/\.csv$/)

    await openMenuEntry(page, 'Vías', 'Infraestructura')
    await deleteNamed(page, trackName, 'vía', 'Borrada')
    await openMenuEntry(page, 'Paquetes de ejecución', 'Infraestructura')
    await deleteNamed(page, packageName, 'paquete de ejecución', 'Borrado')
})

test('importar el catálogo de LOV en simulación hasta su informe', async ({page}) => {
    test.skip(!existsSync(LOV_MASTER), `Sin ${LOV_MASTER}: hace falta mto-configuration al lado de este repo`)
    await page.goto('/trabajos')
    await signIn(page, 'config.responsable')
    await expect(page.getByRole('heading', {name: 'Trabajos', level: 2})).toBeVisible()

    const importer = page.getByRole('region', {name: 'Importar el catálogo de LOV'})
    await importer.getByLabel('Fichero del catálogo de LOV').setInputFiles(LOV_MASTER)
    await importer.getByRole('checkbox', {name: 'Simulación: no escribe nada, solo el informe'}).check()
    await importer.getByRole('button', {name: 'Importar'}).click()
    const label = 'Importación del catálogo de LOV (lov-master.xlsx, simulación)'
    await expect(page.getByText(`Trabajo encolado: ${label}`)).toBeVisible()

    const row = jobRow(page, label).first()
    await expect(row.getByText(/^Terminado/)).toBeVisible({timeout: JOB_TIMEOUT_MS})
    const download = page.waitForEvent('download')
    await row.getByRole('button', {name: `Descargar ${label}`}).click()
    expect((await download).suggestedFilename()).toMatch(/\.json$/)
})
