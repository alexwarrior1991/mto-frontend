import {Badge, Button, Checkbox, Group, Select, Stack, Text, Title} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {IconArrowRight, IconCheck, IconChecks, IconListSearch, IconRefresh} from '@tabler/icons-react'
import {useState} from 'react'
import {ACTIVITY_CATEGORY, ACTIVITY_SEVERITY} from '../../api/notification/enums.js'
import {INBOX_PAGE_SIZE} from '../../api/notification/inbox.js'
import {notificationTarget} from '../../api/notification/links.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import {formatDateTime} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import {ActivityEventModal} from './EventDetailModal.jsx'
import {inboxCountText} from './notificationTexts.js'
import {useFollowLink} from './useFollowLink.js'
import {useInbox, useMarkAllRead, useMarkRead} from './useNotifications.js'

/**
 * notificaciones: mi bandeja (el port de NotificationsView). Las notificaciones dirigidas a mí, que
 * resuelve el servicio con el token, paginadas, filtradas y ordenadas en el servidor, la más reciente
 * primero.
 *
 * - Abre con las no leídas; desmarcar «Solo no leídas» enseña también las leídas. El estado de lectura
 *   es de cada persona y el servicio no ordena por él: lo dice la marca «Nueva».
 * - Abrir una notificación (su flecha, o la fila con doble clic) la marca como leída antes de seguir su
 *   enlace; si el servicio dice que ya no es mía (404 NTF-404), se avisa y no se abre nada. Una leída
 *   no se vuelve a marcar.
 * - «Marcar todas como leídas» va hasta la más reciente visible, como hace el servicio.
 * - La línea del registro que la causó se abre con notification-activity-read. Una notificación de
 *   accesos no la ofrece: /activity/{id} nunca devuelve un acceso.
 */
export default function NotificationsPage({title}) {
    const session = useSession()
    const canReadActivity = session.has(P.NOTIFICATION_ACTIVITY_READ)
    const follow = useFollowLink()

    const [unreadOnly, setUnreadOnly] = useState(true)
    const [category, setCategory] = useState(null)
    const [severity, setSeverity] = useState(null)
    const [from, setFrom] = useState(null)
    const [to, setTo] = useState(null)
    const [sort, setSort] = useState(null)
    const filters = {unread: unreadOnly, category, severity, from, to}
    // La página vuelve a la primera en cuanto cambia lo que se pide.
    const listKey = JSON.stringify([filters, sort])
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1
    const list = useInbox({...filters, page, sort})
    const filtering = [category, severity, from, to].some((value) => value !== null && value !== '')
    const marking = useMarkRead()
    const markingAll = useMarkAllRead()
    const [eventId, setEventId] = useState(null)

    const open = (item) => {
        if (item.read) {
            follow(item.link)
            return
        }
        marking.mutate(item.id, {onSuccess: () => follow(item.link)})
    }
    const markAll = () => markingAll.mutate(undefined, {onSuccess: () => notifySuccess('Todas las notificaciones quedan como leídas')})

    const columns = [
        {key: 'state', label: 'Estado', render: (item) => (item.read ? '' : <Badge size="sm" variant="filled">Nueva</Badge>)},
        {key: 'createdAt', label: 'Cuándo', sortField: 'createdAt', render: (item) => formatDateTime(item.createdAt)},
        {key: 'severity', label: 'Gravedad', sortField: 'severity', render: (item) => ACTIVITY_SEVERITY.label(item.severity)},
        {key: 'category', label: 'Categoría', sortField: 'category', render: (item) => ACTIVITY_CATEGORY.label(item.category)},
        {key: 'title', label: 'Título', sortField: 'title', render: (item) => item.title ?? ''},
        {key: 'body', label: 'Detalle', render: (item) => item.body ?? ''},
    ]

    const actions = (item) => (
        <>
            {notificationTarget(item.link) && (
                <RowActionButton label={`Abrir ${item.title}`} tooltip={`Abrir ${item.link}`} icon={IconArrowRight} onClick={() => open(item)}/>
            )}
            {!item.read && (
                <RowActionButton label={`Marcar como leída ${item.title}`} tooltip="Marcar como leída" icon={IconCheck}
                                 onClick={() => marking.mutate(item.id)}/>
            )}
            {canReadActivity && item.activityEventId && item.category !== 'ACCESS' && (
                <RowActionButton label={`Línea del registro de ${item.title}`} tooltip="La línea del registro que la causó"
                                 icon={IconListSearch} onClick={() => setEventId(item.activityEventId)}/>
            )}
        </>
    )

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group align="flex-end" gap="sm">
                <Checkbox label="Solo no leídas" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.currentTarget.checked)} mb={8}/>
                <Select label="Categoría" placeholder="Todas" clearable w={180} data={ACTIVITY_CATEGORY.selectable()} value={category}
                        onChange={setCategory}/>
                <Select label="Gravedad" placeholder="Todas" clearable w={160} data={ACTIVITY_SEVERITY.selectable()} value={severity}
                        onChange={setSeverity}/>
                <DateInput label="Desde" clearable w={150} valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                           value={from} onChange={setFrom}/>
                <DateInput label="Hasta" clearable w={150} valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                           value={to} onChange={setTo}/>
            </Group>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">{list.data ? inboxCountText(list.data.totalElements, unreadOnly) : ''}</Text>
                <Group gap="sm">
                    <Button variant="default" leftSection={<IconRefresh size={16}/>} loading={list.isFetching} onClick={() => void list.refetch()}>
                        Recargar
                    </Button>
                    <Button leftSection={<IconChecks size={16}/>} loading={markingAll.isPending} onClick={markAll}>Marcar todas como leídas</Button>
                </Group>
            </Group>
            <ServerDataTable ariaLabel={title} columns={columns} rows={list.data?.content ?? []} loading={list.isPending}
                             emptyText={emptyText(list, unreadOnly, filtering)} sort={sort} onSortChange={setSort} page={page}
                             pageSize={INBOX_PAGE_SIZE} totalElements={list.data?.totalElements ?? 0}
                             onPageChange={(next) => setPaging({key: listKey, page: next})} minWidth={1100} onRowDoubleClick={open}
                             rowActions={actions}/>
            {eventId && <ActivityEventModal eventId={eventId} onClose={() => setEventId(null)}/>}
        </Stack>
    )
}

function emptyText(list, unreadOnly, filtering) {
    if (list.isError) {
        return 'No se ha podido leer la bandeja.'
    }
    if (filtering) {
        return 'Ninguna notificación coincide con los filtros.'
    }
    return unreadOnly ? 'No tienes nada sin leer.' : 'No tienes notificaciones.'
}
