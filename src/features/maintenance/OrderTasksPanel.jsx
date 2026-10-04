import {Button, Group, Stack} from '@mantine/core'
import {IconCheck, IconCircleX, IconListCheck, IconPencil, IconPlus, IconWand} from '@tabler/icons-react'
import {useState} from 'react'
import {canCompleteOrder, isOpenOrder, isOpenTask, TASK_STATUS} from '../../api/maintenance/enums.js'
import {assetLabel} from '../../api/maintenance/values.js'
import DataTable from '../../ui/DataTable.jsx'
import {formatDateTime} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import {TaskChecklistModal} from './CheckItemsModal.jsx'
import CompleteTaskModal from './CompleteTaskModal.jsx'
import GenerateTasksModal from './GenerateTasksModal.jsx'
import {kpRange} from './maintenanceTexts.js'
import ReasonModal from './ReasonModal.jsx'
import TaskEditorModal from './TaskEditorModal.jsx'
import {useCancelTask, useOrderTasks} from './useMaintenance.js'

/**
 * Las tareas de una orden, en su orden (el port de OrderTasksPanel). Con maintenance-write: añadir una
 * tarea (orden sin terminar), generar las de un preventivo sobre un tramo (en borrador o planificado),
 * y modificar, rellenar el checklist o cancelar las abiertas; con la orden en curso, además,
 * completarlas, eligiendo entre los turnos en curso de su vía (desde la orden no hay turno). Cada
 * cambio relee la cabecera, que repinta el avance.
 */
export default function OrderTasksPanel({order, canWrite}) {
    const tasks = useOrderTasks(order.id)
    // El diálogo abierto: {kind: 'edit'|'checklist'|'complete'|'cancel', task} o {kind: 'add'|'generate'}.
    const [dialog, setDialog] = useState(null)
    const close = () => setDialog(null)
    const cancelling = useCancelTask(order.id)

    const canAdd = canWrite && isOpenOrder(order.status)
    const canGenerate = canWrite && order.type === 'PREVENTIVE' && (order.status === 'DRAFT' || order.status === 'PLANNED')
        && order.asset?.type === 'TRACK_SECTION'

    const columns = [
        {key: 'sequence', label: '#', render: (task) => task.sequence ?? ''},
        {key: 'description', label: 'Descripción', render: (task) => task.description ?? ''},
        {key: 'asset', label: 'Activo', render: (task) => assetLabel(task.asset)},
        {key: 'kp', label: 'KP', render: (task) => (task.asset ? kpRange(task.asset.startKp, task.asset.endKp) : '')},
        {key: 'types', label: 'Tipos', render: (task) => (task.taskTypeCodes ?? []).join(', ')},
        {key: 'status', label: 'Estado', render: (task) => TASK_STATUS.label(task.status)},
        {key: 'assignedUser', label: 'Asignada a', render: (task) => task.assignedUser ?? ''},
        {key: 'completedAt', label: 'Completada', render: (task) => formatDateTime(task.completedAt)},
    ]

    const actions = (task) => {
        if (!canWrite || !isOpenTask(task.status)) {
            return null
        }
        const name = `la tarea ${task.sequence}`
        return (
            <>
                <RowActionButton label={`Modificar ${name}`} tooltip="Modificar" icon={IconPencil} onClick={() => setDialog({kind: 'edit', task})}/>
                {(task.checkItems ?? []).length > 0 && (
                    <RowActionButton label={`Checklist de ${name}`} tooltip="Checklist" icon={IconListCheck}
                                     onClick={() => setDialog({kind: 'checklist', task})}/>
                )}
                {canCompleteOrder(order.status) && (
                    <RowActionButton label={`Completar ${name}`} tooltip="Completar" icon={IconCheck} onClick={() => setDialog({kind: 'complete', task})}/>
                )}
                <RowActionButton label={`Cancelar ${name}`} tooltip="Cancelar" icon={IconCircleX} color="red"
                                 onClick={() => setDialog({kind: 'cancel', task})}/>
            </>
        )
    }

    const cancel = (reason) => cancelling.mutate({taskId: dialog.task.id, reason}, {
        onSuccess: () => {
            notifySuccess(`Tarea ${dialog.task.sequence} cancelada`)
            close()
        },
    })

    return (
        <Stack>
            {(canAdd || canGenerate) && (
                <Group gap="sm">
                    {canAdd && <Button leftSection={<IconPlus size={16}/>} onClick={() => setDialog({kind: 'add'})}>Añadir tarea</Button>}
                    {canGenerate && (
                        <Button variant="default" leftSection={<IconWand size={16}/>} onClick={() => setDialog({kind: 'generate'})}>Generar tareas</Button>
                    )}
                </Group>
            )}
            <DataTable ariaLabel={`Tareas de ${order.code}`} columns={columns} rows={tasks.data ?? []} loading={tasks.isPending} minWidth={960}
                       emptyText={tasks.isError ? 'No se han podido leer las tareas.' : 'La orden no tiene tareas.'} rowActions={actions}/>
            {dialog?.kind === 'add' && <TaskEditorModal order={order} task={null} onClose={close}/>}
            {dialog?.kind === 'edit' && <TaskEditorModal order={order} task={dialog.task} onClose={close}/>}
            {dialog?.kind === 'generate' && <GenerateTasksModal order={order} onClose={close}/>}
            {dialog?.kind === 'checklist' && <TaskChecklistModal task={dialog.task} onClose={close}/>}
            {dialog?.kind === 'complete' && (
                <CompleteTaskModal orderId={order.id} trackId={dialog.task.asset?.trackId ?? order.trackId} task={dialog.task} shift={null}
                                   onClose={close}/>
            )}
            {dialog?.kind === 'cancel' && (
                <ReasonModal title={`Cancelar la tarea ${dialog.task.sequence}`} confirmLabel="Cancelar la tarea" loading={cancelling.isPending}
                             onConfirm={cancel} onClose={close}>
                    La tarea queda cancelada con su motivo en las notas; no se puede reabrir.
                </ReasonModal>
            )}
        </Stack>
    )
}
