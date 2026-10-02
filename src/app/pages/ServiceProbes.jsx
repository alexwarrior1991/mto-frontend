import {Button, Code, Group, Table, Text, ThemeIcon, Title} from '@mantine/core'
import {IconCheck} from '@tabler/icons-react'
import {useMutation} from '@tanstack/react-query'
import {ApiError} from '../../api/errors.js'
import {runProbe, SERVICE_PROBES} from '../../api/probes.js'
import {useSession} from '../../auth/sessionContext.js'
import ErrorNotice from '../../ui/errors/ErrorNotice.jsx'
import {errorMessage} from '../../ui/errors/messages.js'

/**
 * Una lectura barata por servicio, a traves del gateway y con el token de la persona, para ver de un
 * vistazo que el circuito entero funciona. Solo se ofrece con el permiso de leer ese servicio.
 */
export default function ServiceProbes() {
    const session = useSession()

    return (
        <section aria-labelledby="home-probes">
            <Title order={4} id="home-probes">Comprobar servicios</Title>
            <Text size="sm" c="dimmed">Una lectura por servicio, a través del gateway y con tu token.</Text>
            <Table mt="xs" withTableBorder verticalSpacing="xs">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Servicio</Table.Th>
                        <Table.Th>Permiso</Table.Th>
                        <Table.Th>Resultado</Table.Th>
                        <Table.Th/>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {SERVICE_PROBES.map((probe) => (
                        <ProbeRow key={probe.service} probe={probe} allowed={session.has(probe.permission)}/>
                    ))}
                </Table.Tbody>
            </Table>
        </section>
    )
}

function ProbeRow({probe, allowed}) {
    const probing = useMutation({mutationFn: () => runProbe(probe)})

    return (
        <Table.Tr data-service={probe.service}>
            <Table.Td>{probe.service}</Table.Td>
            <Table.Td><Code>{probe.permission}</Code></Table.Td>
            <Table.Td>
                {probing.isSuccess && (
                    <Group gap={6}>
                        <ThemeIcon size={20} radius="xl" color="teal" variant="light"><IconCheck size={14}/></ThemeIcon>
                        <Text size="sm">Responde</Text>
                    </Group>
                )}
                {probing.isError && (
                    <ErrorNotice message={errorMessage(probing.error)}
                                 reference={probing.error instanceof ApiError ? probing.error.reference : null}/>
                )}
            </Table.Td>
            <Table.Td>
                {allowed
                    ? (
                        <Button size="xs" variant="light" loading={probing.isPending} onClick={() => probing.mutate()}>
                            Comprobar
                        </Button>
                    )
                    : <Text size="xs" c="dimmed">Sin permiso</Text>}
            </Table.Td>
        </Table.Tr>
    )
}
