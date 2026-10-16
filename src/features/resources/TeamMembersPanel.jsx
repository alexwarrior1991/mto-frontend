import {Button, Checkbox, Group, Stack, Text, Tooltip} from '@mantine/core'
import {IconLogout, IconPlus, IconSwitchHorizontal} from '@tabler/icons-react'
import {useState} from 'react'
import {MAX_LINEMEN, MIN_LINEMEN, PERSON_CATEGORY} from '../../api/resources/enums.js'
import {currentMembers} from '../../api/resources/units.js'
import {personLabel} from '../../api/resources/values.js'
import DataTable from '../../ui/DataTable.jsx'
import {formatDate} from '../../ui/format.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import {AddMemberModal, LeaveTeamModal} from './MemberModals.jsx'
import TeamMembersModal from './TeamMembersModal.jsx'
import {useUnitMembers} from './useResources.js'

const FULL = 'Un equipo no pasa de 6 linemen: saca a uno antes o cambia los linemen de una vez'
const SHORT = 'Un equipo no baja de 2 linemen: añade otro antes o cambia los linemen de una vez'

/**
 * Los linemen de un equipo (el port de TeamMembersPanel), con la regla de 2 a 6 a la vista: «Añadir
 * lineman» se deshabilita con 6 y «Sale del equipo» con 2, porque el servicio los rechazaría (409
 * UNI-001); cambiar varios a la vez es «Cambiar los linemen», la lista entera de una vez (PUT
 * /members). Con «Ver también los que salieron» se ve quién estuvo y hasta cuándo.
 *
 * @param {boolean} canWrite resources-write y el equipo activo
 */
export default function TeamMembersPanel({team, canWrite}) {
    const [includeFormer, setIncludeFormer] = useState(false)
    const members = useUnitMembers(team.id, includeFormer)
    const rows = members.data ?? []
    const current = currentMembers(rows)
    // 'add', 'replace' o {leave: miembro}.
    const [dialog, setDialog] = useState(null)
    const close = () => setDialog(null)
    const full = current.length >= MAX_LINEMEN
    const short = current.length <= MIN_LINEMEN

    const columns = [
        {key: 'code', label: 'Código', render: (member) => member.person?.code ?? ''},
        {key: 'name', label: 'Nombre', render: (member) => member.person?.fullName ?? ''},
        {key: 'category', label: 'Categoría', render: (member) => PERSON_CATEGORY.label(member.person?.category)},
        {key: 'username', label: 'Usuario', render: (member) => member.person?.username ?? ''},
        {key: 'joinedOn', label: 'Entró', render: (member) => (member.joinedOn ? formatDate(member.joinedOn) : '')},
        {key: 'leftOn', label: 'Salió', render: (member) => (member.leftOn ? formatDate(member.leftOn) : '')},
    ]
    const actions = (member) => (canWrite && !member.leftOn
        ? (
            <RowActionButton label={`Sale del equipo ${personLabel(member.person)}`} tooltip={short ? SHORT : 'Sale del equipo'} icon={IconLogout}
                             disabled={short} onClick={() => setDialog({leave: member})}/>
        )
        : null)

    return (
        <Stack>
            <Group justify="space-between" align="center">
                <Group gap="md" align="center">
                    <Checkbox label="Ver también los que salieron" checked={includeFormer} onChange={(event) => setIncludeFormer(event.currentTarget.checked)}/>
                    <Text size="sm" c="dimmed" aria-live="polite">{members.data ? `${current.length} de 2 a 6 linemen` : ''}</Text>
                </Group>
                {canWrite && (
                    <Group gap="sm">
                        <Tooltip label={FULL} disabled={!full}>
                            <Button leftSection={<IconPlus size={16}/>} disabled={full} onClick={() => setDialog('add')}>Añadir lineman</Button>
                        </Tooltip>
                        <Button variant="default" leftSection={<IconSwitchHorizontal size={16}/>} onClick={() => setDialog('replace')}>
                            Cambiar los linemen
                        </Button>
                    </Group>
                )}
            </Group>
            <DataTable ariaLabel={`Linemen de ${team.code}`} columns={columns} rows={rows} loading={members.isPending}
                       emptyText={members.isError ? 'No se ha podido leer la lista.' : 'No tiene linemen.'} rowActions={canWrite ? actions : null}/>
            {dialog === 'add' && <AddMemberModal team={team} onClose={close}/>}
            {dialog === 'replace' && <TeamMembersModal team={team} current={current.map((member) => member.person)} onClose={close}/>}
            {dialog?.leave && <LeaveTeamModal team={team} member={dialog.leave} onClose={close}/>}
        </Stack>
    )
}
