import {Badge, Button, Group, Stack, Text, Tooltip} from '@mantine/core'
import {IconPencil, IconPlus, IconRefresh, IconTrash} from '@tabler/icons-react'
import {useState} from 'react'
import {isOpenOrder, STOCK_REQUEST, STOCK_SYNC_STATUS} from '../../api/maintenance/enums.js'
import {
    isEditableLine,
    isInDoubtLine,
    isRemovableLine,
    isReservedLine,
    syncActionOf,
} from '../../api/maintenance/materials.js'
import {materialLabel} from '../../api/maintenance/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import DataTable from '../../ui/DataTable.jsx'
import {formatQuantity} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import {IN_DOUBT_HINT} from './maintenanceTexts.js'
import MaterialUsageModal from './MaterialUsageModal.jsx'
import {useStockNames} from './useMaintenanceNames.js'
import {useOrderMaterials, useOrderTasks, useRemoveMaterial, useSyncMaterial} from './useMaintenance.js'

/**
 * Las líneas de material de una orden y cómo van con mto-stock (el port de OrderMaterialsPanel): el
 * error o el motivo del rechazo, en el tooltip del estado; una petición al almacén sin respuesta,
 * también en el texto.
 *
 * Con la orden sin terminar: añadir (maintenance-write y stock-read), modificar (maintenance-write) y
 * quitar (maintenance-delete; ni consumidas ni con una salida sin respuesta, que quizá ya salió), que
 * libera antes la reserva. «Sincronizar» (maintenance-write) reintenta con el almacén una línea
 * fallida o rechazada, o una sin pedir fuera de borrador, también con la orden terminada; con la orden
 * abierta, además, comprueba una reservada, por si Almacén liberó su reserva. Si el almacén sigue
 * caído o dice que no, el aviso dice por qué, y la línea se relee, porque guarda lo que pasó.
 */
export default function OrderMaterialsPanel({order, canWrite, canDelete}) {
    const session = useSession()
    const readsStock = session.has(P.STOCK_READ)
    const lines = useOrderMaterials(order.id)
    const tasks = useOrderTasks(order.id)
    const warehouses = useStockNames('warehouses', (lines.data ?? []).map((line) => line.warehouseId))
    const syncing = useSyncMaterial(order.id)
    const removing = useRemoveMaterial(order.id)
    // El diálogo abierto: {kind: 'add'} o {kind: 'edit'|'remove', line}.
    const [dialog, setDialog] = useState(null)
    const close = () => setDialog(null)

    const open = isOpenOrder(order.status)
    const taskSequence = new Map((tasks.data ?? []).map((task) => [task.id, task.sequence]))

    const columns = [
        {key: 'material', label: 'Material', render: materialLabel},
        {key: 'warehouse', label: 'Almacén', render: (line) => warehouses.label(line.warehouseId)},
        {key: 'planned', label: 'Previsto', render: (line) => quantityText(line.plannedQuantity, line.unit)},
        {key: 'consumed', label: 'Consumido', render: (line) => quantityText(line.consumedQuantity, line.unit)},
        {key: 'task', label: 'Tarea', render: (line) => (taskSequence.has(line.taskId) ? `Tarea ${taskSequence.get(line.taskId)}` : '')},
        {key: 'status', label: 'Stock', render: (line) => <LineStatus line={line}/>},
    ]

    const sync = (line) => syncing.mutate(line.id, {
        onSuccess: (synced) => notifySuccess(`${synced.materialCode}: ${STOCK_SYNC_STATUS.label(synced.stockSyncStatus).toLowerCase()}`),
    })

    const actions = (line) => {
        const label = materialLabel(line)
        const syncAction = canWrite ? syncActionOf(line, order.status) : null
        return (
            <>
                {canWrite && isEditableLine(line, order.status) && (
                    <RowActionButton label={`Modificar ${label}`} tooltip="Modificar" icon={IconPencil} onClick={() => setDialog({kind: 'edit', line})}/>
                )}
                {syncAction === 'retry' && (
                    <RowActionButton label={`Sincronizar ${label} con el almacén`} tooltip="Sincronizar con el almacén" icon={IconRefresh}
                                     onClick={() => sync(line)}/>
                )}
                {syncAction === 'check' && (
                    <RowActionButton label={`Comprobar la reserva de ${label} en el almacén`} tooltip="Comprobar la reserva en el almacén"
                                     icon={IconRefresh} onClick={() => sync(line)}/>
                )}
                {canDelete && isRemovableLine(line, order.status) && (
                    <RowActionButton label={`Quitar ${label}`} tooltip="Quitar" icon={IconTrash} color="red"
                                     onClick={() => setDialog({kind: 'remove', line})}/>
                )}
            </>
        )
    }

    const remove = () => {
        const {line} = dialog
        removing.mutate(line.id, {
            onSuccess: () => notifySuccess(`Quitado ${line.materialCode}`),
            onSettled: close,
        })
    }

    return (
        <Stack>
            {canWrite && open && (readsStock
                ? (
                    <Group gap="sm">
                        <Button leftSection={<IconPlus size={16}/>} onClick={() => setDialog({kind: 'add'})}>Añadir material</Button>
                    </Group>
                )
                : <Text size="sm" c="dimmed">Añadir materiales pide leer el almacén (stock-read).</Text>)}
            <DataTable ariaLabel={`Materiales de ${order.code}`} columns={columns} rows={lines.data ?? []} loading={lines.isPending} minWidth={880}
                       emptyText={lines.isError ? 'No se han podido leer los materiales.' : 'La orden no tiene materiales.'} rowActions={actions}/>
            {dialog?.kind === 'add' && <MaterialUsageModal order={order} line={null} tasks={tasks.data} onClose={close}/>}
            {dialog?.kind === 'edit' && <MaterialUsageModal order={order} line={dialog.line} tasks={tasks.data} onClose={close}/>}
            {dialog?.kind === 'remove' && (
                <ConfirmModal title={`Quitar ${materialLabel(dialog.line)}`} confirmLabel="Quitar" loading={removing.isPending} onConfirm={remove}
                              onClose={close}>
                    {removalText(dialog.line)}
                </ConfirmModal>
            )}
        </Stack>
    )
}

/**
 * El estado de una línea con el almacén. Lo que explica un fallo (el error, el motivo del rechazo, la
 * petición sin respuesta) va en el tooltip, y la línea se marca en rojo.
 */
function LineStatus({line}) {
    const label = STOCK_SYNC_STATUS.label(line.stockSyncStatus)
    const inDoubt = isInDoubtLine(line)
    const reason = line.stockSyncError?.trim() ? line.stockSyncError : null
    const explanation = inDoubt ? `${reason ? `${reason}. ` : ''}${IN_DOUBT_HINT}` : reason
    const text = inDoubt ? `${label} · ${STOCK_REQUEST.label(line.stockRequestInDoubt)}` : label
    if (!explanation) {
        return <Text size="sm">{text}</Text>
    }
    return (
        <Tooltip label={explanation} multiline w={360} withArrow>
            <Badge color="red" variant="light" style={{textTransform: 'none'}}>{text}</Badge>
        </Tooltip>
    )
}

/**
 * Lo que pasa en el almacén al quitar la línea: el servicio libera antes lo que retenga allí, y una
 * reserva sin respuesta la confirma primero, así que también pasa por el almacén aunque no tenga id.
 */
function removalText(line) {
    if (isInDoubtLine(line)) {
        return 'Antes se confirma con el almacén la reserva que se quedó sin respuesta y se libera; la línea desaparece (queda en su historial).'
    }
    return isReservedLine(line)
        ? 'Se libera antes su reserva en el almacén, y la línea desaparece (queda en su historial).'
        : 'La línea desaparece (queda en su historial).'
}

function quantityText(value, unit) {
    if (value === null || value === undefined) {
        return ''
    }
    return unit ? `${formatQuantity(value)} ${unit}` : formatQuantity(value)
}
