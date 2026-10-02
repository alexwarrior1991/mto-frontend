import {Code, Group, List, Stack, Table, Text, ThemeIcon, Title} from '@mantine/core'
import {IconCheck, IconPoint, IconX} from '@tabler/icons-react'
import {EXPECTED_AUDIENCES} from '../../api/services.js'
import {useSession} from '../../auth/sessionContext.js'
import ServiceProbes from './ServiceProbes.jsx'

/**
 * Inicio: quien ha entrado y con que (el port de HomeView del backoffice). El diagnostico cierra el
 * circuito entero a simple vista: las seis audiencias tienen que estar en el access token, los
 * permisos son roles de cliente (nunca de realm) y cada servicio contesta a traves del gateway.
 */
export default function HomePage() {
    const session = useSession()
    const others = session.audiences.filter((audience) => !EXPECTED_AUDIENCES.includes(audience))

    return (
        <Stack gap="xl" maw={960}>
            <div>
                <Title order={2}>Inicio</Title>
                <Text>Has entrado como <strong>{session.username ?? 'nadie'}</strong>.</Text>
            </div>

            <section aria-labelledby="home-audiences">
                <Title order={4} id="home-audiences">Audiencias del access token</Title>
                <Text size="sm" c="dimmed">Si falta una, ese servicio rechaza el token.</Text>
                <List spacing={4} mt="xs" center>
                    {EXPECTED_AUDIENCES.map((audience) => {
                        const present = session.audiences.includes(audience)
                        return (
                            <List.Item key={audience} data-audience={audience} data-present={String(present)}
                                       icon={<StatusIcon ok={present}/>}>
                                <Code>{audience}</Code>{present ? '' : ' (falta)'}
                            </List.Item>
                        )
                    })}
                    {others.map((audience) => (
                        <List.Item key={audience} icon={<ThemeIcon size={20} radius="xl" color="gray" variant="light"><IconPoint size={14}/></ThemeIcon>}>
                            <Code>{audience}</Code>
                        </List.Item>
                    ))}
                </List>
            </section>

            <section aria-labelledby="home-permissions">
                <Title order={4} id="home-permissions">Permisos</Title>
                <Text size="sm" c="dimmed">Los roles de cliente de cada API: son lo único que abre pantallas y botones.</Text>
                <Table mt="xs" withTableBorder verticalSpacing="xs">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Cliente</Table.Th>
                            <Table.Th>Permisos</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {session.permissionsByClient.map(({clientId, roles}) => (
                            <Table.Tr key={clientId} data-client={clientId}>
                                <Table.Td><Code>{clientId}</Code></Table.Td>
                                <Table.Td>
                                    {roles.length > 0
                                        ? <Group gap={4}>{roles.map((role) => <Code key={role}>{role}</Code>)}</Group>
                                        : <Text size="sm" c="dimmed">ninguno</Text>}
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </section>

            <section aria-labelledby="home-realm-roles">
                <Title order={4} id="home-realm-roles">Roles de realm</Title>
                <Text size="sm" c="dimmed">
                    Solo informativos: un rol de realm no concede ningún permiso en esta aplicación.
                </Text>
                <Group gap={4} mt="xs">
                    {session.realmRoles.length > 0
                        ? session.realmRoles.map((role) => <Code key={role}>{role}</Code>)
                        : <Text size="sm" c="dimmed">ninguno</Text>}
                </Group>
            </section>

            <ServiceProbes/>
        </Stack>
    )
}

function StatusIcon({ok}) {
    return (
        <ThemeIcon size={20} radius="xl" color={ok ? 'teal' : 'red'} variant="light">
            {ok ? <IconCheck size={14} aria-label="presente"/> : <IconX size={14} aria-label="falta"/>}
        </ThemeIcon>
    )
}
