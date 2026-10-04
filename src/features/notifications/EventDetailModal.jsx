import {Button, Center, Group, Loader, Modal, Stack, Table, Text, Title} from '@mantine/core'
import {errorMessage} from '../../ui/errors/messages.js'
import ErrorNotice from '../../ui/errors/ErrorNotice.jsx'
import DataTable from '../../ui/DataTable.jsx'
import {accessFields, activityFields, payloadEntries} from './notificationTexts.js'
import {useActivityEvent} from './useNotifications.js'

/**
 * Una línea del registro entera (el port de EventDetailDialog): la cabecera y el payload clave a clave,
 * tal como lo publicó la fuente y lo dejó la lista blanca del servicio. Aquí no se interpreta nada, y
 * todo se pinta como texto. La lista del registro no trae el payload, así que se pide la línea a su
 * detalle; un fallo (la línea ya no existe, ACT-404) se dice en el propio diálogo.
 */
export function ActivityEventModal({eventId, onClose}) {
    const event = useActivityEvent(eventId)
    let content
    if (event.isPending) {
        content = <Center py="xl"><Loader aria-label="Cargando la línea del registro"/></Center>
    } else if (event.isError) {
        content = <ErrorNotice message={errorMessage(event.error)} reference={event.error?.reference}/>
    } else {
        content = <EventDetail fields={activityFields(event.data)} payload={event.data.payload}/>
    }
    return (
        <Modal opened onClose={onClose} size="xl" title={event.data?.type ?? 'Línea del registro'}>
            <Stack>
                {content}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>Cerrar</Button>
                </Group>
            </Stack>
        </Modal>
    )
}

/** Un acceso entero: la lista ya lo trae con su payload, y no tiene detalle aparte. */
export function AccessEventModal({event, onClose}) {
    return (
        <Modal opened onClose={onClose} size="xl" title={event.type ?? 'Acceso'}>
            <Stack>
                <EventDetail fields={accessFields(event)} payload={event.payload}/>
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>Cerrar</Button>
                </Group>
            </Stack>
        </Modal>
    )
}

function EventDetail({fields, payload}) {
    const entries = payloadEntries(payload)
    return (
        <Stack>
            <Table withRowBorders={false} verticalSpacing={4} aria-label="Cabecera de la línea">
                <Table.Tbody>
                    {fields.map((field) => (
                        <Table.Tr key={field.label}>
                            <Table.Th scope="row" w={170} fw={400} c="dimmed">{field.label}</Table.Th>
                            <Table.Td style={{overflowWrap: 'anywhere'}}>{field.value}</Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
            <Title order={4}>{entries.length > 0 ? 'Datos publicados' : 'Sin datos publicados'}</Title>
            {entries.length > 0
                ? (
                    <DataTable ariaLabel="Datos publicados" rows={entries} rowKey={(entry) => entry.key} minWidth={360}
                               columns={[
                                   {key: 'key', label: 'Clave', render: (entry) => entry.key},
                                   {key: 'value', label: 'Valor', render: (entry) => <Text size="sm" style={{overflowWrap: 'anywhere'}}>{entry.value}</Text>},
                               ]}/>
                )
                : null}
        </Stack>
    )
}
