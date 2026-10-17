import {expect, test} from '@playwright/test'
import {apiAs} from './api.js'
import {signIn} from './keycloak.js'

/**
 * Los recorridos de recursos (la fase de pantallas de mto-resources) contra la plataforma real, con datos
 * de usar y tirar y códigos E2E (nunca A ni B, que mantenimiento adoptaría):
 *
 * - el organigrama: un equipo nace en pantalla con su jefe y 2 linemen, ninguno puede salir con 2, entra
 *   un tercero y sale otra vez;
 * - la flota: un modelo bivial 9A y un vehículo suyo, puesto en vía en una vía de usar y tirar por un punto
 *   de acceso de esa vía (el maestro de mto-configuration, que llega a mto-resources por evento), que se
 *   ve en el tablero, y el punto en dónde está y en sus ubicaciones;
 * - mantenimiento: un equipo de mto-resources llega sincronizado, su turno copia jefe, linemen y vehículo,
 *   se inicia (su jefe está habilitado para conducir la bivial) y se cierra diciendo dónde queda el
 *   vehículo, y mto-resources lo apunta como del turno;
 * - las cualificaciones: la ficha de una persona enseña las suyas con cómo está cada una, y una nueva se
 *   da de alta en pantalla.
 *
 * Las personas, la vía y lo que no recorre la pantalla se ponen por la API antes y se quitan al acabar:
 * en mto-resources nada se borra, se desactiva o se retira.
 */

const SUFFIX = Date.now().toString(36).toUpperCase().slice(-6)
const MAINTENANCE_DEPARTMENT = '0195b000-0000-7000-8000-000000000002'
const PACKAGE_NAME = `E2E-RP-${SUFFIX}`
const STATION_NAME = `E2E-RS-${SUFFIX}`
const TRACK_NAME = `E2E-RT-${SUFFIX}`
/** La vía como la nombran las pantallas: con su paquete. */
const TRACK = `${TRACK_NAME} (${PACKAGE_NAME})`
const UI_TEAM = {code: `E2E-U${SUFFIX}`, name: `Equipo e2e ${SUFFIX}`}
const SHIFT_TEAM = {code: `E2E-S${SUFFIX}`, name: `Turno e2e ${SUFFIX}`}
const MODEL = {code: `E2E-M${SUFFIX}`, name: `Bivial e2e ${SUFFIX}`}
const VEHICLE = {code: `E2E-V${SUFFIX}`, name: `Camión e2e ${SUFFIX}`}
const SHIFT_VEHICLE = {code: `E2E-W${SUFFIX}`, name: `Dresina e2e ${SUFFIX}`}
const ACCESS_POINT = `E2E-AP-${SUFFIX}`

/** Por el menú y no con goto: recargar la página es volver a entrar por el SSO. */
async function openFromMenu(page, group, name) {
    const menu = page.getByRole('navigation', {name: 'Menú principal'})
    const link = menu.getByRole('link', {name, exact: true})
    if (!(await link.isVisible())) {
        await menu.getByRole('button', {name: group}).click()
    }
    await link.click()
    await expect(page.getByRole('heading', {name, level: 2})).toBeVisible()
}

/** Un desplegable con sus opciones ya cargadas: «Vía» a secas no es «Tipo de vía». */
async function chooseOption(page, container, label, option) {
    await container.getByRole('combobox', {name: label, exact: true}).click()
    await page.getByRole('option', {name: option, exact: true}).click()
}

/** Un desplegable que busca en el servidor: se escribe el código y se elige su opción. */
async function searchAndChoose(page, container, label, text, option) {
    const field = container.getByRole('combobox', {name: label, exact: true})
    await field.click()
    await field.fill(text)
    await page.getByRole('option', {name: option, exact: true}).click()
}

function personLabel(person) {
    return `${person.code} · ${person.fullName}`
}

const created = {people: [], units: [], vehicles: [], types: []}

test.beforeAll(async ({playwright}) => {
    const configuration = await apiAs(playwright, 'config.responsable')
    try {
        const [company] = await configuration.get('/api/configuration/business-entities')
        created.package = await configuration.post('/api/configuration/execution-packages', {
            name: PACKAGE_NAME, companyId: company.id, length: 1000, startDate: '2026-01-01', endDate: '2026-12-31',
            initialPackage: false, enabled: true, tracks: null, stations: null,
        })
        created.station = await configuration.post('/api/configuration/stations', {
            name: STATION_NAME, executionPackageId: created.package.id, tracks: null, disconnectors: null, sectionInsulators: null,
        })
        created.track = await configuration.post('/api/configuration/tracks', {
            name: TRACK_NAME, executionPackageId: created.package.id, stationIds: [created.station.id], enabled: true, profiles: null,
        })
    } finally {
        await configuration.dispose()
    }
    const resources = await apiAs(playwright, 'recursos.responsable')
    try {
        const person = async (firstName, category) => {
            const saved = await resources.post('/api/resources/people', {firstName, lastName: `E2E ${SUFFIX}`, category, employer: 'OWN'})
            created.people.push(saved)
            return saved
        }
        // Las del equipo que se crea en pantalla, y las del equipo del turno: una persona dirige un equipo y
        // es lineman de otro como mucho, así que no se comparten.
        created.leader = await person('Jefa', 'TEAM_LEADER')
        created.linemen = [await person('Uno', 'WORKER'), await person('Dos', 'WORKER'), await person('Tres', 'WORKER')]
        created.shiftLeader = await person('Jefe', 'TEAM_LEADER')
        created.shiftLinemen = [await person('Cuatro', 'WORKER'), await person('Cinco', 'WORKER')]
        // El jefe del turno conduce su vehículo: un modelo bivial autopropulsado exige RR-OPERATOR (la semilla de
        // V8) y, sin nadie habilitado en la dotación, mantenimiento no deja iniciar el turno (409 SHF-001).
        const operator = (await resources.get('/api/resources/qualification-types?search=RR-OPERATOR&size=5')).content
            .find((type) => type.code === 'RR-OPERATOR')
        await resources.post(`/api/resources/people/${created.shiftLeader.id}/qualifications`, {qualificationTypeId: operator.id,
            reference: `E2E-${SUFFIX}`})

        // El equipo del turno, con su vehículo por defecto: lo que mantenimiento copia al turno.
        const type = await resources.post('/api/resources/vehicle-types', {
            code: `${MODEL.code}T`, name: `Modelo del turno ${SUFFIX}`, mobility: 'ROAD_RAIL', category: 'ROAD_RAIL_TRUCK',
            railGearType: 'RAIL_WHEEL_DRIVE', selfPropelled: true,
        })
        created.types.push(type)
        created.shiftVehicle = await resources.post('/api/resources/vehicles', {...SHIFT_VEHICLE, typeId: type.id, registrationPlate: `E2E-${SUFFIX}`})
        created.vehicles.push(created.shiftVehicle)
        created.shiftTeam = await resources.post('/api/resources/units', {
            ...SHIFT_TEAM, kind: 'TEAM', discipline: 'MAINTENANCE', parentId: MAINTENANCE_DEPARTMENT, headPersonId: created.shiftLeader.id,
            memberPersonIds: created.shiftLinemen.map((lineman) => lineman.id), executionPackageIds: [created.package.id],
            defaultVehicleId: created.shiftVehicle.id,
        })
        created.units.push(created.shiftTeam)
    } finally {
        await resources.dispose()
    }
})

test.afterAll(async ({playwright}) => {
    const resources = await apiAs(playwright, 'recursos.responsable')
    try {
        // Primero los equipos, que sueltan a sus linemen y a su vehículo; después vehículos, modelos y personas.
        for (const unit of created.units) {
            await resources.delete(`/api/resources/units/${unit.id}`).catch(() => undefined)
        }
        for (const vehicle of created.vehicles) {
            await resources.delete(`/api/resources/vehicles/${vehicle.id}`).catch(() => undefined)
        }
        // El modelo dado de alta en pantalla se busca por su código; un modelo no se borra, se retira.
        const fromScreen = await resources.get(`/api/resources/vehicle-types?search=${MODEL.code}&size=5`).catch(() => ({content: []}))
        for (const type of [...created.types, ...fromScreen.content.filter((found) => found.code === MODEL.code)]) {
            const current = await resources.get(`/api/resources/vehicle-types/${type.id}`)
            await resources.patch(`/api/resources/vehicle-types/${type.id}`, {active: false, version: current.version}).catch(() => undefined)
        }
        for (const person of created.people) {
            await resources.delete(`/api/resources/people/${person.id}`).catch(() => undefined)
        }
    } finally {
        await resources.dispose()
    }
    const configuration = await apiAs(playwright, 'config.responsable')
    try {
        for (const [path, entry] of [['track-access-points', created.accessPoint], ['tracks', created.track], ['stations', created.station],
            ['execution-packages', created.package]]) {
            if (entry) {
                await configuration.delete(`/api/configuration/${path}/${entry.id}`)
            }
        }
    } finally {
        await configuration.dispose()
    }
})

test('un equipo nace con su jefe y 2 linemen, nadie sale con 2, y entra y sale un tercero', async ({page}) => {
    await page.goto('/recursos/organigrama')
    await signIn(page, 'recursos.responsable')
    const tree = page.getByRole('treegrid', {name: 'Organigrama'})
    // La fila de MNT por su botón: su nombre empieza por «Plegar MNT …» en cuanto tiene hijos (el equipo del
    // beforeAll), así que un /^MNT · / no la encuentra.
    await expect(tree.getByRole('button', {name: 'Abrir MNT', exact: true})).toBeVisible()

    await tree.getByRole('button', {name: 'Nueva unidad debajo de MNT'}).click()
    const editor = page.getByRole('dialog', {name: 'Nueva unidad'})
    await editor.getByRole('textbox', {name: 'Código'}).fill(UI_TEAM.code)
    await editor.getByRole('textbox', {name: 'Nombre'}).fill(UI_TEAM.name)
    await chooseOption(page, editor, 'Nivel', 'Equipo')
    await searchAndChoose(page, editor, 'Jefe', created.leader.code, personLabel(created.leader))
    for (const lineman of created.linemen.slice(0, 2)) {
        await searchAndChoose(page, editor, 'Linemen', lineman.code, personLabel(lineman))
        await page.keyboard.press('Escape')
    }
    await editor.getByRole('button', {name: 'Guardar'}).click()
    await expect(page.getByText(`Guardada ${UI_TEAM.code} · ${UI_TEAM.name}`)).toBeVisible()

    await tree.getByRole('button', {name: `Abrir ${UI_TEAM.code}`}).click()
    await expect(page.getByRole('heading', {name: `${UI_TEAM.code} · ${UI_TEAM.name}`, level: 2})).toBeVisible()
    const unit = page.url().split('/').at(-1)
    created.units.push({id: unit})
    const linemen = page.getByRole('table', {name: `Linemen de ${UI_TEAM.code}`})
    await expect(linemen.getByRole('row')).toHaveCount(3)
    for (const lineman of created.linemen.slice(0, 2)) {
        await expect(page.getByRole('button', {name: `Sale del equipo ${personLabel(lineman)}`})).toBeDisabled()
    }

    await page.getByRole('button', {name: 'Añadir lineman'}).click()
    const adding = page.getByRole('dialog', {name: `Añadir lineman a ${UI_TEAM.code} · ${UI_TEAM.name}`})
    const third = created.linemen[2]
    await searchAndChoose(page, adding, 'Lineman', third.code, personLabel(third))
    await adding.getByRole('button', {name: 'Añadir'}).click()
    await expect(page.getByText(`Entra un lineman en ${UI_TEAM.code}`)).toBeVisible()
    await expect(linemen.getByRole('row')).toHaveCount(4)

    await page.getByRole('button', {name: `Sale del equipo ${personLabel(third)}`}).click()
    const leaving = page.getByRole('dialog', {name: `${personLabel(third)} sale de ${UI_TEAM.code} · ${UI_TEAM.name}`})
    await leaving.getByRole('button', {name: 'Sale del equipo'}).click()
    await expect(page.getByText(`${personLabel(third)} sale de ${UI_TEAM.code}`)).toBeVisible()
    await expect(linemen.getByRole('row')).toHaveCount(3)
})

test('un modelo bivial 9A y un vehículo suyo, puesto en vía por un punto de acceso, en el tablero y en sus ubicaciones', async ({page, playwright}) => {
    // Con la espera del evento del punto de acceso, más margen.
    test.setTimeout(180_000)
    // Un punto de acceso de la vía, para encarrilar la bivial. Se pone aquí y no en beforeAll, para que sin él
    // solo falle esta prueba; llega a mto-resources por evento, así que se espera a que lo ofrezca.
    const configuration = await apiAs(playwright, 'config.responsable')
    try {
        created.accessPoint = await configuration.post('/api/configuration/track-access-points', {
            name: ACCESS_POINT, trackId: created.track.id, stationId: created.station.id, kp: 900.1, kind: 'PREPARED_ACCESS', side: 'LEFT',
            roadRailAccess: true, enabled: true,
        })
    } finally {
        await configuration.dispose()
    }
    const resources = await apiAs(playwright, 'recursos.responsable')
    try {
        await expect.poll(async () => {
            const points = await resources.get(`/api/resources/track-access-points?trackId=${created.track.id}&enabled=true`)
            return points.map((point) => point.name)
        }, {timeout: 60_000}).toContain(ACCESS_POINT)
    } finally {
        await resources.dispose()
    }

    await page.goto('/recursos/flota/modelos')
    await signIn(page, 'recursos.responsable')
    await expect(page.getByRole('heading', {name: 'Modelos de vehículo', level: 2})).toBeVisible()

    await page.getByRole('button', {name: 'Nuevo modelo'}).click()
    const model = page.getByRole('dialog', {name: 'Nuevo modelo de vehículo'})
    await model.getByRole('textbox', {name: 'Código'}).fill(MODEL.code)
    await model.getByRole('textbox', {name: 'Nombre'}).fill(MODEL.name)
    await chooseOption(page, model, 'Movilidad', 'Bivial')
    await chooseOption(page, model, 'Categoría', 'Camión bivial')
    await chooseOption(page, model, 'Equipo ferroviario', '9A · tracción en la rueda ferroviaria')
    await model.getByRole('button', {name: 'Guardar'}).click()
    await expect(page.getByText(`Guardado ${MODEL.code} · ${MODEL.name}`)).toBeVisible()

    await openFromMenu(page, 'Recursos', 'Vehículos')
    await page.getByRole('button', {name: 'Nuevo vehículo'}).click()
    const vehicle = page.getByRole('dialog', {name: 'Nuevo vehículo'})
    await vehicle.getByRole('textbox', {name: 'Código (número de flota)'}).fill(VEHICLE.code)
    await vehicle.getByRole('textbox', {name: 'Nombre'}).fill(VEHICLE.name)
    await chooseOption(page, vehicle, 'Modelo', `${MODEL.code} · ${MODEL.name}`)
    await vehicle.getByRole('textbox', {name: 'Matrícula'}).fill(`E2E-${SUFFIX}-B`)
    await vehicle.getByRole('button', {name: 'Guardar'}).click()
    await expect(page.getByText(`Guardado ${VEHICLE.code} · ${VEHICLE.name}`)).toBeVisible()

    await page.getByRole('textbox', {name: 'Buscar'}).fill(VEHICLE.code)
    await page.getByRole('button', {name: `Registrar dónde está ${VEHICLE.code}`}).click()
    const locating = page.getByRole('dialog', {name: `Registrar dónde está ${VEHICLE.code} · ${VEHICLE.name}`})
    await chooseOption(page, locating, 'Dónde está', 'En vía')
    await chooseOption(page, locating, 'Vía', TRACK)
    await locating.getByRole('textbox', {name: 'KP'}).fill('900.15')
    // Su opción dice además el tipo y el kp, tal como los guarda mto-resources.
    await locating.getByRole('combobox', {name: 'Punto de acceso', exact: true}).click()
    await page.getByRole('option', {name: new RegExp(`^${ACCESS_POINT} · Acceso preparado`)}).click()
    await locating.getByRole('button', {name: 'Registrar'}).click()
    await expect(page.getByText(`Registrado dónde está ${VEHICLE.code}`)).toBeVisible()

    await openFromMenu(page, 'Recursos', 'Tablero de la flota')
    await chooseOption(page, page, 'Vía', TRACK)
    const board = page.getByRole('table', {name: 'Tablero de la flota'})
    const row = board.getByRole('row').filter({hasText: VEHICLE.code})
    await expect(row).toContainText('900.15')
    await expect(row).toContainText('En vía')

    await row.getByRole('button', {name: `Abrir ${VEHICLE.code}`}).click()
    await expect(page.getByRole('heading', {name: `${VEHICLE.code} · ${VEHICLE.name}`, level: 2})).toBeVisible()
    created.vehicles.push({id: page.url().split('/').at(-1)})
    await expect(page.getByLabel('Dónde está', {exact: true})).toContainText(`Acceso: ${ACCESS_POINT}`)
    await page.getByRole('tab', {name: 'Ubicaciones'}).click()
    await expect(page.getByRole('table', {name: `Ubicaciones de ${VEHICLE.code}`}).getByRole('row').filter({hasText: 'En vía'}))
        .toContainText(ACCESS_POINT)
})

test('un equipo de mto-resources trabaja un turno de mantenimiento y su vehículo queda donde dice el cierre', async ({page, playwright}) => {
    // El equipo llega a mantenimiento por evento: se espera a que esté sincronizado.
    const maintenance = await apiAs(playwright, 'mantenimiento.responsable')
    try {
        await expect.poll(async () => (await maintenance.get('/api/maintenance/teams'))
            .find((team) => team.code === SHIFT_TEAM.code)?.synchronizedFromResources ?? false, {timeout: 60_000}).toBe(true)
    } finally {
        await maintenance.dispose()
    }

    await page.goto('/mantenimiento/turnos')
    await signIn(page, 'mantenimiento.responsable')
    await expect(page.getByRole('heading', {name: 'Turnos', level: 2})).toBeVisible()
    await page.getByRole('button', {name: 'Nuevo turno'}).click()
    const editor = page.getByRole('dialog', {name: 'Nuevo turno'})
    await chooseOption(page, editor, 'Posesión', 'Total')
    await editor.getByRole('combobox', {name: 'Vías'}).click()
    await page.getByRole('option', {name: TRACK, exact: true}).click()
    await page.keyboard.press('Escape')
    // La dotación y el vehículo no se dicen: los copia el servicio del equipo.
    await chooseOption(page, editor, 'Equipo', `${SHIFT_TEAM.code} - ${SHIFT_TEAM.name}`)
    await editor.getByRole('button', {name: 'Guardar'}).click()
    const heading = page.getByRole('heading', {level: 2, name: /^SH-\d+ · /})
    await expect(heading).toBeVisible()
    const shift = (await heading.textContent()).split(' · ')[0]
    await expect(page.getByLabel('Dotación del turno')).toContainText(personLabel(created.shiftLeader))
    await expect(page.getByLabel('Vehículos del turno')).toContainText(SHIFT_VEHICLE.code)

    await page.getByRole('button', {name: 'Iniciar'}).click()
    await page.getByRole('dialog', {name: `Iniciar ${shift}`}).getByRole('button', {name: 'Iniciar'}).click()
    await expect(page.getByText(`${shift}: en curso`)).toBeVisible()

    await page.getByRole('button', {name: 'Cerrar', exact: true}).click()
    const closing = page.getByRole('dialog', {name: `Cerrar ${shift}`})
    const parking = closing.getByRole('group', {name: `Dónde queda ${SHIFT_VEHICLE.code}`})
    await chooseOption(page, parking, 'Vía', TRACK)
    await parking.getByRole('textbox', {name: 'KP'}).fill('900.12')
    await closing.getByRole('button', {name: 'Cerrar'}).last().click()
    await expect(page.getByText(`${shift}: cerrado`)).toBeVisible()
    await expect(page.getByLabel('Vehículos del turno')).toContainText(`aparcado: ${TRACK} kp 900.12`)

    // mto-resources lee el cierre del turno y mueve el vehículo allí, como dejado por el turno.
    const resources = await apiAs(playwright, 'recursos.responsable')
    try {
        await expect.poll(async () => {
            const position = (await resources.get(`/api/resources/vehicles/${created.shiftVehicle.id}`)).position
            return position ? `${position.kind} ${position.source} ${position.trackId} ${Number(position.kp)}` : 'sin posición'
        }, {timeout: 60_000}).toBe(`PARKED SHIFT ${created.track.id} 900.12`)
    } finally {
        await resources.dispose()
    }
})

test('la ficha de una persona enseña sus cualificaciones con cómo está cada una, y una nueva se da de alta en pantalla', async ({page}) => {
    const leader = created.shiftLeader
    await page.goto('/recursos/personal')
    await signIn(page, 'recursos.responsable')
    await expect(page.getByRole('heading', {name: 'Personal', level: 2})).toBeVisible()
    await page.getByRole('textbox', {name: 'Buscar'}).fill(leader.code)
    await page.getByRole('button', {name: `Abrir ${leader.code}`}).click()
    await expect(page.getByRole('heading', {name: personLabel(leader), level: 2})).toBeVisible()

    const qualifications = page.getByRole('table', {name: `Cualificaciones de ${leader.code}`})
    await expect(qualifications.getByRole('row').filter({hasText: 'RR-OPERATOR'})).toContainText('No caduca')

    await page.getByRole('button', {name: 'Añadir cualificación'}).click()
    const adding = page.getByRole('dialog', {name: `Nueva cualificación de ${personLabel(leader)}`})
    await chooseOption(page, adding, 'Tipo', 'LIC-B · Driving licence B')
    await adding.getByRole('textbox', {name: 'Caduca'}).fill('31/12/2035')
    await adding.getByRole('button', {name: 'Guardar'}).click()
    await expect(page.getByText(`Guardada LIC-B de ${leader.code}`)).toBeVisible()
    await expect(qualifications.getByRole('row').filter({hasText: 'LIC-B'})).toContainText('Vigente')
})
