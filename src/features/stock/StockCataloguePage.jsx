import {Button, CloseButton, Group, Stack, Text, TextInput, Title} from '@mantine/core'
import {useDebouncedValue} from '@mantine/hooks'
import {IconHistory, IconPencil, IconPlus, IconRefresh, IconSearch} from '@tabler/icons-react'
import {useState} from 'react'
import {catalogueRevisionsPath} from '../../api/stock/catalogues.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import RevisionsModal from '../../ui/RevisionsModal.jsx'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import TriStateFilter from '../../ui/TriStateFilter.jsx'
import {countText, entryLabel} from './stockTexts.js'
import {STOCK_PAGE_SIZE, useCatalogueList} from './useStock.js'

const SEARCH_DELAY_MS = 400

/**
 * Un catálogo de mto-stock (el port de StockCatalogueView): la lista paginada en el servidor con la
 * búsqueda por código o nombre, el estado y el orden de una columna, y su editor. Cada página se pide
 * a GET /{catálogo} con search, active, page, size y sort; sin columna elegida se ordena por código, y
 * siempre por id al final. El recuento es totalElements.
 *
 * No hay borrado: un catálogo se retira desde su editor, desmarcando «Activo». «Nuevo» y modificar
 * piden stock-write; esconderlos es cortesía, la guarda es el servicio. La columna de acciones existe
 * siempre, porque el historial de cada fila es lectura, como la lista.
 *
 * @param {{catalogue: string, title: string, singular: string, plural: string}} catalogue la entrada de CATALOGUES
 * @param {Array} columns las columnas de la fila; las ordenables llevan el atributo del servicio en sortField
 * @param {Function} renderEditor ({row, onClose}) → el editor; row es null en un alta
 * @param {Function} [describe] la fila de una revisión → una línea
 * @param {Function} [isEditable] si una fila se puede modificar (un proyecto sincronizado, no)
 * @param {Function} [rowActions] fila → las acciones propias del catálogo, entre modificar y el historial
 */
export default function StockCataloguePage({catalogue, columns, renderEditor, describe, isEditable = () => true, rowActions = null}) {
    const session = useSession()
    const canWrite = session.has(P.STOCK_WRITE)

    const [search, setSearch] = useState('')
    const [debouncedSearch] = useDebouncedValue(search, SEARCH_DELAY_MS)
    const [active, setActive] = useState(null)
    const [sort, setSort] = useState(null)
    // La página vuelve a la primera en cuanto cambia lo que se pide.
    const listKey = JSON.stringify([debouncedSearch.trim(), active, sort])
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1

    // null: cerrado; {row: null}: alta; {row}: modificación.
    const [editing, setEditing] = useState(null)
    const [history, setHistory] = useState(null)

    const list = useCatalogueList(catalogue.catalogue, {search: debouncedSearch, active, page, sort})
    const rows = list.data?.content ?? []
    const filtering = Boolean(debouncedSearch.trim()) || active !== null
    const editable = (row) => canWrite && isEditable(row)

    const actions = (row) => (
        <>
            {editable(row) && (
                <RowActionButton label={`Modificar ${entryLabel(row)}`} tooltip="Modificar" icon={IconPencil}
                                 onClick={() => setEditing({row})}/>
            )}
            {rowActions?.(row)}
            <RowActionButton label={`Historial de ${entryLabel(row)}`} tooltip="Historial" icon={IconHistory}
                             onClick={() => setHistory(row)}/>
        </>
    )

    return (
        <Stack>
            <Title order={2}>{catalogue.title}</Title>
            <Group justify="space-between" align="flex-end" gap="sm">
                <Group gap="sm" align="flex-end">
                    <TextInput aria-label="Buscar por código o nombre" placeholder="Buscar por código o nombre" w={260}
                               leftSection={<IconSearch size={16}/>} value={search} onChange={(event) => setSearch(event.currentTarget.value)}
                               rightSection={search
                                   ? <CloseButton size="sm" aria-label="Borrar la búsqueda" onClick={() => setSearch('')}/>
                                   : null}/>
                    <TriStateFilter label="Estado" labels={['Todos', 'Activos', 'Retirados']} value={active} onChange={setActive}/>
                    <Button variant="default" leftSection={<IconRefresh size={16}/>} loading={list.isFetching}
                            onClick={() => void list.refetch()}>
                        Recargar
                    </Button>
                    <Text size="sm" c="dimmed" aria-live="polite">
                        {list.data ? countText(list.data.totalElements, catalogue.singular, catalogue.plural) : ''}
                    </Text>
                </Group>
                {canWrite && <Button leftSection={<IconPlus size={16}/>} onClick={() => setEditing({row: null})}>Nuevo</Button>}
            </Group>
            <ServerDataTable ariaLabel={catalogue.title} columns={columns} rows={rows} loading={list.isPending}
                             emptyText={emptyText(list, catalogue, filtering)} sort={sort} onSortChange={setSort}
                             page={page} pageSize={STOCK_PAGE_SIZE} totalElements={list.data?.totalElements ?? 0}
                             onPageChange={(next) => setPaging({key: listKey, page: next})} rowActions={actions}
                             onRowDoubleClick={canWrite ? (row) => (isEditable(row) ? setEditing({row}) : undefined) : null}/>
            {editing && renderEditor({row: editing.row, onClose: () => setEditing(null)})}
            {history && (
                <RevisionsModal label={entryLabel(history)} path={catalogueRevisionsPath(catalogue.catalogue, history.id)}
                                describe={describe} onClose={() => setHistory(null)}/>
            )}
        </Stack>
    )
}

function emptyText(list, catalogue, filtering) {
    if (list.isError) {
        return 'No se ha podido leer la lista.'
    }
    return filtering ? 'Nada coincide con la búsqueda.' : `No hay ${catalogue.plural}.`
}
