import {Button, Checkbox, Group, Stack, Text, Title} from '@mantine/core'
import {IconArrowRight, IconPlus} from '@tabler/icons-react'
import {useState} from 'react'
import {useNavigate} from 'react-router'
import {UNIT_KIND, WORK_DISCIPLINE} from '../../api/resources/enums.js'
import {flattenTree} from '../../api/resources/units.js'
import {unitLabel} from '../../api/resources/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import TreeTable from '../../ui/TreeTable.jsx'
import {useConfigurationNames} from '../maintenance/useMaintenanceNames.js'
import {unitPath} from './resourcesRoutes.js'
import {countText, headText, linemenText, unitState} from './resourcesTexts.js'
import UnitEditorModal from './UnitEditorModal.jsx'
import {useUnitTree} from './useResources.js'

/**
 * El organigrama de mto-resources (el port de OrganizationView), entero y desplegado: proyecto,
 * departamento, jefatura de supervisores, supervisión y equipo, con su jefe o «Vacante» y, en un
 * equipo, sus linemen frente a la regla de 2 a 6. Una fila se abre con doble clic o con su botón;
 * «Nueva unidad debajo» da de alta con ese padre (resources-write). Las inactivas solo se ven si se
 * piden.
 */
export default function OrganizationPage({title}) {
    const session = useSession()
    const canWrite = session.has(P.RESOURCES_WRITE)
    const navigate = useNavigate()
    const names = useConfigurationNames()
    const [includeInactive, setIncludeInactive] = useState(false)
    const tree = useUnitTree(includeInactive)
    const roots = tree.data ?? []
    // null: cerrado; {parent}: alta, con ese padre o sin él.
    const [creating, setCreating] = useState(null)

    const packagesOf = (unit) => [...(unit.executionPackageIds ?? [])].sort((a, b) => a - b).map(names.packageName).join(', ')
    const columns = [
        {key: 'unit', label: 'Unidad', render: unitLabel},
        {key: 'kind', label: 'Nivel', render: (unit) => UNIT_KIND.label(unit.kind)},
        {key: 'discipline', label: 'Disciplina', render: (unit) => (unit.discipline ? WORK_DISCIPLINE.label(unit.discipline) : '')},
        {key: 'head', label: 'Jefe', render: (unit) => headText(unit.head)},
        {key: 'linemen', label: 'Linemen', render: linemenText},
        {key: 'packages', label: 'EP', render: packagesOf},
        {key: 'active', label: 'Estado', render: unitState},
    ]
    const open = (unit) => navigate(unitPath(unit.id))
    const actions = (unit) => (
        <>
            <RowActionButton label={`Abrir ${unit.code}`} tooltip="Abrir" icon={IconArrowRight} onClick={() => open(unit)}/>
            {canWrite && unit.active === true && unit.kind !== 'TEAM' && UNIT_KIND.isKnown(unit.kind) && (
                <RowActionButton label={`Nueva unidad debajo de ${unit.code}`} tooltip="Nueva unidad debajo" icon={IconPlus}
                                 onClick={() => setCreating({parent: unit})}/>
            )}
        </>
    )

    const count = flattenTree(roots).length
    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group justify="space-between" align="flex-end">
                <Group gap="md" align="center">
                    <Checkbox label="Ver también las inactivas" checked={includeInactive}
                              onChange={(event) => setIncludeInactive(event.currentTarget.checked)}/>
                    <Text size="sm" c="dimmed" aria-live="polite">{tree.data ? countText(count, 'unidad', 'unidades') : ''}</Text>
                </Group>
                {canWrite && <Button leftSection={<IconPlus size={16}/>} onClick={() => setCreating({parent: null})}>Nueva unidad</Button>}
            </Group>
            <TreeTable ariaLabel={title} roots={roots} columns={columns} rowLabel={unitLabel} rowActions={actions} onRowDoubleClick={open}
                       loading={tree.isPending} emptyText={tree.isError ? 'No se ha podido leer el organigrama.' : 'No hay unidades.'}
                       minWidth={1000}/>
            {creating && <UnitEditorModal unit={null} parent={creating.parent} tree={roots} onClose={() => setCreating(null)}/>}
        </Stack>
    )
}
