import {Button, CloseButton, Group, Select, Stack, Text, TextInput, Title} from '@mantine/core'
import {useDebouncedValue} from '@mantine/hooks'
import {IconArrowRight, IconBan, IconCircleCheck, IconMapPin, IconPencil, IconPlus} from '@tabler/icons-react'
import {useState} from 'react'
import {useNavigate} from 'react-router'
import {VEHICLE_MOBILITY, VEHICLE_STATUS} from '../../api/resources/enums.js'
import {isActiveVehicle} from '../../api/resources/vehicles.js'
import {unitLabel} from '../../api/resources/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import TriStateFilter from '../../ui/TriStateFilter.jsx'
import {useConfigurationNames} from '../infrastructure/useConfigurationNames.js'
import LocationModal from './LocationModal.jsx'
import {vehiclePath} from './resourcesRoutes.js'
import {countText, operationalText, placeText, RETIRE_VEHICLE_TEXT, vehicleState} from './resourcesTexts.js'
import {RESOURCES_PAGE_SIZE, useVehicleAction, useVehicleList} from './useResources.js'
import VehicleEditorModal from './VehicleEditorModal.jsx'

const SEARCH_DELAY_MS = 300

/**
 * Los vehículos de la flota de mto-resources (el port de VehiclesView), paginados, buscados y filtrados
 * en el servidor, con dónde está cada uno. Una fila se abre (la ficha, con su historial de ubicaciones)
 * con doble clic o con su botón. Escribir pide resources-fleet-write; retirar, resources-delete (409
 * VEH-001 mientras sea el vehículo por defecto de un equipo); registrar dónde está,
 * resources-location-write.
 */
export default function VehiclesPage({title}) {
    const session = useSession()
    const canWrite = session.has(P.RESOURCES_FLEET_WRITE)
    const canDelete = session.has(P.RESOURCES_DELETE)
    const canLocate = session.has(P.RESOURCES_LOCATION_WRITE)
    const navigate = useNavigate()
    const names = useConfigurationNames({tracks: true})

    const [search, setSearch] = useState('')
    const [debouncedSearch] = useDebouncedValue(search, SEARCH_DELAY_MS)
    const [mobility, setMobility] = useState(null)
    const [status, setStatus] = useState(null)
    const [available, setAvailable] = useState(null)
    const [active, setActive] = useState(null)
    const [sort, setSort] = useState(null)
    const filters = {search: debouncedSearch.trim(), mobility, status, available, active}
    const listKey = JSON.stringify([filters, sort])
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1
    const list = useVehicleList({...filters, page, sort})
    const filtering = filters.search !== '' || mobility !== null || status !== null || available !== null || active !== null

    // null: cerrado; {vehicle: null}: alta; {vehicle}: modificación.
    const [editing, setEditing] = useState(null)
    const [locating, setLocating] = useState(null)
    const [retiring, setRetiring] = useState(null)
    const acting = useVehicleAction()
    const retire = () => {
        const vehicle = retiring
        acting.mutate({action: 'retire', vehicle}, {
            onSuccess: () => notifySuccess(`Retirado ${unitLabel(vehicle)}`),
            onSettled: () => setRetiring(null),
        })
    }
    const reactivate = (vehicle) => acting.mutate({action: 'reactivate', vehicle}, {onSuccess: () => notifySuccess(`Reactivado ${unitLabel(vehicle)}`)})
    const open = (vehicle) => navigate(vehiclePath(vehicle.id))

    const columns = [
        {key: 'code', label: 'Código', sortField: 'code', render: (vehicle) => vehicle.code},
        {key: 'name', label: 'Nombre', sortField: 'name', render: (vehicle) => vehicle.name ?? ''},
        {key: 'type', label: 'Modelo', render: (vehicle) => vehicle.type?.code ?? ''},
        {key: 'mobility', label: 'Movilidad', render: (vehicle) => VEHICLE_MOBILITY.label(vehicle.type?.mobility)},
        {key: 'plate', label: 'Matrícula', sortField: 'registrationPlate', render: (vehicle) => vehicle.registrationPlate ?? ''},
        {key: 'railNumber', label: 'N.º ferroviario', render: (vehicle) => vehicle.railVehicleNumber ?? ''},
        {key: 'status', label: 'Estado operativo', sortField: 'operationalStatus',
            render: (vehicle) => operationalText(vehicle.operationalStatus, vehicle.statusReason)},
        {key: 'where', label: 'Dónde está', render: (vehicle) => placeText(vehicle.position, names)},
        {key: 'active', label: 'Estado', sortField: 'active', render: vehicleState},
    ]
    const actions = (vehicle) => (
        <>
            <RowActionButton label={`Abrir ${vehicle.code}`} tooltip="Abrir" icon={IconArrowRight} onClick={() => open(vehicle)}/>
            {canLocate && isActiveVehicle(vehicle) && (
                <RowActionButton label={`Registrar dónde está ${vehicle.code}`} tooltip="Registrar ubicación" icon={IconMapPin}
                                 onClick={() => setLocating(vehicle)}/>
            )}
            {canWrite && (
                <RowActionButton label={`Modificar ${vehicle.code}`} tooltip="Modificar" icon={IconPencil} onClick={() => setEditing({vehicle})}/>
            )}
            {canDelete && isActiveVehicle(vehicle) && (
                <RowActionButton label={`Retirar ${vehicle.code}`} tooltip="Retirar" icon={IconBan} color="red" onClick={() => setRetiring(vehicle)}/>
            )}
            {canWrite && !isActiveVehicle(vehicle) && (
                <RowActionButton label={`Reactivar ${vehicle.code}`} tooltip="Reactivar" icon={IconCircleCheck} onClick={() => reactivate(vehicle)}/>
            )}
        </>
    )

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group align="flex-end" gap="sm">
                <TextInput label="Buscar" placeholder="Código, nombre, matrícula, número ferroviario" w={320} value={search}
                           onChange={(event) => setSearch(event.currentTarget.value)}
                           rightSection={search ? <CloseButton size="sm" aria-label="Borrar la búsqueda" onClick={() => setSearch('')}/> : null}/>
                <Select label="Movilidad" placeholder="Todas" w={180} clearable data={VEHICLE_MOBILITY.selectable()} value={mobility} onChange={setMobility}/>
                <Select label="Estado operativo" placeholder="Todos" w={200} clearable data={VEHICLE_STATUS.selectable()} value={status}
                        onChange={setStatus}/>
                <TriStateFilter label="Disponible" labels={['Todos', 'Disponibles', 'No disponibles']} value={available} onChange={setAvailable}/>
                <TriStateFilter label="Estado" labels={['Todos', 'Activos', 'Retirados']} value={active} onChange={setActive}/>
            </Group>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">{list.data ? countText(list.data.totalElements, 'vehículo', 'vehículos') : ''}</Text>
                {canWrite && <Button leftSection={<IconPlus size={16}/>} onClick={() => setEditing({vehicle: null})}>Nuevo vehículo</Button>}
            </Group>
            <ServerDataTable ariaLabel={title} columns={columns} rows={list.data?.content ?? []} loading={list.isPending}
                             emptyText={list.isError ? 'No se ha podido leer la lista.' : (filtering ? 'Ningún vehículo coincide con los filtros.'
                                 : 'No hay vehículos.')}
                             sort={sort} onSortChange={setSort} page={page} pageSize={RESOURCES_PAGE_SIZE}
                             totalElements={list.data?.totalElements ?? 0} onPageChange={(next) => setPaging({key: listKey, page: next})}
                             rowActions={actions} onRowDoubleClick={open} minWidth={1300}/>
            {editing && <VehicleEditorModal vehicle={editing.vehicle} onClose={() => setEditing(null)}/>}
            {locating && <LocationModal vehicle={locating} names={names} onClose={() => setLocating(null)}/>}
            {retiring && (
                <ConfirmModal title={`Retirar ${unitLabel(retiring)}`} confirmLabel="Retirar" cancelLabel="Volver" loading={acting.isPending}
                              onConfirm={retire} onClose={() => setRetiring(null)}>
                    {RETIRE_VEHICLE_TEXT}
                </ConfirmModal>
            )}
        </Stack>
    )
}
