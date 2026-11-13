import {Button, CloseButton, Group, Stack, Text, TextInput, Title} from '@mantine/core'
import {useDebouncedValue} from '@mantine/hooks'
import {IconHistory, IconPencil, IconPlus, IconRefresh, IconSearch, IconTrash} from '@tabler/icons-react'
import {useMemo, useState} from 'react'
import {deleteMaster, masterRevisionsPath} from '../../api/configuration/masters.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import {formatDateTime} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RevisionsModal from '../../ui/RevisionsModal.jsx'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import {MASTER_HISTORY, NO_ENTITY} from './masterHistory.js'
import {countText, deletedText, deleteWarning, nameOf} from './masterResources.js'
import {PAGE_SIZE, useMasterList, useMasterMutation} from './useMasters.js'

const SEARCH_DELAY_MS = 400

/**
 * La pantalla de un maestro de infraestructura (el port de MasterView): la lista paginada en el
 * servidor y su editor. Cada página se pide a POST /filter con la página, el tamaño, el orden de una
 * columna y el texto de búsqueda (searchText, que el servicio aplica a varias columnas), más los
 * filtros propios del maestro. El recuento es totalElements: nunca se trae el maestro entero, y de
 * perfiles hay miles.
 *
 * Los botones siguen los permisos del servicio: crear y modificar piden config-write, y borrar (que es
 * lógico) config-delete. La columna de acciones existe siempre, también para quien solo lee, porque un
 * maestro puede ofrecer acciones de lectura (el esquema de una vía).
 *
 * El historial de una fila pide config-audit y config-read juntos: leer el dato no da derecho a ver
 * quién lo cambió, y el historial enseña la fila. Con uno solo el servicio responde 403, así que el
 * botón no se ofrece. Va detrás de las acciones propias del maestro y antes de borrar.
 *
 * @param {object} master la entrada de MASTERS
 * @param {Array} columns las columnas propias; «Modificado» la añade esta pantalla
 * @param {Array<{key: string, initial?: *, render: Function}>} [filters] los filtros propios:
 *        render(valor, cambiar) pinta el control
 * @param {Function} [rowActions] fila → acciones de lectura, entre modificar y el historial
 * @param {object} references los nombres de las referencias, con los que el historial dice cómo quedó
 *        la fila en cada revisión
 * @param {Function} renderEditor ({row, onClose}) → el editor; row es null en un alta, o una copia de
 *        la fila
 * @param {Function} [labelOf] cómo se nombra una fila en los mensajes
 */
export default function MasterPage({master, columns, filters = [], rowActions = null, references, renderEditor, labelOf = nameOf}) {
    const session = useSession()
    const canWrite = session.has(P.CONFIG_WRITE)
    const canDelete = session.has(P.CONFIG_DELETE)
    const canAudit = session.hasAll(P.CONFIG_AUDIT, P.CONFIG_READ)

    const [search, setSearch] = useState('')
    const [debouncedSearch] = useDebouncedValue(search, SEARCH_DELAY_MS)
    const [filterValues, setFilterValues] = useState(() => Object.fromEntries(filters.map((filter) => [filter.key, filter.initial ?? null])))
    const [sort, setSort] = useState(null)
    // La página vuelve a la primera en cuanto cambia lo que se pide: otra búsqueda, otro filtro u otro orden.
    const listKey = JSON.stringify([debouncedSearch.trim(), filterValues, sort])
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1

    // null: cerrado; {row: null}: alta; {row: copia}: modificación.
    const [editing, setEditing] = useState(null)
    const [deleting, setDeleting] = useState(null)
    const [history, setHistory] = useState(null)

    const filter = useMemo(() => ({searchText: debouncedSearch, ...filterValues}), [debouncedSearch, filterValues])
    const list = useMasterList(master.path, {page, sort, filter})
    const removing = useMasterMutation((row) => deleteMaster(master.path, row.id))

    const rows = list.data?.content ?? []
    const allColumns = [
        ...columns,
        {key: 'versionDate', label: 'Modificado', sortField: 'versionDate', render: (row) => formatDateTime(row.versionDate)},
    ]
    const filtering = Boolean(debouncedSearch.trim()) || Object.values(filterValues).some((value) => value !== null)

    // Se edita una copia de la fila: si se cancela o el servicio rechaza el cambio, la lista sigue
    // enseñando lo que llegó del servicio.
    const edit = (row) => setEditing({row: row === null ? null : structuredClone(row)})

    const confirmDelete = () => {
        const row = deleting
        removing.mutate(row, {
            onSuccess: () => {
                notifySuccess(deletedText(master, labelOf(row)))
                setDeleting(null)
            },
            onError: () => setDeleting(null),
        })
    }

    const actions = (row) => (
        <>
            {canWrite && (
                <RowActionButton label={`Modificar ${labelOf(row)}`} tooltip="Modificar" icon={IconPencil} onClick={() => edit(row)}/>
            )}
            {rowActions?.(row)}
            {canAudit && (
                <RowActionButton label={`Historial de ${labelOf(row)}`} tooltip="Historial" icon={IconHistory}
                                 onClick={() => setHistory(row)}/>
            )}
            {canDelete && (
                <RowActionButton label={`Borrar ${labelOf(row)}`} tooltip="Borrar" icon={IconTrash} color="red"
                                 onClick={() => setDeleting(row)}/>
            )}
        </>
    )

    return (
        <Stack>
            <Title order={2}>{master.title}</Title>
            <Group justify="space-between" align="flex-end" gap="sm">
                <Group gap="sm" align="flex-end">
                    <TextInput aria-label="Buscar" placeholder="Buscar" w={240} leftSection={<IconSearch size={16}/>}
                               value={search} onChange={(event) => setSearch(event.currentTarget.value)}
                               rightSection={search
                                   ? <CloseButton size="sm" aria-label="Borrar la búsqueda" onClick={() => setSearch('')}/>
                                   : null}/>
                    {filters.map((item) => (
                        <div key={item.key}>
                            {item.render(filterValues[item.key], (value) => setFilterValues((current) => ({...current, [item.key]: value})))}
                        </div>
                    ))}
                    <Button variant="default" leftSection={<IconRefresh size={16}/>} loading={list.isFetching}
                            onClick={() => void list.refetch()}>
                        Recargar
                    </Button>
                    <Text size="sm" c="dimmed" aria-live="polite">
                        {list.data ? countText(master, list.data.totalElements) : ''}
                    </Text>
                </Group>
                {canWrite && <Button leftSection={<IconPlus size={16}/>} onClick={() => edit(null)}>Nuevo</Button>}
            </Group>
            <ServerDataTable ariaLabel={master.title} columns={allColumns} rows={rows} loading={list.isPending}
                             emptyText={emptyText(list, master, filtering)} sort={sort} onSortChange={setSort}
                             page={page} pageSize={PAGE_SIZE} totalElements={list.data?.totalElements ?? 0}
                             onPageChange={(next) => setPaging({key: listKey, page: next})}
                             rowActions={actions} onRowDoubleClick={canWrite ? edit : null}/>
            {editing && renderEditor({row: editing.row, onClose: () => setEditing(null)})}
            {history && (
                <RevisionsModal label={labelOf(history)} path={masterRevisionsPath(master.path, history.id)}
                                describe={(entity) => MASTER_HISTORY[master.path](entity, references)} whenMissing={NO_ENTITY}
                                onClose={() => setHistory(null)}/>
            )}
            {deleting && (
                <ConfirmModal title={`Borrar ${master.singular} ${labelOf(deleting)}`} confirmLabel="Borrar"
                              loading={removing.isPending} onConfirm={confirmDelete} onClose={() => setDeleting(null)}>
                    {deleteWarning(master)}
                </ConfirmModal>
            )}
        </Stack>
    )
}

function emptyText(list, master, filtering) {
    if (list.isError) {
        return 'No se ha podido leer la lista.'
    }
    return filtering ? 'Nada coincide con la búsqueda.' : `No hay ${master.plural}.`
}
