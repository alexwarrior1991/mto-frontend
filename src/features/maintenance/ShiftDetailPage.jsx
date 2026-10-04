import {Badge, Button, Center, Group, Loader, Stack, Text, Title} from '@mantine/core'
import {IconArrowLeft, IconCircleX, IconFlag, IconHistory, IconListDetails, IconPencil, IconPlayerPlay, IconRefresh} from '@tabler/icons-react'
import {useState} from 'react'
import {Navigate, useNavigate, useParams} from 'react-router'
import {NotFoundError} from '../../api/errors.js'
import {canCloseShift, canStartShift, isOpenShift, POSSESSION, SHIFT_STATUS} from '../../api/maintenance/enums.js'
import {shiftRevisionsPath} from '../../api/maintenance/shifts.js'
import {assetLabel, teamLabel} from '../../api/maintenance/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import {errorMessage} from '../../ui/errors/messages.js'
import {notifyApiError} from '../../ui/errors/notifyError.js'
import {formatDate, formatDateTime} from '../../ui/format.js'
import LazyTabs from '../../ui/LazyTabs.jsx'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RevisionsModal from '../../ui/RevisionsModal.jsx'
import AssignTasksModal from './AssignTasksModal.jsx'
import {SHIFTS_PATH} from './maintenanceRoutes.js'
import {describeShift, kpRange} from './maintenanceTexts.js'
import ReasonModal from './ReasonModal.jsx'
import ShiftEditorModal from './ShiftEditorModal.jsx'
import ShiftProfilesPanel from './ShiftProfilesPanel.jsx'
import ShiftReportPanel from './ShiftReportPanel.jsx'
import ShiftTasksPanel from './ShiftTasksPanel.jsx'
import ShiftTransitionModal from './ShiftTransitionModal.jsx'
import {useConfigurationNames} from './useMaintenanceNames.js'
import {useShift, useShiftTransition} from './useMaintenance.js'

/** mantenimiento/turnos/:shiftId: la ficha de un turno (el port de ShiftDetailView). Cada turno empieza de cero (key por id). */
export default function ShiftDetailPage() {
    const {shiftId} = useParams()
    return <ShiftDetail key={shiftId} shiftId={shiftId}/>
}

/**
 * La cabecera (equipo, posesión, vías, ventana prevista y real, corte de tensión, minutos netos y
 * seccionadores abiertos), los botones que su estado admite y las pestañas de tareas, perfiles y el
 * parte, que piden sus datos la primera vez que se abren. Modificar, asignar tareas, iniciar, cerrar y
 * cancelar piden maintenance-write; solo se ofrece lo que el estado admite, pero decide el servicio.
 */
function ShiftDetail({shiftId}) {
    const session = useSession()
    const canWrite = session.has(P.MAINTENANCE_WRITE)
    const navigate = useNavigate()
    const names = useConfigurationNames({tracks: true})
    const shift = useShift(shiftId)
    const cancelling = useShiftTransition(shiftId)
    // El diálogo abierto: 'edit', 'assign', 'start', 'close', 'cancel' o 'history'.
    const [dialog, setDialog] = useState(null)
    const close = () => setDialog(null)

    if (shift.error instanceof NotFoundError) {
        return <Navigate to={SHIFTS_PATH} replace/>
    }
    if (shift.isError && !shift.data) {
        return (
            <Stack align="flex-start">
                <Text>No se ha podido leer el turno: {errorMessage(shift.error)}</Text>
                <Group>
                    <Button variant="default" leftSection={<IconArrowLeft size={16}/>} onClick={() => navigate(SHIFTS_PATH)}>Volver a la lista</Button>
                    <Button leftSection={<IconRefresh size={16}/>} loading={shift.isFetching} onClick={() => void shift.refetch()}>Reintentar</Button>
                </Group>
            </Stack>
        )
    }
    if (!shift.data) {
        return <Center py="xl"><Loader aria-label="Cargando el turno"/></Center>
    }

    const current = shift.data
    const status = current.status
    const open = isOpenShift(status)
    const cancel = (reason) => cancelling.mutate({transition: 'cancel', body: {reason}}, {
        onSuccess: (cancelled) => {
            notifySuccess(`${cancelled.code} cancelado`)
            close()
        },
        onError: (error) => notifyApiError(error),
    })
    const disconnectors = (current.blockingDisconnectors ?? []).map(assetLabel).join(', ')

    return (
        <Stack>
            <Group gap="sm" align="center">
                <Title order={2}>{`${current.code} · ${formatDate(current.shiftDate)}`}</Title>
                <Badge aria-label="Estado del turno" variant="light" color={statusColor(status)}>{SHIFT_STATUS.label(status)}</Badge>
                {current.possessionType && (
                    <Badge variant="light" color="gray">{`Posesión ${POSSESSION.label(current.possessionType).toLowerCase()}`}</Badge>
                )}
            </Group>
            <Stack gap={2} aria-label="Resumen del turno">
                <Text size="sm">
                    {[`Equipo: ${current.team ? teamLabel(current.team) : 'sin equipo'}`, `Base: ${orDash(current.baseName)}`,
                        `Vehículo: ${orDash(current.vehicle)}`].join(' · ')}
                </Text>
                <Text size="sm">
                    {[`Vías: ${(current.trackIds ?? []).map(names.trackName).join(', ')}`, `KP ${orDash(kpRange(current.startKp, current.endKp))}`,
                        `Paquete: ${orDash(names.packageName(current.executionPackageId))}`].join(' · ')}
                </Text>
                <Text size="sm">
                    {[`Previsto: ${orDash(formatDateTime(current.plannedStart))} - ${orDash(formatDateTime(current.plannedEnd))}`,
                        `Real: ${orDash(formatDateTime(current.actualStart))} - ${orDash(formatDateTime(current.actualEnd))}`,
                        `Corte de tensión: ${orDash(formatDateTime(current.voltageCutoffAt))}`,
                        `Neto: ${current.netWorkMinutes === null || current.netWorkMinutes === undefined ? '-' : `${current.netWorkMinutes} min`}`].join(' · ')}
                </Text>
                <Text size="sm">
                    {[`Seccionadores abiertos: ${orDash(disconnectors)}`, `Puesta a tierra: ${orDash(current.earthingPoints)}`,
                        `Estacionamiento: ${orDash(current.parkingPlace)}`].join(' · ')}
                </Text>
                {current.personnel?.trim() && <Text size="sm">{`Personal: ${current.personnel}`}</Text>}
                {current.observations?.trim() && <Text size="sm" style={{whiteSpace: 'pre-line'}}>{`Observaciones: ${current.observations}`}</Text>}
            </Stack>
            <Group gap="sm">
                <Button variant="default" leftSection={<IconArrowLeft size={16}/>} onClick={() => navigate(SHIFTS_PATH)}>Volver a la lista</Button>
                <Button variant="default" leftSection={<IconHistory size={16}/>} onClick={() => setDialog('history')}>Historial</Button>
                {canWrite && open && <Button leftSection={<IconPencil size={16}/>} onClick={() => setDialog('edit')}>Modificar</Button>}
                {canWrite && open && (
                    <Button variant="default" leftSection={<IconListDetails size={16}/>} onClick={() => setDialog('assign')}>Asignar tareas</Button>
                )}
                {canWrite && canStartShift(status) && (
                    <Button leftSection={<IconPlayerPlay size={16}/>} onClick={() => setDialog('start')}>Iniciar</Button>
                )}
                {canWrite && canCloseShift(status) && <Button leftSection={<IconFlag size={16}/>} onClick={() => setDialog('close')}>Cerrar</Button>}
                {canWrite && open && (
                    <Button color="red" variant="light" leftSection={<IconCircleX size={16}/>} onClick={() => setDialog('cancel')}>Cancelar</Button>
                )}
            </Group>
            <LazyTabs tabs={[
                {value: 'tasks', label: 'Tareas', render: () => <ShiftTasksPanel shift={current} canWrite={canWrite}/>},
                {value: 'profiles', label: 'Perfiles', render: () => <ShiftProfilesPanel shift={current}/>},
                {value: 'report', label: 'Parte', render: () => <ShiftReportPanel shift={current}/>},
            ]}/>
            {dialog === 'edit' && <ShiftEditorModal shift={current} onClose={close}/>}
            {dialog === 'assign' && <AssignTasksModal shift={current} onClose={close}/>}
            {(dialog === 'start' || dialog === 'close') && <ShiftTransitionModal kind={dialog} shift={current} onClose={close}/>}
            {dialog === 'cancel' && (
                <ReasonModal title={`Cancelar ${current.code}`} confirmLabel="Cancelar el turno" loading={cancelling.isPending} onConfirm={cancel}
                             onClose={close}>
                    El turno queda cancelado con su motivo, y sus tareas sin terminar vuelven a su orden. No se puede deshacer.
                </ReasonModal>
            )}
            {dialog === 'history' && (
                <RevisionsModal label={current.code} path={shiftRevisionsPath(current.id)} describe={describeShift} onClose={close}/>
            )}
        </Stack>
    )
}

function statusColor(status) {
    if (status === 'CLOSED') {
        return 'teal'
    }
    return status === 'CANCELLED' ? 'gray' : 'blue'
}

function orDash(value) {
    return value ? value : '-'
}
