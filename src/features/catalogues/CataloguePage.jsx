import {Button, Checkbox, CloseButton, Group, Stack, Text, TextInput, Title} from '@mantine/core'
import {IconCheck, IconListNumbers, IconPlus, IconRefresh, IconSearch, IconX} from '@tabler/icons-react'
import {useMemo, useState} from 'react'
import {useParams} from 'react-router'
import {findLovResource} from '../../api/configuration/lovResources.js'
import {bulkUpdateLovs, deleteLov, lovEntryWithEnabled} from '../../api/configuration/lovs.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import {notifySuccess} from '../../ui/notifySuccess.js'
import CatalogueBulkCreateModal from './CatalogueBulkCreateModal.jsx'
import CatalogueEditorModal from './CatalogueEditorModal.jsx'
import CatalogueTable from './CatalogueTable.jsx'
import {countText, entriesText, filterRows, sortRows} from './catalogueRows.js'
import {useCatalogue, useCatalogueMutation} from './useCatalogue.js'

/**
 * catalogos/:resource: los 17 catalogos con una sola pantalla (el port de LovCrudView). RouteScreen ya
 * ha comprobado que el catalogo existe. El key hace que cambiar de catalogo empiece de cero, con su
 * filtro, su seleccion y sus dialogos, como entrar en otra pantalla.
 */
export default function CataloguePage({title}) {
    const resource = findLovResource(useParams().resource)
    return <CatalogueScreen key={resource.path} resource={resource} title={title}/>
}

/**
 * El catalogo entero llega en una lista (el servicio no pagina), y filtrar y ordenar es local. Los
 * botones siguen los permisos del servicio: crear y modificar piden config-write y lov-manage;
 * borrar, config-delete y lov-manage; los lotes, config-import y lov-manage.
 */
function CatalogueScreen({resource, title}) {
    const session = useSession()
    const canWrite = session.hasAll(P.CONFIG_WRITE, P.LOV_MANAGE)
    const canDelete = session.hasAll(P.CONFIG_DELETE, P.LOV_MANAGE)
    const canBulk = session.hasAll(P.CONFIG_IMPORT, P.LOV_MANAGE)

    const catalogue = useCatalogue(resource.path)
    const [text, setText] = useState('')
    const [onlyEnabled, setOnlyEnabled] = useState(false)
    const [sort, setSort] = useState({column: 'code', direction: 'asc'})
    const [selected, setSelected] = useState(() => new Set())
    // null: cerrado; {entry: null}: alta; {entry: fila}: modificacion.
    const [editing, setEditing] = useState(null)
    const [deleting, setDeleting] = useState(null)
    const [bulkCreating, setBulkCreating] = useState(false)

    const rows = useMemo(() => (Array.isArray(catalogue.data) ? catalogue.data : []), [catalogue.data])
    const shown = useMemo(() => sortRows(filterRows(rows, {text, onlyEnabled}), sort), [rows, text, onlyEnabled, sort])
    const selectedRows = shown.filter((row) => selected.has(row.id))

    const removing = useCatalogueMutation(resource.path, (row) => deleteLov(resource.path, row.id))
    const switching = useCatalogueMutation(resource.path, (entries) => bulkUpdateLovs(resource.path, entries))

    // Como en el backoffice, la seleccion es de lo que se ve: cambiar el filtro o recargar la vacia.
    const clearSelection = () => setSelected(new Set())
    const changeText = (value) => {
        setText(value)
        clearSelection()
    }
    const changeOnlyEnabled = (value) => {
        setOnlyEnabled(value)
        clearSelection()
    }
    const reload = () => {
        clearSelection()
        void catalogue.refetch()
    }
    const changeSort = (column) => setSort((current) => ({
        column,
        direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
    }))
    const selection = canBulk
        ? {
            selected,
            toggle: (id) => setSelected((current) => {
                const next = new Set(current)
                if (next.has(id)) {
                    next.delete(id)
                } else {
                    next.add(id)
                }
                return next
            }),
            toggleAll: () => setSelected(selectedRows.length === shown.length ? new Set() : new Set(shown.map((row) => row.id))),
        }
        : null

    const confirmDelete = () => {
        const row = deleting
        removing.mutate(row, {
            onSuccess: () => {
                notifySuccess(`Borrada ${row.code}`)
                setSelected((current) => new Set([...current].filter((id) => id !== row.id)))
                setDeleting(null)
            },
            onError: () => setDeleting(null),
        })
    }

    // Cada fila del lote va entera y con su version: una sola desactualizada y el servicio rechaza
    // el lote con 409 CON-001, sin escribir ninguna.
    const switchSelected = (enabled) => {
        const entries = selectedRows.map((row) => lovEntryWithEnabled(row, enabled))
        switching.mutate(entries, {
            onSuccess: (updated) => {
                notifySuccess(entriesText(Array.isArray(updated) ? updated.length : entries.length,
                    enabled ? 'activada' : 'desactivada'))
                clearSelection()
            },
        })
    }

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group justify="space-between" align="center" gap="sm">
                <Group gap="sm" align="center">
                    <TextInput aria-label="Filtrar por código o descripción" placeholder="Filtrar por código o descripción"
                               leftSection={<IconSearch size={16}/>} w={280} value={text}
                               onChange={(event) => changeText(event.currentTarget.value)}
                               rightSection={text
                                   ? <CloseButton size="sm" aria-label="Borrar el filtro" onClick={() => changeText('')}/>
                                   : null}/>
                    <Checkbox label="Solo activos" checked={onlyEnabled}
                              onChange={(event) => changeOnlyEnabled(event.currentTarget.checked)}/>
                    <Button variant="default" leftSection={<IconRefresh size={16}/>} loading={catalogue.isFetching}
                            onClick={reload}>
                        Recargar
                    </Button>
                    <Text size="sm" c="dimmed" aria-live="polite">{countText(shown.length, rows.length)}</Text>
                </Group>
                <Group gap="sm">
                    {canWrite && (
                        <Button leftSection={<IconPlus size={16}/>} onClick={() => setEditing({entry: null})}>Nuevo</Button>
                    )}
                    {canBulk && (
                        <>
                            <Button variant="light" leftSection={<IconListNumbers size={16}/>} onClick={() => setBulkCreating(true)}>
                                Alta múltiple
                            </Button>
                            <Button variant="light" leftSection={<IconCheck size={16}/>} disabled={selectedRows.length === 0}
                                    loading={switching.isPending && switching.variables?.[0]?.enabled === true}
                                    onClick={() => switchSelected(true)}>
                                Activar seleccionados
                            </Button>
                            <Button variant="light" leftSection={<IconX size={16}/>} disabled={selectedRows.length === 0}
                                    loading={switching.isPending && switching.variables?.[0]?.enabled === false}
                                    onClick={() => switchSelected(false)}>
                                Desactivar seleccionados
                            </Button>
                        </>
                    )}
                </Group>
            </Group>
            <CatalogueTable resource={resource} rows={shown} loading={catalogue.isPending} sort={sort} onSort={changeSort}
                            emptyText={emptyText(catalogue, rows)} selection={selection}
                            onEdit={canWrite ? (row) => setEditing({entry: row}) : null}
                            onDelete={canDelete ? setDeleting : null}/>
            {editing && (
                <CatalogueEditorModal resource={resource} catalogueTitle={title} entry={editing.entry}
                                      onClose={() => setEditing(null)}/>
            )}
            {bulkCreating && (
                <CatalogueBulkCreateModal resource={resource} catalogueTitle={title} onClose={() => setBulkCreating(false)}/>
            )}
            {deleting && (
                <ConfirmModal title={`Borrar ${deleting.code}`} confirmLabel="Borrar" loading={removing.isPending}
                              onConfirm={confirmDelete} onClose={() => setDeleting(null)}>
                    La entrada se borra del catálogo y no se puede deshacer. Si algún registro la usa, el servicio no
                    la borra: para retirarla, desactívala.
                </ConfirmModal>
            )}
        </Stack>
    )
}

function emptyText(catalogue, rows) {
    if (catalogue.isError) {
        return 'No se ha podido leer el catálogo.'
    }
    return rows.length === 0 ? 'El catálogo está vacío.' : 'Ninguna entrada coincide con el filtro.'
}
