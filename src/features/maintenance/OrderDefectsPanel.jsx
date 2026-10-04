import {Button, Group, Stack} from '@mantine/core'
import {IconExternalLink, IconPlus} from '@tabler/icons-react'
import {useState} from 'react'
import {useNavigate} from 'react-router'
import {DEFECT_SEVERITY, DEFECT_STATUS, isOpenOrder} from '../../api/maintenance/enums.js'
import {assetLabel} from '../../api/maintenance/values.js'
import DataTable from '../../ui/DataTable.jsx'
import {formatDateTime} from '../../ui/format.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import DefectEditorModal from './DefectEditorModal.jsx'
import {defectPath} from './maintenanceRoutes.js'
import {useOrderDefects} from './useMaintenance.js'

/**
 * Los defectos vinculados a una orden (el port de OrderDefectsPanel); con maintenance-write y la orden
 * sin terminar se da de alta uno ya vinculado, sobre su activo. Una fila abre su ficha.
 */
export default function OrderDefectsPanel({order, canWrite}) {
    const navigate = useNavigate()
    const defects = useOrderDefects(order.id)
    const [creating, setCreating] = useState(false)
    const columns = [
        {key: 'code', label: 'Código', render: (defect) => defect.code},
        {key: 'detectedAt', label: 'Detectado', render: (defect) => formatDateTime(defect.detectedAt)},
        {key: 'asset', label: 'Activo', render: (defect) => assetLabel(defect.asset)},
        {key: 'severity', label: 'Gravedad', render: (defect) => DEFECT_SEVERITY.label(defect.severity)},
        {key: 'status', label: 'Estado', render: (defect) => DEFECT_STATUS.label(defect.status)},
        {key: 'description', label: 'Descripción', render: (defect) => defect.description ?? ''},
    ]
    return (
        <Stack>
            {canWrite && isOpenOrder(order.status) && (
                <Group>
                    <Button leftSection={<IconPlus size={16}/>} onClick={() => setCreating(true)}>Nuevo defecto</Button>
                </Group>
            )}
            <DataTable ariaLabel={`Defectos de ${order.code}`} columns={columns} rows={defects.data ?? []} loading={defects.isPending} minWidth={900}
                       emptyText={defects.isError ? 'No se han podido leer los defectos.' : 'La orden no tiene defectos.'}
                       rowActions={(defect) => <RowActionButton label={`Abrir ${defect.code}`} tooltip="Abrir el defecto" icon={IconExternalLink}
                                                                onClick={() => navigate(defectPath(defect.id))}/>}/>
            {creating && <DefectEditorModal defect={null} order={order} onClose={() => setCreating(false)}/>}
        </Stack>
    )
}
