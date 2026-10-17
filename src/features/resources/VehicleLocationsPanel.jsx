import {Group, Pagination, Stack} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {IconCalendarTime} from '@tabler/icons-react'
import {useState} from 'react'
import {useNavigate} from 'react-router'
import {LOCATION_SOURCE} from '../../api/resources/enums.js'
import {LOCATIONS_PAGE_SIZE, shiftIdOf} from '../../api/resources/vehicles.js'
import DataTable from '../../ui/DataTable.jsx'
import {formatDateTime} from '../../ui/format.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import {shiftPath} from '../maintenance/maintenanceRoutes.js'
import {placeText} from './resourcesTexts.js'
import {useVehicleLocations} from './useResources.js'

/**
 * El historial de ubicaciones de un vehículo (el port de VehicleLocationsPanel), la más reciente
 * primero, sin sort, paginado y filtrado por días: «Desde» y «Hasta» incluyen los dos días enteros. Una
 * ubicación que dejó un turno enlaza con el turno, si se puede leer mantenimiento.
 */
export default function VehicleLocationsPanel({vehicle, names, readsMaintenance}) {
    const navigate = useNavigate()
    const [from, setFrom] = useState(null)
    const [to, setTo] = useState(null)
    const listKey = JSON.stringify([from, to])
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1
    const locations = useVehicleLocations(vehicle.id, {from, to, page})
    const totalPages = Math.max(1, Math.ceil((locations.data?.totalElements ?? 0) / LOCATIONS_PAGE_SIZE))

    const columns = [
        {key: 'when', label: 'Cuándo', render: (location) => (location.observedAt ? formatDateTime(location.observedAt) : '')},
        {key: 'where', label: 'Dónde', render: (location) => placeText(location, names)},
        {key: 'access', label: 'Acceso', render: (location) => location.accessPoint ?? ''},
        {key: 'source', label: 'Origen', render: (location) => LOCATION_SOURCE.label(location.source)},
        {key: 'recordedBy', label: 'Registrada por', render: (location) => location.recordedBy ?? ''},
    ]
    const actions = (location) => {
        const shift = shiftIdOf(location)
        return shift && readsMaintenance
            ? <RowActionButton label="Ver el turno" tooltip="Ver el turno" icon={IconCalendarTime} onClick={() => navigate(shiftPath(shift))}/>
            : null
    }

    return (
        <Stack>
            <Group gap="sm">
                <DateInput label="Desde" clearable valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA" value={from}
                           onChange={setFrom}/>
                <DateInput label="Hasta" clearable valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA" value={to}
                           onChange={setTo}/>
            </Group>
            <DataTable ariaLabel={`Ubicaciones de ${vehicle.code}`} columns={columns} rows={locations.data?.content ?? []} loading={locations.isPending}
                       emptyText={locations.isError ? 'No se ha podido leer el historial.' : 'Sin ubicaciones.'} rowActions={actions}/>
            {totalPages > 1 && <Pagination value={page} total={totalPages} onChange={(next) => setPaging({key: listKey, page: next})}/>}
        </Stack>
    )
}
