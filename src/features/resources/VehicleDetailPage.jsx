import {Badge, Button, Center, Group, Loader, Stack, Text, Title} from '@mantine/core'
import {IconArrowLeft, IconBan, IconCircleCheck, IconHistory, IconMapPin, IconPencil, IconRefresh} from '@tabler/icons-react'
import {useState} from 'react'
import {Navigate, useNavigate, useParams} from 'react-router'
import {NotFoundError} from '../../api/errors.js'
import {VEHICLE_MOBILITY} from '../../api/resources/enums.js'
import {accessPointText, isActiveVehicle, vehicleRevisionsPath} from '../../api/resources/vehicles.js'
import {unitLabel} from '../../api/resources/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import {errorMessage} from '../../ui/errors/messages.js'
import LazyTabs from '../../ui/LazyTabs.jsx'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RevisionsModal from '../../ui/RevisionsModal.jsx'
import {useConfigurationNames} from '../maintenance/useMaintenanceNames.js'
import LocationModal from './LocationModal.jsx'
import {FLEET_PATH} from './resourcesRoutes.js'
import {
    describeVehicle,
    join,
    operationalText,
    originText,
    ownerText,
    placeText,
    RETIRE_VEHICLE_TEXT,
    vehicleState,
} from './resourcesTexts.js'
import {useVehicle, useVehicleAction} from './useResources.js'
import VehicleDocumentsPanel from './VehicleDocumentsPanel.jsx'
import VehicleEditorModal from './VehicleEditorModal.jsx'
import VehicleLocationsPanel from './VehicleLocationsPanel.jsx'
import VehicleRepairsPanel from './VehicleRepairsPanel.jsx'

/** recursos/flota/:vehicleId: la ficha de un vehículo (el port de VehicleDetailView), con key por id. */
export default function VehicleDetailPage() {
    const {vehicleId} = useParams()
    return <VehicleDetail key={vehicleId} vehicleId={vehicleId}/>
}

/**
 * Su modelo, sus datos (también su dispositivo GPS), «Dónde está» (el tipo, el sitio, la vía y el kp, el
 * acceso, el origen y la hora; uno que va con otro dice con quién y dónde está su portador) y las pestañas
 * «Ubicaciones», «Documentos» (con su caducidad: es la ficha a la que lleva el aviso de uno que caduca) y
 * «Taller» (sus reparaciones, que mandan en su estado). Registrar
 * dónde está pide resources-location-write; modificar y escribir sus documentos, resources-fleet-write;
 * retirar y quitar un documento, resources-delete.
 */
function VehicleDetail({vehicleId}) {
    const session = useSession()
    const canWrite = session.has(P.RESOURCES_FLEET_WRITE)
    const canDelete = session.has(P.RESOURCES_DELETE)
    const canLocate = session.has(P.RESOURCES_LOCATION_WRITE)
    const readsMaintenance = session.has(P.MAINTENANCE_READ)
    const navigate = useNavigate()
    const names = useConfigurationNames({tracks: true})
    const vehicle = useVehicle(vehicleId)
    const position = vehicle.data?.position
    const carrierId = position?.kind === 'ATTACHED' ? position.carrier?.id ?? null : null
    const carrier = useVehicle(carrierId, {enabled: Boolean(carrierId), notFound: false})
    // El diálogo abierto: 'edit', 'locate', 'retire' o 'history'.
    const [dialog, setDialog] = useState(null)
    const close = () => setDialog(null)
    const acting = useVehicleAction()

    if (vehicle.error instanceof NotFoundError) {
        return <Navigate to={FLEET_PATH} replace/>
    }
    if (vehicle.isError && !vehicle.data) {
        return (
            <Stack align="flex-start">
                <Text>No se ha podido leer el vehículo: {errorMessage(vehicle.error)}</Text>
                <Group>
                    <Button variant="default" leftSection={<IconArrowLeft size={16}/>} onClick={() => navigate(FLEET_PATH)}>Volver a la flota</Button>
                    <Button leftSection={<IconRefresh size={16}/>} loading={vehicle.isFetching} onClick={() => void vehicle.refetch()}>Reintentar</Button>
                </Group>
            </Stack>
        )
    }
    if (!vehicle.data) {
        return <Center py="xl"><Loader aria-label="Cargando el vehículo"/></Center>
    }

    const current = vehicle.data
    const active = isActiveVehicle(current)
    const details = position ? join(position.executionPackageId == null ? null : `EP ${names.packageName(position.executionPackageId)}`,
        accessPointText(position) ? `Acceso: ${accessPointText(position)}` : null,
        position.latitude == null ? null : `${position.latitude}, ${position.longitude}`) : ''
    const retire = () => acting.mutate({action: 'retire', vehicle: current}, {
        onSuccess: () => notifySuccess(`Retirado ${unitLabel(current)}`),
        onSettled: close,
    })
    const reactivate = () => acting.mutate({action: 'reactivate', vehicle: current}, {onSuccess: () => notifySuccess(`Reactivado ${unitLabel(current)}`)})

    return (
        <Stack>
            <Group gap="sm" align="center">
                <Title order={2}>{unitLabel(current)}</Title>
                <Badge aria-label="Estado operativo" variant="light" color={current.available ? 'green' : 'red'}>
                    {operationalText(current.operationalStatus, null)}
                </Badge>
                <Badge aria-label="Estado del vehículo" variant="light" color={active ? 'green' : 'gray'}>{vehicleState(current)}</Badge>
            </Group>
            <Stack gap={2} aria-label="Resumen del vehículo">
                <Text size="sm">
                    {join(current.type ? `Modelo: ${unitLabel(current.type)}` : null, current.type ? VEHICLE_MOBILITY.label(current.type.mobility) : null,
                        current.registrationPlate ? `Matrícula ${current.registrationPlate}` : null,
                        current.railVehicleNumber ? `N.º ferroviario ${current.railVehicleNumber}` : null, ownerText(current))}
                </Text>
                <Text size="sm">
                    {join(current.statusReason ? `Motivo: ${current.statusReason}` : null, current.serialNumber ? `N.º serie ${current.serialNumber}` : null,
                        current.manufactureYear ? `Año ${current.manufactureYear}` : null, current.odometerKm == null ? null : `${current.odometerKm} km`,
                        current.engineHours == null ? null : `${current.engineHours} h de motor`,
                        current.telematicsDeviceId ? `GPS ${current.telematicsDeviceId}` : null)}
                </Text>
            </Stack>
            <Title order={4}>Dónde está</Title>
            <Stack gap={2} aria-label="Dónde está">
                <Text size="sm">{placeText(position, names)}</Text>
                {details && <Text size="sm">{details}</Text>}
                {position && <Text size="sm" c="dimmed">{originText(position)}</Text>}
                {carrierId && carrier.data && (
                    <Text size="sm">{`${carrier.data.code} está: ${placeText(carrier.data.position, names)}`}</Text>
                )}
                {carrierId && carrier.isError && (
                    <Text size="sm">{`No se ha podido leer dónde está ${position.carrier.code}: ${errorMessage(carrier.error)}`}</Text>
                )}
            </Stack>
            <Group gap="sm">
                <Button variant="default" leftSection={<IconArrowLeft size={16}/>} onClick={() => navigate(FLEET_PATH)}>Volver a la flota</Button>
                <Button variant="default" leftSection={<IconHistory size={16}/>} onClick={() => setDialog('history')}>Historial</Button>
                {canLocate && active && <Button leftSection={<IconMapPin size={16}/>} onClick={() => setDialog('locate')}>Registrar ubicación</Button>}
                {canWrite && <Button variant="default" leftSection={<IconPencil size={16}/>} onClick={() => setDialog('edit')}>Modificar</Button>}
                {canDelete && active && (
                    <Button color="red" variant="light" leftSection={<IconBan size={16}/>} onClick={() => setDialog('retire')}>Retirar</Button>
                )}
                {canWrite && !active && (
                    <Button leftSection={<IconCircleCheck size={16}/>} loading={acting.isPending} onClick={reactivate}>Reactivar</Button>
                )}
            </Group>
            <LazyTabs tabs={[
                {value: 'locations', label: 'Ubicaciones',
                    render: () => <VehicleLocationsPanel vehicle={current} names={names} readsMaintenance={readsMaintenance}/>},
                {value: 'documents', label: 'Documentos',
                    render: () => <VehicleDocumentsPanel vehicle={current} canWrite={canWrite} canDelete={canDelete}/>},
                {value: 'repairs', label: 'Taller', render: () => <VehicleRepairsPanel vehicle={current} canWrite={canWrite}/>},
            ]}/>
            {dialog === 'edit' && <VehicleEditorModal vehicle={current} onClose={close}/>}
            {dialog === 'locate' && <LocationModal vehicle={current} names={names} onClose={close}/>}
            {dialog === 'history' && (
                <RevisionsModal label={current.code} path={vehicleRevisionsPath(current.id)} describe={describeVehicle} onClose={close}/>
            )}
            {dialog === 'retire' && (
                <ConfirmModal title={`Retirar ${unitLabel(current)}`} confirmLabel="Retirar" cancelLabel="Volver" loading={acting.isPending}
                              onConfirm={retire} onClose={close}>
                    {RETIRE_VEHICLE_TEXT}
                </ConfirmModal>
            )}
        </Stack>
    )
}
