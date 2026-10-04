import {Group, Select, Stack, Text, Title} from '@mantine/core'
import {useState} from 'react'
import {inPlanOrder} from '../../api/maintenance/catalogs.js'
import {FUNCTIONAL_GROUP, TASK_UNIT} from '../../api/maintenance/enums.js'
import DataTable from '../../ui/DataTable.jsx'
import {formatQuantity, yesNo} from '../../ui/format.js'
import {countText} from './maintenanceTexts.js'
import {useTaskTypes} from './useMaintenance.js'

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
])

/**
 * El catálogo de tipos de tarea del plan de mantenimiento (el port de TaskTypesView), de solo lectura:
 * lo mantiene el servicio. Sus minutos estándar son los que usa la estimación de carga de una orden. El
 * grupo funcional lo filtra el servicio.
 */
export default function TaskTypesPage({title}) {
    const [group, setGroup] = useState(null)
    const types = useTaskTypes(group)
    const rows = inPlanOrder(types.data)
    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group align="flex-end" gap="sm">
                <Select label="Grupo funcional" placeholder="Todos" clearable w={260} data={FUNCTIONAL_GROUP.selectable()} value={group}
                        onChange={setGroup}/>
                <Text size="sm" c="dimmed" aria-live="polite">{types.data ? countText(rows.length, 'tipo', 'tipos') : ''}</Text>
            </Group>
            <DataTable ariaLabel={title} columns={COLUMNS} rows={rows} loading={types.isPending} minWidth={960}
                       emptyText={types.isError ? 'No se ha podido leer el catálogo.' : 'No hay tipos de tarea.'}/>
        </Stack>
    )
}
