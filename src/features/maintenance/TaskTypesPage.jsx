import {Group, Select, Stack, Text, Title} from '@mantine/core'
import {IconTool} from '@tabler/icons-react'
import {useState} from 'react'
import {inPlanOrder} from '../../api/maintenance/catalogs.js'
import {FUNCTIONAL_GROUP, TASK_EQUIPMENT, TASK_UNIT} from '../../api/maintenance/enums.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import DataTable from '../../ui/DataTable.jsx'
import {formatQuantity, yesNo} from '../../ui/format.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import {countText} from './maintenanceTexts.js'
import TaskEquipmentModal from './TaskEquipmentModal.jsx'
import {useTaskTypes} from './useMaintenance.js'

/** El equipo que exige, por su nombre; sin ninguno, una raya. */
function equipmentText(type) {
    const equipment = type.requiredEquipment ?? []
    return equipment.length === 0 ? '—' : equipment.map((value) => TASK_EQUIPMENT.label(value)).join(', ')
}

const COLUMNS = Object.freeze([
    {key: 'code', label: 'Código', render: (type) => type.code},
    {key: 'description', label: 'Descripción', render: (type) => type.description ?? ''},
    {key: 'group', label: 'Grupo', render: (type) => FUNCTIONAL_GROUP.label(type.functionalGroup)},
    {key: 'unit', label: 'Unidad', render: (type) => TASK_UNIT.label(type.unit)},
    {key: 'minutesPerUnit', label: 'Min/unidad', render: (type) => formatQuantity(type.standardMinutesPerUnit)},
    {key: 'fixedMinutes', label: 'Min fijos', render: (type) => formatQuantity(type.fixedMinutes)},
    {key: 'fullPossession', label: 'Posesión total', render: (type) => yesNo(type.requiresFullPossession)},
    {key: 'diagnostic', label: 'Diagnóstico', render: (type) => yesNo(type.diagnostic)},
    {key: 'active', label: 'Activo', render: (type) => yesNo(type.active)},
    {key: 'equipment', label: 'Equipo exigido', render: equipmentText},
])

/**
 * El catálogo de tipos de tarea del plan de mantenimiento (el port de TaskTypesView): lo mantiene el
 * servicio. Sus minutos estándar son los que usa la estimación de carga de una orden. El grupo funcional lo
 * filtra el servicio. De un tipo solo se cambia el equipo que exige (plataforma aislada, puesta a tierra),
 * con maintenance-supervise y maintenance-write: su botón «Equipo».
 */
export default function TaskTypesPage({title}) {
    const session = useSession()
    const canSupervise = session.hasAll(P.MAINTENANCE_WRITE, P.MAINTENANCE_SUPERVISE)
    const [group, setGroup] = useState(null)
    const [editing, setEditing] = useState(null)
    const types = useTaskTypes(group)
    const rows = inPlanOrder(types.data)
    const actions = canSupervise
        ? (type) => <RowActionButton label={`Equipo de ${type.code}`} tooltip="Equipo" icon={IconTool} onClick={() => setEditing(type)}/>
        : null
    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group align="flex-end" gap="sm">
                <Select label="Grupo funcional" placeholder="Todos" clearable w={260} data={FUNCTIONAL_GROUP.selectable()} value={group}
                        onChange={setGroup}/>
                <Text size="sm" c="dimmed" aria-live="polite">{types.data ? countText(rows.length, 'tipo', 'tipos') : ''}</Text>
            </Group>
            <DataTable ariaLabel={title} columns={COLUMNS} rows={rows} loading={types.isPending} minWidth={1080} rowActions={actions}
                       rowKey={(type) => type.code}
                       emptyText={types.isError ? 'No se ha podido leer el catálogo.' : 'No hay tipos de tarea.'}/>
            {editing && <TaskEquipmentModal type={editing} onClose={() => setEditing(null)}/>}
        </Stack>
    )
}
