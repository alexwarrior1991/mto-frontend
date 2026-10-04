import {Button, Checkbox, Group, Modal, Select, SimpleGrid, Stack} from '@mantine/core'
import {useState} from 'react'
import {ORDER_STATUS} from '../../api/maintenance/enums.js'
import {assetLabel} from '../../api/maintenance/values.js'
import DataTable from '../../ui/DataTable.jsx'
import {errorMessage} from '../../ui/errors/messages.js'
import {notifySuccess, notifyWarning} from '../../ui/notifySuccess.js'
import {useConfigurationNames} from './useMaintenanceNames.js'
import {useAssignTask, useOpenOrdersOnTrack, useOrderTasks} from './useMaintenance.js'

/**
 * Asignar tareas pendientes a un turno (el port de AssignTasksDialog): una vía del turno, una orden
 * abierta de esa vía y sus tareas pendientes. Se asignan una a una, en su orden, porque el servicio
 * comprueba la vía y la posesión de cada una: las que rechaza (409 SHF-001, o una que ya no está
 * pendiente) se cuentan en el aviso con su motivo, y las demás quedan asignadas. El diálogo sigue
 * abierto para elegir otra orden.
 */
export default function AssignTasksModal({shift, onClose}) {
    const names = useConfigurationNames({tracks: true})
    const tracks = (shift.trackIds ?? []).map((id) => ({value: String(id), label: names.trackName(id)}))
    const [trackId, setTrackId] = useState(tracks[0]?.value ?? null)
    const [orderId, setOrderId] = useState(null)
    const [selected, setSelected] = useState([])
    const [assigning, setAssigning] = useState(false)
    const orders = useOpenOrdersOnTrack(trackId === null ? null : Number(trackId))
    const tasks = useOrderTasks(orderId, {enabled: orderId !== null})
    const assign = useAssignTask(shift.id)
    const pending = (tasks.data ?? []).filter((task) => task.status === 'PENDING')

    const chooseTrack = (value) => {
        setTrackId(value)
        setOrderId(null)
        setSelected([])
    }
    const chooseOrder = (value) => {
        setOrderId(value)
        setSelected([])
    }
    const toggle = (task, checked) => setSelected((ids) => (checked ? [...ids, task.id] : ids.filter((id) => id !== task.id)))

    const run = async () => {
        const chosen = pending.filter((task) => selected.includes(task.id))
        setAssigning(true)
        let assigned = 0
        const refused = []
        for (const task of chosen) {
            try {
                await assign.mutateAsync(task.id)
                assigned += 1
            } catch (error) {
                refused.push(`tarea ${task.sequence} (${errorMessage(error)})`)
            }
        }
        setAssigning(false)
        setSelected([])
        const text = `Asignadas: ${assigned}.${refused.length > 0 ? ` Rechazadas: ${refused.join('; ')}` : ''}`
        if (refused.length > 0) {
            notifyWarning(text)
        } else {
            notifySuccess(text)
        }
        await assign.settled(orderId)
    }

    const columns = [
        {key: 'pick', label: 'Elegir', render: (task) => (
            <Checkbox aria-label={`Elegir la tarea ${task.sequence}`} checked={selected.includes(task.id)}
                      onChange={(event) => toggle(task, event.currentTarget.checked)}/>
        )},
        {key: 'sequence', label: '#', render: (task) => task.sequence ?? ''},
        {key: 'description', label: 'Descripción', render: (task) => task.description ?? ''},
        {key: 'asset', label: 'Activo', render: (task) => assetLabel(task.asset)},
        {key: 'types', label: 'Tipos', render: (task) => (task.taskTypeCodes ?? []).join(', ')},
        {key: 'shift', label: 'Turno', render: (task) => shiftOf(task, shift)},
    ]

    return (
        <Modal opened onClose={onClose} size="xl" title={`Asignar tareas a ${shift.code}`}>
            <Stack>
                <SimpleGrid cols={{base: 1, sm: 2}}>
                    <Select label="Vía" data={tracks} value={trackId} onChange={chooseTrack} allowDeselect={false}/>
                    <Select label="Orden" placeholder="Elige una orden abierta de la vía" searchable clearable value={orderId} onChange={chooseOrder}
                            nothingFoundMessage="Ninguna orden abierta en esta vía"
                            data={(orders.data ?? []).map((order) => ({value: order.id, label: orderLabel(order)}))}/>
                </SimpleGrid>
                <DataTable ariaLabel={`Tareas pendientes para ${shift.code}`} columns={columns} rows={pending} loading={orderId !== null && tasks.isPending}
                           emptyText={orderId === null ? 'Elige una orden.' : 'La orden no tiene tareas pendientes.'} minWidth={760}/>
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>Cerrar</Button>
                    <Button disabled={selected.length === 0} loading={assigning} onClick={() => void run()}>Asignar</Button>
                </Group>
            </Stack>
        </Modal>
    )
}

function orderLabel(order) {
    return `${order.code} · ${order.title}${order.status ? ` (${ORDER_STATUS.label(order.status).toLowerCase()})` : ''}`
}

function shiftOf(task, shift) {
    if (!task.shiftId) {
        return ''
    }
    return task.shiftId === shift.id ? 'Ya en este turno' : 'En otro turno'
}
