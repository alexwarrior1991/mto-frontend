import {expect, test} from '@playwright/test'
import {signIn} from './keycloak.js'

/**
 * El recorrido de la fase 1 contra la plataforma real, con entradas de usar y tirar que se borran al
 * acabar: alta, modificacion y borrado de una entrada; y una cimentacion con su tipo, que mientras la
 * usa no se puede borrar. Necesita un mto-configuration que publique la version de los catalogos y
 * deje modificar los tres con tipo.
 */

const SUFFIX = Date.now().toString(36).toUpperCase()

function menu(page) {
    return page.getByRole('navigation', {name: 'Menú principal'})
}

/** Cambia de catalogo por el menu, sin recargar: el token vive en memoria. */
async function openCatalogue(page, title) {
    const link = menu(page).getByRole('link', {name: title, exact: true})
    if (!(await link.isVisible())) {
        await menu(page).getByRole('button', {name: 'Catálogos'}).click()
    }
    await link.click()
    await expect(page.getByRole('heading', {name: title})).toBeVisible()
}

async function createEntry(page, catalogue, code, description, parent = null) {
    await page.getByRole('button', {name: 'Nuevo'}).click()
    const dialog = page.getByRole('dialog', {name: `Nueva entrada de ${catalogue}`})
    await dialog.getByRole('textbox', {name: 'Código'}).fill(code)
    await dialog.getByRole('textbox', {name: 'Descripción'}).fill(description)
    if (parent) {
        await dialog.getByRole('combobox', {name: parent.label}).fill(parent.code)
        await page.getByRole('option', {name: new RegExp(`^${parent.code} `)}).click()
    }
    await dialog.getByRole('button', {name: 'Guardar'}).click()
    await expect(dialog).toBeHidden()
}

async function deleteEntry(page, code) {
    await page.getByRole('button', {name: `Borrar ${code}`}).click()
    await page.getByRole('dialog', {name: `Borrar ${code}`}).getByRole('button', {name: 'Borrar'}).click()
}

function rowOf(page, code) {
    return page.getByRole('row').filter({has: page.getByRole('cell', {name: code, exact: true})})
}

test('una entrada de usar y tirar: alta, modificacion con su version y borrado', async ({page}) => {
    const code = `E2E-${SUFFIX}`
    await page.goto('/catalogos/profile-statuses')
    await signIn(page, 'config.responsable')
    await expect(page.getByRole('heading', {name: 'Estados de perfil'})).toBeVisible()

    await createEntry(page, 'Estados de perfil', code, 'Prueba de punta a punta')
    await page.getByRole('textbox', {name: 'Filtrar por código o descripción'}).fill(code)
    await expect(rowOf(page, code)).toContainText('config.responsable')

    for (const description of ['Prueba modificada', 'Prueba modificada dos veces']) {
        await page.getByRole('button', {name: `Modificar ${code}`}).click()
        const dialog = page.getByRole('dialog', {name: 'Modificar entrada de Estados de perfil'})
        await dialog.getByRole('textbox', {name: 'Descripción'}).fill(description)
        await dialog.getByRole('button', {name: 'Guardar'}).click()
        // La segunda modificacion solo entra si lleva la version que dejo la primera.
        await expect(dialog).toBeHidden()
        await expect(rowOf(page, code)).toContainText(description)
    }

    await deleteEntry(page, code)
    await expect(page.getByText(`Borrada ${code}`)).toBeVisible()
    await expect(rowOf(page, code)).toHaveCount(0)
})

test('una cimentacion con su tipo, y el tipo no se borra mientras la cimentacion lo usa', async ({page}) => {
    const type = `E2E-T-${SUFFIX}`
    const foundation = `E2E-C-${SUFFIX}`
    await page.goto('/catalogos/foundation-types')
    await signIn(page, 'config.responsable')
    await expect(page.getByRole('heading', {name: 'Tipos de cimentación'})).toBeVisible()
    await createEntry(page, 'Tipos de cimentación', type, 'Tipo de prueba')

    await openCatalogue(page, 'Cimentaciones')
    await createEntry(page, 'Cimentaciones', foundation, 'Cimentación de prueba',
        {label: 'Tipo de cimentación', code: type})
    await expect(rowOf(page, foundation)).toContainText(type)

    await openCatalogue(page, 'Tipos de cimentación')
    await deleteEntry(page, type)
    await expect(page.getByText('o la entrada está en uso')).toBeVisible()
    await expect(rowOf(page, type)).toHaveCount(1)

    await openCatalogue(page, 'Cimentaciones')
    await deleteEntry(page, foundation)
    await expect(page.getByText(`Borrada ${foundation}`)).toBeVisible()

    await openCatalogue(page, 'Tipos de cimentación')
    await deleteEntry(page, type)
    await expect(page.getByText(`Borrada ${type}`)).toBeVisible()
})
