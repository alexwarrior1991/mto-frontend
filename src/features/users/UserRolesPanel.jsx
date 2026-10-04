import {Button, Group, MultiSelect, Select, Stack, Text} from '@mantine/core'
import {IconCircleMinus, IconPlus} from '@tabler/icons-react'
import {useState} from 'react'
import {clientLabel} from '../../api/users/roles.js'
import DataTable from '../../ui/DataTable.jsx'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import {assignedRolesText, realmRolesText, roleRows} from './userTexts.js'
import {useAssignedRoles, useClientRoles, useClients, useRoleAssignment} from './useUsers.js'

const COLUMNS = [
    {key: 'clientId', label: 'Cliente', render: (row) => row.clientId},
    {key: 'role', label: 'Rol', render: (row) => row.role},
]

/**
 * La pestaña «Roles de cliente» de la ficha (el port de UserRolesPanel): las asignaciones directas y,
 * con users-roles-write, añadir roles de un cliente y quitarlos. Añadir es un PUT con {roles}; quitar,
 * un DELETE con el mismo cuerpo; los dos devuelven los roles de la persona como quedan, y es eso lo que
 * se pinta. Los clientes protegidos del realm ni se listan ni se asignan: el servicio no los ofrece.
 */
export default function UserRolesPanel({userId, canWrite}) {
    const assigned = useAssignedRoles(userId)
    const clients = useClients({enabled: canWrite})
    const [clientId, setClientId] = useState(null)
    const [names, setNames] = useState([])
    const clientRoles = useClientRoles(canWrite ? clientId : null)
    const changing = useRoleAssignment(userId)

    const rows = roleRows(assigned.data?.clientRoles)
    // Los roles del cliente elegido que la persona aún no tiene.
    const held = new Set(rows.filter((row) => row.clientId === clientId).map((row) => row.role))
    const roleOptions = (clientRoles.data ?? []).map((role) => role.name).filter((name) => !held.has(name))

    const chooseClient = (value) => {
        setClientId(value)
        setNames([])
    }
    const assign = () => {
        const roles = [...names].sort()
        changing.mutate({clientId, roles, assign: true}, {
            onSuccess: () => {
                notifySuccess(assignedRolesText(roles))
                setNames([])
            },
        })
    }
    const remove = (row) => changing.mutate({clientId: row.clientId, roles: [row.role], assign: false}, {
        onSuccess: () => notifySuccess(`Rol ${row.role} quitado`),
    })

    return (
        <Stack>
            <Text size="sm">Asignaciones directas de roles de cliente. Los clientes protegidos del realm no se listan ni se asignan.</Text>
            <DataTable ariaLabel="Roles de cliente asignados" columns={COLUMNS} rows={rows} loading={assigned.isPending}
                       emptyText={assigned.isError ? 'No se han podido leer los roles.' : 'Sin roles de cliente.'}
                       rowKey={(row) => `${row.clientId}/${row.role}`}
                       rowActions={canWrite
                           ? (row) => (
                               <RowActionButton label={`Quitar el rol ${row.role} de ${row.clientId}`} tooltip="Quitar el rol"
                                                icon={IconCircleMinus} color="red" onClick={() => remove(row)}/>
                           )
                           : null}/>
            {assigned.data && <Text size="sm" c="dimmed">{realmRolesText(assigned.data.realmRoles, {includesProfiles: true})}</Text>}
            {canWrite && (
                <Group align="flex-end" gap="sm">
                    <Select label="Cliente" w={280} searchable clearable placeholder={clients.isPending ? 'Cargando…' : undefined}
                            data={(clients.data ?? []).map((client) => ({value: client.clientId, label: clientLabel(client)}))}
                            value={clientId} onChange={chooseClient}/>
                    <MultiSelect label="Roles" w={360} searchable clearable disabled={!clientId}
                                 nothingFoundMessage="No queda ninguno por asignar" data={roleOptions} value={names} onChange={setNames}/>
                    <Button leftSection={<IconPlus size={16}/>} disabled={names.length === 0} loading={changing.isPending} onClick={assign}>
                        Asignar
                    </Button>
                </Group>
            )}
        </Stack>
    )
}
