import {Button, CloseButton, Group, Select, Stack, Text, TextInput, Title} from '@mantine/core'
import {useDebouncedValue} from '@mantine/hooks'
import {IconBan, IconCircleCheck, IconPencil, IconPlus} from '@tabler/icons-react'
import {useState} from 'react'
import {PARKING_SITE_KIND} from '../../api/resources/enums.js'
import {unitLabel} from '../../api/resources/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import TriStateFilter from '../../ui/TriStateFilter.jsx'
import {ReferenceSelect} from '../infrastructure/ReferencePickers.jsx'
import {useConfigurationNames} from '../infrastructure/useConfigurationNames.js'
import ParkingSiteEditorModal from './ParkingSiteEditorModal.jsx'
import {accessText, countText, join} from './resourcesTexts.js'
import {RESOURCES_PAGE_SIZE, useParkingSiteAction, useParkingSiteList} from './useResources.js'

const SEARCH_DELAY_MS = 300

/**
 * El catálogo de sitios de aparcamiento de mto-resources (el port de ParkingSitesView), paginado y
 * filtrado en el servidor. Es opcional: un vehículo se puede dejar en una vía y un kp, o con una
 * descripción, sin sitio. Escribir pide resources-write; retirar, resources-delete. EP y vía se nombran
 * con mto-configuration (#id sin config-read).
 */
export default function ParkingSitesPage({title}) {
    const session = useSession()
    const canWrite = session.has(P.RESOURCES_WRITE)
    const canDelete = session.has(P.RESOURCES_DELETE)
    const names = useConfigurationNames({tracks: true, stations: true})

    const [search, setSearch] = useState('')
    const [debouncedSearch] = useDebouncedValue(search, SEARCH_DELAY_MS)
    const [kind, setKind] = useState(null)
    const [packageId, setPackageId] = useState(null)
    const [active, setActive] = useState(null)
    const [sort, setSort] = useState(null)
    const filters = {search: debouncedSearch.trim(), kind, executionPackageId: packageId === null ? null : Number(packageId), active}
    const listKey = JSON.stringify([filters, sort])
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1
    const list = useParkingSiteList({...filters, page, sort})
    const filtering = filters.search !== '' || kind !== null || packageId !== null || active !== null

    const [editing, setEditing] = useState(null)
    const [retiring, setRetiring] = useState(null)
    const acting = useParkingSiteAction()
    const retire = () => {
        const site = retiring
        acting.mutate({action: 'retire', site}, {
            onSuccess: () => notifySuccess(`Retirado ${unitLabel(site)}`),
            onSettled: () => setRetiring(null),
        })
    }
    const offerAgain = (site) => acting.mutate({action: 'offer', site}, {onSuccess: () => notifySuccess(`Se vuelve a ofrecer ${unitLabel(site)}`)})

    const columns = [
        {key: 'code', label: 'Código', sortField: 'code', render: (site) => site.code},
        {key: 'name', label: 'Nombre', sortField: 'name', render: (site) => site.name},
        {key: 'kind', label: 'Tipo', sortField: 'kind', render: (site) => PARKING_SITE_KIND.label(site.kind)},
        {key: 'package', label: 'EP', render: (site) => (site.executionPackageId == null ? '' : names.packageName(site.executionPackageId))},
        {key: 'where', label: 'Vía y kp', render: (site) => join(site.trackId == null ? null : names.trackName(site.trackId),
            site.kp == null ? null : `kp ${site.kp}`)},
        {key: 'access', label: 'Accesos', render: accessText},
        {key: 'active', label: 'Estado', sortField: 'active', render: (site) => (site.active === true ? 'Activo' : 'Retirado')},
    ]
    const actions = (site) => (
        <>
            {canWrite && (
                <RowActionButton label={`Modificar ${site.code}`} tooltip="Modificar" icon={IconPencil} onClick={() => setEditing({site})}/>
            )}
            {canDelete && site.active === true && (
                <RowActionButton label={`Retirar ${site.code}`} tooltip="Retirar" icon={IconBan} color="red" onClick={() => setRetiring(site)}/>
            )}
            {canWrite && site.active !== true && (
                <RowActionButton label={`Volver a ofrecer ${site.code}`} tooltip="Volver a ofrecer" icon={IconCircleCheck}
                                 onClick={() => offerAgain(site)}/>
            )}
        </>
    )

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group align="flex-end" gap="sm">
                <TextInput label="Buscar" placeholder="Código, nombre, dirección" w={280} value={search}
                           onChange={(event) => setSearch(event.currentTarget.value)}
                           rightSection={search ? <CloseButton size="sm" aria-label="Borrar la búsqueda" onClick={() => setSearch('')}/> : null}/>
                <Select label="Tipo" placeholder="Todos" w={220} clearable data={PARKING_SITE_KIND.selectable()} value={kind} onChange={setKind}/>
                {names.readsConfiguration && (
                    <ReferenceSelect label="EP" placeholder="Todos" w={200} options={names.packageOptions} value={packageId} onChange={setPackageId}/>
                )}
                <TriStateFilter label="Estado" labels={['Todos', 'Activos', 'Retirados']} value={active} onChange={setActive}/>
            </Group>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">{list.data ? countText(list.data.totalElements, 'sitio', 'sitios') : ''}</Text>
                {canWrite && <Button leftSection={<IconPlus size={16}/>} onClick={() => setEditing({site: null})}>Nuevo sitio</Button>}
            </Group>
            <ServerDataTable ariaLabel={title} columns={columns} rows={list.data?.content ?? []} loading={list.isPending}
                             emptyText={list.isError ? 'No se ha podido leer la lista.' : (filtering ? 'Ningún sitio coincide con los filtros.'
                                 : 'No hay sitios.')}
                             sort={sort} onSortChange={setSort} page={page} pageSize={RESOURCES_PAGE_SIZE}
                             totalElements={list.data?.totalElements ?? 0} onPageChange={(next) => setPaging({key: listKey, page: next})}
                             rowActions={actions} onRowDoubleClick={canWrite ? (site) => setEditing({site}) : null} minWidth={1000}/>
            {editing && <ParkingSiteEditorModal site={editing.site} names={names} onClose={() => setEditing(null)}/>}
            {retiring && (
                <ConfirmModal title={`Retirar ${unitLabel(retiring)}`} confirmLabel="Retirar" cancelLabel="Volver" loading={acting.isPending}
                              onConfirm={retire} onClose={() => setRetiring(null)}>
                    Sale del catálogo; las ubicaciones registradas allí lo siguen nombrando. Se puede volver a ofrecer.
                </ConfirmModal>
            )}
        </Stack>
    )
}
