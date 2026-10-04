import {Badge, Button, Center, Group, Loader, Stack, Text, Title} from '@mantine/core'
import {
    IconArrowLeft,
    IconCheck,
    IconClipboardCheck,
    IconHistory,
    IconLink,
    IconLock,
    IconPencil,
    IconRefresh,
    IconTool,
    IconTrash,
} from '@tabler/icons-react'
import {useState} from 'react'
import {Navigate, useNavigate, useParams} from 'react-router'
import {NotFoundError} from '../../api/errors.js'
import {defectRevisionsPath} from '../../api/maintenance/defects.js'
import {DEFECT_SEVERITY, DEFECT_STATUS, isEditableDefect, isPendingDefect} from '../../api/maintenance/enums.js'
import {assetLabel} from '../../api/maintenance/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import {errorMessage} from '../../ui/errors/messages.js'
import {notifyApiError} from '../../ui/errors/notifyError.js'
import {formatDate, formatDateTime} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RevisionsModal from '../../ui/RevisionsModal.jsx'
import DefectEditorModal from './DefectEditorModal.jsx'
import {LinkOrderModal, ResolveDefectModal} from './DefectTransitionModals.jsx'
import {DEFECTS_PATH, inspectionPath, orderPath} from './maintenanceRoutes.js'
import {describeDefect, kpRange} from './maintenanceTexts.js'
import ReasonModal from './ReasonModal.jsx'
import StatusHistoryTable from './StatusHistoryTable.jsx'
import {useConfigurationNames} from './useMaintenanceNames.js'
import {useDefect, useDefectHistory, useDefectTransition} from './useMaintenance.js'

/** mantenimiento/defectos/:defectId: la ficha de un defecto (el port de DefectDetailView), con key por id. */
export default function DefectDetailPage() {
    const {defectId} = useParams()
    return <DefectDetail key={defectId} defectId={defectId}/>
}

/**
 * La cabecera, de dónde salió (la inspección o la tarea), la orden que lo corrige, los botones que su
 * estado admite y su historial de estados. Modificar y vincular a una orden piden maintenance-write;
 * resolver, cerrar y descartar, además maintenance-supervise. Solo se ofrece lo que el estado admite,
 * pero decide el servicio.
 */
function DefectDetail({defectId}) {
    const session = useSession()
    const canWrite = session.has(P.MAINTENANCE_WRITE)
    const canSupervise = session.hasAll(P.MAINTENANCE_WRITE, P.MAINTENANCE_SUPERVISE)
    const navigate = useNavigate()
    const names = useConfigurationNames({tracks: true})
    const defect = useDefect(defectId)
    const history = useDefectHistory(defectId)
    const transition = useDefectTransition(defectId)
    // El diálogo abierto: 'edit', 'link', 'resolve', 'close', 'discard' o 'history'.
    const [dialog, setDialog] = useState(null)
    const close = () => setDialog(null)

    if (defect.error instanceof NotFoundError) {
        return <Navigate to={DEFECTS_PATH} replace/>
    }
    if (defect.isError && !defect.data) {
        return (
            <Stack align="flex-start">
                <Text>No se ha podido leer el defecto: {errorMessage(defect.error)}</Text>
                <Group>
                    <Button variant="default" leftSection={<IconArrowLeft size={16}/>} onClick={() => navigate(DEFECTS_PATH)}>Volver a la lista</Button>
                    <Button leftSection={<IconRefresh size={16}/>} loading={defect.isFetching} onClick={() => void defect.refetch()}>Reintentar</Button>
                </Group>
            </Stack>
        )
    }
    if (!defect.data) {
        return <Center py="xl"><Loader aria-label="Cargando el defecto"/></Center>
    }

    const current = defect.data
    const status = current.status
    const withReason = (kind, done) => (reason) => transition.mutate({transition: kind, body: {reason}}, {
        onSuccess: (updated) => {
            notifySuccess(`${updated.code} ${done}`)
            close()
        },
        onError: (error) => notifyApiError(error),
    })

    return (
        <Stack>
            <Group gap="sm" align="center">
                <Title order={2}>{current.code}</Title>
                {current.severity && (
                    <Badge variant="light" color={current.severity === 'CRITICAL' || current.severity === 'HIGH' ? 'red' : 'yellow'}>
                        {`Gravedad ${DEFECT_SEVERITY.label(current.severity).toLowerCase()}`}
                    </Badge>
                )}
                <Badge aria-label="Estado del defecto" variant="light" color={statusColor(status)}>{DEFECT_STATUS.label(status)}</Badge>
            </Group>
            <Stack gap={2} aria-label="Resumen del defecto">
                <Text size="sm">
                    {[`Activo: ${assetLabel(current.asset)}`, `Vía: ${names.trackName(current.trackId)}`,
                        `KP ${kpRange(current.startKp, current.endKp) || '-'}`, `Detectado: ${formatDateTime(current.detectedAt)}`,
                        `Reparación prevista: ${current.repairPlannedDate ? formatDate(current.repairPlannedDate) : '-'}`].join(' · ')}
                </Text>
                {[['Descripción', current.description], ['Notas técnicas', current.technicalNotes], ['Corrección', current.correctionType],
                    ['Piezas cambiadas', current.partsReplaced], ['Resolución', current.resolutionNotes],
                    ['Motivo del descarte', current.discardReason]].filter(([, text]) => text?.trim()).map(([label, text]) => (
                    <Text key={label} size="sm">{`${label}: ${text}`}</Text>
                ))}
                {current.resolvedAt && <Text size="sm">{`Resuelto: ${formatDateTime(current.resolvedAt)}`}</Text>}
            </Stack>
            <Group gap="sm">
                <Button variant="default" leftSection={<IconArrowLeft size={16}/>} onClick={() => navigate(DEFECTS_PATH)}>Volver a la lista</Button>
                <Button variant="default" leftSection={<IconHistory size={16}/>} onClick={() => setDialog('history')}>Historial</Button>
                {current.inspectionId && (
                    <Button variant="default" leftSection={<IconClipboardCheck size={16}/>} onClick={() => navigate(inspectionPath(current.inspectionId))}>
                        Ver la inspección
                    </Button>
                )}
                {current.orderId && (
                    <Button variant="default" leftSection={<IconTool size={16}/>} onClick={() => navigate(orderPath(current.orderId))}>Ver la orden</Button>
                )}
                {canWrite && isEditableDefect(status) && (
                    <Button leftSection={<IconPencil size={16}/>} onClick={() => setDialog('edit')}>Modificar</Button>
                )}
                {canWrite && isPendingDefect(status) && (
                    <Button variant="default" leftSection={<IconLink size={16}/>} onClick={() => setDialog('link')}>Vincular a una orden</Button>
                )}
                {canSupervise && isPendingDefect(status) && (
                    <Button leftSection={<IconCheck size={16}/>} onClick={() => setDialog('resolve')}>Resolver</Button>
                )}
                {canSupervise && status === 'RESOLVED' && (
                    <Button leftSection={<IconLock size={16}/>} onClick={() => setDialog('close')}>Cerrar</Button>
                )}
                {canSupervise && status === 'OPEN' && (
                    <Button color="red" variant="light" leftSection={<IconTrash size={16}/>} onClick={() => setDialog('discard')}>Descartar</Button>
                )}
            </Group>
            <Title order={3}>Estados</Title>
            <StatusHistoryTable ariaLabel={`Estados de ${current.code}`} query={history} statusLabel={DEFECT_STATUS.label}/>
            {dialog === 'edit' && <DefectEditorModal defect={current} onClose={close}/>}
            {dialog === 'link' && <LinkOrderModal defect={current} onClose={close}/>}
            {dialog === 'resolve' && <ResolveDefectModal defect={current} onClose={close}/>}
            {dialog === 'close' && (
                <ReasonModal title={`Cerrar ${current.code}`} confirmLabel="Cerrar el defecto" loading={transition.isPending}
                             onConfirm={withReason('close', 'cerrado')} onClose={close}>
                    El defecto queda cerrado; el motivo va a su historial de estados.
                </ReasonModal>
            )}
            {dialog === 'discard' && (
                <ReasonModal title={`Descartar ${current.code}`} confirmLabel="Descartar el defecto" loading={transition.isPending}
                             onConfirm={withReason('discard', 'descartado')} onClose={close}>
                    El defecto queda descartado con su motivo. No se puede deshacer.
                </ReasonModal>
            )}
            {dialog === 'history' && (
                <RevisionsModal label={current.code} path={defectRevisionsPath(current.id)} describe={describeDefect} onClose={close}/>
            )}
        </Stack>
    )
}

function statusColor(status) {
    if (status === 'RESOLVED' || status === 'CLOSED') {
        return 'teal'
    }
    return status === 'DISCARDED' ? 'gray' : 'blue'
}
