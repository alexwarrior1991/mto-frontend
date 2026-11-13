import {Button, CloseButton, Group, Select, Stack, Text, TextInput} from '@mantine/core'
import {useDebouncedValue} from '@mantine/hooks'
import {IconRefresh, IconRotateClockwise} from '@tabler/icons-react'
import {useState} from 'react'
import {canRetryDelivery, DELIVERIES_PAGE_SIZE, deliveryRecipient, isUuid} from '../../api/notification/admin.js'
import {DELIVERY_SCOPE, DELIVERY_STATUS} from '../../api/notification/enums.js'
import {formatDateTime} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import {countText} from './notificationTexts.js'
import {useDeliveries, useRetryDelivery} from './useNotifications.js'

const SEARCH_DELAY_MS = 300

const NO_FILTER = Object.freeze({status: null, channel: '', notificationId: ''})

const COLUMNS = [
    {key: 'createdAt', label: 'Creada', sortField: 'createdAt', render: (row) => formatDateTime(row.createdAt)},
    {key: 'channel', label: 'Canal', sortField: 'channel', render: (row) => row.channel ?? ''},
    {key: 'scope', label: 'Ámbito', render: (row) => DELIVERY_SCOPE.label(row.scope)},
    {key: 'recipient', label: 'Para', render: (row) => deliveryRecipient(row)},
    {key: 'status', label: 'Estado', sortField: 'status', render: (row) => DELIVERY_STATUS.label(row.status)},
    {key: 'attempts', label: 'Intentos', render: (row) => `${row.attempts ?? 0}/${row.maxAttempts ?? 0}`},
    {key: 'nextAttemptAt', label: 'Próximo intento', sortField: 'nextAttemptAt', render: (row) => formatDateTime(row.nextAttemptAt)},
    {key: 'sentAt', label: 'Enviada', sortField: 'sentAt', render: (row) => formatDateTime(row.sentAt)},
    {key: 'lastError', label: 'Último error', render: (row) => row.lastError ?? ''},
    {key: 'notificationId', label: 'Notificación', render: (row) => row.notificationId ?? ''},
]

/**
 * Las entregas por los canales que empujan, hoy el correo (GET /admin/deliveries, el port de
 * AdminDeliveriesPanel): paginadas, filtradas y ordenadas en el servicio, la más reciente primero.
 *
 * - Los filtros son los del servicio: el estado, el canal (escrito entero: se compara tal cual) y la
 *   notificación, por su id. Lo que no se filtra no viaja.
 * - El id de la notificación se busca entero: mientras no sea un UUID no se pide nada (el servicio
 *   respondería 400), el campo se marca y la lista sigue con el último filtro bien formado.
 * - «Reintentar» devuelve a la cola una fallida o una omitida, que es lo único que el servicio
 *   reintenta (canRetryDelivery); en otro estado sería su 409 DLV-409. Sin confirmación: no hay nada
 *   que perder. Salga bien o no, la lista se relee, porque la entrega ya no está como se pintó.
 */
export default function AdminDeliveriesPanel() {
    const [status, setStatus] = useState(null)
    const [texts, setTexts] = useState({channel: '', notificationId: ''})
    const [debounced] = useDebouncedValue(texts, SEARCH_DELAY_MS)
    const [sort, setSort] = useState(null)

    const written = {status, channel: debounced.channel.trim(), notificationId: debounced.notificationId.trim()}
    const wellFormed = written.notificationId === '' || isUuid(written.notificationId)
    // Lo que pide la lista es el último filtro bien formado: con un id a medias, sigue con el anterior.
    const [applied, setApplied] = useState(NO_FILTER)
    if (wellFormed && JSON.stringify(written) !== JSON.stringify(applied)) {
        setApplied(written)
    }

    // La página vuelve a la primera en cuanto cambia lo que se pide.
    const listKey = JSON.stringify([applied, sort])
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1
    const list = useDeliveries({...applied, page, sort})
    const retrying = useRetryDelivery()
    const filtering = applied.status !== null || applied.channel !== '' || applied.notificationId !== ''

    const retry = (delivery) => retrying.mutate(delivery.id, {onSuccess: () => notifySuccess('Entrega en cola otra vez')})

    const text = (key, label, placeholder, width, error = null) => (
        <TextInput label={label} placeholder={placeholder} w={width} value={texts[key]} error={error}
                   onChange={(event) => {
                       const value = event.currentTarget.value
                       setTexts((current) => ({...current, [key]: value}))
                   }}
                   rightSection={texts[key]
                       ? <CloseButton size="sm" aria-label={`Borrar ${label.toLowerCase()}`}
                                      onClick={() => setTexts((current) => ({...current, [key]: ''}))}/>
                       : null}/>
    )

    return (
        <Stack>
            <Group justify="space-between" align="flex-start">
                <Group align="flex-start" gap="sm">
                    <Select label="Estado" placeholder="Todos" clearable w={180} data={DELIVERY_STATUS.selectable()} value={status}
                            onChange={setStatus}/>
                    {text('channel', 'Canal', 'email', 160)}
                    {text('notificationId', 'Notificación (id)', null, 330,
                        wellFormed ? null : 'El id entero de una notificación (un UUID)')}
                    <Text size="sm" c="dimmed" mt={30} aria-live="polite">
                        {list.data ? countText(list.data.totalElements, 'entrega', 'entregas') : ''}
                    </Text>
                </Group>
                <Button variant="default" mt={25} leftSection={<IconRefresh size={16}/>} loading={list.isFetching}
                        onClick={() => void list.refetch()}>
                    Actualizar
                </Button>
            </Group>
            <ServerDataTable ariaLabel="Entregas" columns={COLUMNS} rows={list.data?.content ?? []} loading={list.isPending}
                             emptyText={emptyText(list, filtering)} sort={sort} onSortChange={setSort} page={page}
                             pageSize={DELIVERIES_PAGE_SIZE} totalElements={list.data?.totalElements ?? 0}
                             onPageChange={(next) => setPaging({key: listKey, page: next})} minWidth={1400}
                             rowActions={(delivery) => canRetryDelivery(delivery.status) && (
                                 <RowActionButton label={`Reintentar la entrega a ${deliveryRecipient(delivery)}`} tooltip="Reintentar"
                                                  icon={IconRotateClockwise} disabled={retrying.isPending}
                                                  onClick={() => retry(delivery)}/>
                             )}/>
        </Stack>
    )
}

function emptyText(list, filtering) {
    if (list.isError) {
        return 'No se han podido leer las entregas.'
    }
    return filtering ? 'Ninguna entrega coincide con los filtros.' : 'No hay ninguna entrega.'
}
