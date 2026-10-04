import {Button, Group, Stack, Text, Title} from '@mantine/core'
import {IconPencil, IconPlus} from '@tabler/icons-react'
import {useState} from 'react'
import {isActiveTeam, teamsByCode} from '../../api/maintenance/catalogs.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import DataTable from '../../ui/DataTable.jsx'
import RowActionButton from '../../ui/RowActionButton.jsx'
import {countText} from './maintenanceTexts.js'
import TeamEditorModal from './TeamEditorModal.jsx'
import {useConfigurationNames} from './useMaintenanceNames.js'
import {useTeams} from './useMaintenance.js'

/**
 * Los equipos de mantenimiento (el port de TeamsView), sin paginar porque son pocos. Se dan de alta y
 * se modifican con maintenance-write; no se borran: se retiran desmarcando «Activo». Los paquetes en
 * los que trabaja cada uno son ids de mto-configuration, nombrados con config-read.
 */
export default function TeamsPage({title}) {
    const session = useSession()
    const canWrite = session.has(P.MAINTENANCE_WRITE)
    const names = useConfigurationNames()
    const teams = useTeams()
    const rows = teamsByCode(teams.data)
    // null: cerrado; {team: null}: alta; {team}: modificación.
    const [editing, setEditing] = useState(null)

    const columns = [
        {key: 'code', label: 'Código', render: (team) => team.code},
        {key: 'name', label: 'Nombre', render: (team) => team.name},
        {key: 'baseName', label: 'Base', render: (team) => team.baseName ?? ''},
        {key: 'vehicle', label: 'Vehículo', render: (team) => team.vehicle ?? ''},
        {
            key: 'packages', label: 'Paquetes',
            render: (team) => [...(team.executionPackageIds ?? [])].sort((left, right) => left - right).map(names.packageName).join(', '),
        },
        {key: 'active', label: 'Estado', render: (team) => (isActiveTeam(team) ? 'Activo' : 'Retirado')},
    ]

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">{teams.data ? countText(rows.length, 'equipo', 'equipos') : ''}</Text>
                {canWrite && <Button leftSection={<IconPlus size={16}/>} onClick={() => setEditing({team: null})}>Nuevo equipo</Button>}
            </Group>
            <DataTable ariaLabel={title} columns={columns} rows={rows} loading={teams.isPending}
                       emptyText={teams.isError ? 'No se ha podido leer la lista.' : 'No hay equipos.'}
                       rowActions={canWrite
                           ? (team) => <RowActionButton label={`Modificar ${team.code}`} tooltip="Modificar" icon={IconPencil}
                                                        onClick={() => setEditing({team})}/>
                           : null}/>
            {editing && <TeamEditorModal team={editing.team} packageOptions={names.packageOptions} onClose={() => setEditing(null)}/>}
        </Stack>
    )
}
