import {IconCheck, IconCircleX, IconExternalLink, IconListCheck, IconPlayerPlay} from '@tabler/icons-react'
import {useState} from 'react'
import {useNavigate} from 'react-router'
import {canCloseShift, isOpenTask, TASK_STATUS} from '../../api/maintenance/enums.js'
import {assetLabel} from '../../api/maintenance/values.js'
import DataTable from '../../ui/DataTable.jsx'
import {formatDateTime} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import {TaskChecklistModal} from './CheckItemsModal.jsx'
import CompleteTaskModal from './CompleteTaskModal.jsx'
import {orderPath} from './maintenanceRoutes.js'
import {kpRange} from './maintenanceTexts.js'
import ReasonModal from './ReasonModal.jsx'
import {useCancelTask, useOrderCodes, useShiftTasks, useStartTask} from './useMaintenance.js'

/**
 * Las tareas asignadas a un turno, de todas sus órdenes (el port de ShiftTasksPanel). Con
 * maintenance-write y el turno en curso se inician y se completan aquí; el checklist y cancelar valen
 * mientras la tarea esté abierta. Si la orden no está en curso o el turno no admite el trabajo, lo dice
 * el servicio. Cada fila abre su orden.
 */
export default function ShiftTasksPanel({shift, canWrite}) {
    const navigate = useNavigate()
    const tasks = useShiftTasks(shift.id)
    const rows = [...(tasks.data ?? [])].sort(byOrderAndSequence)
    const codes = useOrderCodes(rows.map((task) => task.orderId))
    const starting = useStartTask()
    const cancelling = useCancelTask()
    // El diálogo abierto: {kind: 'checklist'|'complete'|'cancel', task}.
    const [dialog, setDialog] = useState(null)
    const close = () => setDialog(null)
    const working = canCloseShift(shift.status)

    const codeOf = (task) => codes.data?.[task.orderId] ?? ''
    const nameOf = (task) => `la tarea ${task.sequence}${codeOf(task) ? ` de ${codeOf(task)}` : ''}`

    const columns = [
        {key: 'order', label: 'Orden', render: codeOf},
        {key: 'sequence', label: '#', render: (task) => task.sequence ?? ''},
        {key: 'description', label: 'Descripción', render: (task) => task.description ?? ''},
        {key: 'asset', label: 'Activo', render: (task) => assetLabel(task.asset)},
        {key: 'kp', label: 'KP', render: (task) => (task.asset ? kpRange(task.asset.startKp, task.asset.endKp) : '')},
        {key: 'types', label: 'Tipos', render: (task) => (task.taskTypeCodes ?? []).join(', ')},
        {key: 'status', label: 'Estado', render: (task) => TASK_STATUS.label(task.status)},
        {key: 'completedAt', label: 'Completada', render: (task) => formatDateTime(task.completedAt)},
    ]

    const start = (task) => starting.mutate({orderId: task.orderId, taskId: task.id, shiftId: shift.id}, {
        onSuccess: () => notifySuccess(`Tarea ${task.sequence} iniciada`),
    })

    const actions = (task) => {
        const name = nameOf(task)
        const open = canWrite && isOpenTask(task.status)
        return (
            <>
                <RowActionButton label={`Abrir la orden de ${name}`} tooltip="Abrir la orden" icon={IconExternalLink}
                                 onClick={() => navigate(orderPath(task.orderId))}/>
                {open && working && task.status === 'PENDING' && (
                    <RowActionButton label={`Iniciar ${name}`} tooltip="Iniciar" icon={IconPlayerPlay} onClick={() => start(task)}/>
                )}
                {open && (task.checkItems ?? []).length > 0 && (
                    <RowActionButton label={`Checklist de ${name}`} tooltip="Checklist" icon={IconListCheck}
                                     onClick={() => setDialog({kind: 'checklist', task})}/>
                )}
                {open && working && (
                    <RowActionButton label={`Completar ${name}`} tooltip="Completar" icon={IconCheck} onClick={() => setDialog({kind: 'complete', task})}/>
                )}
                {open && (
                    <RowActionButton label={`Cancelar ${name}`} tooltip="Cancelar" icon={IconCircleX} color="red"
                                     onClick={() => setDialog({kind: 'cancel', task})}/>
                )}
            </>
        )
    }

    const cancel = (reason) => cancelling.mutate({orderId: dialog.task.orderId, taskId: dialog.task.id, reason}, {
        onSuccess: () => {
            notifySuccess(`Tarea ${dialog.task.sequence} cancelada`)
            close()
        },
    })

    return (
        <>
            <DataTable ariaLabel={`Tareas de ${shift.code}`} columns={columns} rows={rows} loading={tasks.isPending} minWidth={1000}
                       emptyText={tasks.isError ? 'No se han podido leer las tareas.' : 'El turno no tiene tareas asignadas.'} rowActions={actions}/>
            {dialog?.kind === 'checklist' && <TaskChecklistModal task={dialog.task} name={nameOf(dialog.task)} onClose={close}/>}
            {dialog?.kind === 'complete' && (
                <CompleteTaskModal orderId={dialog.task.orderId} trackId={null} task={dialog.task} shift={shift} name={nameOf(dialog.task)}
                                   onClose={close}/>
            )}
            {dialog?.kind === 'cancel' && (
                <ReasonModal title={`Cancelar ${nameOf(dialog.task)}`} confirmLabel="Cancelar la tarea" loading={cancelling.isPending}
                             onConfirm={cancel} onClose={close}>
                    La tarea queda cancelada con su motivo; no se puede reabrir.
                </ReasonModal>
            )}
        </>
    )
}

/** De orden en orden, y dentro de cada una por su secuencia. */
function byOrderAndSequence(left, right) {
    const order = String(left.orderId).localeCompare(String(right.orderId))
    return order !== 0 ? order : (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER)
}
