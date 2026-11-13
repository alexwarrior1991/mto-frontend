import {Button, Group, Stack, Text, Title} from '@mantine/core'
import {IconRefresh} from '@tabler/icons-react'
import {INBOX_MESSAGE_STATUS, SOURCE_CURSOR_KIND} from '../../api/notification/enums.js'
import DataTable from '../../ui/DataTable.jsx'
import {formatDateTime} from '../../ui/format.js'
import {leaseText, sourcesSummary} from './adminTexts.js'
import {useSourcesStatus} from './useNotifications.js'

const INBOX_COLUMNS = [
    {key: 'sourceService', label: 'Fuente', render: (row) => row.sourceService ?? ''},
    {key: 'status', label: 'Estado', render: (row) => INBOX_MESSAGE_STATUS.label(row.status)},
    {key: 'total', label: 'Mensajes', render: (row) => row.total ?? ''},
]

const CURSOR_COLUMNS = [
    {key: 'kind', label: 'Lector', render: (row) => SOURCE_CURSOR_KIND.label(row.kind)},
    {key: 'lastEventTime', label: 'Leído hasta', render: (row) => formatDateTime(row.lastEventTime)},
    {key: 'lastPollAt', label: 'Último sondeo', render: (row) => formatDateTime(row.lastPollAt)},
    {key: 'lastSuccessAt', label: 'Último éxito', render: (row) => formatDateTime(row.lastSuccessAt)},
    {key: 'lease', label: 'Arrendado por', render: (row) => leaseText(row)},
    {key: 'lastError', label: 'Último error', render: (row) => row.lastError ?? ''},
]

/**
 * Cómo están las fuentes (GET /admin/sources, el port de AdminSourcesPanel): cuántos mensajes de cada
 * fuente de RabbitMQ hay en el inbox y en qué estado, hasta dónde ha leído el lector de Keycloak y quién
 * lo tiene arrendado, cuántas ráfagas siguen abiertas y cuántas entregas hay en cada estado. Son las
 * cifras del servicio: aquí no se suma nada. Se vuelve a pedir con «Actualizar», sin sondeo; un fallo se
 * avisa y deja el resumen y las dos tablas vacíos.
 */
export default function AdminSourcesPanel() {
    const sources = useSourcesStatus()
    const status = sources.isError ? null : sources.data
    const empty = sources.isError ? 'No se ha podido leer el estado de las fuentes.' : null

    return (
        <Stack>
            <Group justify="space-between" align="center">
                <Text size="sm" aria-live="polite">{status ? sourcesSummary(status) : ''}</Text>
                <Button variant="default" leftSection={<IconRefresh size={16}/>} loading={sources.isFetching}
                        onClick={() => void sources.refetch()}>
                    Actualizar
                </Button>
            </Group>
            <Title order={4}>Inbox por fuente y estado</Title>
            <DataTable ariaLabel="Inbox por fuente y estado" columns={INBOX_COLUMNS} rows={status?.inbox ?? []} loading={sources.isPending}
                       rowKey={(row) => `${row.sourceService}|${row.status}`} emptyText={empty ?? 'El inbox está vacío.'}/>
            <Title order={4}>Lector de Keycloak</Title>
            <DataTable ariaLabel="Lector de Keycloak" columns={CURSOR_COLUMNS} rows={status?.cursors ?? []} loading={sources.isPending}
                       rowKey={(row) => row.kind} emptyText={empty ?? 'Ningún lector ha leído todavía.'} minWidth={900}/>
        </Stack>
    )
}
