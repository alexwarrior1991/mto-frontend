import {act, screen, waitFor, within} from '@testing-library/react'
import {http, HttpResponse} from 'msw'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {buildMenu} from '../app/navigation.js'
import {P} from '../auth/permissions.js'
import {sessionJobs} from '../features/jobs/sessionJobs.js'
import {POLL_INTERVAL_MS} from '../features/jobs/useJobs.js'
import {renderRoute} from './render.jsx'
import {server} from './server.js'
import {loginAs, sessionWith} from './session.js'

/**
 * La pantalla de trabajos (trabajos) con los casos de trabajos de ViewLayerTest del backoffice: subir y
 * lanzar una importación y seguirla hasta el enlace de descarga y el botón de errores (que pide el
 * detalle); el 429 apuntado como rechazado con su aviso; un trabajo propio fuera de la página seguido
 * por su familia; la lista paginada y filtrada en el servicio; un tipo o un estado desconocidos sin
 * descarga, sin detalle y sin consultas; y los lanzadores según los permisos. Y lo que el backoffice
 * no hacía: no preguntar con la pestaña oculta, enseñar fijo un fallo del sondeo en vez de callarlo,
 * no subir lo que pasa de 20 MB y decir el 410 de un fichero que ya no está.
 *
 * El reloj es falso y avanza solo (shouldAdvanceTime), y cada vuelta del sondeo se provoca con
 * nextPoll: dos segundos más.
 */

const BASE = '/api/configuration'
const JOB_ID = '6f1c0000-0000-4000-8000-000000000001'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const IMPORTER = [P.CONFIG_READ, P.CONFIG_IMPORT]

const PACKAGES = [{id: 100, name: 'EP4', enabled: true, versionNumber: 1}]
const TRACKS = [{id: 3, name: 'TRACK 1', executionPackageId: 100, enabled: true, versionNumber: 1}]
const STATIONS = [{id: 12, name: 'ATOCHA', executionPackageId: 100, versionNumber: 1}]

function job(overrides = {}) {
    return {
        id: JOB_ID, type: 'PROFILE_IMPORT', status: 'PENDING', createdAt: '2026-08-27T09:12:03Z',
        processedItems: 0, successfulItems: 0, failedItems: 0, ...overrides,
    }
}

/** Los desplegables de vías y estaciones: las referencias de infraestructura (POST /filter, 1000 filas). */
function serveReferences() {
    for (const [path, rows] of [['execution-packages', PACKAGES], ['tracks', TRACKS], ['stations', STATIONS]]) {
        server.use(http.post(`${BASE}/${path}/filter`, () => HttpResponse.json({
            content: rows, page: {number: 0, size: 1000, totalElements: rows.length, totalPages: 1},
        })))
    }
}

/**
 * El servicio simulado: GET /jobs devuelve lo que haya en history, paginado y filtrado por tipo y
 * estado como el de verdad. Apunta la query de cada petición.
 */
function serveJobs(history, {respond = null} = {}) {
    const requests = []
    server.use(http.get(`${BASE}/jobs`, ({request}) => {
        const url = new URL(request.url)
        requests.push(url.search)
        const failure = respond?.(requests.length)
        if (failure) {
            return failure
        }
        const number = Number(url.searchParams.get('page') ?? 0)
        const size = Number(url.searchParams.get('size') ?? 20)
        const type = url.searchParams.get('type')
        const status = url.searchParams.get('status')
        const matching = history.filter((item) => (!type || item.type === type) && (!status || item.status === status))
        return HttpResponse.json({
            content: matching.slice(number * size, number * size + size),
            page: {number, size, totalElements: matching.length, totalPages: Math.ceil(matching.length / size)},
        })
    }))
    return requests
}

/** Una vuelta del sondeo: dos segundos más en el reloj. */
async function nextPoll() {
    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS))
}

function history() {
    return screen.getByRole('table', {name: 'Historial de trabajos'})
}

/** Las filas con datos de la tabla, sin la cabecera ni la de «cargando». */
function dataRows() {
    return within(history()).getAllByRole('row').slice(1).filter((row) => within(row).queryAllByRole('cell').length > 1)
}

function cells(row) {
    return within(row).getAllByRole('cell').map((cell) => cell.textContent)
}

async function choose(user, container, label, option) {
    await user.click(within(container).getByRole('combobox', {name: label}))
    await user.click(await screen.findByRole('option', {name: option}))
}

async function uploadTo(user, container, label, file) {
    await user.upload(within(container).getByLabelText(label), file)
}

function workbook(name) {
    return new File(['PK-xlsx'], name, {type: XLSX})
}

/** Lo que guarda el navegador al descargar: el nombre de cada fichero. */
function captureDownloads() {
    Object.defineProperty(URL, 'createObjectURL', {value: vi.fn(() => 'blob:mto/1'), configurable: true})
    Object.defineProperty(URL, 'revokeObjectURL', {value: vi.fn(), configurable: true})
    const saved = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
        saved.push(this.download)
    })
    return saved
}

beforeEach(() => {
    vi.useFakeTimers({shouldAdvanceTime: true})
})

afterEach(() => {
    vi.useRealTimers()
    sessionJobs.reset()
    delete URL.createObjectURL
    delete URL.revokeObjectURL
})

describe('el menú y los lanzadores', () => {
    it('«Trabajos» sale para quien lee la configuración y ya no está pendiente', async () => {
        serveReferences()
        serveJobs([])
        expect(buildMenu(loginAs('config.lector')).map((item) => item.label)).toContain('Trabajos')
        expect(buildMenu(loginAs('almacen.lector')).map((item) => item.label)).not.toContain('Trabajos')

        renderRoute('/trabajos', {session: loginAs('config.lector')})

        expect(await screen.findByRole('heading', {name: 'Trabajos', level: 2})).toBeInTheDocument()
        expect(screen.queryByText(/Llega en la fase/)).not.toBeInTheDocument()
        expect(await screen.findByText('Ninguno todavía')).toBeInTheDocument()
        await waitFor(() => expect(document.title).toBe('Trabajos · MTO'))
    })

    it('quien solo lee solo exporta, y el catálogo de LOV pide además lov-manage', async () => {
        serveReferences()
        serveJobs([])
        const reader = renderRoute('/trabajos', {session: loginAs('config.lector')})

        expect(await screen.findByRole('region', {name: 'Exportar los perfiles de una vía'})).toBeInTheDocument()
        expect(screen.queryByRole('region', {name: 'Importar el maestro de perfiles'})).not.toBeInTheDocument()
        expect(screen.queryByRole('region', {name: 'Importar el catálogo de LOV'})).not.toBeInTheDocument()
        expect(screen.queryByRole('region', {name: 'Republicar datos maestros'})).not.toBeInTheDocument()
        reader.unmount()

        const importer = renderRoute('/trabajos', {session: sessionWith(IMPORTER)})
        expect(await screen.findByRole('region', {name: 'Importar el maestro de perfiles'})).toBeInTheDocument()
        expect(screen.getByRole('region', {name: 'Republicar datos maestros'})).toBeInTheDocument()
        expect(screen.queryByRole('region', {name: 'Importar el catálogo de LOV'})).not.toBeInTheDocument()
        importer.unmount()

        renderRoute('/trabajos', {session: loginAs('config.responsable')})
        expect(await screen.findByRole('region', {name: 'Importar el catálogo de LOV'})).toBeInTheDocument()
        expect(screen.getAllByRole('region')).toHaveLength(4)
    })
})

describe('lanzar y seguir', () => {
    it('una importación se apunta con su etiqueta y se sigue hasta su descarga y sus errores; después no se pregunta más', async () => {
        serveReferences()
        const jobs = []
        const lists = serveJobs(jobs)
        const imports = []
        server.use(http.post(`${BASE}/profiles/jobs/import`, ({request}) => {
            imports.push(new URL(request.url).search)
            jobs.unshift(job())
            return HttpResponse.json(job(), {status: 202})
        }))
        const {user} = renderRoute('/trabajos', {session: loginAs('config.responsable')})

        const importer = await screen.findByRole('region', {name: 'Importar el maestro de perfiles'})
        const start = within(importer).getByRole('button', {name: 'Importar'})
        expect(start).toBeDisabled()
        await uploadTo(user, importer, 'Fichero del maestro de perfiles', workbook('profile-master.xlsx'))
        expect(within(importer).getByText('profile-master.xlsx')).toBeInTheDocument()
        expect(start).toBeEnabled()
        await user.click(start)

        const label = 'Importación del maestro de perfiles (profile-master.xlsx)'
        expect(await screen.findByText(`Trabajo encolado: ${label}`)).toBeInTheDocument()
        await waitFor(() => expect(dataRows()).toHaveLength(1))
        expect(cells(dataRows()[0]).slice(0, 3)).toEqual([label, 'Importación del maestro de perfiles', 'En cola'])
        expect(imports).toEqual(['?dryRun=false'])
        expect(start).toBeDisabled()
        expect(within(importer).queryByText('profile-master.xlsx')).not.toBeInTheDocument()

        jobs[0] = job({status: 'RUNNING', totalItems: 100, processedItems: 50, successfulItems: 50})
        await nextPoll()
        expect(await within(history()).findByText('50 / 100')).toBeInTheDocument()
        expect(within(history()).getByRole('progressbar', {name: 'Progreso'})).toBeInTheDocument()
        expect(screen.getByText('1 en el servicio, 1 en curso')).toBeInTheDocument()
        expect(within(history()).queryByRole('button', {name: `Descargar ${label}`})).not.toBeInTheDocument()

        jobs[0] = job({status: 'COMPLETED_WITH_ERRORS', totalItems: 100, processedItems: 100, successfulItems: 98, failedItems: 2})
        await nextPoll()
        expect(await screen.findByText(`${label}: Terminado con errores`)).toBeInTheDocument()
        expect(cells(dataRows()[0])).toContain('Terminado con errores')
        expect(screen.getByText('1 en el servicio, 0 en curso')).toBeInTheDocument()

        // Su fichero es el informe de esos errores: se descarga con el token, por su familia y su id.
        const saved = captureDownloads()
        const files = []
        server.use(http.get(`${BASE}/profiles/jobs/${JOB_ID}/file`, ({request}) => {
            files.push(request.headers.get('authorization'))
            return HttpResponse.json({errors: []}, {headers: {'Content-Disposition': 'attachment; filename="informe-profile-master.json"'}})
        }))
        await user.click(within(history()).getByRole('button', {name: `Descargar ${label}`}))
        await waitFor(() => expect(saved).toEqual(['informe-profile-master.json']))
        expect(files).toEqual(['Bearer test-token'])

        // La fila no trae los errores por elemento: el botón los pide al detalle de la familia.
        server.use(http.get(`${BASE}/profiles/jobs/${JOB_ID}`, () => HttpResponse.json(job({
            status: 'COMPLETED_WITH_ERRORS', totalItems: 100, processedItems: 100, successfulItems: 98, failedItems: 2,
            itemErrors: [{index: 118, operation: 'create', code: 'ValidationException', message: 'kp obligatorio [kp]'}],
        }))))
        await user.click(within(history()).getByRole('button', {name: `Errores de ${label}`}))
        const dialog = await screen.findByRole('dialog', {name: `Errores de ${label}`})
        expect(within(dialog).getByRole('cell', {name: 'kp obligatorio [kp]'})).toBeInTheDocument()
        expect(within(dialog).getByRole('cell', {name: '118'})).toBeInTheDocument()
        expect(within(dialog).getByText('2 elementos fallidos; el servicio solo detalla los primeros 1. El informe descargable los trae todos.'))
            .toBeInTheDocument()
        // La X de la ventana también se llama «Cerrar»; el del pie es el segundo.
        await user.click(within(dialog).getAllByRole('button', {name: 'Cerrar'}).at(-1))

        // Terminado todo, la pantalla deja de preguntar.
        const asked = lists.length
        await nextPoll()
        await nextPoll()
        expect(lists).toHaveLength(asked)
    })

    it('una simulación lo dice en su etiqueta y viaja con dryRun', async () => {
        serveReferences()
        serveJobs([])
        const imports = []
        server.use(
            http.post(`${BASE}/lovs/jobs/import`, ({request}) => {
                imports.push(new URL(request.url).search)
                return HttpResponse.json(job({type: 'LOV_IMPORT', status: 'COMPLETED'}), {status: 202})
            }),
        )
        const {user} = renderRoute('/trabajos', {session: loginAs('config.responsable')})

        const importer = await screen.findByRole('region', {name: 'Importar el catálogo de LOV'})
        await uploadTo(user, importer, 'Fichero del catálogo de LOV', workbook('lov-master.xlsx'))
        await user.click(within(importer).getByRole('checkbox', {name: 'Simulación: no escribe nada, solo el informe'}))
        await user.click(within(importer).getByRole('button', {name: 'Importar'}))

        expect(await screen.findByText('Trabajo encolado: Importación del catálogo de LOV (lov-master.xlsx, simulación)')).toBeInTheDocument()
        expect(imports).toEqual(['?dryRun=true'])
    })

    it('exportar pide una vía y lleva el formato elegido; la fila se nombra con la vía y su paquete', async () => {
        serveReferences()
        const jobs = []
        serveJobs(jobs)
        const exports = []
        server.use(http.post(`${BASE}/profiles/jobs/export`, ({request}) => {
            exports.push(new URL(request.url).search)
            const accepted = job({type: 'PROFILE_EXPORT', trackId: 3, mapperType: 'technical'})
            jobs.unshift(accepted)
            return HttpResponse.json(accepted, {status: 202})
        }))
        const {user} = renderRoute('/trabajos', {session: loginAs('config.lector')})

        const exporter = await screen.findByRole('region', {name: 'Exportar los perfiles de una vía'})
        await user.click(within(exporter).getByRole('button', {name: 'Exportar'}))
        expect(within(exporter).getByText('Elige una vía')).toBeInTheDocument()

        await choose(user, exporter, 'Vía', 'TRACK 1 (EP4)')
        await choose(user, exporter, 'Formato', 'technical')
        await user.click(within(exporter).getByRole('button', {name: 'Exportar'}))

        expect(await screen.findByText('Trabajo encolado: Exportación de TRACK 1 (EP4)')).toBeInTheDocument()
        expect(exports).toEqual(['?trackId=3&mapperType=technical'])
        await waitFor(() => expect(dataRows()).toHaveLength(1))
        expect(cells(dataRows()[0])[0]).toBe('Exportación de TRACK 1 (EP4)')
    })

    it('republicar acota con la vía solo los perfiles, y con la estación los seccionadores y aisladores', async () => {
        serveReferences()
        serveJobs([])
        const republished = []
        server.use(http.post(`${BASE}/master-data/republish`, ({request}) => {
            republished.push(new URL(request.url).search)
            return HttpResponse.json(job({type: 'MASTER_DATA_REPUBLISH', status: 'COMPLETED'}), {status: 202})
        }))
        const {user} = renderRoute('/trabajos', {session: sessionWith(IMPORTER)})

        const republisher = await screen.findByRole('region', {name: 'Republicar datos maestros'})
        expect(within(republisher).getByRole('combobox', {name: 'Solo la vía'})).toBeEnabled()
        expect(within(republisher).getByRole('combobox', {name: 'Solo la estación'})).toBeDisabled()
        await choose(user, republisher, 'Solo la vía', 'TRACK 1 (EP4)')
        await user.click(within(republisher).getByRole('button', {name: 'Republicar'}))
        expect(await screen.findByText('Trabajo encolado: Republicado de perfiles')).toBeInTheDocument()

        // Lo que deja de aplicar se deshabilita y se vacía: la vía no viaja con los seccionadores.
        await choose(user, republisher, 'Qué republicar', 'Seccionadores')
        expect(within(republisher).getByRole('combobox', {name: 'Solo la vía'})).toBeDisabled()
        expect(within(republisher).getByRole('combobox', {name: 'Solo la vía'})).toHaveValue('')
        await choose(user, republisher, 'Solo la estación', 'ATOCHA (EP4)')
        await user.click(within(republisher).getByRole('button', {name: 'Republicar'}))
        expect(await screen.findByText('Trabajo encolado: Republicado de seccionadores')).toBeInTheDocument()

        await choose(user, republisher, 'Qué republicar', 'Todo')
        await user.click(within(republisher).getByRole('button', {name: 'Republicar'}))
        expect(await screen.findByText('Trabajo encolado: Republicado de todo')).toBeInTheDocument()

        expect(republished).toEqual(['?entity=profile&trackId=3', '?entity=disconnector&stationId=12', '?entity=all'])
    })

    it('un 429 se apunta como rechazado y dice cuándo volver a intentarlo; no hay nada que seguir', async () => {
        serveReferences()
        const jobs = []
        const lists = serveJobs(jobs)
        server.use(http.post(`${BASE}/profiles/jobs/export`, () => {
            const rejected = job({type: 'PROFILE_EXPORT', status: 'REJECTED', trackId: 3, mapperType: 'basic'})
            jobs.unshift(rejected)
            return HttpResponse.json(rejected, {status: 429, headers: {'Retry-After': '30'}})
        }))
        const {user} = renderRoute('/trabajos', {session: loginAs('config.lector')})

        const exporter = await screen.findByRole('region', {name: 'Exportar los perfiles de una vía'})
        await choose(user, exporter, 'Vía', 'TRACK 1 (EP4)')
        await user.click(within(exporter).getByRole('button', {name: 'Exportar'}))

        expect(await screen.findByText('Sin hueco para Exportación de TRACK 1 (EP4): el servicio lo ha rechazado. Inténtalo en 30 s.'))
            .toBeInTheDocument()
        await waitFor(() => expect(dataRows()).toHaveLength(1))
        expect(cells(dataRows()[0]).slice(0, 3)).toEqual(['Exportación de TRACK 1 (EP4)', 'Exportación de perfiles', 'Rechazado'])
        const asked = lists.length
        await nextPoll()
        expect(lists).toHaveLength(asked)
    })

    it('un trabajo propio que no está en la página se sigue por su familia, se avisa al terminar y luego no se pregunta más', async () => {
        serveReferences()
        serveJobs([])
        server.use(http.post(`${BASE}/profiles/jobs/import`, () => HttpResponse.json(job(), {status: 202})))
        const details = []
        let status = 'RUNNING'
        server.use(http.get(`${BASE}/profiles/jobs/${JOB_ID}`, () => {
            details.push(status)
            return HttpResponse.json(job({status, totalItems: 10, processedItems: status === 'COMPLETED' ? 10 : 4}))
        }))
        const {user} = renderRoute('/trabajos', {session: sessionWith(IMPORTER)})

        const importer = await screen.findByRole('region', {name: 'Importar el maestro de perfiles'})
        await uploadTo(user, importer, 'Fichero del maestro de perfiles', workbook('profile-master.xlsx'))
        await user.click(within(importer).getByRole('button', {name: 'Importar'}))
        expect(await screen.findByText('Trabajo encolado: Importación del maestro de perfiles (profile-master.xlsx)')).toBeInTheDocument()
        await waitFor(() => expect(details).toContain('RUNNING'))

        status = 'COMPLETED'
        await nextPoll()
        expect(await screen.findByText('Importación del maestro de perfiles (profile-master.xlsx): Terminado')).toBeInTheDocument()
        const asked = details.length
        await nextPoll()
        await nextPoll()
        expect(details).toHaveLength(asked)
        expect(details.at(-1)).toBe('COMPLETED')
    })
})

describe('el historial', () => {
    it('es la lista del servicio: paginada y filtrada allí, con lo lanzado desde otra parte descrito por su tipo', async () => {
        serveReferences()
        const jobs = Array.from({length: 25}, (_, index) => job({
            id: `job-${index}`,
            type: index % 2 === 0 ? 'LOV_IMPORT' : 'MASTER_DATA_REPUBLISH',
            status: 'COMPLETED',
            createdAt: new Date(Date.UTC(2026, 7, 27, 9, 12, 3) - index * 1000).toISOString(),
        }))
        const lists = serveJobs(jobs)
        const {user} = renderRoute('/trabajos', {session: loginAs('config.lector')})

        await waitFor(() => expect(dataRows()).toHaveLength(20))
        expect(cells(dataRows()[0])[0]).toBe('Importación del catálogo de LOV')
        expect(screen.getByText('25 en el servicio, 0 en curso')).toBeInTheDocument()
        expect(lists.at(-1)).toBe('?page=0&size=20')

        await user.click(screen.getByRole('button', {name: 'Página 2'}))
        await waitFor(() => expect(dataRows()).toHaveLength(5))
        expect(lists.at(-1)).toBe('?page=1&size=20')

        await choose(user, document.body, 'Tipo', 'Republicado de datos maestros')
        await waitFor(() => expect(dataRows()).toHaveLength(12))
        expect(lists.at(-1)).toBe('?page=0&size=20&type=MASTER_DATA_REPUBLISH')
        await choose(user, document.body, 'Estado', 'Fallido')
        await waitFor(() => expect(screen.getByText('Ningún trabajo todavía.')).toBeInTheDocument())
        expect(lists.at(-1)).toBe('?page=0&size=20&type=MASTER_DATA_REPUBLISH&status=FAILED')

        const asked = lists.length
        await nextPoll()
        expect(lists).toHaveLength(asked)
    })

    it('un tipo o un estado nuevos se leen como «Desconocido», sin descarga, sin detalle y sin consultas, y no se ofrecen como filtro', async () => {
        serveReferences()
        const lists = serveJobs([
            job({id: 'new-type', type: 'PROFILE_REPAIR', status: 'COMPLETED', totalItems: 10, processedItems: 10, successfulItems: 8,
                failedItems: 2}),
            job({id: 'new-status', type: 'PROFILE_EXPORT', status: 'PAUSED', trackId: 3, mapperType: 'basic', totalItems: 10,
                processedItems: 4, successfulItems: 4}),
        ])
        const {user} = renderRoute('/trabajos', {session: loginAs('config.lector')})

        await waitFor(() => expect(dataRows()).toHaveLength(2))
        const [newType, newStatus] = dataRows()
        expect(cells(newType).slice(0, 3)).toEqual(['Desconocido', 'Desconocido', 'Terminado'])
        expect(cells(newStatus).slice(0, 3)).toEqual(['Exportación de TRACK 1 (EP4) (basic)', 'Exportación de perfiles', 'Desconocido'])
        expect(screen.getByText('2 en el servicio, 0 en curso')).toBeInTheDocument()
        expect(within(newType).queryByRole('button', {name: /^Descargar/})).not.toBeInTheDocument()
        expect(within(newStatus).queryByRole('button', {name: /^Descargar/})).not.toBeInTheDocument()

        // Sin familia no hay a quién pedir el detalle: se enseña lo que trae la fila, sin llamar.
        await user.click(within(newType).getByRole('button', {name: 'Errores de Desconocido'}))
        const dialog = await screen.findByRole('dialog', {name: 'Errores de Desconocido'})
        expect(within(dialog).getByText('2 elementos fallidos, sin detalle del servicio.')).toBeInTheDocument()
        // La X de la ventana también se llama «Cerrar»; el del pie es el segundo.
        await user.click(within(dialog).getAllByRole('button', {name: 'Cerrar'}).at(-1))

        await user.click(screen.getByRole('combobox', {name: 'Tipo'}))
        expect(screen.queryByRole('option', {name: 'Desconocido'})).not.toBeInTheDocument()
        expect(await screen.findAllByRole('option')).toHaveLength(6)
        await user.keyboard('{Escape}')
        await user.click(screen.getByRole('combobox', {name: 'Estado'}))
        expect(screen.queryByRole('option', {name: 'Desconocido'})).not.toBeInTheDocument()
        await user.keyboard('{Escape}')

        const asked = lists.length
        await nextPoll()
        expect(lists).toHaveLength(asked)
    })

    it('con la pestaña oculta no se pregunta, y al volver a ella se sigue', async () => {
        serveReferences()
        const lists = serveJobs([job({type: 'LOV_IMPORT', status: 'RUNNING'})])
        renderRoute('/trabajos', {session: loginAs('config.lector')})
        await waitFor(() => expect(dataRows()).toHaveLength(1))
        await nextPoll()
        await waitFor(() => expect(lists.length).toBeGreaterThanOrEqual(2))

        const visibility = (state) => {
            Object.defineProperty(document, 'visibilityState', {value: state, configurable: true})
            document.dispatchEvent(new Event('visibilitychange', {bubbles: true}))
        }
        try {
            visibility('hidden')
            // Lo que ya iba de camino llega; desde ahí no sale nada más.
            await nextPoll()
            const hidden = lists.length
            await nextPoll()
            await nextPoll()
            expect(lists).toHaveLength(hidden)

            visibility('visible')
            await nextPoll()
            await waitFor(() => expect(lists.length).toBeGreaterThan(hidden))
        } finally {
            delete document.visibilityState
        }
    })

    it('un fallo del sondeo no se avisa cada dos segundos: se enseña fijo encima de la tabla hasta que vuelve a ir bien', async () => {
        serveReferences()
        const unavailable = () => HttpResponse.json({title: 'Service Unavailable', status: 503, service: 'mto-configuration'},
            {status: 503, headers: {'Content-Type': 'application/problem+json'}})
        let failing = false
        const lists = serveJobs([job({type: 'LOV_IMPORT', status: 'RUNNING'})], {respond: () => (failing ? unavailable() : null)})
        renderRoute('/trabajos', {session: loginAs('config.lector')})
        await waitFor(() => expect(dataRows()).toHaveLength(1))

        failing = true
        await nextPoll()
        expect(await screen.findByText('No se ha podido leer la lista de trabajos')).toBeInTheDocument()
        const failed = lists.length
        await nextPoll()
        await waitFor(() => expect(lists.length).toBeGreaterThan(failed))
        expect(screen.getAllByText('El servicio no está disponible ahora mismo. Inténtalo más tarde.')).toHaveLength(1)
        expect(dataRows()).toHaveLength(1)

        failing = false
        await nextPoll()
        await waitFor(() => expect(screen.queryByText('No se ha podido leer la lista de trabajos')).not.toBeInTheDocument())
        expect(dataRows()).toHaveLength(1)
    })

    it('un fichero de más de 20 MB no se sube: lo dice y no deja importar', async () => {
        serveReferences()
        serveJobs([])
        const {user} = renderRoute('/trabajos', {session: sessionWith(IMPORTER)})

        const importer = await screen.findByRole('region', {name: 'Importar el maestro de perfiles'})
        const huge = workbook('profile-master.xlsx')
        Object.defineProperty(huge, 'size', {value: 20 * 1024 * 1024 + 1})
        await uploadTo(user, importer, 'Fichero del maestro de perfiles', huge)

        expect(within(importer).getByText('Pasa de 20 MB, lo más que admite el servicio.')).toBeInTheDocument()
        expect(within(importer).getByRole('button', {name: 'Importar'})).toBeDisabled()
        await user.click(within(importer).getByRole('button', {name: 'Quitar el fichero'}))
        expect(within(importer).queryByText('Pasa de 20 MB, lo más que admite el servicio.')).not.toBeInTheDocument()
    })

    it('una descarga cuyo fichero ya no está (410) pide volver a lanzar el trabajo', async () => {
        serveReferences()
        serveJobs([job({type: 'PROFILE_EXPORT', status: 'COMPLETED', trackId: 3, mapperType: 'basic', totalItems: 4, processedItems: 4,
            successfulItems: 4})])
        server.use(http.get(`${BASE}/profiles/jobs/${JOB_ID}/file`, () => HttpResponse.json(
            {status: 410, detail: `El fichero del trabajo ${JOB_ID} ya no esta disponible`},
            {status: 410, headers: {'Content-Type': 'application/problem+json'}},
        )))
        const {user} = renderRoute('/trabajos', {session: loginAs('config.lector')})

        await waitFor(() => expect(dataRows()).toHaveLength(1))
        await user.click(within(history()).getByRole('button', {name: 'Descargar Exportación de TRACK 1 (EP4) (basic)'}))

        expect(await screen.findByText('El fichero ya no está en el servicio: vuelve a lanzar el trabajo.')).toBeInTheDocument()
    })
})
