import {Grid, Group, Select, Stack, Text, TextInput, Title} from '@mantine/core'
import {IconEye, IconSearch} from '@tabler/icons-react'
import {useState} from 'react'
import {clientLabel, listClientRoleMembers} from '../../api/users/roles.js'
import DataTable from '../../ui/DataTable.jsx'
import {yesNo} from '../../ui/format.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import {normalizeText} from '../catalogues/catalogueRows.js'
import MembersSection from './MembersSection.jsx'
import {shownCountText} from './userTexts.js'
import {useClientRoles, useClients, usersKey} from './useUsers.js'

const COLUMNS = [
    {key: 'name', label: 'Rol', render: (role) => role.name},
    {key: 'description', label: 'Descripción', render: (role) => role.description ?? ''},
    {key: 'composite', label: 'Compuesto', render: (role) => yesNo(role.composite)},
]

/**
 * usuarios/roles: los roles de cada cliente, de solo lectura (el port de ClientRolesView). Se elige un
 * cliente (los protegidos del realm no salen), sus roles se filtran en local y, al elegir uno, se ve
 * quién lo tiene por asignación directa: quien lo tiene por un perfil aparece en el perfil.
 */
export default function ClientRolesPage() {
    const clients = useClients()
    const [clientId, setClientId] = useState(null)
    const [filter, setFilter] = useState('')
    const [chosen, setChosen] = useState(null)
    const roles = useClientRoles(clientId)

    const all = roles.data ?? []
    const needle = normalizeText(filter).trim()
    const shown = needle
        ? all.filter((role) => normalizeText(role.name).includes(needle) || normalizeText(role.description).includes(needle))
        : all

    const chooseClient = (value) => {
        setClientId(value)
        setChosen(null)
    }
    // Como en el backoffice, filtrar quita la selección: lo elegido puede no estar entre lo que se ve.
    const changeFilter = (value) => {
        setFilter(value)
        setChosen(null)
    }

    return (
        <Stack>
            <Title order={2}>Roles de cliente</Title>
            <Grid gutter="lg">
                <Grid.Col span={{base: 12, md: 6}}>
                    <Stack gap="sm">
                        <Group gap="sm" align="flex-end">
                            <Select label="Cliente" w={260} searchable placeholder={clients.isPending ? 'Cargando…' : 'Elige un cliente'}
                                    data={(clients.data ?? []).map((client) => ({value: client.clientId, label: clientLabel(client)}))}
                                    value={clientId} onChange={chooseClient}/>
                            <TextInput aria-label="Filtrar por nombre o descripción" placeholder="Filtrar por nombre o descripción"
                                       leftSection={<IconSearch size={16}/>} value={filter}
                                       onChange={(event) => changeFilter(event.currentTarget.value)}/>
                        </Group>
                        <Text size="sm" c="dimmed" aria-live="polite">
                            {clientId && roles.data ? shownCountText(shown.length, all.length, ['rol', 'roles']) : ''}
                        </Text>
                        <DataTable ariaLabel="Roles" columns={COLUMNS} rows={shown} loading={Boolean(clientId) && roles.isPending}
                                   minWidth={360} rowKey={(role) => role.name} selectedKey={chosen}
                                   emptyText={emptyText(clientId, roles)}
                                   rowActions={(role) => (
                                       <RowActionButton label={`Ver quién tiene ${role.name}`} tooltip="Ver quién lo tiene" icon={IconEye}
                                                        onClick={() => setChosen(role.name)}/>
                                   )}/>
                    </Stack>
                </Grid.Col>
                <Grid.Col span={{base: 12, md: 6}}>
                    {clientId && chosen
                        ? (
                            <MembersSection key={`${clientId}/${chosen}`} title={`Miembros de ${clientId} / ${chosen}`}
                                            queryKey={usersKey('role-members', clientId, chosen)}
                                            fetchPage={(range, options) => listClientRoleMembers(clientId, chosen, range, options)}
                                            note="Solo asignaciones directas del rol. Quien lo tiene por un perfil aparece en el perfil, no aquí."/>
                        )
                        : <Text size="sm" c="dimmed">Elige un rol para ver quién lo tiene.</Text>}
                </Grid.Col>
            </Grid>
        </Stack>
    )
}

function emptyText(clientId, roles) {
    if (!clientId) {
        return 'Elige un cliente para ver sus roles.'
    }
    return roles.isError ? 'No se han podido leer los roles.' : 'Ningún rol.'
}
