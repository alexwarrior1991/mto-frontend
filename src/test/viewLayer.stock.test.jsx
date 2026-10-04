import {screen, waitFor, within} from '@testing-library/react'
import {http, HttpResponse} from 'msw'
import {describe, expect, it} from 'vitest'
import {buildMenu} from '../app/navigation.js'
import {P} from '../auth/permissions.js'
import {stockKey} from '../features/stock/useStock.js'
import {renderRoute} from './render.jsx'
import {server} from './server.js'
import {loginAs, sessionWith} from './session.js'

/**
 * Las pantallas de almacén (almacen/*) con los casos de almacén de ViewLayerTest del backoffice: los
 * catálogos paginados, buscados, ordenados y filtrados en el servicio; lo que ve quien solo lee; el
 * alta sin active y la modificación con él; los errores del servicio; el proyecto sincronizado; las
 * cifras y el libro de un material y los bajo mínimo; el libro entero; las cuatro operaciones; las
 * reservas con lo que admite cada una; los conjuntos con su lista y su disponibilidad; y el historial.
 * Y lo que el backoffice no hacía: un código repetido no pide recargar, los filtros encuentran lo
 * retirado, un error sobre la lista de materiales cae bajo ella, consumir deja viejo el libro y sin
 * columna elegida se manda el orden de la pantalla.
 */

const BASE = '/api/stock'

const WH1 = '2b2b2b2b-0000-4000-8000-000000000001'
const PRJ_MANUAL = '2b2b2b2b-0000-4000-8000-000000000002'
const PRJ_SYNCED = '2b2b2b2b-0000-4000-8000-000000000003'
const MAT1 = '2b2b2b2b-0000-4000-8000-000000000004'
const WH2 = '2b2b2b2b-0000-4000-8000-000000000005'
const SUP1 = '2b2b2b2b-0000-4000-8000-000000000006'
const RES1 = '2b2b2b2b-0000-4000-8000-000000000007'
const ASM1 = '2b2b2b2b-0000-4000-8000-000000000008'
const MAT2 = '2b2b2b2b-0000-4000-8000-000000000009'
const RES2 = '2b2b2b2b-0000-4000-8000-00000000000a'
const WH_RETIRED = '2b2b2b2b-0000-4000-8000-00000000000b'

const AUDIT = Object.freeze({createdAt: '2026-09-01T08:00:00Z', updatedAt: '2026-09-02T08:00:00Z', createdBy: 'almacen.operario',
    updatedBy: 'almacen.operario'})

// Los resúmenes que llegan dentro de un apunte, una reserva o un conjunto.
const HILO = Object.freeze({id: MAT1, code: 'MAT-001', name: 'Hilo de contacto', unitOfMeasure: 'm', active: true})
const GRAPA = Object.freeze({id: MAT2, code: 'MAT-002', name: 'Grapa', unitOfMeasure: 'ud', active: true})
const CENTRAL = Object.freeze({id: WH1, code: 'WH-000', name: 'Central', active: true})
const NAVE2 = Object.freeze({id: WH2, code: 'WH-002', name: 'Nave 2', active: true})
const NAVE4 = Object.freeze({id: WH_RETIRED, code: 'WH-004', name: 'Nave 4', active: false})
const RAIL = Object.freeze({id: SUP1, code: 'SUP-001', name: 'Rail', active: true})
const TRAMO = Object.freeze({id: PRJ_MANUAL, code: 'PRJ-001', name: 'Renovación', active: true})
const EP42 = Object.freeze({id: PRJ_SYNCED, code: 'EP-42', name: 'Tramo Sants-Sagrera', active: true})

// Las filas de los catálogos.
const materialRow = (summary, minimum = 100) => ({...summary, minimumStockLevel: minimum, audit: AUDIT})
const entryRow = (summary) => ({...summary, audit: AUDIT})
const projectRow = (summary, synchronized) => ({
    ...summary, sourceService: synchronized ? 'mto-configuration' : null, synchronizedFromMasterData: synchronized, audit: AUDIT,
})
const MATERIALS = [materialRow(HILO), materialRow(GRAPA, 50)]
const WAREHOUSES = [entryRow(CENTRAL), entryRow(NAVE2), entryRow(NAVE4)]
const SUPPLIERS = [entryRow(RAIL)]
const PROJECTS = [projectRow(TRAMO, false), projectRow(EP42, true)]

function mensula(components = [[HILO, 2], [GRAPA, 4]], active = true) {
    return {
        id: ASM1, code: 'ASM-001', name: 'Ménsula', active,
        components: components.map(([material, quantity], index) => ({id: `line-${index}`, material, quantity, audit: AUDIT})),
        audit: AUDIT,
    }
}

let sequence = 0

function movement(type, signedQuantity, extra = {}) {
    sequence += 1
    return {
        id: `mv-${sequence}`, type, quantity: Math.abs(signedQuantity), signedQuantity, material: HILO, warehouse: CENTRAL, supplier: null,
        project: EP42, reservation: null, relatedMovement: null, occurredAt: '2026-09-10T10:00:00Z', externalReference: 'OT-7', notes: null,
        audit: AUDIT, ...extra,
    }
}

function reservation(id, status, quantity, extra = {}) {
    const active = status === 'ACTIVE'
    return {
        id, material: HILO, warehouse: CENTRAL, project: TRAMO, quantity, status, reservedAt: '2026-09-12T08:00:00Z',
        releasedAt: active ? null : '2026-09-13T08:00:00Z', active, audit: AUDIT, ...extra,
    }
}

function figuresOf(available, lowStock, warehouse = CENTRAL) {
    return {
        material: HILO, warehouse, onHandQuantity: 12.5, activeReservedQuantity: 2, availableQuantity: available, minimumStockLevel: 100,
        lowStock, calculatedAt: '2026-09-21T10:00:00Z',
    }
}

function revision(number, operation, author, source, entity) {
    return {
        revision: {revision: number, revisionAt: `2026-09-0${number}T10:00:00Z`, operation, author, source, correlationId: `corr-${number}`},
        entity,
    }
}

/** El JSON de error de mto-stock, que no es problem+json. */
function stockError(status, errorCode, message, validationErrors = []) {
    return HttpResponse.json({
        timestamp: '2026-09-21T10:00:00Z', status, error: 'ERROR', message, path: '/api/v1/inventory', method: 'POST', errorCode,
        correlationId: `corr-${errorCode}`, validationErrors,
    }, {status})
}

function pageOf(rows, url) {
    const number = Number(url.searchParams.get('page') ?? 0)
    const size = Number(url.searchParams.get('size') ?? 20)
    return {
        content: rows.slice(number * size, number * size + size),
        page: {number, size, totalElements: rows.length, totalPages: Math.ceil(rows.length / size), first: number === 0,
            last: (number + 1) * size >= rows.length},
    }
}

/** Ordena como Spring: por cada sort que llega, en su orden, hasta que uno distinga. */
function sorted(rows, url) {
    const orders = url.searchParams.getAll('sort').map((sort) => sort.split(','))
    return [...rows].sort((a, b) => {
        for (const [field, direction] of orders) {
            const left = a[field]
            const right = b[field]
            const compared = typeof left === 'string' ? left.localeCompare(right) : Number(left) - Number(right)
            if (compared !== 0) {
                return direction === 'desc' ? -compared : compared
            }
        }
        return 0
    })
}

const has = (url, name) => url.searchParams.has(name)
const param = (url, name) => url.searchParams.get(name)

/**
 * mto-stock en el gateway simulado, como el de verdad: cada catálogo busca search en el código o el
 * nombre, filtra active solo si viene, ordena por los sort que llegan y pagina con page y size; las
 * demás listas filtran por lo que reciben. Sin revisiones, el historial es un 404. Apunta cada
 * petición de lectura.
 */
function serveStock({
    materials = MATERIALS, warehouses = WAREHOUSES, suppliers = SUPPLIERS, projects = PROJECTS, assemblies = [],
    lowStock = {}, figures = {}, ledger = [], movements = [], reservations = [], revisions = {}, availability = {},
} = {}) {
    const requests = []
    const log = (request) => {
        const url = new URL(request.url)
        requests.push(url)
        return url
    }
    const catalogues = {materials, warehouses, suppliers, projects, assemblies}
    for (const [catalogue, rows] of Object.entries(catalogues)) {
        server.use(http.get(`${BASE}/${catalogue}`, ({request}) => {
            const url = log(request)
            const search = (param(url, 'search') ?? '').toLowerCase()
            const matching = rows.filter((row) => (!search || `${row.code} ${row.name}`.toLowerCase().includes(search))
                && (!has(url, 'active') || String(row.active) === param(url, 'active')))
            return HttpResponse.json(pageOf(sorted(matching, url), url))
        }))
    }
    server.use(
        http.get(`${BASE}/materials/low-stock`, ({request}) => {
            const url = log(request)
            return HttpResponse.json(pageOf(lowStock[param(url, 'warehouseId') ?? ''] ?? [], url))
        }),
        http.get(`${BASE}/materials/:id/stock`, ({request, params}) => {
            const url = log(request)
            const found = figures[`${params.id}|${param(url, 'warehouseId') ?? ''}`]
            return found ? HttpResponse.json(found) : stockError(404, 'MAT-404', `Material not found: ${params.id}`)
        }),
        http.get(`${BASE}/materials/:id/movements`, ({request, params}) => {
            const url = log(request)
            const rows = ledger.filter((row) => row.material.id === params.id
                && (!has(url, 'warehouseId') || row.warehouse.id === param(url, 'warehouseId')))
            return HttpResponse.json(pageOf(rows, url))
        }),
        http.get(`${BASE}/movements`, ({request}) => {
            const url = log(request)
            const rows = movements.filter((row) => (!has(url, 'movementType') || row.type === param(url, 'movementType'))
                && (!has(url, 'warehouseId') || row.warehouse.id === param(url, 'warehouseId'))
                && (!has(url, 'materialId') || row.material.id === param(url, 'materialId'))
                && (!has(url, 'projectId') || row.project?.id === param(url, 'projectId')))
            return HttpResponse.json(pageOf(rows, url))
        }),
        http.get(`${BASE}/reservations`, ({request}) => {
            const url = log(request)
            const rows = reservations.filter((row) => (!has(url, 'status') || row.status === param(url, 'status'))
                && (!has(url, 'warehouseId') || row.warehouse.id === param(url, 'warehouseId'))
                && (!has(url, 'materialId') || row.material.id === param(url, 'materialId'))
                && (!has(url, 'projectId') || row.project.id === param(url, 'projectId')))
            return HttpResponse.json(pageOf(sorted(rows, url), url))
        }),
        http.get(`${BASE}/:resource/:id/revisions`, ({request, params}) => {
            const url = log(request)
            const rows = revisions[params.id]
            return rows ? HttpResponse.json(pageOf(rows, url)) : stockError(404, 'APP-404', `No revisions found for ${params.id}`)
        }),
        http.get(`${BASE}/assemblies/:id/availability`, ({request, params}) => {
            const url = log(request)
            return HttpResponse.json(availability[`${params.id}|${param(url, 'warehouseId')}`])
        }),
    )
    return requests
}

/** Las lecturas de una ruta, en su orden. */
function readsOf(requests, path) {
    return requests.filter((url) => url.pathname === path)
}

/** Recoge los cuerpos que llegan a una escritura (null si no lleva) y contesta con respond(cuerpo). */
function recordWrites(method, path, respond) {
    const bodies = []
    server.use(http[method](path, async ({request}) => {
        const text = await request.text()
        const body = text ? JSON.parse(text) : null
        bodies.push(body)
        return respond(body)
    }))
    return bodies
}

function table(name) {
    return screen.getByRole('table', {name})
}

/** Las filas con datos de una tabla, cada una como el texto de sus celdas. */
function dataRows(name) {
    return within(table(name)).getAllByRole('row').slice(1)
        .map((row) => within(row).queryAllByRole('cell'))
        .filter((cells) => cells.length > 1)
}

function firstColumn(name) {
    return dataRows(name).map((cells) => cells[0].textContent)
}

function rowOf(name, text) {
    return within(table(name)).getAllByRole('row')
        .find((row) => within(row).queryAllByRole('cell').some((cell) => cell.textContent === text))
}

/** Los nombres de las acciones de una fila, en su orden. */
function actionsOf(row) {
    return within(row).queryAllByRole('button').map((button) => button.getAttribute('aria-label'))
}

async function open(path, session, tableName, expected) {
    const view = renderRoute(path, {session})
    await waitFor(() => expect(firstColumn(tableName)).toHaveLength(expected))
    return view
}

/** Elige en un desplegable: lo abre (los del almacén piden entonces su primera página) y pulsa la opción. */
async function choose(user, container, label, option) {
    await user.click(within(container).getByRole('combobox', {name: label}))
    await user.click(await screen.findByRole('option', {name: option}))
}

/**
 * Quita el filtro de estado de las reservas como lo haría alguien con el teclado: el botón de borrar de
 * Mantine no es accesible, pero elegir otra vez lo elegido lo deselecciona (allowDeselect).
 */
async function showAllStates(user) {
    await choose(user, document.body, 'Estado', 'Activa')
    await waitFor(() => expect(screen.getByRole('combobox', {name: 'Estado'})).toHaveValue(''))
}

async function typeInto(user, container, label, text) {
    const field = within(container).getByRole('textbox', {name: label})
    await user.clear(field)
    if (text) {
        await user.type(field, text)
    }
    return field
}

describe('el menú y las rutas', () => {
    it('las ocho pantallas cuelgan de «Almacén» para quien lee el almacén, en su orden, y ya no están pendientes', async () => {
        serveStock()
        const stock = buildMenu(loginAs('almacen.lector')).find((item) => item.key === 'almacen')
        expect(stock.children.map((child) => [child.label, child.path])).toEqual([
            ['Existencias', '/almacen'], ['Materiales', '/almacen/materiales'], ['Almacenes', '/almacen/almacenes'],
            ['Proveedores', '/almacen/proveedores'], ['Proyectos', '/almacen/proyectos'], ['Movimientos', '/almacen/movimientos'],
            ['Reservas', '/almacen/reservas'], ['Conjuntos', '/almacen/conjuntos']])
        const keys = buildMenu(loginAs('almacen.lector')).map((item) => item.key ?? item.path)
        expect(keys).not.toContain('infraestructura')
        expect(keys).not.toContain('usuarios')
        expect(buildMenu(loginAs('config.responsable')).some((item) => item.key === 'almacen')).toBe(false)

        await open('/almacen/almacenes', loginAs('almacen.lector'), 'Almacenes', 3)
        expect(screen.getByRole('heading', {name: 'Almacenes', level: 2})).toBeInTheDocument()
        expect(screen.queryByText(/Llega en la fase/)).not.toBeInTheDocument()
        await waitFor(() => expect(document.title).toBe('Almacenes · MTO'))
    })

    it('un rol de realm llamado como un permiso no abre el almacén ni pide nada al servicio', async () => {
        renderRoute('/almacen/almacenes', {session: sessionWith([P.NOTIFICATION_INBOX], {realmRoles: ['stock-read', 'mto-warehouse-admin']})})

        expect(await screen.findByText('No tienes permiso para abrir esta pantalla')).toBeInTheDocument()
        expect(screen.getByText('stock-read')).toBeInTheDocument()
    })
})

describe('los catálogos', () => {
    function manyWarehouses() {
        return [entryRow(CENTRAL), ...Array.from({length: 119}, (_, index) => entryRow({
            id: `wh-${index + 1}`, code: `WH-${String(index + 1).padStart(3, '0')}`, name: `Nave ${index + 1}`, active: (index + 1) % 4 !== 0,
        }))]
    }

    it('la lista se pagina, se busca, se filtra y se ordena en el servicio, y sin columna elegida va por código', async () => {
        const requests = serveStock({warehouses: manyWarehouses()})
        const {user} = await open('/almacen/almacenes', loginAs('almacen.lector'), 'Almacenes', 50)
        const lists = () => readsOf(requests, `${BASE}/warehouses`)

        expect(screen.getByText('120 almacenes')).toBeInTheDocument()
        expect(firstColumn('Almacenes')[0]).toBe('WH-000')
        expect(lists()[0].search).toBe('?page=0&size=50&sort=code%2Casc&sort=id%2Casc')
        await user.click(screen.getByRole('button', {name: 'Página 2'}))
        await waitFor(() => expect(firstColumn('Almacenes')[0]).toBe('WH-050'))
        expect(param(lists().at(-1), 'page')).toBe('1')

        await user.type(screen.getByRole('textbox', {name: 'Buscar por código o nombre'}), 'nave 1')
        await waitFor(() => expect(screen.getByText('31 almacenes')).toBeInTheDocument())
        expect(param(lists().at(-1), 'search')).toBe('nave 1')
        expect(param(lists().at(-1), 'page')).toBe('0')

        await choose(user, document.body, 'Estado', 'Retirados')
        await waitFor(() => expect(screen.getByText('7 almacenes')).toBeInTheDocument())
        expect(firstColumn('Almacenes')).toEqual(['WH-012', 'WH-016', 'WH-100', 'WH-104', 'WH-108', 'WH-112', 'WH-116'])
        expect(param(lists().at(-1), 'active')).toBe('false')

        await user.click(screen.getByRole('button', {name: 'Nombre'}))
        await user.click(screen.getByRole('button', {name: 'Nombre'}))
        await waitFor(() => expect(lists().at(-1).searchParams.getAll('sort')).toEqual(['name,desc', 'id,asc']))
        await waitFor(() => expect(firstColumn('Almacenes')).toEqual(['WH-016', 'WH-012', 'WH-116', 'WH-112', 'WH-108', 'WH-104', 'WH-100']))
        await user.click(screen.getByRole('button', {name: 'Nombre'}))
        await waitFor(() => expect(lists().at(-1).searchParams.getAll('sort')).toEqual(['code,asc', 'id,asc']))
    })

    it('quien solo lee ve la lista sin controles de escritura: solo el historial de cada fila', async () => {
        serveStock()
        const {user} = await open('/almacen/materiales', loginAs('almacen.lector'), 'Materiales', 2)

        const hilo = rowOf('Materiales', 'MAT-001')
        expect(within(hilo).getAllByRole('cell').map((cell) => cell.textContent).slice(0, 5))
            .toEqual(['MAT-001', 'Hilo de contacto', 'm', '100', 'Sí'])
        expect(screen.queryByRole('button', {name: 'Nuevo'})).not.toBeInTheDocument()
        expect(actionsOf(hilo)).toEqual(['Historial de MAT-001 - Hilo de contacto'])
        await user.dblClick(hilo)
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('el alta de un almacén manda código y nombre, sin estado; modificarlo manda también si sigue activo', async () => {
        serveStock({warehouses: [entryRow(CENTRAL)]})
        const creates = recordWrites('post', `${BASE}/warehouses`, (body) => HttpResponse.json({...body, id: 'wh-9', active: true}, {status: 201}))
        const updates = recordWrites('put', `${BASE}/warehouses/${WH1}`, (body) => HttpResponse.json({...CENTRAL, ...body}))
        const {user} = await open('/almacen/almacenes', loginAs('almacen.operario'), 'Almacenes', 1)

        await user.click(screen.getByRole('button', {name: 'Nuevo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Alta de almacén'})
        expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument()
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('El código es obligatorio')).toBeInTheDocument()
        expect(creates).toHaveLength(0)
        await typeInto(user, dialog, 'Código', 'WH-009')
        await typeInto(user, dialog, 'Nombre', ' Nave 9 ')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        expect(await screen.findByText('Guardado WH-009')).toBeInTheDocument()
        expect(creates).toEqual([{code: 'WH-009', name: 'Nave 9'}])
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

        await user.click(screen.getByRole('button', {name: 'Modificar WH-000 - Central'}))
        const editor = await screen.findByRole('dialog', {name: 'Modificar almacén WH-000'})
        const active = within(editor).getByRole('checkbox', {name: 'Activo'})
        expect(active).toBeChecked()
        await user.click(active)
        await user.click(within(editor).getByRole('button', {name: 'Guardar'}))

        await waitFor(() => expect(updates).toEqual([{code: 'WH-000', name: 'Central', active: false}]))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('los errores del servicio caen en su campo, lo que no tiene campo se avisa y el diálogo sigue abierto', async () => {
        serveStock()
        server.use(http.post(`${BASE}/suppliers`, () => stockError(400, 'REQ-VALIDATION', 'Request validation failed.', [
            {field: 'code', message: 'size must be between 1 and 64'},
            {field: 'supplierRequest', message: 'something about the whole body'},
        ])))
        const {user} = await open('/almacen/proveedores', loginAs('almacen.operario'), 'Proveedores', 1)

        await user.click(screen.getByRole('button', {name: 'Nuevo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Alta de proveedor'})
        await typeInto(user, dialog, 'Código', 'SUP-1')
        await typeInto(user, dialog, 'Nombre', 'Rail')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        expect(await within(dialog).findByText('size must be between 1 and 64')).toBeInTheDocument()
        expect(within(dialog).getByRole('textbox', {name: 'Código'})).toHaveAttribute('aria-invalid', 'true')
        expect(await screen.findByText('supplierRequest: something about the whole body')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Alta de proveedor'})).toBeInTheDocument()
    })

    it('un código repetido se dice como tal, sin pedir recargar, y el diálogo sigue abierto con lo escrito', async () => {
        serveStock()
        server.use(http.post(`${BASE}/suppliers`, () => stockError(409, 'SUP-409', 'Supplier code already exists: SUP-001')))
        const {user} = await open('/almacen/proveedores', loginAs('almacen.operario'), 'Proveedores', 1)

        await user.click(screen.getByRole('button', {name: 'Nuevo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Alta de proveedor'})
        await typeInto(user, dialog, 'Código', 'SUP-001')
        await typeInto(user, dialog, 'Nombre', 'Otro')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        expect(await screen.findByText('Ya existe otro con ese código.')).toBeInTheDocument()
        expect(screen.getByText('Referencia: corr-SUP-409')).toBeInTheDocument()
        expect(screen.queryByText(/recarga/)).not.toBeInTheDocument()
        expect(within(dialog).getByRole('textbox', {name: 'Código'})).toHaveValue('SUP-001')
    })

    it('un proyecto sincronizado enseña su origen y no ofrece modificarlo: el servicio lo rechazaría con PRJ-001', async () => {
        serveStock()
        const {user} = await open('/almacen/proyectos', loginAs('almacen.operario'), 'Proyectos', 2)

        expect(within(rowOf('Proyectos', 'PRJ-001')).getByText('manual')).toBeInTheDocument()
        expect(within(rowOf('Proyectos', 'EP-42')).getByText('sincronizado de mto-configuration')).toBeInTheDocument()
        expect(actionsOf(rowOf('Proyectos', 'PRJ-001'))).toEqual(['Modificar PRJ-001 - Renovación', 'Historial de PRJ-001 - Renovación'])
        expect(actionsOf(rowOf('Proyectos', 'EP-42'))).toEqual(['Historial de EP-42 - Tramo Sants-Sagrera'])
        await user.dblClick(rowOf('Proyectos', 'EP-42'))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('el editor de materiales manda la unidad y el mínimo, y rechaza un mínimo negativo antes de llamar', async () => {
        serveStock()
        const creates = recordWrites('post', `${BASE}/materials`, (body) => HttpResponse.json({...body, id: 'mat-9', active: true}, {status: 201}))
        const {user} = await open('/almacen/materiales', loginAs('almacen.operario'), 'Materiales', 2)

        await user.click(screen.getByRole('button', {name: 'Nuevo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Alta de material'})
        await typeInto(user, dialog, 'Código', 'MAT-009')
        await typeInto(user, dialog, 'Nombre', 'Hilo')
        await typeInto(user, dialog, 'Unidad de medida', 'm')
        await typeInto(user, dialog, 'Stock mínimo', '-1')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('No puede ser negativo')).toBeInTheDocument()
        expect(creates).toHaveLength(0)

        await typeInto(user, dialog, 'Stock mínimo', '100')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        expect(await screen.findByText('Guardado MAT-009')).toBeInTheDocument()
        expect(creates).toEqual([{code: 'MAT-009', name: 'Hilo', unitOfMeasure: 'm', minimumStockLevel: 100}])
    })
})

describe('las existencias', () => {
    it('las cifras de un material en un almacén son las del servicio, con su libro; sin material no hay cifras', async () => {
        const requests = serveStock({
            figures: {[`${MAT1}|${WH1}`]: figuresOf(10.5, true)},
            ledger: [movement('OUTPUT', -3), movement('ENTRY', 10, {project: null, supplier: RAIL}), movement('ENTRY', 4, {warehouse: NAVE2})],
        })
        const {user} = renderRoute('/almacen', {session: loginAs('almacen.lector')})
        expect(await screen.findByRole('heading', {name: 'Existencias', level: 2})).toBeInTheDocument()
        expect(screen.queryByRole('region', {name: 'Existencias del material'})).not.toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Entrada'})).not.toBeInTheDocument()

        await choose(user, document.body, 'Almacén', 'WH-000 - Central')
        await choose(user, document.body, 'Material', 'MAT-001 - Hilo de contacto')

        const figures = await screen.findByRole('region', {name: 'Existencias del material'})
        expect(within(within(figures).getByRole('group', {name: 'Físico'})).getByText('12.5')).toBeInTheDocument()
        expect(within(within(figures).getByRole('group', {name: 'Reservado'})).getByText('2')).toBeInTheDocument()
        expect(within(within(figures).getByRole('group', {name: 'Disponible'})).getByText('10.5')).toBeInTheDocument()
        expect(within(within(figures).getByRole('group', {name: 'Mínimo'})).getByText('100')).toBeInTheDocument()
        expect(within(figures).getByText('Bajo mínimo')).toBeInTheDocument()
        expect(screen.getByRole('heading', {name: 'Movimientos de MAT-001 - Hilo de contacto en WH-000'})).toBeInTheDocument()
        await waitFor(() => expect(dataRows('Movimientos del material')).toHaveLength(2))
        expect(dataRows('Movimientos del material')[0].map((cell) => cell.textContent))
            .toEqual(['10/09/2026 10:00', 'Salida', 'WH-000', '-3', 'EP-42', '', 'OT-7', 'almacen.operario'].map((text) => expect.stringContaining(text)))
        expect(within(rowOf('Movimientos del material', 'Entrada')).getByText('SUP-001')).toBeInTheDocument()
        const ledger = readsOf(requests, `${BASE}/materials/${MAT1}/movements`).at(-1)
        expect(ledger.search).toBe(`?warehouseId=${WH1}&page=0&size=50&sort=occurredAt%2Cdesc&sort=id%2Casc`)
        expect(readsOf(requests, `${BASE}/materials/${MAT1}/stock`).map((url) => url.search)).toEqual([`?warehouseId=${WH1}`])
        expect(readsOf(requests, `${BASE}/warehouses`).every((url) => !has(url, 'active'))).toBe(true)
    })

    it('la lista bajo mínimo sigue al almacén elegido, y su fila elige el material', async () => {
        const requests = serveStock({
            lowStock: {'': [materialRow(HILO), materialRow(GRAPA, 50)], [WH1]: [materialRow(HILO)]},
            figures: {[`${MAT1}|${WH1}`]: figuresOf(1, true)},
        })
        const {user} = renderRoute('/almacen', {session: loginAs('almacen.lector')})
        await waitFor(() => expect(firstColumn('Bajo mínimo')).toEqual(['MAT-001', 'MAT-002']))
        expect(screen.getByText('2 materiales')).toBeInTheDocument()
        expect(readsOf(requests, `${BASE}/materials/low-stock`)[0].search).toBe('?page=0&size=50&sort=code%2Casc&sort=id%2Casc')

        await choose(user, document.body, 'Almacén', 'WH-000 - Central')
        await waitFor(() => expect(firstColumn('Bajo mínimo')).toEqual(['MAT-001']))
        expect(screen.getByText('1 material')).toBeInTheDocument()
        expect(param(readsOf(requests, `${BASE}/materials/low-stock`).at(-1), 'warehouseId')).toBe(WH1)

        await user.click(screen.getByRole('button', {name: 'Ver las existencias de MAT-001'}))
        expect(screen.getByRole('combobox', {name: 'Material'})).toHaveValue('MAT-001 - Hilo de contacto')
        expect(await screen.findByRole('region', {name: 'Existencias del material'})).toBeInTheDocument()
        expect(readsOf(requests, `${BASE}/materials/${MAT1}/stock`).map((url) => url.search)).toEqual([`?warehouseId=${WH1}`])
    })
})

describe('los movimientos', () => {
    it('el libro entero se filtra en el servicio por tipo, almacén, días y quién lo registró', async () => {
        const requests = serveStock({movements: [movement('ENTRY', 10, {supplier: RAIL, project: null})]})
        const {user} = await open('/almacen/movimientos', loginAs('almacen.lector'), 'Movimientos', 1)
        const lists = () => readsOf(requests, `${BASE}/movements`)

        expect(screen.getByText('1 movimiento')).toBeInTheDocument()
        expect(within(rowOf('Movimientos', '10/09/2026 10:00')).getByText('MAT-001 - Hilo de contacto')).toBeInTheDocument()
        expect(lists()[0].search).toBe('?page=0&size=50&sort=occurredAt%2Cdesc&sort=id%2Casc')
        expect(screen.queryByRole('button', {name: 'Salida'})).not.toBeInTheDocument()

        await choose(user, document.body, 'Tipo', 'Entrada')
        await choose(user, document.body, 'Almacén', 'WH-000 - Central')
        await typeInto(user, document.body, 'Desde', '01/09/2026')
        await typeInto(user, document.body, 'Hasta', '30/09/2026')
        await typeInto(user, document.body, 'Registrado por', 'ana')

        await waitFor(() => expect(param(lists().at(-1), 'user')).toBe('ana'))
        const filtered = lists().at(-1)
        expect(Object.fromEntries(['movementType', 'warehouseId', 'page'].map((name) => [name, param(filtered, name)])))
            .toEqual({movementType: 'ENTRY', warehouseId: WH1, page: '0'})
        expect(param(filtered, 'dateFrom')).toBe(new Date(2026, 8, 1).toISOString())
        expect(param(filtered, 'dateTo')).toBe(new Date(new Date(2026, 9, 1).getTime() - 1).toISOString())
        expect(has(filtered, 'materialId') || has(filtered, 'projectId')).toBe(false)
    })

    it('un apunte de un tipo que esta versión no conoce se pinta «Desconocido», pero no se ofrece como filtro', async () => {
        serveStock({movements: [movement('RETURN_TO_SUPPLIER', -3)]})
        const {user} = await open('/almacen/movimientos', loginAs('almacen.lector'), 'Movimientos', 1)

        expect(within(rowOf('Movimientos', '10/09/2026 10:00')).getByText('Desconocido')).toBeInTheDocument()
        expect(within(rowOf('Movimientos', '10/09/2026 10:00')).getByText('-3')).toBeInTheDocument()
        await user.click(screen.getByRole('combobox', {name: 'Tipo'}))
        expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['Entrada', 'Salida',
            'Ajuste positivo', 'Ajuste negativo', 'Transferencia entrante', 'Transferencia saliente'])
    })

    it('los filtros ofrecen también lo retirado, para encontrar lo de antes; un diálogo, solo lo activo', async () => {
        const requests = serveStock()
        const {user} = await open('/almacen/movimientos', loginAs('almacen.operario'), 'Movimientos', 0)

        await user.click(screen.getByRole('combobox', {name: 'Almacén'}))
        expect((await screen.findAllByRole('option')).map((option) => option.textContent))
            .toEqual(['WH-000 - Central', 'WH-002 - Nave 2', 'WH-004 - Nave 4 (retirado)'])
        expect(has(readsOf(requests, `${BASE}/warehouses`).at(-1), 'active')).toBe(false)
        await user.keyboard('{Escape}')

        await user.click(screen.getByRole('button', {name: 'Entrada'}))
        const dialog = await screen.findByRole('dialog', {name: 'Entrada'})
        await user.click(within(dialog).getByRole('combobox', {name: 'Almacén'}))
        await waitFor(() => expect(param(readsOf(requests, `${BASE}/warehouses`).at(-1), 'active')).toBe('true'))
        await waitFor(() => expect(screen.getAllByRole('option').map((option) => option.textContent))
            .toEqual(['WH-000 - Central', 'WH-002 - Nave 2']))
    })

    it('una entrada lleva el material elegido en la pantalla, el almacén, el proveedor y la cantidad, y relee las cifras', async () => {
        const requests = serveStock({figures: {[`${MAT1}|`]: figuresOf(10, false, null)}})
        const entries = recordWrites('post', `${BASE}/movements/entries`, () => HttpResponse.json(movement('ENTRY', 10), {status: 201}))
        const {user} = renderRoute('/almacen', {session: loginAs('almacen.operario')})
        await screen.findByRole('heading', {name: 'Existencias', level: 2})
        await choose(user, document.body, 'Material', 'MAT-001 - Hilo de contacto')
        await screen.findByRole('region', {name: 'Existencias del material'})

        await user.click(screen.getByRole('button', {name: 'Entrada'}))
        const dialog = await screen.findByRole('dialog', {name: 'Entrada'})
        expect(within(dialog).getByRole('combobox', {name: 'Material'})).toHaveValue('MAT-001 - Hilo de contacto')
        await user.click(within(dialog).getByRole('button', {name: 'Registrar'}))
        expect(await within(dialog).findByText('Elige el almacén')).toBeInTheDocument()
        expect(within(dialog).getByText('La cantidad es obligatoria')).toBeInTheDocument()
        expect(entries).toHaveLength(0)

        await choose(user, dialog, 'Almacén', 'WH-000 - Central')
        await choose(user, dialog, 'Proveedor', 'SUP-001 - Rail')
        await typeInto(user, dialog, 'Cantidad', '10')
        await typeInto(user, dialog, 'Referencia externa', 'ALB-1')
        await user.click(within(dialog).getByRole('button', {name: 'Registrar'}))

        expect(await screen.findByText('Entrada registrada: 10 m de MAT-001')).toBeInTheDocument()
        expect(entries).toEqual([{materialId: MAT1, warehouseId: WH1, supplierId: SUP1, quantity: 10, externalReference: 'ALB-1'}])
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        await waitFor(() => expect(readsOf(requests, `${BASE}/materials/${MAT1}/stock`)).toHaveLength(2))
        expect(readsOf(requests, `${BASE}/materials/${MAT1}/stock`).every((url) => url.search === '')).toBe(true)
    })

    it('una salida sin stock dice lo que dice el servicio y el diálogo sigue abierto para corregirla', async () => {
        serveStock()
        const outputs = recordWrites('post', `${BASE}/movements/outputs`, () => stockError(409, 'STK-001',
            `Insufficient stock for material ${MAT1} in warehouse ${WH1}: requested 5, available 2`))
        const {user} = await open('/almacen/movimientos', loginAs('almacen.operario'), 'Movimientos', 0)

        await user.click(screen.getByRole('button', {name: 'Salida'}))
        const dialog = await screen.findByRole('dialog', {name: 'Salida'})
        await choose(user, dialog, 'Material', 'MAT-001 - Hilo de contacto')
        await choose(user, dialog, 'Almacén', 'WH-000 - Central')
        await choose(user, dialog, 'Proyecto', 'EP-42 - Tramo Sants-Sagrera')
        await typeInto(user, dialog, 'Cantidad', '5')
        await typeInto(user, dialog, 'Referencia externa', '   ')
        await user.click(within(dialog).getByRole('button', {name: 'Registrar'}))

        expect(await screen.findByText(`No hay stock disponible suficiente. Insufficient stock for material ${MAT1} in warehouse ${WH1}: `
            + 'requested 5, available 2')).toBeInTheDocument()
        expect(outputs).toEqual([{materialId: MAT1, warehouseId: WH1, projectId: PRJ_SYNCED, quantity: 5}])
        expect(screen.getByRole('dialog', {name: 'Salida'})).toBeInTheDocument()
    })

    it('una transferencia exige otro almacén de destino y manda origen y destino', async () => {
        serveStock()
        const transfers = recordWrites('post', `${BASE}/movements/transfers`, () => HttpResponse.json([
            movement('OUTGOING_TRANSFER', -3), movement('INCOMING_TRANSFER', 3, {warehouse: NAVE2})], {status: 201}))
        const {user} = await open('/almacen/movimientos', loginAs('almacen.operario'), 'Movimientos', 0)

        await user.click(screen.getByRole('button', {name: 'Transferencia'}))
        const dialog = await screen.findByRole('dialog', {name: 'Transferencia'})
        await choose(user, dialog, 'Material', 'MAT-001 - Hilo de contacto')
        await choose(user, dialog, 'Almacén de origen', 'WH-000 - Central')
        await choose(user, dialog, 'Almacén de destino', 'WH-000 - Central')
        await typeInto(user, dialog, 'Cantidad', '3')
        await user.click(within(dialog).getByRole('button', {name: 'Registrar'}))
        expect(await within(dialog).findByText('El destino tiene que ser otro almacén')).toBeInTheDocument()
        expect(transfers).toHaveLength(0)

        await choose(user, dialog, 'Almacén de destino', 'WH-002 - Nave 2')
        await user.click(within(dialog).getByRole('button', {name: 'Registrar'}))

        expect(await screen.findByText('Transferencia registrada: 3 m de MAT-001')).toBeInTheDocument()
        expect(transfers).toEqual([{materialId: MAT1, sourceWarehouseId: WH1, targetWarehouseId: WH2, quantity: 3}])
    })

    it('un error del servicio sobre el almacén de origen de una transferencia cae en ese campo', async () => {
        serveStock()
        server.use(http.post(`${BASE}/movements/transfers`, () => stockError(400, 'REQ-VALIDATION', 'Request validation failed.', [
            {field: 'sourceWarehouseId', message: 'must not be null'},
        ])))
        const {user} = await open('/almacen/movimientos', loginAs('almacen.operario'), 'Movimientos', 0)

        await user.click(screen.getByRole('button', {name: 'Transferencia'}))
        const dialog = await screen.findByRole('dialog', {name: 'Transferencia'})
        await choose(user, dialog, 'Material', 'MAT-001 - Hilo de contacto')
        await choose(user, dialog, 'Almacén de origen', 'WH-000 - Central')
        await choose(user, dialog, 'Almacén de destino', 'WH-002 - Nave 2')
        await typeInto(user, dialog, 'Cantidad', '3')
        await user.click(within(dialog).getByRole('button', {name: 'Registrar'}))

        expect(await within(dialog).findByText('must not be null')).toBeInTheDocument()
        expect(within(dialog).getByRole('combobox', {name: 'Almacén de origen'})).toHaveAttribute('aria-invalid', 'true')
        expect(screen.queryByText(/sourceWarehouseId/)).not.toBeInTheDocument()
    })

    it('el ajuste pide stock-adjust además de stock-write', async () => {
        serveStock()
        await open('/almacen/movimientos', loginAs('almacen.operario'), 'Movimientos', 0)

        expect(screen.getByRole('button', {name: 'Entrada'})).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Ajuste'})).not.toBeInTheDocument()
    })

    it('un ajuste manda su sentido, su motivo y la fecha y hora escritas como el Instant de la zona del navegador', async () => {
        serveStock()
        const adjustments = recordWrites('post', `${BASE}/movements/adjustments`, () => HttpResponse.json(movement('NEGATIVE_ADJUSTMENT', -1),
            {status: 201}))
        const {user} = await open('/almacen/movimientos', loginAs('almacen.responsable'), 'Movimientos', 0)

        await user.click(screen.getByRole('button', {name: 'Ajuste'}))
        const dialog = await screen.findByRole('dialog', {name: 'Ajuste de inventario'})
        await choose(user, dialog, 'Material', 'MAT-001 - Hilo de contacto')
        await choose(user, dialog, 'Almacén', 'WH-000 - Central')
        await choose(user, dialog, 'Sentido', 'Negativo: falta material')
        await typeInto(user, dialog, 'Cantidad', '1')
        await typeInto(user, dialog, 'Fecha y hora', '10/09/2026 08:30')
        await typeInto(user, dialog, 'Notas', 'Rotura en obra')
        await user.click(within(dialog).getByRole('button', {name: 'Registrar'}))

        expect(await screen.findByText('Ajuste registrado: 1 m de MAT-001')).toBeInTheDocument()
        expect(adjustments).toEqual([{
            materialId: MAT1, warehouseId: WH1, direction: 'NEGATIVE', quantity: 1, occurredAt: new Date(2026, 8, 10, 8, 30).toISOString(),
            notes: 'Rotura en obra',
        }])
    })
})

describe('las reservas', () => {
    const ACTIVE = reservation(RES1, 'ACTIVE', 5)
    const CONSUMED = reservation(RES2, 'CONSUMED', 2)
    const LABEL = 'la reserva de MAT-001 para PRJ-001'

    it('se filtran y se ordenan en el servicio, empezando por las activas, y solo una activa ofrece cambios', async () => {
        const requests = serveStock({reservations: [ACTIVE, CONSUMED]})
        const {user} = await open('/almacen/reservas', loginAs('almacen.operario'), 'Reservas', 1)
        const lists = () => readsOf(requests, `${BASE}/reservations`)

        expect(screen.getByText('1 reserva')).toBeInTheDocument()
        expect(lists()[0].search).toBe('?status=ACTIVE&page=0&size=50&sort=reservedAt%2Cdesc&sort=id%2Casc')
        const active = rowOf('Reservas', 'Activa')
        expect(active).toHaveTextContent('MAT-001 - Hilo de contacto')
        expect(active).toHaveTextContent('PRJ-001')
        expect(actionsOf(active)).toEqual([`Modificar ${LABEL}`, `Salida con ${LABEL}`, `Consumir ${LABEL}`, `Liberar ${LABEL}`,
            `Historial de ${LABEL}`])

        await showAllStates(user)
        await waitFor(() => expect(screen.getByText('2 reservas')).toBeInTheDocument())
        expect(has(lists().at(-1), 'status')).toBe(false)
        expect(actionsOf(rowOf('Reservas', 'Consumida'))).toEqual([`Historial de ${LABEL}`])

        await choose(user, document.body, 'Almacén', 'WH-000 - Central')
        await choose(user, document.body, 'Material', 'MAT-001 - Hilo de contacto')
        await choose(user, document.body, 'Proyecto', 'PRJ-001 - Renovación')
        await waitFor(() => expect(param(lists().at(-1), 'projectId')).toBe(PRJ_MANUAL))
        expect(Object.fromEntries(['warehouseId', 'materialId', 'page'].map((name) => [name, param(lists().at(-1), name)])))
            .toEqual({warehouseId: WH1, materialId: MAT1, page: '0'})

        await user.click(screen.getByRole('button', {name: 'Cantidad'}))
        await user.click(screen.getByRole('button', {name: 'Cantidad'}))
        await waitFor(() => expect(lists().at(-1).searchParams.getAll('sort')).toEqual(['quantity,desc', 'id,asc']))
    })

    it('una reserva en un estado que esta versión no conoce solo ofrece su historial, también a quien puede todo', async () => {
        serveStock({reservations: [reservation(RES2, 'EXPIRED', 2)]})
        const {user} = await open('/almacen/reservas', loginAs('almacen.responsable'), 'Reservas', 0)

        await showAllStates(user)
        await waitFor(() => expect(firstColumn('Reservas')).toHaveLength(1))
        expect(actionsOf(rowOf('Reservas', 'Desconocido'))).toEqual([`Historial de ${LABEL}`])
        await user.click(screen.getByRole('combobox', {name: 'Estado'}))
        expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['Activa', 'Liberada', 'Consumida', 'Cancelada'])
    })

    it('quien solo lee ve las reservas sin ninguna acción, salvo el historial', async () => {
        serveStock({reservations: [ACTIVE]})
        await open('/almacen/reservas', loginAs('almacen.lector'), 'Reservas', 1)

        expect(screen.queryByRole('button', {name: 'Nueva reserva'})).not.toBeInTheDocument()
        expect(actionsOf(rowOf('Reservas', 'Activa'))).toEqual([`Historial de ${LABEL}`])
    })

    it('el alta lleva material, almacén, proyecto y cantidad: una reserva es siempre para un proyecto', async () => {
        const requests = serveStock({reservations: []})
        const creates = recordWrites('post', `${BASE}/reservations`, () => HttpResponse.json(ACTIVE, {status: 201}))
        const {user} = await open('/almacen/reservas', loginAs('almacen.operario'), 'Reservas', 0)
        const lists = readsOf(requests, `${BASE}/reservations`).length

        await user.click(screen.getByRole('button', {name: 'Nueva reserva'}))
        const dialog = await screen.findByRole('dialog', {name: 'Nueva reserva'})
        await choose(user, dialog, 'Material', 'MAT-001 - Hilo de contacto')
        await choose(user, dialog, 'Almacén', 'WH-000 - Central')
        await typeInto(user, dialog, 'Cantidad', '5')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByText('Elige el proyecto')).toBeInTheDocument()
        expect(creates).toHaveLength(0)

        await choose(user, dialog, 'Proyecto', 'PRJ-001 - Renovación')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        expect(await screen.findByText('Reserva registrada: 5 m de MAT-001 para PRJ-001')).toBeInTheDocument()
        expect(creates).toEqual([{materialId: MAT1, warehouseId: WH1, projectId: PRJ_MANUAL, quantity: 5}])
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        await waitFor(() => expect(readsOf(requests, `${BASE}/reservations`).length).toBeGreaterThan(lists))
    })

    it('modificarla no toca el material ni la fecha: manda almacén, proyecto y cantidad', async () => {
        serveStock({reservations: [ACTIVE]})
        const updates = recordWrites('put', `${BASE}/reservations/${RES1}`, (body) => HttpResponse.json({...ACTIVE, warehouse: NAVE2,
            quantity: body.quantity}))
        const {user} = await open('/almacen/reservas', loginAs('almacen.operario'), 'Reservas', 1)

        await user.click(screen.getByRole('button', {name: `Modificar ${LABEL}`}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar la reserva de MAT-001'})
        const material = within(dialog).getByRole('combobox', {name: 'Material'})
        expect(material).toHaveValue('MAT-001 - Hilo de contacto')
        expect(material).toHaveAttribute('readonly')
        expect(within(dialog).queryByRole('textbox', {name: 'Reservada el'})).not.toBeInTheDocument()
        await choose(user, dialog, 'Almacén', 'WH-002 - Nave 2')
        await typeInto(user, dialog, 'Cantidad', '7')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        expect(await screen.findByText('Reserva modificada: 7 m de MAT-001 para PRJ-001')).toBeInTheDocument()
        expect(updates).toEqual([{warehouseId: WH2, projectId: PRJ_MANUAL, quantity: 7}])
    })

    it('liberar, cancelar y consumir se confirman, cada uno con su llamada; cancelar pide stock-delete y un RES-001 se avisa', async () => {
        const requests = serveStock({reservations: [ACTIVE]})
        const releases = recordWrites('post', `${BASE}/reservations/${RES1}/release`, () => HttpResponse.json(reservation(RES1, 'RELEASED', 5)))
        const cancels = recordWrites('delete', `${BASE}/reservations/${RES1}`, () => HttpResponse.json(reservation(RES1, 'CANCELLED', 5)))
        const consumes = recordWrites('post', `${BASE}/reservations/${RES1}/consume`, () => stockError(422, 'RES-001',
            'Only active reservations can be changed'))
        const {user} = await open('/almacen/reservas', loginAs('almacen.responsable'), 'Reservas', 1)
        const lists = () => readsOf(requests, `${BASE}/reservations`).length

        await user.click(screen.getByRole('button', {name: `Liberar ${LABEL}`}))
        let confirm = await screen.findByRole('dialog', {name: `Liberar ${LABEL}`})
        expect(confirm).toHaveTextContent('El material vuelve al disponible sin ningún movimiento.')
        await user.click(within(confirm).getByRole('button', {name: 'Volver'}))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(releases).toHaveLength(0)
        await user.click(screen.getByRole('button', {name: `Liberar ${LABEL}`}))
        confirm = await screen.findByRole('dialog', {name: `Liberar ${LABEL}`})
        let before = lists()
        await user.click(within(confirm).getByRole('button', {name: 'Liberar'}))
        expect(await screen.findByText('Reserva liberada: 5 m de MAT-001')).toBeInTheDocument()
        expect(releases).toEqual([null])
        await waitFor(() => expect(lists()).toBeGreaterThan(before))

        await user.click(screen.getByRole('button', {name: `Cancelar ${LABEL}`}))
        confirm = await screen.findByRole('dialog', {name: `Cancelar ${LABEL}`})
        expect(confirm).toHaveTextContent('No se puede deshacer.')
        before = lists()
        await user.click(within(confirm).getByRole('button', {name: 'Cancelar la reserva'}))
        expect(await screen.findByText('Reserva cancelada: 5 m de MAT-001')).toBeInTheDocument()
        expect(cancels).toEqual([null])
        await waitFor(() => expect(lists()).toBeGreaterThan(before))

        await user.click(screen.getByRole('button', {name: `Consumir ${LABEL}`}))
        confirm = await screen.findByRole('dialog', {name: `Consumir ${LABEL}`})
        expect(confirm).toHaveTextContent('queda una salida en el libro')
        before = lists()
        await user.click(within(confirm).getByRole('button', {name: 'Consumir'}))
        expect(await screen.findByText('La operación no es posible. Only active reservations can be changed')).toBeInTheDocument()
        expect(consumes).toEqual([null])
        await waitFor(() => expect(lists()).toBeGreaterThan(before))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('sin stock-delete no se ofrece cancelar', async () => {
        serveStock({reservations: [ACTIVE]})
        await open('/almacen/reservas', loginAs('almacen.operario'), 'Reservas', 1)

        expect(screen.queryByRole('button', {name: `Cancelar ${LABEL}`})).not.toBeInTheDocument()
        expect(screen.getByRole('button', {name: `Liberar ${LABEL}`})).toBeInTheDocument()
    })

    it('la salida desde una reserva fija material, almacén y cantidad, trae su proyecto y manda el reservationId', async () => {
        const requests = serveStock({reservations: [ACTIVE]})
        const outputs = recordWrites('post', `${BASE}/movements/outputs`, () => HttpResponse.json(movement('OUTPUT', -5), {status: 201}))
        const {user} = await open('/almacen/reservas', loginAs('almacen.operario'), 'Reservas', 1)
        const lists = readsOf(requests, `${BASE}/reservations`).length

        await user.click(screen.getByRole('button', {name: `Salida con ${LABEL}`}))
        const dialog = await screen.findByRole('dialog', {name: 'Salida'})
        expect(dialog).toHaveTextContent('Esta salida consume la reserva: el material, el almacén y la cantidad son los reservados.')
        const material = within(dialog).getByRole('combobox', {name: 'Material'})
        const warehouse = within(dialog).getByRole('combobox', {name: 'Almacén'})
        const quantity = within(dialog).getByRole('textbox', {name: 'Cantidad'})
        expect([material, warehouse, quantity].map((field) => field.value)).toEqual(['MAT-001 - Hilo de contacto', 'WH-000 - Central', '5'])
        for (const field of [material, warehouse, quantity]) {
            expect(field).toHaveAttribute('readonly')
        }
        expect(within(dialog).getByRole('combobox', {name: 'Proyecto'})).toHaveValue('PRJ-001 - Renovación')
        await typeInto(user, dialog, 'Referencia externa', 'OT-9')
        await user.click(within(dialog).getByRole('button', {name: 'Registrar'}))

        expect(await screen.findByText('Salida registrada: 5 m de MAT-001')).toBeInTheDocument()
        expect(outputs).toEqual([{materialId: MAT1, warehouseId: WH1, projectId: PRJ_MANUAL, reservationId: RES1, quantity: 5,
            externalReference: 'OT-9'}])
        await waitFor(() => expect(readsOf(requests, `${BASE}/reservations`).length).toBeGreaterThan(lists))
    })

    it('consumir deja viejos el libro y los movimientos, porque escribe una salida; liberar no los toca', async () => {
        serveStock({reservations: [ACTIVE]})
        recordWrites('post', `${BASE}/reservations/${RES1}/release`, () => HttpResponse.json(reservation(RES1, 'RELEASED', 5)))
        recordWrites('post', `${BASE}/reservations/${RES1}/consume`, () => HttpResponse.json(reservation(RES1, 'CONSUMED', 5)))
        const {user, queryClient} = await open('/almacen/reservas', loginAs('almacen.operario'), 'Reservas', 1)
        const ledger = stockKey('ledger', MAT1, {warehouseId: null, page: 1, sort: null})
        const movements = stockKey('movements', {page: 1})
        const figures = stockKey('figures', MAT1, null)
        for (const key of [ledger, movements, figures]) {
            queryClient.setQueryData(key, {content: [], totalElements: 0})
        }
        const stale = () => [ledger, movements, figures].map((key) => queryClient.getQueryState(key).isInvalidated)

        await user.click(screen.getByRole('button', {name: `Liberar ${LABEL}`}))
        await user.click(within(await screen.findByRole('dialog', {name: `Liberar ${LABEL}`})).getByRole('button', {name: 'Liberar'}))
        await screen.findByText('Reserva liberada: 5 m de MAT-001')
        await waitFor(() => expect(stale()).toEqual([false, false, true]))

        await user.click(screen.getByRole('button', {name: `Consumir ${LABEL}`}))
        await user.click(within(await screen.findByRole('dialog', {name: `Consumir ${LABEL}`})).getByRole('button', {name: 'Consumir'}))
        await screen.findByText('Reserva consumida: 5 m de MAT-001')
        await waitFor(() => expect(stale()).toEqual([true, true, true]))
    })
})

describe('los conjuntos', () => {
    function availabilityOf(material, required, available, producible, limiting) {
        return {
            material, requiredQuantityPerAssembly: required, onHandQuantity: available + 1, activeReservedQuantity: 1,
            availableQuantity: available, producibleAssemblyQuantity: producible, limitingComponent: limiting,
        }
    }

    it('la lista enseña sus líneas, y quien solo lee puede pedir la disponibilidad pero no modificar', async () => {
        serveStock({assemblies: [mensula(), {...mensula([[HILO, 1]], false), id: 'asm-2', code: 'ASM-002', name: 'Retirado'}]})
        await open('/almacen/conjuntos', loginAs('almacen.lector'), 'Conjuntos', 2)

        expect(within(rowOf('Conjuntos', 'ASM-001')).getAllByRole('cell').map((cell) => cell.textContent).slice(0, 4))
            .toEqual(['ASM-001', 'Ménsula', '2', 'Sí'])
        expect(screen.getByText('2 conjuntos')).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Nuevo'})).not.toBeInTheDocument()
        expect(actionsOf(rowOf('Conjuntos', 'ASM-001'))).toEqual(['Disponibilidad de ASM-001 - Ménsula', 'Historial de ASM-001 - Ménsula'])
        expect(actionsOf(rowOf('Conjuntos', 'ASM-002'))).toEqual(['Historial de ASM-002 - Retirado'])
    })

    it('la disponibilidad se pide en un almacén y marca el componente que limita', async () => {
        const requests = serveStock({
            assemblies: [mensula()],
            availability: {[`${ASM1}|${WH1}`]: {
                assembly: {id: ASM1, code: 'ASM-001', name: 'Ménsula', active: true}, warehouse: CENTRAL, availableQuantity: 3,
                components: [availabilityOf(HILO, 2, 12.5, 6, false), availabilityOf(GRAPA, 4, 13, 3, true)],
                calculatedAt: '2026-09-21T10:00:00Z',
            }},
        })
        const {user} = await open('/almacen/conjuntos', loginAs('almacen.lector'), 'Conjuntos', 1)

        await user.click(screen.getByRole('button', {name: 'Disponibilidad de ASM-001 - Ménsula'}))
        const dialog = await screen.findByRole('dialog', {name: 'Disponibilidad de ASM-001 - Ménsula'})
        expect(within(dialog).queryByText(/montables/)).not.toBeInTheDocument()
        expect(readsOf(requests, `${BASE}/assemblies/${ASM1}/availability`)).toHaveLength(0)

        await choose(user, dialog, 'Almacén', 'WH-000 - Central')

        expect(await within(dialog).findByText('3 conjuntos montables en WH-000')).toBeInTheDocument()
        expect(firstColumn('Componentes')).toEqual(['MAT-001 - Hilo de contacto', 'MAT-002 - Grapa'])
        expect(within(rowOf('Componentes', 'MAT-002 - Grapa')).getByText('13')).toBeInTheDocument()
        expect(within(rowOf('Componentes', 'MAT-002 - Grapa')).getByText('Limita')).toBeInTheDocument()
        expect(within(rowOf('Componentes', 'MAT-001 - Hilo de contacto')).queryByText('Limita')).not.toBeInTheDocument()
        expect(readsOf(requests, `${BASE}/assemblies/${ASM1}/availability`).map((url) => url.search)).toEqual([`?warehouseId=${WH1}`])
        expect(screen.queryByText(/Error inesperado/)).not.toBeInTheDocument()
    })

    it('el alta lleva sus líneas; una lista vacía se rechaza antes de llamar y un material repetido sustituye su cantidad', async () => {
        serveStock()
        const creates = recordWrites('post', `${BASE}/assemblies`, (body) => HttpResponse.json({...mensula(), code: body.code}, {status: 201}))
        const {user} = await open('/almacen/conjuntos', loginAs('almacen.operario'), 'Conjuntos', 0)

        await user.click(screen.getByRole('button', {name: 'Nuevo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Alta de conjunto'})
        await typeInto(user, dialog, 'Código', 'ASM-002')
        await typeInto(user, dialog, 'Nombre', 'Ménsula doble')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(await within(dialog).findByRole('alert')).toHaveTextContent('La lista de materiales no puede ir vacía')
        expect(creates).toHaveLength(0)

        await user.click(within(dialog).getByRole('button', {name: 'Añadir'}))
        expect(within(dialog).getByText('Elige el material')).toBeInTheDocument()
        expect(within(dialog).getByText('La cantidad es obligatoria')).toBeInTheDocument()
        for (const [material, quantity] of [['MAT-001 - Hilo de contacto', '2'], ['MAT-002 - Grapa', '4'], ['MAT-001 - Hilo de contacto', '3']]) {
            await choose(user, dialog, 'Material', material)
            await typeInto(user, dialog, 'Cantidad por conjunto', quantity)
            await user.click(within(dialog).getByRole('button', {name: 'Añadir'}))
        }
        expect(dataRows('Lista de materiales').map((cells) => [cells[0].textContent, cells[1].textContent]))
            .toEqual([['MAT-001 - Hilo de contacto', '3 m'], ['MAT-002 - Grapa', '4 ud']])
        expect(within(dialog).getByRole('combobox', {name: 'Material'})).toHaveValue('')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        expect(await screen.findByText('Guardado ASM-002')).toBeInTheDocument()
        expect(creates).toEqual([{code: 'ASM-002', name: 'Ménsula doble', components: [{materialId: MAT1, quantity: 3}, {materialId: MAT2, quantity: 4}]}])
    })

    it('modificar un conjunto manda la lista entera, sin la línea quitada, y si sigue activo', async () => {
        serveStock({assemblies: [mensula()]})
        const updates = recordWrites('put', `${BASE}/assemblies/${ASM1}`, () => HttpResponse.json(mensula([[HILO, 2]], false)))
        const {user} = await open('/almacen/conjuntos', loginAs('almacen.operario'), 'Conjuntos', 1)

        await user.click(screen.getByRole('button', {name: 'Modificar ASM-001 - Ménsula'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar conjunto ASM-001'})
        expect(firstColumn('Lista de materiales')).toEqual(['MAT-001 - Hilo de contacto', 'MAT-002 - Grapa'])
        await user.click(within(dialog).getByRole('button', {name: 'Quitar MAT-002'}))
        expect(firstColumn('Lista de materiales')).toEqual(['MAT-001 - Hilo de contacto'])
        await user.click(within(dialog).getByRole('checkbox', {name: 'Activo'}))
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        expect(await screen.findByText('Guardado ASM-001')).toBeInTheDocument()
        expect(updates).toEqual([{code: 'ASM-001', name: 'Ménsula', active: false, components: [{materialId: MAT1, quantity: 2}]}])
    })

    it('un error del servicio sobre la lista cae bajo ella, y uno sobre una línea, en su fila', async () => {
        serveStock({assemblies: [mensula()]})
        server.use(http.put(`${BASE}/assemblies/${ASM1}`, () => stockError(400, 'REQ-VALIDATION', 'Request validation failed.', [
            {field: 'components', message: 'each material can appear only once in components'},
            {field: 'components[1].quantity', message: 'must be greater than 0'},
        ])))
        const {user} = await open('/almacen/conjuntos', loginAs('almacen.operario'), 'Conjuntos', 1)

        await user.click(screen.getByRole('button', {name: 'Modificar ASM-001 - Ménsula'}))
        const dialog = await screen.findByRole('dialog', {name: 'Modificar conjunto ASM-001'})
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        expect(await within(dialog).findByRole('alert')).toHaveTextContent('each material can appear only once in components')
        expect(within(rowOf('Lista de materiales', '4 ud')).getByText('must be greater than 0')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Modificar conjunto ASM-001'})).toBeInTheDocument()
    })
})

describe('el historial', () => {
    it('el de una fila de catálogo se pagina, la más reciente primero, y dice cómo quedó', async () => {
        const before = mensula([[HILO, 2]])
        const requests = serveStock({
            assemblies: [mensula()],
            revisions: {[ASM1]: [revision(2, 'UPDATED', 'almacen.operario', 'HTTP', mensula()), revision(1, 'CREATED', null, 'BASELINE', before)]},
        })
        const {user} = await open('/almacen/conjuntos', loginAs('almacen.lector'), 'Conjuntos', 1)

        await user.click(screen.getByRole('button', {name: 'Historial de ASM-001 - Ménsula'}))
        const dialog = await screen.findByRole('dialog', {name: 'Historial de ASM-001 - Ménsula'})

        expect(await within(dialog).findByText('2 revisiones, la más reciente primero')).toBeInTheDocument()
        const [newest, first] = dataRows('Historial de ASM-001 - Ménsula').map((cells) => cells.map((cell) => cell.textContent))
        expect(newest).toEqual(['2', '02/09/2026 12:00', 'Modificación', 'almacen.operario', 'HTTP',
            'ASM-001 - Ménsula · 2 líneas (MAT-001 x2, MAT-002 x4) · activo', 'corr-2'].map((text, index) => (index === 1 ? expect.any(String) : text)))
        expect(first).toEqual(['1', expect.any(String), 'Alta', '', 'BASELINE', 'ASM-001 - Ménsula · 1 línea (MAT-001 x2) · activo', 'corr-1'])
        expect(readsOf(requests, `${BASE}/assemblies/${ASM1}/revisions`).map((url) => url.search)).toEqual(['?page=0&size=20'])
    })

    it('una fila sin historial todavía lo dice, sin tabla y sin aviso de error', async () => {
        serveStock({warehouses: [entryRow(CENTRAL)]})
        const {user} = await open('/almacen/almacenes', loginAs('almacen.lector'), 'Almacenes', 1)

        await user.click(screen.getByRole('button', {name: 'Historial de WH-000 - Central'}))
        const dialog = await screen.findByRole('dialog', {name: 'Historial de WH-000 - Central'})

        expect(await within(dialog).findByText('Sin historial todavía: el servicio no guarda ninguna revisión de esta fila.')).toBeInTheDocument()
        expect(within(dialog).queryByRole('table')).not.toBeInTheDocument()
        expect(screen.queryByText(/No se ha encontrado/)).not.toBeInTheDocument()
        expect(screen.queryByText(/Referencia:/)).not.toBeInTheDocument()
    })

    it('el de una reserva se abre desde cualquier fila y la describe como quedó', async () => {
        serveStock({
            reservations: [reservation(RES1, 'ACTIVE', 5), reservation(RES2, 'CONSUMED', 2)],
            revisions: {[RES2]: [
                revision(2, 'UPDATED', 'almacen.operario', 'HTTP', reservation(RES2, 'CONSUMED', 2)),
                revision(1, 'CREATED', 'almacen.operario', 'HTTP', reservation(RES2, 'ACTIVE', 2)),
            ]},
        })
        const {user} = await open('/almacen/reservas', loginAs('almacen.lector'), 'Reservas', 1)
        await showAllStates(user)
        await waitFor(() => expect(firstColumn('Reservas')).toHaveLength(2))

        await user.click(within(rowOf('Reservas', 'Consumida')).getByRole('button', {name: 'Historial de la reserva de MAT-001 para PRJ-001'}))
        const dialog = await screen.findByRole('dialog', {name: 'Historial de la reserva de MAT-001 para PRJ-001'})

        await waitFor(() => expect(dataRows('Historial de la reserva de MAT-001 para PRJ-001')).toHaveLength(2))
        expect(within(dialog).getByText('2 m de MAT-001 en WH-000 para PRJ-001 · Consumida')).toBeInTheDocument()
        expect(within(dialog).getByText('2 m de MAT-001 en WH-000 para PRJ-001 · Activa')).toBeInTheDocument()
        expect(screen.getAllByRole('dialog')).toHaveLength(1)
    })
})
