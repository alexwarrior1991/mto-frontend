import {Button, Group, Stack} from '@mantine/core'
import {IconExternalLink, IconPlus} from '@tabler/icons-react'
import {useState} from 'react'
import {useNavigate} from 'react-router'
import {INSPECTION_RESULT, isOpenOrder} from '../../api/maintenance/enums.js'
import {assetLabel} from '../../api/maintenance/values.js'
import DataTable from '../../ui/DataTable.jsx'
import {formatDate} from '../../ui/format.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import InspectionEditorModal from './InspectionEditorModal.jsx'
import {inspectionPath} from './maintenanceRoutes.js'
import {useOrderInspections} from './useMaintenance.js'

/**
 * Las inspecciones hechas desde una orden de inspección (el port de OrderInspectionsPanel); con
 * maintenance-write y la orden sin terminar se da de alta una sobre su activo (el servicio no completa
 * una orden de inspección sin ninguna). Una fila abre su ficha.
 */
export default function OrderInspectionsPanel({order, canWrite}) {
    const navigate = useNavigate()
    const inspections = useOrderInspections(order.id)
    const [creating, setCreating] = useState(false)
    const columns = [
        {key: 'code', label: 'Código', render: (inspection) => inspection.code},
        {key: 'inspectionDate', label: 'Fecha', render: (inspection) => formatDate(inspection.inspectionDate)},
        {key: 'asset', label: 'Activo', render: (inspection) => assetLabel(inspection.asset)},
        {key: 'result', label: 'Resultado', render: (inspection) => INSPECTION_RESULT.label(inspection.result)},
        {key: 'inspector', label: 'Inspector', render: (inspection) => inspection.inspector ?? ''},
    ]
    return (
        <Stack>
            {canWrite && order.type === 'INSPECTION' && isOpenOrder(order.status) && (
                <Group>
                    <Button leftSection={<IconPlus size={16}/>} onClick={() => setCreating(true)}>Nueva inspección</Button>
                </Group>
            )}
            <DataTable ariaLabel={`Inspecciones de ${order.code}`} columns={columns} rows={inspections.data ?? []} loading={inspections.isPending}
                       minWidth={760} emptyText={inspections.isError ? 'No se han podido leer las inspecciones.' : 'La orden no tiene inspecciones.'}
                       rowActions={(inspection) => <RowActionButton label={`Abrir ${inspection.code}`} tooltip="Abrir la inspección"
                                                                    icon={IconExternalLink} onClick={() => navigate(inspectionPath(inspection.id))}/>}/>
            {creating && <InspectionEditorModal inspection={null} originOrder={order} onClose={() => setCreating(false)}/>}
        </Stack>
    )
}
