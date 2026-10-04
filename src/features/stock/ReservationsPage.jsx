import {Button, Group, Select, Stack, Text, Title} from '@mantine/core'
import {IconArrowUp, IconCheck, IconHistory, IconLockOpen, IconPencil, IconPlus, IconTrash} from '@tabler/icons-react'
import {useState} from 'react'
import {isActiveReservation, RESERVATION_STATUS, reservationRevisionsPath} from '../../api/stock/reservations.js'
import {referenceLabel} from '../../api/stock/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import {formatDateTime, formatQuantity} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RevisionsModal from '../../ui/RevisionsModal.jsx'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import MovementModal from './MovementModal.jsx'
import ReservationModal from './ReservationModal.jsx'
import StockPicker from './StockPicker.jsx'
import {countText, describeReservation, reservationDoneText, reservationLabel} from './stockTexts.js'
import {STOCK_PAGE_SIZE, useReservationAction, useReservationList} from './useStock.js'

const COLUMNS = Object.freeze([
    {key: 'reservedAt', label: 'Reservada', sortField: 'reservedAt', render: (row) => formatDateTime(row.reservedAt)},
    {key: 'material', label: 'Material', render: (row) => referenceLabel(row.material)},
    {key: 'warehouse', label: 'Almacén', render: (row) => row.warehouse?.code ?? ''},
    {key: 'project', label: 'Proyecto', render: (row) => row.project?.code ?? ''},
    {key: 'quantity', label: 'Cantidad', sortField: 'quantity', render: (row) => formatQuantity(row.quantity)},
    {key: 'status', label: 'Estado', sortField: 'status', render: (row) => RESERVATION_STATUS.label(row.status)},
    {key: 'releasedAt', label: 'Cerrada', render: (row) => formatDateTime(row.releasedAt)},
    {key: 'createdBy', label: 'Por', render: (row) => row.audit?.createdBy ?? ''},
])

/** Los tres cambios de una reserva activa que se confirman, cada uno su llamada. */
const ACTIONS = Object.freeze({
    consume: Object.freeze({
        verb: 'Consumir', confirm: 'Consumir', color: 'blue', done: 'Reserva consumida',
        text: 'El material sale del almacén: baja el físico además del reservado, y queda una salida en el libro, sin referencia '
            + 'ni notas. Para dejarlas, «Salida con esta reserva».',
    }),
    release: Object.freeze({
        verb: 'Liberar', confirm: 'Liberar', color: 'blue', done: 'Reserva liberada',
        text: 'El material vuelve al disponible sin ningún movimiento.',
    }),
    cancel: Object.freeze({
        verb: 'Cancelar', confirm: 'Cancelar la reserva', color: 'red', done: 'Reserva cancelada',
        text: 'Queda cancelada y el material vuelve al disponible. No se puede deshacer.',
    }),
})

/**
 * Las reservas de material para un proyecto (el port de ReservationsView), paginadas en el servidor
 * con sus filtros; empieza enseñando las activas. Solo una reserva activa cambia, y cada cambio es su
 * llamada: modificar, la salida que la consume con referencia y notas, consumir y liberar piden
 * stock-write, y cancelar, stock-delete. Las demás filas, también las de un estado que esta versión no
 * conoce, no ofrecen ningún cambio, porque el servicio respondería 422 RES-001; si aun así llega
 * (otra persona la cerró entre medias), el aviso lo dice y la lista enseña cómo está.
 *
 * Cualquier fila tiene su historial, que es lectura.
 */
export default function ReservationsPage({title}) {
    const session = useSession()
    const canWrite = session.has(P.STOCK_WRITE)
    const canCancel = session.has(P.STOCK_DELETE)

    const [status, setStatus] = useState('ACTIVE')
    const [warehouse, setWarehouse] = useState(null)
    const [material, setMaterial] = useState(null)
    const [project, setProject] = useState(null)
    const [sort, setSort] = useState(null)
    const filters = {status, warehouseId: warehouse?.id ?? null, materialId: material?.id ?? null, projectId: project?.id ?? null}
    // La página vuelve a la primera en cuanto cambia lo que se pide.
    const listKey = JSON.stringify([filters, sort])
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1
    const list = useReservationList({...filters, page, sort})
    const filtering = Object.values(filters).some((value) => value !== null)

    // null: cerrado; {reservation: null}: alta; {reservation}: modificación.
    const [editing, setEditing] = useState(null)
    const [output, setOutput] = useState(null)
    const [confirming, setConfirming] = useState(null)
    const [history, setHistory] = useState(null)
    const acting = useReservationAction()

    const act = () => {
        const {action, reservation} = confirming
        acting.mutate({action, reservation}, {
            onSuccess: (result) => {
                notifySuccess(reservationDoneText(ACTIONS[action].done, result ?? reservation))
                setConfirming(null)
            },
            onError: () => setConfirming(null),
        })
    }

    const actions = (row) => {
        const label = reservationLabel(row)
        const active = isActiveReservation(row)
        const confirm = (action) => () => setConfirming({action, reservation: row})
        return (
            <>
                {active && canWrite && (
                    <>
                        <RowActionButton label={`Modificar ${label}`} tooltip="Modificar" icon={IconPencil}
                                         onClick={() => setEditing({reservation: row})}/>
                        <RowActionButton label={`Salida con ${label}`} tooltip="Salida con esta reserva" icon={IconArrowUp}
                                         onClick={() => setOutput(row)}/>
                        <RowActionButton label={`Consumir ${label}`} tooltip="Consumir" icon={IconCheck} onClick={confirm('consume')}/>
                        <RowActionButton label={`Liberar ${label}`} tooltip="Liberar" icon={IconLockOpen} onClick={confirm('release')}/>
                    </>
                )}
                {active && canCancel && (
                    <RowActionButton label={`Cancelar ${label}`} tooltip="Cancelar" icon={IconTrash} color="red" onClick={confirm('cancel')}/>
                )}
                <RowActionButton label={`Historial de ${label}`} tooltip="Historial" icon={IconHistory} onClick={() => setHistory(row)}/>
            </>
        )
    }

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group justify="space-between" align="flex-end" gap="sm">
                <Group align="flex-end" gap="sm">
                    <Select label="Estado" placeholder="Todos" clearable w={170} data={RESERVATION_STATUS.selectable()} value={status}
                            onChange={setStatus}/>
                    <StockPicker catalogue="warehouses" label="Almacén" w={230} includeRetired value={warehouse} onChange={setWarehouse}/>
                    <StockPicker catalogue="materials" label="Material" w={280} includeRetired value={material} onChange={setMaterial}/>
                    <StockPicker catalogue="projects" label="Proyecto" w={230} includeRetired value={project} onChange={setProject}/>
                    <Text size="sm" c="dimmed" aria-live="polite">
                        {list.data ? countText(list.data.totalElements, 'reserva', 'reservas') : ''}
                    </Text>
                </Group>
                {canWrite && (
                    <Button leftSection={<IconPlus size={16}/>} onClick={() => setEditing({reservation: null})}>Nueva reserva</Button>
                )}
            </Group>
            <ServerDataTable ariaLabel={title} columns={COLUMNS} rows={list.data?.content ?? []} loading={list.isPending}
                             emptyText={emptyText(list, filtering)} sort={sort} onSortChange={setSort}
                             page={page} pageSize={STOCK_PAGE_SIZE} totalElements={list.data?.totalElements ?? 0}
                             onPageChange={(next) => setPaging({key: listKey, page: next})} rowActions={actions} minWidth={960}/>
            {editing && <ReservationModal reservation={editing.reservation} onClose={() => setEditing(null)}/>}
            {output && (
                <MovementModal kind="output" onClose={() => setOutput(null)} initial={{
                    material: output.material, warehouse: output.warehouse, project: output.project,
                    reservationId: output.id, quantity: output.quantity,
                }}/>
            )}
            {confirming && (
                <ConfirmModal title={`${ACTIONS[confirming.action].verb} ${reservationLabel(confirming.reservation)}`}
                              confirmLabel={ACTIONS[confirming.action].confirm} confirmColor={ACTIONS[confirming.action].color}
                              cancelLabel="Volver" loading={acting.isPending} onConfirm={act} onClose={() => setConfirming(null)}>
                    {ACTIONS[confirming.action].text}
                </ConfirmModal>
            )}
            {history && (
                <RevisionsModal label={reservationLabel(history)} path={reservationRevisionsPath(history.id)} describe={describeReservation}
                                onClose={() => setHistory(null)}/>
            )}
        </Stack>
    )
}

function emptyText(list, filtering) {
    if (list.isError) {
        return 'No se ha podido leer la lista.'
    }
    return filtering ? 'Ninguna reserva coincide con los filtros.' : 'No hay reservas.'
}
