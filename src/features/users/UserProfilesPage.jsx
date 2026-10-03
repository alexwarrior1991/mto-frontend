import {Grid, Stack, Text, TextInput, Title} from '@mantine/core'
import {IconEye, IconSearch} from '@tabler/icons-react'
import {useState} from 'react'
import {listProfileMembers} from '../../api/users/profiles.js'
import DataTable from '../../ui/DataTable.jsx'
import RowActionButton from '../../ui/RowActionButton.jsx'
import {normalizeText} from '../catalogues/catalogueRows.js'
import MembersSection from './MembersSection.jsx'
import {realmRolesText, roleRows, shownCountText} from './userTexts.js'
import {useProfile, useProfileCatalogue, usersKey} from './useUsers.js'

const COLUMNS = [
    {key: 'name', label: 'Perfil', render: (profile) => profile.name},
    {key: 'description', label: 'Descripción', render: (profile) => profile.description ?? ''},
]

const GRANT_COLUMNS = [
    {key: 'clientId', label: 'Cliente', render: (row) => row.clientId},
    {key: 'role', label: 'Rol', render: (row) => row.role},
]

/**
 * usuarios/perfiles: el catálogo de perfiles, de solo lectura (el port de UserProfilesView). El
 * catálogo llega entero, así que el filtro es local, sin mayúsculas ni tildes. Al elegir un perfil se
 * ve lo que concede y quién lo tiene por asignación directa. Filtrar quita la selección.
 */
export default function UserProfilesPage() {
    const profiles = useProfileCatalogue()
    const [filter, setFilter] = useState('')
    const [chosen, setChosen] = useState(null)

    // Como en el backoffice, filtrar quita la selección: lo elegido puede no estar entre lo que se ve.
    const changeFilter = (value) => {
        setFilter(value)
        setChosen(null)
    }

    const all = profiles.data ?? []
    const needle = normalizeText(filter).trim()
    const shown = needle
        ? all.filter((profile) => normalizeText(profile.name).includes(needle) || normalizeText(profile.description).includes(needle))
        : all

    return (
        <Stack>
            <Title order={2}>Perfiles de usuario</Title>
            <Grid gutter="lg">
                <Grid.Col span={{base: 12, md: 5}}>
                    <Stack gap="sm">
                        <TextInput aria-label="Filtrar por nombre o descripción" placeholder="Filtrar por nombre o descripción"
                                   leftSection={<IconSearch size={16}/>} value={filter} onChange={(event) => changeFilter(event.currentTarget.value)}/>
                        <Text size="sm" c="dimmed" aria-live="polite">
                            {profiles.data ? shownCountText(shown.length, all.length, ['perfil', 'perfiles']) : ''}
                        </Text>
                        <DataTable ariaLabel="Perfiles" columns={COLUMNS} rows={shown} loading={profiles.isPending} minWidth={320}
                                   emptyText={profiles.isError ? 'No se ha podido leer el catálogo.' : 'Ningún perfil.'}
                                   rowKey={(profile) => profile.name} selectedKey={chosen}
                                   rowActions={(profile) => (
                                       <RowActionButton label={`Ver ${profile.name}`} tooltip="Ver lo que concede y quién lo tiene"
                                                        icon={IconEye} onClick={() => setChosen(profile.name)}/>
                                   )}/>
                    </Stack>
                </Grid.Col>
                <Grid.Col span={{base: 12, md: 7}}>
                    {chosen
                        ? <ProfileDetail key={chosen} name={chosen}/>
                        : <Text size="sm" c="dimmed">Elige un perfil para ver lo que concede y quién lo tiene.</Text>}
                </Grid.Col>
            </Grid>
        </Stack>
    )
}

function ProfileDetail({name}) {
    const profile = useProfile(name)
    if (!profile.data) {
        return <Text size="sm" c="dimmed">{profile.isError ? 'No se ha podido leer el perfil.' : 'Cargando…'}</Text>
    }
    const current = profile.data
    return (
        <Stack>
            <Title order={3}>{current.name}</Title>
            {current.description && <Text size="sm">{current.description}</Text>}
            <Title order={4}>Lo que concede</Title>
            <DataTable ariaLabel={`Lo que concede ${current.name}`} columns={GRANT_COLUMNS} rows={roleRows(current.clientRoles)}
                       emptyText="Ningún rol de cliente." rowKey={(row) => `${row.clientId}/${row.role}`} minWidth={320}/>
            <Text size="sm" c="dimmed">{realmRolesText(current.realmRoles)}</Text>
            <MembersSection title={`Miembros de ${current.name}`} queryKey={usersKey('profile-members', current.name)}
                            fetchPage={(range, options) => listProfileMembers(current.name, range, options)}
                            note="Solo asignaciones directas del perfil. Quien tiene sus roles por otro camino no aparece."/>
        </Stack>
    )
}
