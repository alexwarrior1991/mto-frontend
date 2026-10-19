import {Badge, Button, Group, Stack, Text} from '@mantine/core'
import {IconBan, IconCircleCheck, IconPencil, IconPlayerPlay, IconPlus} from '@tabler/icons-react'
import {useState} from 'react'
import {REPAIR_KIND, REPAIR_STATUS} from '../../api/resources/enums.js'
import {repairActions} from '../../api/resources/repairs.js'
import {unitLabel} from '../../api/resources/values.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import DataTable from '../../ui/DataTable.jsx'
import {formatDate, formatDateTime, formatQuantity, yesNo} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import RepairModal from './RepairModal.jsx'
import {countText} from './resourcesTexts.js'
import {useRepairTransition, useVehicleRepairs} from './useResources.js'

const STATUS_COLORS = Object.freeze({PLANNED: 'blue', OPEN: 'orange', CLOSED: 'green', CANCELLED: 'gray'})

/** Lo que dice cada transición antes de hacerla: su efecto en el vehículo. */
function transitionText(transition, repair) {
    switch (transition) {
        case 'open':
            return repair.immobilises !== false
                ? 'El vehículo entra en el taller ahora: queda «En reparación» y fuera de los turnos hasta que se cierre.'
                : 'El vehículo entra en el taller ahora; no lo inmoviliza, así que sigue disponible.'
        case 'close':
            return 'El vehículo sale del taller ahora. Si era la última abierta que lo inmovilizaba, vuelve a «Operativo».'
        default:
            return repair.status === 'OPEN'
                ? 'Se cancela y no se puede deshacer. Si era la última abierta que lo inmovilizaba, el vehículo vuelve a «Operativo».'
                : 'Se cancela y no se puede deshacer: el vehículo deja de estar reservado para el taller en esas fechas.'
    }
}

// confirm: el botón de la confirmación, que no puede llamarse como el «Cerrar» del propio diálogo.
const TRANSITIONS = Object.freeze({
    open: {verb: 'Abrir', confirm: 'Abrir la reparación', done: 'Abierta', icon: IconPlayerPlay, color: undefined},
    close: {verb: 'Cerrar', confirm: 'Cerrar la reparación', done: 'Cerrada', icon: IconCircleCheck, color: 'green'},
    cancel: {verb: 'Cancelar', confirm: 'Cancelar la reparación', done: 'Cancelada', icon: IconBan, color: 'red'},
})

/**
 * El taller de un vehículo (el port de VehicleRepairsPanel): sus reparaciones, la más reciente primero,
 * con su clase, su estado, si lo inmovilizan, cuándo se prevén, cuándo se abrieron y se cerraron, el taller
 * y el coste. Con resources-fleet-write, cada fila ofrece lo que admite su estado (planificada: abrir,
 * modificar, cancelar; abierta: cerrar, modificar, cancelar; cerrada o cancelada: modificar; una de un
 * estado desconocido, nada), y abrir, cerrar y cancelar se confirman con su efecto en el vehículo.
 */
export default function VehicleRepairsPanel({vehicle, canWrite}) {
    const repairs = useVehicleRepairs(vehicle.id)
    // null: cerrado; {repair: null}: alta; {repair}: modificación.
    const [editing, setEditing] = useState(null)
    // {repair, transition}
    const [confirming, setConfirming] = useState(null)
    const transition = useRepairTransition(vehicle.id)
    const rows = repairs.data ?? []

    const run = () => {
        const {repair, transition: name} = confirming
        transition.mutate({repair, transition: name}, {
            onSuccess: () => notifySuccess(`${TRANSITIONS[name].done} ${repair.code}`),
            onSettled: () => setConfirming(null),
        })
    }

    const columns = [
        {key: 'code', label: 'Código', render: (row) => row.code},
        {key: 'kind', label: 'Clase', render: (row) => REPAIR_KIND.label(row.kind)},
        {key: 'status', label: 'Estado', render: (row) => (
            <Badge variant="light" color={STATUS_COLORS[row.status] ?? 'gray'}>{REPAIR_STATUS.label(row.status)}</Badge>
        )},
        {key: 'immobilises', label: 'Inmoviliza', render: (row) => yesNo(row.immobilises)},
        {key: 'planned', label: 'Previsto', render: (row) => (row.plannedFrom || row.plannedTo
            ? `${formatDate(row.plannedFrom) || '…'} – ${formatDate(row.plannedTo) || '…'}` : '')},
        {key: 'openedAt', label: 'Abierta', render: (row) => formatDateTime(row.openedAt)},
        {key: 'closedAt', label: 'Cerrada', render: (row) => formatDateTime(row.closedAt)},
        {key: 'workshop', label: 'Taller', render: (row) => row.workshop ?? ''},
        {key: 'cost', label: 'Coste', render: (row) => formatQuantity(row.cost)},
    ]
    const actions = canWrite
        ? (row) => repairActions(row).map((action) => (action === 'edit'
            ? <RowActionButton key="edit" label={`Modificar ${row.code}`} tooltip="Modificar" icon={IconPencil} onClick={() => setEditing({repair: row})}/>
            : (
                <RowActionButton key={action} label={`${TRANSITIONS[action].verb} ${row.code}`} tooltip={TRANSITIONS[action].verb}
                                 icon={TRANSITIONS[action].icon} color={TRANSITIONS[action].color}
                                 onClick={() => setConfirming({repair: row, transition: action})}/>
            )))
        : null

    return (
        <Stack>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">{repairs.data ? countText(rows.length, 'reparación', 'reparaciones') : ''}</Text>
                {canWrite && <Button leftSection={<IconPlus size={16}/>} onClick={() => setEditing({repair: null})}>Nueva reparación</Button>}
            </Group>
            <DataTable ariaLabel={`Taller de ${vehicle.code}`} columns={columns} rows={rows} loading={repairs.isPending}
                       emptyText={repairs.isError ? 'No se han podido leer sus reparaciones.' : 'No ha pasado por el taller.'}
                       rowActions={actions} minWidth={1000}/>
            {editing && <RepairModal vehicle={vehicle} repair={editing.repair} onClose={() => setEditing(null)}/>}
            {confirming && (
                <ConfirmModal title={`${TRANSITIONS[confirming.transition].verb} ${confirming.repair.code} de ${unitLabel(vehicle)}`}
                              confirmLabel={TRANSITIONS[confirming.transition].confirm} cancelLabel="Volver"
                              confirmColor={confirming.transition === 'cancel' ? 'red' : 'blue'} loading={transition.isPending}
                              onConfirm={run} onClose={() => setConfirming(null)}>
                    {transitionText(confirming.transition, confirming.repair)}
                </ConfirmModal>
            )}
        </Stack>
    )
}
