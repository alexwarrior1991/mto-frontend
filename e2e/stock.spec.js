import {expect, test} from '@playwright/test'
import {signIn} from './keycloak.js'

/**
 * El recorrido de la fase 5 contra la plataforma real, con almacen.responsable y datos de usar y tirar:
 * el alta de un almacén, un proyecto y un material; una entrada; una reserva que se consume y deja su
 * salida en el libro; un ajuste que deja el material bajo mínimo; un conjunto con su disponibilidad,
 * modificado con su lista entera (lo que arregló mto-stock#21) y con su historial. Al final se retira
 * todo lo creado: un catálogo del almacén no se borra. Y almacen.lector, que lo ve todo sin poder
 * cambiar nada.
 *
 * Necesita mto-stock con su arreglo: antes, modificar la lista de un conjunto daba un 500 y consumir
 * una reserva no dejaba la salida en el libro.
 */

const SUFFIX = Date.now().toString(36).toUpperCase()
const WAREHOUSE = {code: `E2E-WH-${SUFFIX}`, name: 'Almacén e2e'}
const PROJECT = {code: `E2E-PRJ-${SUFFIX}`, name: 'Proyecto e2e'}
const MATERIAL = {code: `E2E-MAT-${SUFFIX}`, name: 'Hilo e2e'}
const ASSEMBLY = {code: `E2E-ASM-${SUFFIX}`, name: 'Conjunto e2e'}
const label = (entry) => `${entry.code} - ${entry.name}`

/** Por el menú y no con goto: recargar la página es volver a entrar por el SSO. */
async function openFromMenu(page, name) {
    const menu = page.getByRole('navigation', {name: 'Menú principal'})
    const link = menu.getByRole('link', {name, exact: true})
    if (!(await link.isVisible())) {
        await menu.getByRole('button', {name: 'Almacén'}).click()
    }
    await link.click()
    await expect(page.getByRole('heading', {name, level: 2})).toBeVisible()
}

/** Un desplegable del almacén busca en el servidor: se escribe el código y se elige la opción. */
async function pick(page, container, fieldLabel, entry) {
    await container.getByRole('combobox', {name: fieldLabel}).fill(entry.code)
    await page.getByRole('option', {name: label(entry)}).click()
}

/**
 * Guardar solo cierra el diálogo si el servicio lo acepta (si no, el error va a su campo y el diálogo sigue
 * abierto): es la señal de que se guardó. El aviso «Guardado …» puede coincidir con el de un guardado
 * anterior de la misma fila que aún no se ha ido, como el alta, la modificación y la retirada del conjunto.
 */
async function saved(page, dialog, code) {
    await expect(dialog).toBeHidden()
    await expect(page.getByText(`Guardado ${code}`).last()).toBeVisible()
}

async function create(page, entry, extra = async () => {}) {
    await page.getByRole('button', {name: 'Nuevo'}).click()
    const dialog = page.getByRole('dialog', {name: /^Alta de /})
    await dialog.getByRole('textbox', {name: 'Código'}).fill(entry.code)
    await dialog.getByRole('textbox', {name: 'Nombre'}).fill(entry.name)
    await extra(dialog)
    await dialog.getByRole('button', {name: 'Guardar'}).click()
    await saved(page, dialog, entry.code)
}

async function retire(page, entry) {
    await page.getByRole('textbox', {name: 'Buscar por código o nombre'}).fill(entry.code)
    await page.getByRole('button', {name: `Modificar ${label(entry)}`}).click()
    const dialog = page.getByRole('dialog', {name: new RegExp(`^Modificar .* ${entry.code}$`)})
    await dialog.getByRole('checkbox', {name: 'Activo'}).uncheck()
    await dialog.getByRole('button', {name: 'Guardar'}).click()
    await saved(page, dialog, entry.code)
}

test('dar de alta, mover material, reservarlo y consumirlo, montar un conjunto y retirarlo todo', async ({page}) => {
    await page.goto('/almacen/almacenes')
    await signIn(page, 'almacen.responsable')
    await expect(page.getByRole('heading', {name: 'Almacenes', level: 2})).toBeVisible()

    await create(page, WAREHOUSE)
    await openFromMenu(page, 'Proyectos')
    await create(page, PROJECT)
    await openFromMenu(page, 'Materiales')
    await create(page, MATERIAL, async (dialog) => {
        await dialog.getByRole('textbox', {name: 'Unidad de medida'}).fill('m')
        await dialog.getByRole('textbox', {name: 'Stock mínimo'}).fill('5')
    })

    await openFromMenu(page, 'Movimientos')
    await page.getByRole('button', {name: 'Entrada'}).click()
    const entry = page.getByRole('dialog', {name: 'Entrada'})
    await pick(page, entry, 'Material', MATERIAL)
    await pick(page, entry, 'Almacén', WAREHOUSE)
    await entry.getByRole('textbox', {name: 'Cantidad'}).fill('10')
    await entry.getByRole('textbox', {name: 'Referencia externa'}).fill(`ALB-${SUFFIX}`)
    await entry.getByRole('button', {name: 'Registrar'}).click()
    await expect(page.getByText(`Entrada registrada: 10 m de ${MATERIAL.code}`)).toBeVisible()

    await openFromMenu(page, 'Reservas')
    await page.getByRole('button', {name: 'Nueva reserva'}).click()
    const reservation = page.getByRole('dialog', {name: 'Nueva reserva'})
    await pick(page, reservation, 'Material', MATERIAL)
    await pick(page, reservation, 'Almacén', WAREHOUSE)
    await pick(page, reservation, 'Proyecto', PROJECT)
    await reservation.getByRole('textbox', {name: 'Cantidad'}).fill('4')
    await reservation.getByRole('button', {name: 'Guardar'}).click()
    await expect(page.getByText(`Reserva registrada: 4 m de ${MATERIAL.code} para ${PROJECT.code}`)).toBeVisible()
    const reservationLabel = `la reserva de ${MATERIAL.code} para ${PROJECT.code}`
    await page.getByRole('button', {name: `Consumir ${reservationLabel}`}).click()
    await page.getByRole('dialog', {name: `Consumir ${reservationLabel}`}).getByRole('button', {name: 'Consumir'}).click()
    await expect(page.getByText(`Reserva consumida: 4 m de ${MATERIAL.code}`)).toBeVisible()

    await openFromMenu(page, 'Existencias')
    await pick(page, page, 'Material', MATERIAL)
    await pick(page, page, 'Almacén', WAREHOUSE)
    const figures = page.getByRole('region', {name: 'Existencias del material'})
    await expect(figures.getByRole('group', {name: 'Físico'})).toContainText('6')
    await expect(figures.getByRole('group', {name: 'Reservado'})).toContainText('0')
    await expect(figures.getByRole('group', {name: 'Disponible'})).toContainText('6')
    // Consumir deja su salida en el libro: el libro y las cifras cuadran.
    const ledger = page.getByRole('table', {name: 'Movimientos del material'})
    await expect(ledger.getByRole('row').filter({hasText: 'Salida'}).filter({hasText: '-4'})).toBeVisible()
    await expect(ledger.getByRole('row').filter({hasText: 'Entrada'}).filter({hasText: `ALB-${SUFFIX}`})).toBeVisible()

    await page.getByRole('button', {name: 'Ajuste'}).click()
    const adjustment = page.getByRole('dialog', {name: 'Ajuste de inventario'})
    await adjustment.getByRole('combobox', {name: 'Sentido'}).click()
    await page.getByRole('option', {name: 'Negativo: falta material'}).click()
    await adjustment.getByRole('textbox', {name: 'Cantidad'}).fill('2')
    await adjustment.getByRole('textbox', {name: 'Notas'}).fill('Rotura en la prueba e2e')
    await adjustment.getByRole('button', {name: 'Registrar'}).click()
    await expect(page.getByText(`Ajuste registrado: 2 m de ${MATERIAL.code}`)).toBeVisible()
    await expect(figures.getByRole('group', {name: 'Disponible'})).toContainText('4')
    await expect(figures.getByText('Bajo mínimo')).toBeVisible()
    await expect(page.getByRole('table', {name: 'Bajo mínimo'}).getByText(MATERIAL.code, {exact: true})).toBeVisible()

    await openFromMenu(page, 'Conjuntos')
    await create(page, ASSEMBLY, async (dialog) => {
        await pick(page, dialog, 'Material', MATERIAL)
        await dialog.getByRole('textbox', {name: 'Cantidad por conjunto'}).fill('2')
        await dialog.getByRole('button', {name: 'Añadir'}).click()
    })
    await page.getByRole('textbox', {name: 'Buscar por código o nombre'}).fill(ASSEMBLY.code)
    await page.getByRole('button', {name: `Disponibilidad de ${label(ASSEMBLY)}`}).click()
    let availability = page.getByRole('dialog', {name: `Disponibilidad de ${label(ASSEMBLY)}`})
    await pick(page, availability, 'Almacén', WAREHOUSE)
    await expect(availability.getByText(`2 conjuntos montables en ${WAREHOUSE.code}`)).toBeVisible()
    await availability.getByRole('button', {name: 'Cerrar'}).last().click()

    // Modificar la lista: volver a añadir el material cambia su cantidad, y la lista viaja entera.
    await page.getByRole('button', {name: `Modificar ${label(ASSEMBLY)}`}).click()
    const editor = page.getByRole('dialog', {name: `Modificar conjunto ${ASSEMBLY.code}`})
    await pick(page, editor, 'Material', MATERIAL)
    await editor.getByRole('textbox', {name: 'Cantidad por conjunto'}).fill('4')
    await editor.getByRole('button', {name: 'Añadir'}).click()
    await expect(editor.getByRole('table', {name: 'Lista de materiales'}).getByText('4 m')).toBeVisible()
    await editor.getByRole('button', {name: 'Guardar'}).click()
    await saved(page, editor, ASSEMBLY.code)
    await page.getByRole('button', {name: `Disponibilidad de ${label(ASSEMBLY)}`}).click()
    availability = page.getByRole('dialog', {name: `Disponibilidad de ${label(ASSEMBLY)}`})
    await pick(page, availability, 'Almacén', WAREHOUSE)
    await expect(availability.getByText(`1 conjunto montable en ${WAREHOUSE.code}`)).toBeVisible()
    await availability.getByRole('button', {name: 'Cerrar'}).last().click()

    await page.getByRole('button', {name: `Historial de ${label(ASSEMBLY)}`}).click()
    const history = page.getByRole('dialog', {name: `Historial de ${label(ASSEMBLY)}`})
    await expect(history.getByText(/revisi(ón|ones), la más reciente primero/)).toBeVisible()
    await expect(history.getByRole('table').getByText('Alta', {exact: true})).toBeVisible()
    await history.getByRole('button', {name: 'Cerrar'}).last().click()

    await retire(page, ASSEMBLY)
    await openFromMenu(page, 'Materiales')
    await retire(page, MATERIAL)
    await openFromMenu(page, 'Proyectos')
    await retire(page, PROJECT)
    await openFromMenu(page, 'Almacenes')
    await retire(page, WAREHOUSE)
})

test('quien solo lee el almacén lo ve todo sin poder cambiar nada', async ({page}) => {
    await page.goto('/almacen/materiales')
    await signIn(page, 'almacen.lector')
    await expect(page.getByRole('heading', {name: 'Materiales', level: 2})).toBeVisible()
    await expect(page.getByRole('button', {name: 'Nuevo'})).toHaveCount(0)
    await expect(page.getByRole('button', {name: /^Modificar /})).toHaveCount(0)

    await openFromMenu(page, 'Movimientos')
    await expect(page.getByRole('button', {name: 'Entrada'})).toHaveCount(0)
    await openFromMenu(page, 'Reservas')
    await expect(page.getByRole('button', {name: 'Nueva reserva'})).toHaveCount(0)
    await expect(page.getByRole('button', {name: /^(Consumir|Liberar|Cancelar) /})).toHaveCount(0)
})
