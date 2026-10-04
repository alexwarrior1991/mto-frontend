import {Badge, Button, Center, Group, Loader, Stack, Text, Title} from '@mantine/core'
import {
    IconAlertTriangle,
    IconArrowLeft,
    IconCalendar,
    IconCheck,
    IconCircleX,
    IconClipboardCheck,
    IconHistory,
    IconPencil,
    IconPlayerPlay,
    IconRefresh,
    IconUserCheck,
} from '@tabler/icons-react'
import {useState} from 'react'
import {Navigate, useNavigate, useParams} from 'react-router'
import {NotFoundError} from '../../api/errors.js'
import {
    canAssignOrder,
    canCompleteOrder,
    canPlanOrder,
    canStartOrder,
    isOpenOrder,
    ORDER_STATUS,
    ORDER_TYPE,
    PRIORITY,
} from '../../api/maintenance/enums.js'
import {orderRevisionsPath, transitionRequest} from '../../api/maintenance/orders.js'
import {assetLabel, teamLabel} from '../../api/maintenance/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import {errorMessage} from '../../ui/errors/messages.js'
import {notifyApiError} from '../../ui/errors/notifyError.js'
import {formatDate, formatDateTime, formatQuantity} from '../../ui/format.js'
import LazyTabs from '../../ui/LazyTabs.jsx'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RevisionsModal from '../../ui/RevisionsModal.jsx'
import {defectPath, inspectionPath, ORDERS_PATH} from './maintenanceRoutes.js'
import {describeOrder, kpRange} from './maintenanceTexts.js'
import OrderEditorModal from './OrderEditorModal.jsx'
import OrderTasksPanel from './OrderTasksPanel.jsx'
import OrderTransitionModal from './OrderTransitionModal.jsx'
import ReasonModal from './ReasonModal.jsx'
import StatusHistoryTable from './StatusHistoryTable.jsx'
import {useConfigurationNames, useStockNames} from './useMaintenanceNames.js'
import {useOrder, useOrderHistory, useOrderTransition} from './useMaintenance.js'

/**
 * mantenimiento/ordenes/:orderId: la ficha de una orden (el port de OrderDetailView). Cada orden
 * empieza de cero (key por id). mto-notification enlaza aquí, y el correo hace absoluta esta ruta.
 */
export default function OrderDetailPage() {
    const {orderId} = useParams()
    return <OrderDetail key={orderId} orderId={orderId}/>
}

/**
 * La cabecera (activo, vía, kp, equipo, avance y estimación, que calcula el servicio, y la inspección o
 * el defecto de los que salió), los botones que su estado admite y las pestañas, que piden sus datos
 * la primera vez que se abren.
 *
 * Solo se ofrece lo que el estado admite, copiado de la máquina de estados del servicio, pero quien
 * decide es el servicio: un 409 TRN-001 se avisa con el diálogo abierto. Cancelar y completar con
 * force piden maintenance-supervise además de maintenance-write. Tras una transición la ficha pinta
 * la orden que devuelve el servicio y relee las pestañas abiertas.
 */
function OrderDetail({orderId}) {
    const session = useSession()
    const canWrite = session.has(P.MAINTENANCE_WRITE)
    const canSupervise = session.hasAll(P.MAINTENANCE_WRITE, P.MAINTENANCE_SUPERVISE)
    const navigate = useNavigate()
    const names = useConfigurationNames({tracks: true})
    const order = useOrder(orderId)
    const projects = useStockNames('projects', [order.data?.stockProjectId])
    const cancelling = useOrderTransition(orderId)
    // El diálogo abierto: 'edit', 'history', 'cancel' o una transición ('plan', 'assign', 'start', 'complete').
    const [dialog, setDialog] = useState(null)
    const close = () => setDialog(null)

    if (order.error instanceof NotFoundError) {
        return <Navigate to={ORDERS_PATH} replace/>
    }
    if (order.isError && !order.data) {
        return (
            <Stack align="flex-start">
                <Text>No se ha podido leer la orden: {errorMessage(order.error)}</Text>
                <Group>
                    <Button variant="default" leftSection={<IconArrowLeft size={16}/>} onClick={() => navigate(ORDERS_PATH)}>Volver a la lista</Button>
                    <Button leftSection={<IconRefresh size={16}/>} loading={order.isFetching} onClick={() => void order.refetch()}>Reintentar</Button>
                </Group>
            </Stack>
        )
    }
    if (!order.data) {
        return <Center py="xl"><Loader aria-label="Cargando la orden"/></Center>
    }

    const current = order.data
    const status = current.status
    const open = isOpenOrder(status)
    const cancel = (reason) => cancelling.mutate({transition: 'cancel', body: transitionRequest('cancel', {reason})}, {
        onSuccess: (cancelled) => {
            notifySuccess(`${cancelled.code} cancelada`)
            close()
        },
        onError: (error) => notifyApiError(error),
    })
    const project = current.stockProjectId ? projects.label(current.stockProjectId) : 'el del paquete, al planificar'

    return (
        <Stack>
            <Group gap="sm" align="center">
                <Title order={2}>{`${current.code} · ${current.title}`}</Title>
                <Badge aria-label="Estado de la orden" variant="light" color={statusColor(status)}>{ORDER_STATUS.label(status)}</Badge>
                <Badge variant="light" color="gray">{ORDER_TYPE.label(current.type)}</Badge>
                {current.priority && <Badge variant="light" color="gray">{`Prioridad ${PRIORITY.label(current.priority).toLowerCase()}`}</Badge>}
            </Group>
            <Stack gap={2} aria-label="Resumen de la orden">
                <Text size="sm">
                    {[`Activo: ${assetLabel(current.asset)}`, `Vía: ${names.trackName(current.trackId)}`, `KP ${kpRange(current.startKp, current.endKp)}`,
                        `Paquete: ${names.packageName(current.executionPackageId)}`].join(' · ')}
                </Text>
                <Text size="sm">
                    {[`Equipo: ${current.team ? teamLabel(current.team) : 'sin equipo'}`, `Asignada a: ${current.assignedUser ?? 'nadie'}`,
                        `Prevista: ${orDash(formatDate(current.plannedDate))}`, `Inicio: ${orDash(formatDateTime(current.actualStartDate))}`,
                        `Fin: ${orDash(formatDateTime(current.actualEndDate))}`].join(' · ')}
                </Text>
                <Text size="sm">
                    {[`Tareas: ${current.completedTaskCount ?? 0} de ${current.taskCount ?? 0} completadas`,
                        `Estimación: ${formatQuantity(current.estimatedMinutes)} min en ${current.estimatedShifts ?? 0} `
                        + `${current.estimatedShifts === 1 ? 'turno' : 'turnos'}`,
                        `Proyecto de almacén: ${project}`].join(' · ')}
                </Text>
                {current.closingNotes && <Text size="sm">{`Notas de cierre: ${current.closingNotes}`}</Text>}
                {current.cancellationReason && <Text size="sm">{`Motivo de la cancelación: ${current.cancellationReason}`}</Text>}
            </Stack>
            <Group gap="sm">
                <Button variant="default" leftSection={<IconArrowLeft size={16}/>} onClick={() => navigate(ORDERS_PATH)}>Volver a la lista</Button>
                <Button variant="default" leftSection={<IconHistory size={16}/>} onClick={() => setDialog('history')}>Historial</Button>
                {current.originInspectionId && (
                    <Button variant="default" leftSection={<IconClipboardCheck size={16}/>}
                            onClick={() => navigate(inspectionPath(current.originInspectionId))}>Inspección de origen</Button>
                )}
                {current.originDefectId && (
                    <Button variant="default" leftSection={<IconAlertTriangle size={16}/>}
                            onClick={() => navigate(defectPath(current.originDefectId))}>Defecto de origen</Button>
                )}
                {canWrite && open && <Button leftSection={<IconPencil size={16}/>} onClick={() => setDialog('edit')}>Modificar</Button>}
                {canWrite && canPlanOrder(status) && (
                    <Button leftSection={<IconCalendar size={16}/>} onClick={() => setDialog('plan')}>Planificar</Button>
                )}
                {canWrite && canAssignOrder(status) && (
                    <Button leftSection={<IconUserCheck size={16}/>} onClick={() => setDialog('assign')}>Asignar</Button>
                )}
                {canWrite && canStartOrder(status, current.type) && (
                    <Button leftSection={<IconPlayerPlay size={16}/>} onClick={() => setDialog('start')}>Iniciar</Button>
                )}
                {canWrite && canCompleteOrder(status) && (
                    <Button leftSection={<IconCheck size={16}/>} onClick={() => setDialog('complete')}>Completar</Button>
                )}
                {canSupervise && open && (
                    <Button color="red" variant="light" leftSection={<IconCircleX size={16}/>} onClick={() => setDialog('cancel')}>Cancelar</Button>
                )}
            </Group>
            <LazyTabs tabs={[
                {value: 'tasks', label: 'Tareas', render: () => <OrderTasksPanel order={current} canWrite={canWrite}/>},
                {value: 'history', label: 'Estados', render: () => <OrderStatusHistory order={current}/>},
            ]}/>
            {dialog === 'edit' && <OrderEditorModal order={current} onClose={close}/>}
            {['plan', 'assign', 'start', 'complete'].includes(dialog) && (
                <OrderTransitionModal kind={dialog} order={current} canForce={canSupervise} onClose={close}/>
            )}
            {dialog === 'cancel' && (
                <ReasonModal title={`Cancelar ${current.code}`} confirmLabel="Cancelar la orden" loading={cancelling.isPending} onConfirm={cancel}
                             onClose={close}>
                    La orden queda cancelada con su motivo y se liberan en el almacén las reservas de sus materiales. No se puede deshacer.
                </ReasonModal>
            )}
            {dialog === 'history' && (
                <RevisionsModal label={current.code} path={orderRevisionsPath(current.id)} describe={describeOrder} onClose={close}/>
            )}
        </Stack>
    )
}

function OrderStatusHistory({order}) {
    const history = useOrderHistory(order.id)
    return <StatusHistoryTable ariaLabel={`Estados de ${order.code}`} query={history} statusLabel={ORDER_STATUS.label}/>
}

function statusColor(status) {
    if (status === 'COMPLETED') {
        return 'teal'
    }
    return status === 'CANCELLED' ? 'gray' : 'blue'
}

function orDash(value) {
    return value ? value : '-'
}
