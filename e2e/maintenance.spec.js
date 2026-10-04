import {expect, test} from '@playwright/test'
import {signIn} from './keycloak.js'

/**
 * El recorrido de la fase 6 contra la plataforma real, con mantenimiento.responsable y datos de usar y
 * tirar:
 *
 * - el alta de un tramo de vía en la primera vía de mto-configuration, lejos de sus perfiles;
 * - una orden correctiva sobre él, planificada e iniciada, con una tarea;
 * - un turno con posesión total en esa vía: se inicia, se le asigna la tarea, que se inicia y se
 *   completa en él, y se cierra;
 * - la orden completada, con sus estados y su historial;
 * - el informe de avance de la vía, consultado y descargado;
 * - y el tramo desactivado al final.
 *
 * La orden y el turno se quedan, terminados: en mto-maintenance no se borran. Y mantenimiento.lector,
 * que lo ve todo sin poder cambiar nada.
 */

const SUFFIX = Date.now().toString(36).toUpperCase()
const SECTION = {code: `E2E-TS-${SUFFIX}`, name: `Tramo e2e ${SUFFIX}`}
const SECTION_LABEL = `${SECTION.code} - ${SECTION.name}`
const TITLE = `Revisión e2e ${SUFFIX}`

/** Por el menú y no con goto: recargar la página es volver a entrar por el SSO. */
async function openFromMenu(page, name) {
    const menu = page.getByRole('navigation', {name: 'Menú principal'})
    const link = menu.getByRole('link', {name, exact: true})
    if (!(await link.isVisible())) {
        await menu.getByRole('button', {name: 'Mantenimiento'}).click()
    }
    await link.click()
    await expect(page.getByRole('heading', {name, level: 2})).toBeVisible()
}

/** Un desplegable con sus opciones ya cargadas: «Vía» a secas no es «Tipo de vía». */
async function chooseOption(page, container, label, option) {
    await container.getByRole('combobox', {name: label, exact: true}).click()
    await page.getByRole('option', {name: option, exact: true}).click()
}

/** El código de la ficha abierta, que es lo primero de su título: «MO-000123 · …». */
async function codeOfHeading(page, pattern) {
    const heading = page.getByRole('heading', {level: 2, name: pattern})
    await expect(heading).toBeVisible()
    return (await heading.textContent()).split(' · ')[0]
}

test('una orden de principio a fin: el tramo, la tarea trabajada en un turno, el informe y el tramo desactivado', async ({page}) => {
    await page.goto('/mantenimiento/activos')
    await signIn(page, 'mantenimiento.responsable')
    await expect(page.getByRole('heading', {name: 'Activos', level: 2})).toBeVisible()

    await page.getByRole('button', {name: 'Nuevo tramo'}).click()
    const sectionEditor = page.getByRole('dialog', {name: 'Nuevo tramo de vía'})
    await sectionEditor.getByRole('textbox', {name: 'Código'}).fill(SECTION.code)
    await sectionEditor.getByRole('textbox', {name: 'Nombre'}).fill(SECTION.name)
    await sectionEditor.getByRole('combobox', {name: 'Vía', exact: true}).click()
    const firstTrack = page.getByRole('option').first()
    const track = (await firstTrack.textContent()).trim()
    await firstTrack.click()
    // Lejos de los perfiles de la vía: el tramo no tiene que abarcar ninguno.
    await sectionEditor.getByRole('textbox', {name: 'Kp inicial'}).fill('900.1')
    await sectionEditor.getByRole('textbox', {name: 'Kp final'}).fill('900.2')
    await sectionEditor.getByRole('button', {name: 'Guardar'}).click()
    await expect(page.getByText(`Guardado ${SECTION_LABEL}`)).toBeVisible()

    await openFromMenu(page, 'Órdenes')
    await page.getByRole('button', {name: 'Nueva orden'}).click()
    const orderEditor = page.getByRole('dialog', {name: 'Nueva orden'})
    await orderEditor.getByRole('combobox', {name: 'Activo'}).fill(SECTION.name)
    await page.getByRole('option', {name: SECTION_LABEL}).click()
    await chooseOption(page, orderEditor, 'Tipo', 'Correctiva')
    await orderEditor.getByRole('textbox', {name: 'Título'}).fill(TITLE)
    await orderEditor.getByRole('button', {name: 'Guardar'}).click()
    const order = await codeOfHeading(page, `· ${TITLE}`)

    // Cada transición es su diálogo, y la ficha pinta lo que devuelve el servicio.
    await page.getByRole('button', {name: 'Planificar'}).click()
    await page.getByRole('dialog', {name: `Planificar ${order}`}).getByRole('button', {name: 'Planificar'}).click()
    await expect(page.getByText(`${order}: planificada`)).toBeVisible()
    await page.getByRole('button', {name: 'Iniciar'}).click()
    await page.getByRole('dialog', {name: `Iniciar ${order}`}).getByRole('button', {name: 'Iniciar'}).click()
    await expect(page.getByText(`${order}: en curso`)).toBeVisible()
    await expect(page.getByLabel('Estado de la orden')).toHaveText('En curso')

    await page.getByRole('button', {name: 'Añadir tarea'}).click()
    const taskEditor = page.getByRole('dialog', {name: `Nueva tarea en ${order}`})
    await taskEditor.getByRole('textbox', {name: 'Descripción'}).fill('Revisar el tramo e2e')
    await taskEditor.getByRole('button', {name: 'Guardar'}).click()
    await expect(page.getByText(`Tarea 1 añadida a ${order}`)).toBeVisible()

    // Con posesión total el turno admite cualquier tipo de tarea, también los que pone el servicio.
    await openFromMenu(page, 'Turnos')
    await page.getByRole('button', {name: 'Nuevo turno'}).click()
    const shiftEditor = page.getByRole('dialog', {name: 'Nuevo turno'})
    await chooseOption(page, shiftEditor, 'Posesión', 'Total')
    await shiftEditor.getByRole('combobox', {name: 'Vías'}).click()
    await page.getByRole('option', {name: track, exact: true}).click()
    await shiftEditor.getByRole('textbox', {name: 'Personal'}).fill('Brigada e2e')
    await shiftEditor.getByRole('button', {name: 'Guardar'}).click()
    const shift = await codeOfHeading(page, /^SH-\d+ · /)

    await page.getByRole('button', {name: 'Iniciar'}).click()
    await page.getByRole('dialog', {name: `Iniciar ${shift}`}).getByRole('button', {name: 'Iniciar'}).click()
    await expect(page.getByText(`${shift}: en curso`)).toBeVisible()

    await page.getByRole('button', {name: 'Asignar tareas'}).click()
    const assigning = page.getByRole('dialog', {name: `Asignar tareas a ${shift}`})
    await assigning.getByRole('combobox', {name: 'Orden'}).click()
    await page.getByRole('option', {name: `${order} · ${TITLE}`}).click()
    await assigning.getByRole('checkbox', {name: 'Elegir la tarea 1'}).check()
    await assigning.getByRole('button', {name: 'Asignar', exact: true}).click()
    await expect(page.getByText('Asignadas: 1.')).toBeVisible()
    await assigning.getByRole('button', {name: 'Cerrar'}).click()

    const task = `la tarea 1 de ${order}`
    await page.getByRole('button', {name: `Iniciar ${task}`}).click()
    await expect(page.getByText('Tarea 1 iniciada')).toBeVisible()
    await page.getByRole('button', {name: `Completar ${task}`}).click()
    const completing = page.getByRole('dialog', {name: new RegExp(`^Completar ${task}`)})
    await completing.getByRole('textbox', {name: 'Notas', exact: true}).fill('Sin incidencias')
    await completing.getByRole('button', {name: 'Completar'}).click()
    await expect(page.getByText('Tarea 1 completada')).toBeVisible()

    await page.getByRole('button', {name: 'Cerrar', exact: true}).click()
    const closing = page.getByRole('dialog', {name: `Cerrar ${shift}`})
    await closing.getByRole('textbox', {name: 'Minutos netos de trabajo'}).fill('120')
    await closing.getByRole('button', {name: 'Cerrar'}).click()
    await expect(page.getByText(`${shift}: cerrado`)).toBeVisible()
    // El parte del turno: la tarea, con sus notas como trabajos hechos.
    await page.getByRole('tab', {name: 'Parte'}).click()
    const report = page.getByRole('table', {name: `Parte de ${shift}`})
    await expect(report.getByRole('row').filter({hasText: order}).filter({hasText: 'Sin incidencias'})).toBeVisible()
    await page.getByRole('tab', {name: 'Tareas'}).click()

    await page.getByRole('button', {name: `Abrir la orden de ${task}`}).click()
    await expect(page.getByRole('heading', {level: 2, name: `${order} · ${TITLE}`})).toBeVisible()
    await expect(page.getByText('Tareas: 1 de 1 completadas')).toBeVisible()
    await page.getByRole('button', {name: 'Completar', exact: true}).click()
    const finishing = page.getByRole('dialog', {name: `Completar ${order}`})
    await finishing.getByRole('textbox', {name: 'Notas de cierre'}).fill('Revisión e2e terminada')
    await finishing.getByRole('button', {name: 'Completar'}).click()
    await expect(page.getByText(`${order}: completada`)).toBeVisible()

    // Los estados son las transiciones con su comentario; el historial, las revisiones de Envers.
    await page.getByRole('tab', {name: 'Estados'}).click()
    const states = page.getByRole('table', {name: `Estados de ${order}`})
    for (const status of ['Borrador', 'Planificada', 'En curso', 'Completada']) {
        await expect(states.getByRole('cell', {name: status, exact: true}).first()).toBeVisible()
    }
    await page.getByRole('button', {name: 'Historial', exact: true}).click()
    const history = page.getByRole('dialog', {name: `Historial de ${order}`})
    await expect(history.getByRole('table').getByText('Alta', {exact: true})).toBeVisible()
    await history.getByRole('button', {name: 'Cerrar'}).click()

    // El informe se descarga a través de la aplicación, con el token: lo que se consultó.
    await openFromMenu(page, 'Informes')
    await chooseOption(page, page, 'Vía', track)
    await page.getByRole('button', {name: 'Consultar'}).click()
    await expect(page.getByLabel('Resumen del avance')).toBeVisible()
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'Excel'}).click()])
    expect(file.suggestedFilename()).toMatch(/\.xlsx$/)

    await openFromMenu(page, 'Activos')
    await page.getByRole('textbox', {name: 'Nombre'}).fill(SECTION.name)
    await page.getByRole('button', {name: `Desactivar ${SECTION_LABEL}`}).click()
    await page.getByRole('dialog', {name: `Desactivar ${SECTION_LABEL}`}).getByRole('button', {name: 'Desactivar'}).click()
    await expect(page.getByText(`Desactivado ${SECTION_LABEL}`)).toBeVisible()
})

test('quien solo lee el mantenimiento lo ve todo sin poder cambiar nada', async ({page}) => {
    await page.goto('/mantenimiento')
    await signIn(page, 'mantenimiento.lector')
    await expect(page.getByRole('heading', {name: 'Órdenes', level: 2})).toBeVisible()
    await expect(page.getByRole('button', {name: 'Nueva orden'})).toHaveCount(0)

    await openFromMenu(page, 'Activos')
    await expect(page.getByRole('button', {name: 'Nuevo tramo'})).toHaveCount(0)
    await expect(page.getByRole('button', {name: /^(Modificar|Desactivar|Reactivar) /})).toHaveCount(0)
    await openFromMenu(page, 'Turnos')
    await expect(page.getByRole('button', {name: 'Nuevo turno'})).toHaveCount(0)
    await openFromMenu(page, 'Inspecciones')
    await expect(page.getByRole('button', {name: 'Nueva inspección'})).toHaveCount(0)
    await openFromMenu(page, 'Defectos')
    await expect(page.getByRole('button', {name: 'Nuevo defecto'})).toHaveCount(0)
    await openFromMenu(page, 'Equipos')
    await expect(page.getByRole('button', {name: 'Nuevo equipo'})).toHaveCount(0)
})
