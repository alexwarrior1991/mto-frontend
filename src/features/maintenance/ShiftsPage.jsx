import {Button, Group, Select, Stack, Text, Title} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {IconExternalLink, IconPlus} from '@tabler/icons-react'
import {useState} from 'react'
import {useNavigate} from 'react-router'
import {teamsByCode} from '../../api/maintenance/catalogs.js'
import {POSSESSION, SHIFT_STATUS} from '../../api/maintenance/enums.js'
import {teamLabel} from '../../api/maintenance/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import {formatDate, formatDateTime} from '../../ui/format.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import {ReferenceSelect} from './MaintenancePickers.jsx'
import {shiftPath} from './maintenanceRoutes.js'
import {countText, kpRange} from './maintenanceTexts.js'
import ShiftEditorModal from './ShiftEditorModal.jsx'
import {useConfigurationNames} from './useMaintenanceNames.js'
import {MAINTENANCE_PAGE_SIZE, useShiftList, useTeams} from './useMaintenance.js'

/**
 * mantenimiento/turnos: los turnos nocturnos (el port de ShiftsView), paginados, filtrados y ordenados
 * en el servidor (fechas, equipo, vía, paquete, estado y posesión), el más reciente primero. Una fila
 * abre la ficha, donde se inicia, se asignan tareas, se trabajan y se cierra. Sin config-read no hay
 * vías entre las que elegir, y un turno necesita al menos una: no se ofrece el alta.
 */
export default function ShiftsPage({title}) {
    const session = useSession()
    const navigate = useNavigate()
    const names = useConfigurationNames({tracks: true})
    const teams = useTeams()
    const canCreate = session.has(P.MAINTENANCE_WRITE) && names.readsConfiguration

    const [dateFrom, setDateFrom] = useState(null)
    const [dateTo, setDateTo] = useState(null)
    const [teamId, setTeamId] = useState(null)
    const [trackId, setTrackId] = useState(null)
    const [packageId, setPackageId] = useState(null)
    const [status, setStatus] = useState(null)
    const [possessionType, setPossessionType] = useState(null)
    const [sort, setSort] = useState(null)
    const filters = {dateFrom, dateTo, teamId, trackId, executionPackageId: packageId, status, possessionType}
    // La página vuelve a la primera en cuanto cambia lo que se pide.
    const listKey = JSON.stringify([filters, sort])
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1
    const list = useShiftList({...filters, page, sort})
    const filtering = Object.values(filters).some((value) => value !== null && value !== '')
    const [creating, setCreating] = useState(false)
    const open = (shift) => navigate(shiftPath(shift.id))

    const columns = [
        {key: 'code', label: 'Código', sortField: 'code', render: (shift) => shift.code},
        {key: 'shiftDate', label: 'Fecha', sortField: 'shiftDate', render: (shift) => formatDate(shift.shiftDate)},
        {key: 'team', label: 'Equipo', render: (shift) => teamLabel(shift.team)},
        {key: 'possession', label: 'Posesión', sortField: 'possessionType', render: (shift) => POSSESSION.label(shift.possessionType)},
        {key: 'tracks', label: 'Vías', render: (shift) => (shift.trackIds ?? []).map(names.trackName).join(', ')},
        {key: 'kp', label: 'KP', render: (shift) => kpRange(shift.startKp, shift.endKp)},
        {key: 'status', label: 'Estado', sortField: 'status', render: (shift) => SHIFT_STATUS.label(shift.status)},
        {key: 'actualStart', label: 'Inicio', render: (shift) => formatDateTime(shift.actualStart)},
        {key: 'actualEnd', label: 'Fin', render: (shift) => formatDateTime(shift.actualEnd)},
        {key: 'net', label: 'Neto', render: (shift) => (shift.netWorkMinutes === null || shift.netWorkMinutes === undefined ? '' : `${shift.netWorkMinutes} min`)},
    ]

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group align="flex-end" gap="sm">
                <DateInput label="Desde" clearable w={150} valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                           value={dateFrom} onChange={setDateFrom}/>
                <DateInput label="Hasta" clearable w={150} valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                           value={dateTo} onChange={setDateTo}/>
                <Select label="Equipo" placeholder="Todos" clearable searchable w={220} value={teamId} onChange={setTeamId}
                        data={teamsByCode(teams.data).map((team) => ({value: team.id, label: teamLabel(team)}))}/>
                <ReferenceSelect label="Vía" placeholder="Todas" w={220} options={names.trackOptions} value={trackId} onChange={setTrackId}/>
                <ReferenceSelect label="Paquete" placeholder="Todos" w={200} options={names.packageOptions} value={packageId}
                                 onChange={setPackageId}/>
                <Select label="Estado" placeholder="Todos" clearable w={150} data={SHIFT_STATUS.selectable()} value={status} onChange={setStatus}/>
                <Select label="Posesión" placeholder="Todas" clearable w={140} data={POSSESSION.selectable()} value={possessionType}
                        onChange={setPossessionType}/>
            </Group>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">{list.data ? countText(list.data.totalElements, 'turno', 'turnos') : ''}</Text>
                {canCreate && <Button leftSection={<IconPlus size={16}/>} onClick={() => setCreating(true)}>Nuevo turno</Button>}
            </Group>
            <ServerDataTable ariaLabel={title} columns={columns} rows={list.data?.content ?? []} loading={list.isPending}
                             emptyText={emptyText(list, filtering)} sort={sort} onSortChange={setSort} page={page}
                             pageSize={MAINTENANCE_PAGE_SIZE} totalElements={list.data?.totalElements ?? 0}
                             onPageChange={(next) => setPaging({key: listKey, page: next})} minWidth={1200} onRowDoubleClick={open}
                             rowActions={(shift) => <RowActionButton label={`Abrir ${shift.code}`} tooltip="Abrir el turno" icon={IconExternalLink}
                                                                     onClick={() => open(shift)}/>}/>
            {creating && <ShiftEditorModal shift={null} onClose={() => setCreating(false)} onSaved={open}/>}
        </Stack>
    )
}

function emptyText(list, filtering) {
    if (list.isError) {
        return 'No se ha podido leer la lista.'
    }
    return filtering ? 'Ningún turno coincide con los filtros.' : 'No hay turnos.'
}
