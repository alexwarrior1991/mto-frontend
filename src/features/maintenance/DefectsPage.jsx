import {Button, Group, Select, Stack, Text, Title} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {IconExternalLink, IconPlus} from '@tabler/icons-react'
import {useState} from 'react'
import {useNavigate} from 'react-router'
import {DEFECT_SEVERITY, DEFECT_STATUS} from '../../api/maintenance/enums.js'
import {assetLabel} from '../../api/maintenance/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import {formatDate, formatDateTime} from '../../ui/format.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import DefectEditorModal from './DefectEditorModal.jsx'
import {ReferenceSelect} from './MaintenancePickers.jsx'
import {defectPath} from './maintenanceRoutes.js'
import {countText, kpRange} from './maintenanceTexts.js'
import {useConfigurationNames} from './useMaintenanceNames.js'
import {MAINTENANCE_PAGE_SIZE, useDefectList} from './useMaintenance.js'

/**
 * mantenimiento/defectos: los defectos de catenaria (el port de DefectsView), paginados, filtrados y
 * ordenados en el servidor, el más reciente primero. Las fechas de detección filtran días enteros.
 * Una fila abre su ficha, y un alta abre la del defecto nuevo.
 */
export default function DefectsPage({title}) {
    const session = useSession()
    const canWrite = session.has(P.MAINTENANCE_WRITE)
    const navigate = useNavigate()
    const names = useConfigurationNames({tracks: true})

    const [severity, setSeverity] = useState(null)
    const [status, setStatus] = useState(null)
    const [trackId, setTrackId] = useState(null)
    const [packageId, setPackageId] = useState(null)
    const [detectedFrom, setDetectedFrom] = useState(null)
    const [detectedTo, setDetectedTo] = useState(null)
    const [sort, setSort] = useState(null)
    const filters = {severity, status, trackId, executionPackageId: packageId, detectedFrom, detectedTo}
    // La página vuelve a la primera en cuanto cambia lo que se pide.
    const listKey = JSON.stringify([filters, sort])
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1
    const list = useDefectList({...filters, page, sort})
    const filtering = Object.values(filters).some((value) => value !== null && value !== '')
    const [creating, setCreating] = useState(false)
    const open = (defect) => navigate(defectPath(defect.id))

    const columns = [
        {key: 'code', label: 'Código', sortField: 'code', render: (defect) => defect.code},
        {key: 'detectedAt', label: 'Detectado', sortField: 'detectedAt', render: (defect) => formatDateTime(defect.detectedAt)},
        {key: 'asset', label: 'Activo', render: (defect) => assetLabel(defect.asset)},
        {key: 'track', label: 'Vía', render: (defect) => names.trackName(defect.trackId)},
        {key: 'kp', label: 'KP', render: (defect) => kpRange(defect.startKp, defect.endKp)},
        {key: 'severity', label: 'Gravedad', sortField: 'severity', render: (defect) => DEFECT_SEVERITY.label(defect.severity)},
        {key: 'status', label: 'Estado', sortField: 'status', render: (defect) => DEFECT_STATUS.label(defect.status)},
        {key: 'repair', label: 'Reparación prevista', sortField: 'repairPlannedDate', render: (defect) => formatDate(defect.repairPlannedDate)},
        {key: 'description', label: 'Descripción', render: (defect) => defect.description ?? ''},
    ]

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group align="flex-end" gap="sm">
                <Select label="Gravedad" placeholder="Todas" clearable w={150} data={DEFECT_SEVERITY.selectable()} value={severity}
                        onChange={setSeverity}/>
                <Select label="Estado" placeholder="Todos" clearable w={150} data={DEFECT_STATUS.selectable()} value={status} onChange={setStatus}/>
                <ReferenceSelect label="Vía" placeholder="Todas" w={220} options={names.trackOptions} value={trackId} onChange={setTrackId}/>
                <ReferenceSelect label="Paquete" placeholder="Todos" w={200} options={names.packageOptions} value={packageId}
                                 onChange={setPackageId}/>
                <DateInput label="Detectado desde" clearable w={160} valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                           value={detectedFrom} onChange={setDetectedFrom}/>
                <DateInput label="Detectado hasta" clearable w={160} valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                           value={detectedTo} onChange={setDetectedTo}/>
            </Group>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">{list.data ? countText(list.data.totalElements, 'defecto', 'defectos') : ''}</Text>
                {canWrite && <Button leftSection={<IconPlus size={16}/>} onClick={() => setCreating(true)}>Nuevo defecto</Button>}
            </Group>
            <ServerDataTable ariaLabel={title} columns={columns} rows={list.data?.content ?? []} loading={list.isPending}
                             emptyText={emptyText(list, filtering)} sort={sort} onSortChange={setSort} page={page}
                             pageSize={MAINTENANCE_PAGE_SIZE} totalElements={list.data?.totalElements ?? 0}
                             onPageChange={(next) => setPaging({key: listKey, page: next})} minWidth={1200} onRowDoubleClick={open}
                             rowActions={(defect) => <RowActionButton label={`Abrir ${defect.code}`} tooltip="Abrir el defecto" icon={IconExternalLink}
                                                                      onClick={() => open(defect)}/>}/>
            {creating && <DefectEditorModal defect={null} onClose={() => setCreating(false)} onSaved={open}/>}
        </Stack>
    )
}

function emptyText(list, filtering) {
    if (list.isError) {
        return 'No se ha podido leer la lista.'
    }
    return filtering ? 'Ningún defecto coincide con los filtros.' : 'No hay defectos.'
}
