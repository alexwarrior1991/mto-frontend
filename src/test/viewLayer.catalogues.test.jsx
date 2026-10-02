import {act, screen, waitFor, within} from '@testing-library/react'
import {http, HttpResponse} from 'msw'
import {describe, expect, it} from 'vitest'
import {P} from '../auth/permissions.js'
import {parseBulkLines} from '../features/catalogues/bulkLines.js'
import {renderRoute} from './render.jsx'
import {server} from './server.js'
import {loginAs, sessionWith} from './session.js'

/**
 * La pantalla de catalogos (catalogos/:resource) con los casos de catalogos de ViewLayerTest del
 * backoffice: el catalogo de la ruta y su filtro local, lo que ve quien solo lee, el error con su
 * referencia, el alta, los errores del servicio campo a campo, la modificacion con la version leida,
 * la version vieja, el formulario vacio, el borrado confirmado, el lote con la version de cada fila y
 * el alta multiple. Y lo que el backoffice no tenia: el tipo de los tres catalogos que lo exigen.
 */

const STATUSES = '/api/configuration/profile-statuses'
const MANAGER = [P.CONFIG_READ, P.CONFIG_WRITE, P.CONFIG_DELETE, P.CONFIG_IMPORT, P.LOV_MANAGE]

function threeStatuses() {
    return [
        {
            id: 1, code: 'DRAFT', description: 'Borrador', type: null, enabled: true, versionNumber: 3,
            versionDate: '2026-08-01T10:15:00', versionUser: 'config.responsable',
        },
        {
            id: 2, code: 'PROVISIONAL', description: 'Provisional', type: null, enabled: true, versionNumber: 1,
            versionDate: null, versionUser: null,
        },
        {
            id: 3, code: 'DEFINITIVE', description: 'Definitivo, en explotación', type: null, enabled: false,
            versionNumber: 1, versionDate: null, versionUser: null,
        },
    ]
}

/**
 * Un catalogo en el gateway simulado: cada lectura devuelve la siguiente respuesta (la ultima se
 * repite), y se cuentan las lecturas.
 */
function serveCatalogue(path, ...responses) {
    const reads = {count: 0}
    server.use(http.get(path, () => {
        const body = responses[Math.min(reads.count, responses.length - 1)]
        reads.count += 1
        return HttpResponse.json(body)
    }))
    return reads
}

/** Recoge los cuerpos que llegan a una escritura y contesta con respond(cuerpo). */
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

function problem(status, body, headers = {}) {
    return HttpResponse.json(body, {status, headers: {'Content-Type': 'application/problem+json', ...headers}})
}

function table() {
    return screen.getByRole('table', {name: 'Entradas del catálogo'})
}

/** Los codigos de las filas que se ven, en su orden. */
function shownCodes() {
    const column = within(table()).getAllByRole('columnheader').map((header) => header.textContent).indexOf('Código')
    return within(table()).getAllByRole('row').slice(1)
        .map((row) => within(row).queryAllByRole('cell'))
        .filter((cells) => cells.length > 1)
        .map((cells) => cells[column].textContent)
}

function rowOf(code) {
    return within(table()).getAllByRole('row')
        .find((row) => within(row).queryAllByRole('cell').some((cell) => cell.textContent === code))
}

async function openCatalogue(path, session, expected) {
    const view = renderRoute(path, {session})
    await waitFor(() => expect(shownCodes()).toHaveLength(expected))
    return view
}

async function editDescription(user, code, description, catalogueTitle = 'Estados de perfil') {
    await user.click(screen.getByRole('button', {name: `Modificar ${code}`}))
    const dialog = await screen.findByRole('dialog', {name: `Modificar entrada de ${catalogueTitle}`})
    const field = within(dialog).getByRole('textbox', {name: 'Descripción'})
    await user.clear(field)
    await user.type(field, description)
    await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
    return dialog
}

describe('el catalogo de la ruta', () => {
    it('se lista por codigo con quien lo toco por ultima vez, y el filtro es local y no distingue mayusculas ni tildes', async () => {
        const reads = serveCatalogue(STATUSES, threeStatuses())
        const {user} = renderRoute('/catalogos/profile-statuses', {session: loginAs('config.lector')})

        expect(await screen.findByRole('heading', {name: 'Estados de perfil'})).toBeInTheDocument()
        await waitFor(() => expect(shownCodes()).toEqual(['DEFINITIVE', 'DRAFT', 'PROVISIONAL']))
        expect(screen.getByText('3 entradas')).toBeInTheDocument()
        expect(within(rowOf('DRAFT')).getByText('01/08/2026 10:15')).toBeInTheDocument()
        expect(within(rowOf('DRAFT')).getByText('config.responsable')).toBeInTheDocument()
        expect(within(rowOf('DEFINITIVE')).getByText('No')).toBeInTheDocument()

        const filter = screen.getByRole('textbox', {name: 'Filtrar por código o descripción'})
        await user.type(filter, 'prov')
        expect(shownCodes()).toEqual(['PROVISIONAL'])
        expect(screen.getByText('1 de 3 entradas')).toBeInTheDocument()

        await user.clear(filter)
        await user.type(filter, 'EXPLOTACION')
        expect(shownCodes()).toEqual(['DEFINITIVE'])

        await user.clear(filter)
        await user.click(screen.getByRole('checkbox', {name: 'Solo activos'}))
        expect(shownCodes()).toEqual(['DRAFT', 'PROVISIONAL'])
        expect(reads.count).toBe(1)

        await user.click(screen.getByRole('button', {name: 'Recargar'}))
        await waitFor(() => expect(reads.count).toBe(2))
    })

    it('Código y Descripción ordenan, y un segundo clic invierte el orden', async () => {
        serveCatalogue(STATUSES, threeStatuses())
        const {user} = await openCatalogue('/catalogos/profile-statuses', loginAs('config.lector'), 3)

        await user.click(screen.getByRole('button', {name: 'Descripción'}))
        expect(shownCodes()).toEqual(['DRAFT', 'DEFINITIVE', 'PROVISIONAL'])
        await user.click(screen.getByRole('button', {name: 'Descripción'}))
        expect(shownCodes()).toEqual(['PROVISIONAL', 'DEFINITIVE', 'DRAFT'])
        await user.click(screen.getByRole('button', {name: 'Código'}))
        expect(shownCodes()).toEqual(['DEFINITIVE', 'DRAFT', 'PROVISIONAL'])
        expect(screen.getByRole('columnheader', {name: 'Código'})).toHaveAttribute('aria-sort', 'ascending')
    })

    it('quien solo lee no ve ningun control de escritura, tampoco con los permisos de escribir sin lov-manage', async () => {
        serveCatalogue(STATUSES, threeStatuses())
        const reader = await openCatalogue('/catalogos/profile-statuses', loginAs('config.lector'), 3)
        expectNoWriteControls()
        reader.unmount()

        await openCatalogue('/catalogos/profile-statuses',
            sessionWith([P.CONFIG_READ, P.CONFIG_WRITE, P.CONFIG_DELETE, P.CONFIG_IMPORT]), 3)
        expectNoWriteControls()
    })

    it('un fallo al leer se avisa con su referencia, y la tabla dice que no se ha podido leer', async () => {
        server.use(http.get(STATUSES, () => problem(503,
            {title: 'Service Unavailable', status: 503, service: 'mto-configuration', correlationId: 'corr-5'},
            {'Retry-After': '30'})))
        renderRoute('/catalogos/profile-statuses', {session: loginAs('config.lector')})

        expect(await screen.findByText('El servicio no está disponible ahora mismo. Inténtalo en 30 s.')).toBeInTheDocument()
        expect(screen.getByText('Referencia: corr-5')).toBeInTheDocument()
        expect(screen.getByText('No se ha podido leer el catálogo.')).toBeInTheDocument()
    })

    it('cambiar de catalogo empieza de cero: su titulo, su lectura y sin el filtro del anterior', async () => {
        serveCatalogue(STATUSES, threeStatuses())
        serveCatalogue('/api/configuration/pole-types', [{id: 7, code: 'PT7', description: 'Poste tipo 7', enabled: true}])
        const {user, router} = await openCatalogue('/catalogos/profile-statuses', loginAs('config.lector'), 3)
        await user.type(screen.getByRole('textbox', {name: 'Filtrar por código o descripción'}), 'prov')

        await act(() => router.navigate('/catalogos/pole-types'))

        expect(await screen.findByRole('heading', {name: 'Tipos de poste'})).toBeInTheDocument()
        await waitFor(() => expect(shownCodes()).toEqual(['PT7']))
        expect(screen.getByRole('textbox', {name: 'Filtrar por código o descripción'})).toHaveValue('')
    })
})

function expectNoWriteControls() {
    expect(screen.queryByRole('button', {name: 'Nuevo'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Alta múltiple'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Desactivar seleccionados'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Modificar DRAFT'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {name: 'Borrar DRAFT'})).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', {name: 'Seleccionar DRAFT'})).not.toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Recargar'})).toBeInTheDocument()
}

describe('alta y modificacion', () => {
    it('el alta manda solo lo escrito y sin espacios, cierra el dialogo, avisa y relee el catalogo', async () => {
        const archived = {
            id: 4, code: 'ARCHIVED', description: 'Archivado', type: null, enabled: true, versionNumber: 1,
            versionDate: '2026-10-02T09:00:00', versionUser: 'config.responsable',
        }
        const reads = serveCatalogue(STATUSES, threeStatuses(), [...threeStatuses(), archived])
        const posts = recordWrites('post', STATUSES, () => HttpResponse.json(archived, {status: 201}))
        const {user} = await openCatalogue('/catalogos/profile-statuses', sessionWith(MANAGER), 3)

        await user.click(screen.getByRole('button', {name: 'Nuevo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Nueva entrada de Estados de perfil'})
        await user.type(within(dialog).getByRole('textbox', {name: 'Código'}), ' ARCHIVED ')
        await user.type(within(dialog).getByRole('textbox', {name: 'Descripción'}), 'Archivado')
        expect(within(dialog).getByRole('checkbox', {name: 'Activo'})).toBeChecked()
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(posts).toEqual([{code: 'ARCHIVED', description: 'Archivado', enabled: true}])
        expect(screen.getByText('Guardado')).toBeInTheDocument()
        await waitFor(() => expect(shownCodes()).toContain('ARCHIVED'))
        expect(reads.count).toBe(2)
    })

    it('los errores del servicio caen en su campo con el dialogo abierto, y lo que no tiene campo se avisa', async () => {
        serveCatalogue(STATUSES, threeStatuses())
        server.use(http.post(STATUSES, () => problem(400, {
            title: 'Error de validación', status: 400, code: 'VAL-000', traceId: 't-1', errors: [
                {field: 'code', code: 'VAL-002', message: 'El código ya existe'},
                {field: 'somethingElse', code: 'VAL-001', message: 'Otro problema'},
            ],
        })))
        const {user} = await openCatalogue('/catalogos/profile-statuses', sessionWith(MANAGER), 3)

        await user.click(screen.getByRole('button', {name: 'Nuevo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Nueva entrada de Estados de perfil'})
        const code = within(dialog).getByRole('textbox', {name: 'Código'})
        await user.type(code, 'DRAFT')
        await user.type(within(dialog).getByRole('textbox', {name: 'Descripción'}), 'Duplicado')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        await waitFor(() => expect(code).toHaveAttribute('aria-invalid', 'true'))
        expect(within(dialog).getByText('El código ya existe')).toBeInTheDocument()
        expect(screen.getByText('somethingElse: Otro problema')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Nueva entrada de Estados de perfil'})).toBeInTheDocument()
    })

    it('un codigo repetido (409 BUS-002) se avisa sin pedir recargar, con el dialogo abierto', async () => {
        serveCatalogue(STATUSES, threeStatuses())
        server.use(http.post(STATUSES, () => problem(409, {title: 'Conflicto', status: 409, code: 'BUS-002', traceId: 't-dup'})))
        const {user} = await openCatalogue('/catalogos/profile-statuses', sessionWith(MANAGER), 3)

        await user.click(screen.getByRole('button', {name: 'Nuevo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Nueva entrada de Estados de perfil'})
        await user.type(within(dialog).getByRole('textbox', {name: 'Código'}), 'DRAFT')
        await user.type(within(dialog).getByRole('textbox', {name: 'Descripción'}), 'Otra vez')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        expect(await screen.findByText('Ya existe otro registro con ese valor (un código que no se puede repetir), o la entrada está en uso.'))
            .toBeInTheDocument()
        expect(screen.getByText('Referencia: t-dup')).toBeInTheDocument()
        expect(screen.getByRole('dialog', {name: 'Nueva entrada de Estados de perfil'})).toBeInTheDocument()
    })

    it('una modificacion manda la fila leida entera con su version, y la siguiente la version recargada', async () => {
        const read = threeStatuses()
        // Lo que la pantalla no ensena tambien vuelve: un PUT del servicio sustituye la entrada entera.
        read[0].drawingNumber = 1234
        const reloaded = threeStatuses()
        reloaded[0] = {...read[0], description: 'Borrador revisado', versionNumber: 4, versionDate: '2026-10-02T09:00:00'}
        const reads = serveCatalogue(STATUSES, read, reloaded)
        const puts = recordWrites('put', `${STATUSES}/1`, (body) => HttpResponse.json({...body, versionNumber: body.versionNumber + 1}))
        const {user} = await openCatalogue('/catalogos/profile-statuses', sessionWith(MANAGER), 3)

        await editDescription(user, 'DRAFT', 'Borrador revisado')
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        await waitFor(() => expect(within(rowOf('DRAFT')).getByText('Borrador revisado')).toBeInTheDocument())
        await editDescription(user, 'DRAFT', 'Borrador definitivo')

        await waitFor(() => expect(puts).toHaveLength(2))
        expect(puts[0]).toEqual({...read[0], description: 'Borrador revisado'})
        expect(puts[1]).toEqual({...reloaded[0], description: 'Borrador definitivo'})
        await waitFor(() => expect(reads.count).toBe(3))
    })

    it('una version vieja (409 CON-001) pide recargar con su referencia, y el dialogo sigue abierto con lo escrito', async () => {
        const reads = serveCatalogue(STATUSES, threeStatuses())
        server.use(http.put(`${STATUSES}/1`, () => problem(409, {
            title: 'Conflicto', status: 409, code: 'CON-001', traceId: 't-409', retryable: true,
            detail: 'Conflicto de concurrencia detectado. Inténtelo de nuevo.',
        })))
        const {user} = await openCatalogue('/catalogos/profile-statuses', sessionWith(MANAGER), 3)

        const dialog = await editDescription(user, 'DRAFT', 'Borrador revisado')

        expect(await screen.findByText('Conflicto con otro cambio: recarga y vuelve a intentarlo.')).toBeInTheDocument()
        expect(screen.getByText('Referencia: t-409')).toBeInTheDocument()
        expect(dialog).toBeInTheDocument()
        expect(within(dialog).getByRole('textbox', {name: 'Descripción'})).toHaveValue('Borrador revisado')
        expect(reads.count).toBe(1)
    })

    it('un formulario vacio no llega al servicio', async () => {
        serveCatalogue(STATUSES, threeStatuses())
        const {user} = await openCatalogue('/catalogos/profile-statuses', sessionWith(MANAGER), 3)

        await user.click(screen.getByRole('button', {name: 'Nuevo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Nueva entrada de Estados de perfil'})
        await user.type(within(dialog).getByRole('textbox', {name: 'Descripción'}), '   ')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        // Sin manejador para el POST: si saliera, setup.js haria fallar el test.
        expect(within(dialog).getByText('El código es obligatorio')).toBeInTheDocument()
        expect(within(dialog).getByText('La descripción es obligatoria')).toBeInTheDocument()
    })
})

describe('borrar', () => {
    it('pide confirmacion diciendo lo que pasa de verdad, borra la entrada y relee el catalogo', async () => {
        const reads = serveCatalogue(STATUSES, threeStatuses(), threeStatuses().slice(1))
        const deletes = recordWrites('delete', `${STATUSES}/1`, () => new HttpResponse(null, {status: 204}))
        const {user} = await openCatalogue('/catalogos/profile-statuses',
            sessionWith([P.CONFIG_READ, P.CONFIG_DELETE, P.LOV_MANAGE]), 3)
        expect(screen.queryByRole('button', {name: 'Modificar DRAFT'})).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', {name: 'Borrar DRAFT'}))
        const dialog = await screen.findByRole('dialog', {name: 'Borrar DRAFT'})
        expect(dialog).toHaveTextContent('no se puede deshacer')
        expect(dialog).toHaveTextContent('desactívala')
        expect(deletes).toHaveLength(0)
        await user.click(within(dialog).getByRole('button', {name: 'Borrar'}))

        expect(await screen.findByText('Borrada DRAFT')).toBeInTheDocument()
        await waitFor(() => expect(shownCodes()).toEqual(['DEFINITIVE', 'PROVISIONAL']))
        expect(deletes).toHaveLength(1)
        expect(reads.count).toBe(2)
    })

    it('una entrada en uso (409 BUS-002) no se borra, y el aviso lo dice', async () => {
        const reads = serveCatalogue(STATUSES, threeStatuses())
        server.use(http.delete(`${STATUSES}/1`, () => problem(409, {
            title: 'Conflicto', status: 409, code: 'BUS-002', traceId: 't-bus',
            detail: 'La operación entra en conflicto con un registro existente: valor único repetido o referencia en uso',
        })))
        const {user} = await openCatalogue('/catalogos/profile-statuses', sessionWith(MANAGER), 3)

        await user.click(screen.getByRole('button', {name: 'Borrar DRAFT'}))
        await user.click(within(await screen.findByRole('dialog', {name: 'Borrar DRAFT'})).getByRole('button', {name: 'Borrar'}))

        expect(await screen.findByText('Ya existe otro registro con ese valor (un código que no se puede repetir), o la entrada está en uso.'))
            .toBeInTheDocument()
        expect(screen.getByText('Referencia: t-bus')).toBeInTheDocument()
        expect(shownCodes()).toContain('DRAFT')
        expect(reads.count).toBe(1)
    })
})

describe('lotes', () => {
    it('desactivar en lote manda cada fila seleccionada entera y con su version', async () => {
        const reads = serveCatalogue(STATUSES, threeStatuses())
        const puts = recordWrites('put', `${STATUSES}/bulk`, (body) => HttpResponse.json(body))
        const {user} = await openCatalogue('/catalogos/profile-statuses',
            sessionWith([P.CONFIG_READ, P.CONFIG_IMPORT, P.LOV_MANAGE]), 3)
        expect(screen.queryByRole('button', {name: 'Nuevo'})).not.toBeInTheDocument()

        const disable = screen.getByRole('button', {name: 'Desactivar seleccionados'})
        expect(disable).toBeDisabled()
        await user.click(screen.getByRole('checkbox', {name: 'Seleccionar DRAFT'}))
        await user.click(screen.getByRole('checkbox', {name: 'Seleccionar PROVISIONAL'}))
        expect(disable).toBeEnabled()
        await user.click(disable)

        expect(await screen.findByText('2 entradas desactivadas')).toBeInTheDocument()
        const [draft, provisional] = threeStatuses()
        // Una sola fila con la version vieja y el servicio rechaza el lote entero (409 CON-001).
        expect(puts).toEqual([[{...draft, enabled: false}, {...provisional, enabled: false}]])
        await waitFor(() => expect(reads.count).toBe(2))
        expect(screen.getByRole('checkbox', {name: 'Seleccionar DRAFT'})).not.toBeChecked()
    })

    it('«Seleccionar todas» se queda en lo que se ve', async () => {
        serveCatalogue(STATUSES, threeStatuses())
        const puts = recordWrites('put', `${STATUSES}/bulk`, (body) => HttpResponse.json(body))
        const {user} = await openCatalogue('/catalogos/profile-statuses', sessionWith(MANAGER), 3)

        await user.click(screen.getByRole('checkbox', {name: 'Solo activos'}))
        await user.click(screen.getByRole('checkbox', {name: 'Seleccionar todas'}))
        await user.click(screen.getByRole('button', {name: 'Activar seleccionados'}))

        expect(await screen.findByText('2 entradas activadas')).toBeInTheDocument()
        expect(puts[0].map((entry) => entry.code)).toEqual(['DRAFT', 'PROVISIONAL'])
    })

    it('el alta multiple lee una entrada por linea, no llama si no la entiende y crea las que si', async () => {
        const reads = serveCatalogue(STATUSES, threeStatuses())
        const posts = recordWrites('post', `${STATUSES}/bulk`,
            (body) => HttpResponse.json(body.map((entry, index) => ({...entry, id: 10 + index})), {status: 201}))
        const {user} = await openCatalogue('/catalogos/profile-statuses',
            sessionWith([P.CONFIG_READ, P.CONFIG_IMPORT, P.LOV_MANAGE]), 3)

        await user.click(screen.getByRole('button', {name: 'Alta múltiple'}))
        const dialog = await screen.findByRole('dialog', {name: 'Alta múltiple en Estados de perfil'})
        const lines = within(dialog).getByRole('textbox', {name: 'Entradas'})
        await user.click(lines)
        await user.paste('PT1;Uno\nSIN-DESCRIPCION')
        await user.click(within(dialog).getByRole('button', {name: 'Crear'}))
        expect(within(dialog).getByText('La línea 2 no tiene código y descripción separados por «;»')).toBeInTheDocument()
        expect(posts).toHaveLength(0)

        await user.clear(lines)
        await user.paste('PT1;Uno\n\nPT2\tDos\nPT3 - Tres')
        await user.click(within(dialog).getByRole('button', {name: 'Crear'}))

        expect(await screen.findByText('3 entradas creadas')).toBeInTheDocument()
        expect(posts).toEqual([[
            {code: 'PT1', description: 'Uno', enabled: true},
            {code: 'PT2', description: 'Dos', enabled: true},
            {code: 'PT3', description: 'Tres', enabled: true},
        ]])
        await waitFor(() => expect(reads.count).toBe(2))
    })
})

describe('bulkLines.js: el texto del alta multiple', () => {
    it('una entrada por linea con «;», tabulador o « - », y las lineas en blanco no cuentan', () => {
        expect(parseBulkLines('PT1;Poste tipo 1\n\nPT2\tPoste tipo 2\r\nPT3 - Poste tipo 3\n')).toEqual({
            entries: [
                {code: 'PT1', description: 'Poste tipo 1'},
                {code: 'PT2', description: 'Poste tipo 2'},
                {code: 'PT3', description: 'Poste tipo 3'},
            ],
            error: null,
        })
        expect(parseBulkLines('A;B - C').entries).toEqual([{code: 'A', description: 'B - C'}])
    })

    it('dice la primera linea que no entiende, contando desde 1, y que no hay ninguna', () => {
        expect(parseBulkLines('PT1;Poste tipo 1\nSIN-DESCRIPCION\n').error)
            .toBe('La línea 2 no tiene código y descripción separados por «;»')
        expect(parseBulkLines(';Sin código').error).toBe('La línea 1 no tiene código y descripción separados por «;»')
        expect(parseBulkLines(`${'X'.repeat(41)};Largo`).error).toBe('La línea 1 tiene un código de más de 40 caracteres')
        expect(parseBulkLines(`X;${'d'.repeat(201)}`).error).toBe('La línea 1 tiene una descripción de más de 200 caracteres')
        expect(parseBulkLines('  \n').error).toBe('No hay ninguna entrada')
    })
})

describe('los tres catalogos con tipo', () => {
    const FOUNDATIONS = '/api/configuration/foundations'
    const TYPES = '/api/configuration/foundation-types'
    const superficial = {
        id: 4, code: 'FT1', description: 'Superficial', type: null, enabled: true, versionNumber: 1,
        versionDate: null, versionUser: null,
    }
    const deep = {
        id: 5, code: 'FT2', description: 'Profunda', type: null, enabled: true, versionNumber: 2,
        versionDate: null, versionUser: null,
    }
    const footing = {
        id: 12, code: 'ZAP-1', description: 'Zapata', type: null, enabled: true, versionNumber: 3,
        versionDate: '2026-09-30T08:15:00', versionUser: 'ana', drawingNumber: 1234, foundationType: superficial,
    }

    it('el tipo sale en la tabla, y el alta lo exige y lo manda por su id', async () => {
        serveCatalogue(FOUNDATIONS, [footing])
        serveCatalogue(TYPES, [deep, superficial])
        const posts = recordWrites('post', FOUNDATIONS, (body) => HttpResponse.json({...body, id: 13}, {status: 201}))
        const {user} = await openCatalogue('/catalogos/foundations', sessionWith(MANAGER), 1)
        expect(screen.getByRole('columnheader', {name: 'Tipo de cimentación'})).toBeInTheDocument()
        expect(within(rowOf('ZAP-1')).getByText('FT1')).toBeInTheDocument()

        await user.click(screen.getByRole('button', {name: 'Nuevo'}))
        const dialog = await screen.findByRole('dialog', {name: 'Nueva entrada de Cimentaciones'})
        await user.type(within(dialog).getByRole('textbox', {name: 'Código'}), 'PIL-1')
        await user.type(within(dialog).getByRole('textbox', {name: 'Descripción'}), 'Pilote')
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))
        expect(within(dialog).getByText('El tipo es obligatorio')).toBeInTheDocument()
        expect(posts).toHaveLength(0)

        await user.click(within(dialog).getByRole('combobox', {name: 'Tipo de cimentación'}))
        await user.click(await screen.findByRole('option', {name: 'FT2 · Profunda'}))
        await user.click(within(dialog).getByRole('button', {name: 'Guardar'}))

        await waitFor(() => expect(posts).toEqual([
            {code: 'PIL-1', description: 'Pilote', enabled: true, foundationType: {id: 5}},
        ]))
    })

    it('una cimentacion se modifica entera: vuelven su plano y su version, y el tipo por su id', async () => {
        serveCatalogue(FOUNDATIONS, [footing])
        serveCatalogue(TYPES, [superficial, deep])
        const puts = recordWrites('put', `${FOUNDATIONS}/12`, (body) => HttpResponse.json({...body, versionNumber: 4}))
        const {user} = await openCatalogue('/catalogos/foundations', sessionWith(MANAGER), 1)

        const dialog = await editDescription(user, 'ZAP-1', 'Zapata corrida', 'Cimentaciones')
        expect(within(dialog).getByRole('combobox', {name: 'Tipo de cimentación'})).toHaveValue('FT1 · Superficial')

        await waitFor(() => expect(puts).toHaveLength(1))
        expect(puts[0]).toEqual({...footing, description: 'Zapata corrida', foundationType: {id: 4}})
    })

    it('el alta multiple de porticos pide el tipo una vez para todas', async () => {
        serveCatalogue('/api/configuration/portals', [])
        serveCatalogue('/api/configuration/portal-types', [{id: 8, code: 'PO1', description: 'Pórtico rígido', enabled: true}])
        const posts = recordWrites('post', '/api/configuration/portals/bulk', (body) => HttpResponse.json(body, {status: 201}))
        const {user} = renderRoute('/catalogos/portals', {session: sessionWith(MANAGER)})
        expect(await screen.findByText('El catálogo está vacío.')).toBeInTheDocument()

        await user.click(screen.getByRole('button', {name: 'Alta múltiple'}))
        const dialog = await screen.findByRole('dialog', {name: 'Alta múltiple en Pórticos'})
        await user.click(within(dialog).getByRole('textbox', {name: 'Entradas'}))
        await user.paste('P1;Uno\nP2;Dos')
        await user.click(within(dialog).getByRole('button', {name: 'Crear'}))
        expect(within(dialog).getByText('El tipo es obligatorio')).toBeInTheDocument()
        expect(posts).toHaveLength(0)

        await user.click(within(dialog).getByRole('combobox', {name: 'Tipo de pórtico'}))
        await user.click(await screen.findByRole('option', {name: 'PO1 · Pórtico rígido'}))
        await user.click(within(dialog).getByRole('button', {name: 'Crear'}))

        expect(await screen.findByText('2 entradas creadas')).toBeInTheDocument()
        expect(posts).toEqual([[
            {code: 'P1', description: 'Uno', enabled: true, portalType: {id: 8}},
            {code: 'P2', description: 'Dos', enabled: true, portalType: {id: 8}},
        ]])
    })
})
