import {Button, CloseButton, Group, Select, Stack, Text, TextInput, Title} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useDebouncedValue} from '@mantine/hooks'
import {IconExternalLink, IconPlus} from '@tabler/icons-react'
import {useState} from 'react'
import {useNavigate} from 'react-router'
import {ASSET_TYPE, INSPECTION_KIND, INSPECTION_RESULT} from '../../api/maintenance/enums.js'
import {assetLabel} from '../../api/maintenance/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import {formatDate} from '../../ui/format.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import InspectionEditorModal from './InspectionEditorModal.jsx'
import {ReferenceSelect} from './MaintenancePickers.jsx'
import {inspectionPath} from './maintenanceRoutes.js'
import {countText, kp} from './maintenanceTexts.js'
import {useConfigurationNames} from './useMaintenanceNames.js'
import {MAINTENANCE_PAGE_SIZE, useInspectionList} from './useMaintenance.js'

const SEARCH_DELAY_MS = 300

/**
 * mantenimiento/inspecciones: las inspecciones (el port de InspectionsView), paginadas, filtradas y
 * ordenadas en el servidor, la más reciente primero. Una fila abre su ficha, y un alta abre la de la
 * inspección nueva.
 */
export default function InspectionsPage({title}) {
    const session = useSession()
    const canWrite = session.has(P.MAINTENANCE_WRITE)
    const navigate = useNavigate()
    const names = useConfigurationNames({tracks: true})

    const [result, setResult] = useState(null)
    const [assetType, setAssetType] = useState(null)
    const [trackId, setTrackId] = useState(null)
    const [packageId, setPackageId] = useState(null)
    const [inspectionFrom, setInspectionFrom] = useState(null)
    const [inspectionTo, setInspectionTo] = useState(null)
    const [inspector, setInspector] = useState('')
    const [debouncedInspector] = useDebouncedValue(inspector, SEARCH_DELAY_MS)
    const [sort, setSort] = useState(null)
    const filters = {result, assetType, trackId, executionPackageId: packageId, inspectionFrom, inspectionTo, inspector: debouncedInspector.trim()}
    // La página vuelve a la primera en cuanto cambia lo que se pide.
    const listKey = JSON.stringify([filters, sort])
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1
    const list = useInspectionList({...filters, page, sort})
    const filtering = Object.values(filters).some((value) => value !== null && value !== '')
    const [creating, setCreating] = useState(false)
    const open = (inspection) => navigate(inspectionPath(inspection.id))

    const columns = [
        {key: 'code', label: 'Código', sortField: 'code', render: (inspection) => inspection.code},
        {key: 'inspectionDate', label: 'Fecha', sortField: 'inspectionDate', render: (inspection) => formatDate(inspection.inspectionDate)},
        {key: 'asset', label: 'Activo', render: (inspection) => assetLabel(inspection.asset)},
        {key: 'track', label: 'Vía', render: (inspection) => names.trackName(inspection.trackId)},
        {key: 'kp', label: 'KP', render: (inspection) => kp(inspection.kp)},
        {key: 'kind', label: 'Tipo', render: (inspection) => (inspection.inspectionKind ? INSPECTION_KIND.label(inspection.inspectionKind) : '')},
        {key: 'result', label: 'Resultado', sortField: 'result', render: (inspection) => INSPECTION_RESULT.label(inspection.result)},
        {key: 'inspector', label: 'Inspector', sortField: 'inspector', render: (inspection) => inspection.inspector ?? ''},
        {key: 'defect', label: 'Defecto', render: (inspection) => (inspection.generatedDefectId ? 'Sí' : '')},
        {key: 'order', label: 'Orden', render: (inspection) => (inspection.generatedOrderId ? 'Sí' : '')},
    ]

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group align="flex-end" gap="sm">
                <Select label="Resultado" placeholder="Todos" clearable w={160} data={INSPECTION_RESULT.selectable()} value={result} onChange={setResult}/>
                <Select label="Tipo de activo" placeholder="Todos" clearable w={180} data={ASSET_TYPE.selectable()} value={assetType}
                        onChange={setAssetType}/>
                <ReferenceSelect label="Vía" placeholder="Todas" w={220} options={names.trackOptions} value={trackId} onChange={setTrackId}/>
                <ReferenceSelect label="Paquete" placeholder="Todos" w={200} options={names.packageOptions} value={packageId}
                                 onChange={setPackageId}/>
                <DateInput label="Desde" clearable w={150} valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                           value={inspectionFrom} onChange={setInspectionFrom}/>
                <DateInput label="Hasta" clearable w={150} valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                           value={inspectionTo} onChange={setInspectionTo}/>
                <TextInput label="Inspector" w={180} value={inspector} onChange={(event) => setInspector(event.currentTarget.value)}
                           rightSection={inspector ? <CloseButton size="sm" aria-label="Borrar el inspector" onClick={() => setInspector('')}/> : null}/>
            </Group>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">
                    {list.data ? countText(list.data.totalElements, 'inspección', 'inspecciones') : ''}
                </Text>
                {canWrite && <Button leftSection={<IconPlus size={16}/>} onClick={() => setCreating(true)}>Nueva inspección</Button>}
            </Group>
            <ServerDataTable ariaLabel={title} columns={columns} rows={list.data?.content ?? []} loading={list.isPending}
                             emptyText={emptyText(list, filtering)} sort={sort} onSortChange={setSort} page={page}
                             pageSize={MAINTENANCE_PAGE_SIZE} totalElements={list.data?.totalElements ?? 0}
                             onPageChange={(next) => setPaging({key: listKey, page: next})} minWidth={1200} onRowDoubleClick={open}
                             rowActions={(inspection) => <RowActionButton label={`Abrir ${inspection.code}`} tooltip="Abrir la inspección"
                                                                          icon={IconExternalLink} onClick={() => open(inspection)}/>}/>
            {creating && <InspectionEditorModal inspection={null} onClose={() => setCreating(false)} onSaved={open}/>}
        </Stack>
    )
}

function emptyText(list, filtering) {
    if (list.isError) {
        return 'No se ha podido leer la lista.'
    }
    return filtering ? 'Ninguna inspección coincide con los filtros.' : 'No hay inspecciones.'
}
