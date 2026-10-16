import {Button, CloseButton, Group, Select, Stack, Text, TextInput, Title} from '@mantine/core'
import {useDebouncedValue} from '@mantine/hooks'
import {IconBan, IconCircleCheck, IconPencil, IconPlus} from '@tabler/icons-react'
import {useState} from 'react'
import {capabilityLabel, categoriesOf, VEHICLE_CAPABILITIES, VEHICLE_CATEGORY, VEHICLE_MOBILITY} from '../../api/resources/enums.js'
import {unitLabel} from '../../api/resources/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import TriStateFilter from '../../ui/TriStateFilter.jsx'
import {countText, join} from './resourcesTexts.js'
import {RESOURCES_PAGE_SIZE, useVehicleTypeAction, useVehicleTypeList} from './useResources.js'
import VehicleTypeEditorModal from './VehicleTypeEditorModal.jsx'

const SEARCH_DELAY_MS = 300
const CAPABILITY_OPTIONS = Object.entries(VEHICLE_CAPABILITIES).map(([value, label]) => ({value, label}))

/**
 * Los modelos de vehículo de mto-resources (el port de VehicleTypesView), paginados, buscados y
 * filtrados en el servidor. Darlos de alta y modificarlos pide resources-fleet-write; retirarlos (un
 * DELETE: ningún vehículo nuevo es de él, los que ya lo son se quedan), resources-delete; volver a
 * ofrecerlo es un PATCH active=true. No tienen historial: son un catálogo.
 */
export default function VehicleTypesPage({title}) {
    const session = useSession()
    const canWrite = session.has(P.RESOURCES_FLEET_WRITE)
    const canDelete = session.has(P.RESOURCES_DELETE)

    const [search, setSearch] = useState('')
    const [debouncedSearch] = useDebouncedValue(search, SEARCH_DELAY_MS)
    const [mobility, setMobility] = useState(null)
    const [category, setCategory] = useState(null)
    const [capability, setCapability] = useState(null)
    const [active, setActive] = useState(null)
    const [sort, setSort] = useState(null)
    const filters = {search: debouncedSearch.trim(), mobility, category, capability, active}
    const listKey = JSON.stringify([filters, sort])
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1
    const list = useVehicleTypeList({...filters, page, sort})
    const filtering = filters.search !== '' || mobility !== null || category !== null || capability !== null || active !== null

    // null: cerrado; {type: null}: alta; {type}: modificación.
    const [editing, setEditing] = useState(null)
    const [retiring, setRetiring] = useState(null)
    const acting = useVehicleTypeAction()

    // La categoría se ofrece de la movilidad elegida; una que ya no es de ella se quita.
    const changeMobility = (next) => {
        setMobility(next)
        if (category && !categoriesOf(next).some((option) => option.value === category)) {
            setCategory(null)
        }
    }
    const retire = () => {
        const type = retiring
        acting.mutate({action: 'retire', type}, {
            onSuccess: () => notifySuccess(`Retirado ${unitLabel(type)}`),
            onSettled: () => setRetiring(null),
        })
    }
    const offerAgain = (type) => acting.mutate({action: 'offer', type}, {onSuccess: () => notifySuccess(`Se vuelve a ofrecer ${unitLabel(type)}`)})

    const columns = [
        {key: 'code', label: 'Código', sortField: 'code', render: (type) => type.code},
        {key: 'name', label: 'Nombre', sortField: 'name', render: (type) => type.name},
        {key: 'make', label: 'Fabricante', render: (type) => join(type.manufacturer, type.model)},
        {key: 'mobility', label: 'Movilidad', sortField: 'mobility', render: (type) => VEHICLE_MOBILITY.label(type.mobility)},
        {key: 'category', label: 'Categoría', sortField: 'category', render: (type) => VEHICLE_CATEGORY.label(type.category)},
        {key: 'seats', label: 'Plazas', render: (type) => (type.seats ?? '') === '' ? '' : String(type.seats)},
        {key: 'capabilities', label: 'Capacidades', render: (type) => [...(type.capabilities ?? [])].sort().map(capabilityLabel).join(', ')},
        {key: 'active', label: 'Estado', sortField: 'active', render: (type) => (type.active === true ? 'Activo' : 'Retirado')},
    ]
    const actions = (type) => (
        <>
            {canWrite && (
                <RowActionButton label={`Modificar ${type.code}`} tooltip="Modificar" icon={IconPencil} onClick={() => setEditing({type})}/>
            )}
            {canDelete && type.active === true && (
                <RowActionButton label={`Retirar ${type.code}`} tooltip="Retirar" icon={IconBan} color="red" onClick={() => setRetiring(type)}/>
            )}
            {canWrite && type.active !== true && (
                <RowActionButton label={`Volver a ofrecer ${type.code}`} tooltip="Volver a ofrecer" icon={IconCircleCheck}
                                 onClick={() => offerAgain(type)}/>
            )}
        </>
    )

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group align="flex-end" gap="sm">
                <TextInput label="Buscar" placeholder="Código, nombre, fabricante, modelo" w={300} value={search}
                           onChange={(event) => setSearch(event.currentTarget.value)}
                           rightSection={search ? <CloseButton size="sm" aria-label="Borrar la búsqueda" onClick={() => setSearch('')}/> : null}/>
                <Select label="Movilidad" placeholder="Todas" w={180} clearable data={VEHICLE_MOBILITY.selectable()} value={mobility}
                        onChange={changeMobility}/>
                <Select label="Categoría" placeholder="Todas" w={240} clearable searchable data={categoriesOf(mobility)} value={category}
                        onChange={setCategory}/>
                <Select label="Capacidad" placeholder="Todas" w={220} clearable searchable data={CAPABILITY_OPTIONS} value={capability}
                        onChange={setCapability}/>
                <TriStateFilter label="Estado" labels={['Todos', 'Activos', 'Retirados']} value={active} onChange={setActive}/>
            </Group>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">{list.data ? countText(list.data.totalElements, 'modelo', 'modelos') : ''}</Text>
                {canWrite && <Button leftSection={<IconPlus size={16}/>} onClick={() => setEditing({type: null})}>Nuevo modelo</Button>}
            </Group>
            <ServerDataTable ariaLabel={title} columns={columns} rows={list.data?.content ?? []} loading={list.isPending}
                             emptyText={list.isError ? 'No se ha podido leer la lista.' : (filtering ? 'Ningún modelo coincide con los filtros.'
                                 : 'No hay modelos.')}
                             sort={sort} onSortChange={setSort} page={page} pageSize={RESOURCES_PAGE_SIZE}
                             totalElements={list.data?.totalElements ?? 0} onPageChange={(next) => setPaging({key: listKey, page: next})}
                             rowActions={actions} onRowDoubleClick={canWrite ? (type) => setEditing({type}) : null} minWidth={1100}/>
            {editing && <VehicleTypeEditorModal type={editing.type} onClose={() => setEditing(null)}/>}
            {retiring && (
                <ConfirmModal title={`Retirar ${unitLabel(retiring)}`} confirmLabel="Retirar" cancelLabel="Volver" loading={acting.isPending}
                              onConfirm={retire} onClose={() => setRetiring(null)}>
                    No se borra: ningún vehículo nuevo será de este modelo; los que ya lo son se quedan. Se puede volver a ofrecer.
                </ConfirmModal>
            )}
        </Stack>
    )
}
