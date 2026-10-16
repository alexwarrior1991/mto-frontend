import {Button, Group, Select, Stack, Text, Title} from '@mantine/core'
import {IconArrowRight, IconMapPin, IconRefresh} from '@tabler/icons-react'
import {useState} from 'react'
import {useNavigate} from 'react-router'
import {LOCATION_KIND, VEHICLE_ATTACHMENT, VEHICLE_MOBILITY} from '../../api/resources/enums.js'
import {getVehicle, whereOf} from '../../api/resources/vehicles.js'
import {unitLabel} from '../../api/resources/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import {notifyApiError} from '../../ui/errors/notifyError.js'
import {formatDateTime} from '../../ui/format.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import {ReferenceSelect} from '../maintenance/MaintenancePickers.jsx'
import {useConfigurationNames} from '../maintenance/useMaintenanceNames.js'
import LocationModal from './LocationModal.jsx'
import {vehiclePath} from './resourcesRoutes.js'
import {countText, operationalText} from './resourcesTexts.js'
import {RESOURCES_PAGE_SIZE, useFleetBoard} from './useResources.js'

/** El tipo de su propia ubicación; uno remolcado o transportado dice con quién va. */
function kindOf(row) {
    const own = row.position
    if (!own) {
        return ''
    }
    if (own.kind === 'ATTACHED' && own.carrier) {
        return `${own.attachment ? VEHICLE_ATTACHMENT.label(own.attachment) : LOCATION_KIND.label(own.kind)} por ${own.carrier.code}`
    }
    return LOCATION_KIND.label(own.kind)
}

/**
 * El tablero de la flota (el port de FleetBoardView): los vehículos activos con posición conocida,
 * paginados en el servicio por vía y kp con el vehículo para desempatar, así que con una vía elegida se
 * lee como la vía en orden de kp. La vía y el kp son los de dónde está de verdad: un remolcado está
 * donde su portador y la fila lo dice. Filtra por EP, vía y tipo; «Actualizar» lo vuelve a pedir, sin
 * sondeo. Registrar dónde está pide resources-location-write y lee antes el vehículo.
 */
export default function FleetBoardPage({title}) {
    const session = useSession()
    const canLocate = session.has(P.RESOURCES_LOCATION_WRITE)
    const navigate = useNavigate()
    const names = useConfigurationNames({tracks: true})
    const [packageId, setPackageId] = useState(null)
    const [trackId, setTrackId] = useState(null)
    const [kind, setKind] = useState(null)
    const filters = {executionPackageId: packageId === null ? null : Number(packageId), trackId: trackId === null ? null : Number(trackId), kind}
    const listKey = JSON.stringify(filters)
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1
    const board = useFleetBoard({...filters, page})
    const [locating, setLocating] = useState(null)

    // Las vías que se ofrecen son las del EP elegido; una que ya no es de él se quita.
    const trackOptions = packageId === null ? names.trackOptions : names.trackOptionsIn(Number(packageId))
    const changePackage = (next) => {
        setPackageId(next)
        if (trackId !== null && next !== null && !names.trackOptionsIn(Number(next)).some((option) => option.value === trackId)) {
            setTrackId(null)
        }
    }
    const locate = async (row) => {
        try {
            setLocating(await getVehicle(row.vehicle.id))
        } catch (error) {
            notifyApiError(error)
        }
    }

    const columns = [
        {key: 'track', label: 'Vía', render: (row) => (whereOf(row)?.trackId == null ? '' : names.trackName(whereOf(row).trackId))},
        {key: 'kp', label: 'KP', render: (row) => (whereOf(row)?.kp == null ? '' : String(whereOf(row).kp))},
        {key: 'vehicle', label: 'Vehículo', render: (row) => unitLabel(row.vehicle)},
        {key: 'mobility', label: 'Movilidad', render: (row) => VEHICLE_MOBILITY.label(row.vehicle?.mobility)},
        {key: 'kind', label: 'Dónde está', render: kindOf},
        {key: 'site', label: 'Sitio', render: (row) => whereOf(row)?.parkingSite?.code ?? ''},
        {key: 'status', label: 'Estado operativo', render: (row) => operationalText(row.operationalStatus, null)},
        {key: 'since', label: 'Desde', render: (row) => (row.position?.observedAt ? formatDateTime(row.position.observedAt) : '')},
    ]
    const actions = (row) => (row.vehicle
        ? (
            <>
                <RowActionButton label={`Abrir ${row.vehicle.code}`} tooltip="Abrir" icon={IconArrowRight} onClick={() => navigate(vehiclePath(row.vehicle.id))}/>
                {canLocate && (
                    <RowActionButton label={`Registrar dónde está ${row.vehicle.code}`} tooltip="Registrar ubicación" icon={IconMapPin}
                                     onClick={() => void locate(row)}/>
                )}
            </>
        )
        : null)

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group align="flex-end" gap="sm">
                {names.readsConfiguration && (
                    <>
                        <ReferenceSelect label="EP" placeholder="Todos" w={200} options={names.packageOptions} value={packageId} onChange={changePackage}/>
                        <ReferenceSelect label="Vía" placeholder="Todas" w={240} options={trackOptions} value={trackId} onChange={setTrackId}/>
                    </>
                )}
                <Select label="Dónde está" placeholder="Todos" w={200} clearable data={LOCATION_KIND.selectable()} value={kind} onChange={setKind}/>
            </Group>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">{board.data ? countText(board.data.totalElements, 'vehículo', 'vehículos') : ''}</Text>
                <Button variant="default" leftSection={<IconRefresh size={16}/>} loading={board.isFetching} onClick={() => void board.refetch()}>
                    Actualizar
                </Button>
            </Group>
            {/* El orden es el del tablero, por vía y kp: las columnas no lo cambian. */}
            <ServerDataTable ariaLabel={title} columns={columns} rows={board.data?.content ?? []} loading={board.isPending}
                             emptyText={board.isError ? 'No se ha podido leer el tablero.' : 'Ningún vehículo con posición conocida.'}
                             sort={null} onSortChange={() => {}} page={page} pageSize={RESOURCES_PAGE_SIZE}
                             totalElements={board.data?.totalElements ?? 0} onPageChange={(next) => setPaging({key: listKey, page: next})}
                             rowKey={(row) => row.vehicle?.id} rowActions={actions}
                             onRowDoubleClick={(row) => row.vehicle && navigate(vehiclePath(row.vehicle.id))} minWidth={1100}/>
            {locating && <LocationModal vehicle={locating} names={names} onClose={() => setLocating(null)}/>}
        </Stack>
    )
}
