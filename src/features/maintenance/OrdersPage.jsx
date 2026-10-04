import {Button, CloseButton, Group, Select, Stack, Text, TextInput, Title} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useDebouncedValue} from '@mantine/hooks'
import {IconExternalLink, IconPlus} from '@tabler/icons-react'
import {useState} from 'react'
import {useNavigate} from 'react-router'
import {teamsByCode} from '../../api/maintenance/catalogs.js'
import {ORDER_STATUS, ORDER_TYPE, PRIORITY} from '../../api/maintenance/enums.js'
import {assetLabel, teamLabel} from '../../api/maintenance/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import {formatDate} from '../../ui/format.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import {ReferenceSelect} from './MaintenancePickers.jsx'
import {orderPath} from './maintenanceRoutes.js'
import {countText, kpRange, progress} from './maintenanceTexts.js'
import OrderEditorModal from './OrderEditorModal.jsx'
import {useConfigurationNames} from './useMaintenanceNames.js'
import {MAINTENANCE_PAGE_SIZE, useOrderList, useTeams} from './useMaintenance.js'

const SEARCH_DELAY_MS = 300

/**
 * mantenimiento: las órdenes de mantenimiento (el port de OrdersView), paginadas, filtradas y
 * ordenadas en el servidor; es el nodo del grupo «Mantenimiento» del menú. Vía y paquete llegan como
 * ids de mto-configuration; el activo y el equipo vienen resumidos en la propia orden. Solo se ordena
 * por atributos de la orden: el avance y la estimación los calcula el servicio. Una fila abre su ficha,
 * y un alta abre la de la orden nueva.
 */
export default function OrdersPage({title}) {
    const session = useSession()
    const canWrite = session.has(P.MAINTENANCE_WRITE)
    const navigate = useNavigate()
    const names = useConfigurationNames({tracks: true})
    const teams = useTeams()

    const [status, setStatus] = useState(null)
    const [type, setType] = useState(null)
    const [priority, setPriority] = useState(null)
    const [trackId, setTrackId] = useState(null)
    const [packageId, setPackageId] = useState(null)
    const [teamId, setTeamId] = useState(null)
    const [code, setCode] = useState('')
    const [assignedUser, setAssignedUser] = useState('')
    const [debouncedCode] = useDebouncedValue(code, SEARCH_DELAY_MS)
    const [debouncedUser] = useDebouncedValue(assignedUser, SEARCH_DELAY_MS)
    const [plannedFrom, setPlannedFrom] = useState(null)
    const [plannedTo, setPlannedTo] = useState(null)
    const [sort, setSort] = useState(null)
    const filters = {
        status, type, priority, trackId, executionPackageId: packageId, teamId, code: debouncedCode.trim(),
        assignedUser: debouncedUser.trim(), plannedFrom, plannedTo,
    }
    // La página vuelve a la primera en cuanto cambia lo que se pide.
    const listKey = JSON.stringify([filters, sort])
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1
    const list = useOrderList({...filters, page, sort})
    const filtering = Object.values(filters).some((value) => value !== null && value !== '')
    const [creating, setCreating] = useState(false)
    const open = (order) => navigate(orderPath(order.id))

    const columns = [
        {key: 'code', label: 'Código', sortField: 'code', render: (order) => order.code},
        {key: 'title', label: 'Título', sortField: 'title', render: (order) => order.title},
        {key: 'type', label: 'Tipo', sortField: 'type', render: (order) => ORDER_TYPE.label(order.type)},
        {key: 'status', label: 'Estado', sortField: 'status', render: (order) => ORDER_STATUS.label(order.status)},
        {key: 'priority', label: 'Prioridad', sortField: 'priority', render: (order) => PRIORITY.label(order.priority)},
        {key: 'asset', label: 'Activo', render: (order) => assetLabel(order.asset)},
        {key: 'track', label: 'Vía', render: (order) => names.trackName(order.trackId)},
        {key: 'kp', label: 'KP', render: (order) => kpRange(order.startKp, order.endKp)},
        {key: 'package', label: 'Paquete', render: (order) => names.packageName(order.executionPackageId)},
        {key: 'plannedDate', label: 'Prevista', sortField: 'plannedDate', render: (order) => formatDate(order.plannedDate)},
        {key: 'team', label: 'Equipo', render: (order) => teamLabel(order.team)},
        {key: 'tasks', label: 'Tareas', render: (order) => progress(order.completedTaskCount, order.taskCount)},
        {key: 'assignedUser', label: 'Asignada a', sortField: 'assignedUser', render: (order) => order.assignedUser ?? ''},
    ]

    const clearable = (value, setValue, label) => (value
        ? <CloseButton size="sm" aria-label={`Borrar ${label}`} onClick={() => setValue('')}/>
        : null)

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group align="flex-end" gap="sm">
                <Select label="Estado" placeholder="Todos" clearable w={150} data={ORDER_STATUS.selectable()} value={status} onChange={setStatus}/>
                <Select label="Tipo" placeholder="Todos" clearable w={150} data={ORDER_TYPE.selectable()} value={type} onChange={setType}/>
                <Select label="Prioridad" placeholder="Todas" clearable w={140} data={PRIORITY.selectable()} value={priority} onChange={setPriority}/>
                <ReferenceSelect label="Vía" placeholder="Todas" w={220} options={names.trackOptions} value={trackId} onChange={setTrackId}/>
                <ReferenceSelect label="Paquete" placeholder="Todos" w={200} options={names.packageOptions} value={packageId}
                                 onChange={setPackageId}/>
                <Select label="Equipo" placeholder="Todos" clearable searchable w={220} value={teamId} onChange={setTeamId}
                        data={teamsByCode(teams.data).map((team) => ({value: team.id, label: teamLabel(team)}))}/>
                <TextInput label="Código" placeholder="MO-000001" w={150} value={code} onChange={(event) => setCode(event.currentTarget.value)}
                           rightSection={clearable(code, setCode, 'el código')}/>
                <TextInput label="Asignada a" w={190} value={assignedUser} onChange={(event) => setAssignedUser(event.currentTarget.value)}
                           rightSection={clearable(assignedUser, setAssignedUser, 'a quién está asignada')}/>
                <DateInput label="Prevista desde" clearable w={160} valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                           value={plannedFrom} onChange={setPlannedFrom}/>
                <DateInput label="Prevista hasta" clearable w={160} valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                           value={plannedTo} onChange={setPlannedTo}/>
            </Group>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">{list.data ? countText(list.data.totalElements, 'orden', 'órdenes') : ''}</Text>
                {canWrite && <Button leftSection={<IconPlus size={16}/>} onClick={() => setCreating(true)}>Nueva orden</Button>}
            </Group>
            <ServerDataTable ariaLabel={title} columns={columns} rows={list.data?.content ?? []} loading={list.isPending}
                             emptyText={emptyText(list, filtering)} sort={sort} onSortChange={setSort} page={page}
                             pageSize={MAINTENANCE_PAGE_SIZE} totalElements={list.data?.totalElements ?? 0}
                             onPageChange={(next) => setPaging({key: listKey, page: next})} minWidth={1400} onRowDoubleClick={open}
                             rowActions={(order) => <RowActionButton label={`Abrir ${order.code}`} tooltip="Abrir la orden" icon={IconExternalLink}
                                                                     onClick={() => open(order)}/>}/>
            {creating && <OrderEditorModal order={null} onClose={() => setCreating(false)} onSaved={open}/>}
        </Stack>
    )
}

function emptyText(list, filtering) {
    if (list.isError) {
        return 'No se ha podido leer la lista.'
    }
    return filtering ? 'Ninguna orden coincide con los filtros.' : 'No hay órdenes.'
}
