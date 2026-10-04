import {Button, Group, Select, Stack, Text} from '@mantine/core'
import {IconCircleMinus, IconPlus} from '@tabler/icons-react'
import {useState} from 'react'
import DataTable from '../../ui/DataTable.jsx'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import {profileOptionLabel} from './userTexts.js'
import {useAssignedProfiles, useProfileAssignment, useProfileCatalogue} from './useUsers.js'

const COLUMNS = [
    {key: 'name', label: 'Perfil', render: (profile) => profile.name},
    {key: 'description', label: 'Descripción', render: (profile) => profile.description ?? ''},
]

/**
 * La pestaña «Perfiles» de la ficha (el port de UserProfilesPanel): los perfiles asignados a la
 * persona y, con users-profiles-write, asignar y quitar. Lo que se pinta después es la lista que
 * devuelve el servicio, sin volver a pedirla. Quitar no pide confirmación: se vuelve a asignar igual.
 */
export default function UserProfilesPanel({userId, canWrite}) {
    const assigned = useAssignedProfiles(userId)
    const catalogue = useProfileCatalogue({enabled: canWrite})
    const changing = useProfileAssignment(userId)
    const [chosen, setChosen] = useState(null)

    const assignedNames = new Set((assigned.data ?? []).map((profile) => profile.name))
    // Solo lo que falta: volver a asignar lo asignado no hace nada en el servicio, pero confunde.
    const options = (catalogue.data ?? [])
        .filter((profile) => !assignedNames.has(profile.name))
        .map((profile) => ({value: profile.name, label: profileOptionLabel(profile)}))

    const assign = () => changing.mutate({name: chosen, assign: true}, {
        onSuccess: () => {
            notifySuccess(`Perfil ${chosen} asignado`)
            setChosen(null)
        },
    })
    const remove = (profile) => changing.mutate({name: profile.name, assign: false}, {
        onSuccess: () => notifySuccess(`Perfil ${profile.name} quitado`),
    })

    return (
        <Stack>
            <Text size="sm">
                Un perfil es un rol compuesto de realm (mto-…) que concede roles de cliente. Aquí se ven las asignaciones directas:
                quien tiene un rol por un perfil aparece en el perfil, no en el rol.
            </Text>
            <DataTable ariaLabel="Perfiles asignados" columns={COLUMNS} rows={assigned.data ?? []} loading={assigned.isPending}
                       emptyText={assigned.isError ? 'No se han podido leer los perfiles.' : 'Sin perfiles.'} rowKey={(profile) => profile.name}
                       rowActions={canWrite
                           ? (profile) => (
                               <RowActionButton label={`Quitar el perfil ${profile.name}`} tooltip="Quitar el perfil" icon={IconCircleMinus}
                                                color="red" onClick={() => remove(profile)}/>
                           )
                           : null}/>
            {canWrite && (
                <Group align="flex-end" gap="sm">
                    <Select label="Perfil" w={360} searchable clearable nothingFoundMessage="No queda ninguno por asignar"
                            placeholder={catalogue.isPending ? 'Cargando…' : undefined} data={options} value={chosen} onChange={setChosen}/>
                    <Button leftSection={<IconPlus size={16}/>} disabled={!chosen} loading={changing.isPending} onClick={assign}>
                        Asignar
                    </Button>
                </Group>
            )}
        </Stack>
    )
}
