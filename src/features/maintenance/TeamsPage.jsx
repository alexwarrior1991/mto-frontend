import {Button, Group, Stack, Text, Title} from '@mantine/core'
import {IconPencil, IconPlus, IconSitemap, IconTrain} from '@tabler/icons-react'
import {useState} from 'react'
import {useNavigate} from 'react-router'
import {isActiveTeam, isSynchronizedTeam, teamsByCode} from '../../api/maintenance/catalogs.js'
import {personLabel} from '../../api/resources/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import DataTable from '../../ui/DataTable.jsx'
import RowActionButton from '../../ui/RowActionButton.jsx'
import {useConfigurationNames} from '../infrastructure/useConfigurationNames.js'
import {unitPath, vehiclePath} from '../resources/resourcesRoutes.js'
import {countText} from './maintenanceTexts.js'
import TeamEditorModal from './TeamEditorModal.jsx'
import {useTeams} from './useMaintenance.js'

/**
 * Los equipos de mantenimiento (el port de TeamsView), sin paginar porque son pocos. Los locales se dan
 * de alta y se modifican con maintenance-write; no se borran: se retiran desmarcando «Activo». Los que
 * llegan de mto-resources se leen: su fila lleva a su unidad del organigrama y a su vehículo (con
 * resources-read) en vez de a «Modificar», que el servicio rechazaría con 409 TEA-001. Los paquetes en
 * los que trabaja cada uno son ids de mto-configuration, nombrados con config-read.
 */
export default function TeamsPage({title}) {
    const session = useSession()
    const canWrite = session.has(P.MAINTENANCE_WRITE)
    const readsResources = session.has(P.RESOURCES_READ)
    const navigate = useNavigate()
    const names = useConfigurationNames()
    const teams = useTeams()
    const rows = teamsByCode(teams.data)
    // null: cerrado; {team: null}: alta; {team}: modificación.
    const [editing, setEditing] = useState(null)

    const columns = [
        {key: 'code', label: 'Código', render: (team) => team.code},
        {key: 'name', label: 'Nombre', render: (team) => team.name},
        {key: 'origin', label: 'Origen', render: (team) => (isSynchronizedTeam(team) ? 'mto-resources' : 'Local')},
        {key: 'leader', label: 'Jefe', render: (team) => personLabel(team.leader)},
        {key: 'supervisor', label: 'Supervisor', render: (team) => personLabel(team.supervisor)},
        {key: 'members', label: 'Linemen', render: (team) => (isSynchronizedTeam(team) ? String((team.members ?? []).length) : '')},
        {key: 'baseName', label: 'Base', render: (team) => team.baseName ?? ''},
        {key: 'vehicle', label: 'Vehículo', render: (team) => team.vehicle ?? ''},
        {
            key: 'packages', label: 'Paquetes',
            render: (team) => [...(team.executionPackageIds ?? [])].sort((left, right) => left - right).map(names.packageName).join(', '),
        },
        {key: 'active', label: 'Estado', render: (team) => (isActiveTeam(team) ? 'Activo' : 'Retirado')},
    ]
    const actions = (team) => {
        if (isSynchronizedTeam(team)) {
            // Se cambia en mto-resources: aquí se ofrece ir allí, si se puede leer.
            return (
                <>
                    {readsResources && team.sourceEntityId && (
                        <RowActionButton label={`Abrir ${team.code} en el organigrama`} tooltip="Abrir en el organigrama" icon={IconSitemap}
                                         onClick={() => navigate(unitPath(team.sourceEntityId))}/>
                    )}
                    {readsResources && team.defaultVehicleId && (
                        <RowActionButton label={`Abrir el vehículo de ${team.code}`} tooltip="Abrir su vehículo" icon={IconTrain}
                                         onClick={() => navigate(vehiclePath(team.defaultVehicleId))}/>
                    )}
                </>
            )
        }
        return canWrite
            ? <RowActionButton label={`Modificar ${team.code}`} tooltip="Modificar" icon={IconPencil} onClick={() => setEditing({team})}/>
            : null
    }

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">{teams.data ? countText(rows.length, 'equipo', 'equipos') : ''}</Text>
                {canWrite && <Button leftSection={<IconPlus size={16}/>} onClick={() => setEditing({team: null})}>Nuevo equipo</Button>}
            </Group>
            <DataTable ariaLabel={title} columns={columns} rows={rows} loading={teams.isPending}
                       emptyText={teams.isError ? 'No se ha podido leer la lista.' : 'No hay equipos.'}
                       rowActions={canWrite || readsResources ? actions : null} minWidth={1100}/>
            {editing && <TeamEditorModal team={editing.team} packageOptions={names.packageOptions} onClose={() => setEditing(null)}/>}
        </Stack>
    )
}
