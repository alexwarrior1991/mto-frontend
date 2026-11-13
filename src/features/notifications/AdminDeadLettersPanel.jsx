import {Button, Group, Stack, Text} from '@mantine/core'
import {IconEye, IconRefresh, IconRotateClockwise} from '@tabler/icons-react'
import {useState} from 'react'
import {hasMessages} from '../../api/notification/admin.js'
import DataTable from '../../ui/DataTable.jsx'
import RowActionButton from '../../ui/RowActionButton.jsx'
import DeadLetterPeekModal from './DeadLetterPeekModal.jsx'
import DeadLetterReprocessModal from './DeadLetterReprocessModal.jsx'
import {useDeadLetterQueues, usePeekDeadLetters} from './useNotifications.js'

const NO_QUEUE = 'Sin cola en el broker'

const COLUMNS = [
    {key: 'source', label: 'Fuente', render: (row) => row.source ?? ''},
    {key: 'queue', label: 'Cola', render: (row) => row.queue ?? ''},
    {key: 'deadLetterQueue', label: 'Cola de mensajes muertos', render: (row) => row.deadLetterQueue ?? ''},
    {key: 'messages', label: 'Mensajes', render: (row) => (typeof row.messages === 'number' ? row.messages : NO_QUEUE)},
]

/**
 * Las colas de mensajes muertos (DLQ) de las fuentes de RabbitMQ (GET /admin/dead-letters, el port de
 * AdminDeadLettersPanel): lo que no se pudo aplicar y el broker apartó.
 *
 * - Por fuente, «Mirar» enseña los primeros mensajes sin sacarlos y «Reprocesar» los pasa otra vez por
 *   su consumidor. Las dos solo donde hay algo (hasMessages): una cola que el broker no tiene sería el
 *   409 SRC-409 del servicio, y una vacía no tiene nada.
 * - Con el broker apagado en el despliegue (enabled: false) se dice, sin tabla ni acciones.
 * - Las fuentes no se copian aquí: se pinta lo que llega.
 * - Mirar es una llamada; si falla, se avisa y no se abre nada. Una pasada de reproceso que termina bien
 *   relee las colas.
 */
export default function AdminDeadLettersPanel() {
    const queues = useDeadLetterQueues()
    const peek = usePeekDeadLetters()
    const [peeked, setPeeked] = useState(null)
    const [peeking, setPeeking] = useState(null)
    const [reprocessing, setReprocessing] = useState(null)

    const data = queues.isError ? null : queues.data
    const disabled = data !== null && data !== undefined && !data.enabled

    const look = async (queue) => {
        setPeeking(queue.source)
        const result = await peek(queue.source)
        setPeeking(null)
        setPeeked(result)
    }

    const actions = (queue) => hasMessages(queue) && (
        <>
            <RowActionButton label={`Mirar los mensajes de ${queue.source}`} tooltip="Mirar" icon={IconEye}
                             disabled={peeking !== null} onClick={() => void look(queue)}/>
            <RowActionButton label={`Reprocesar los mensajes de ${queue.source}`} tooltip="Reprocesar" icon={IconRotateClockwise}
                             onClick={() => setReprocessing(queue)}/>
        </>
    )

    return (
        <Stack>
            <Group justify="space-between" align="center">
                <Text size="sm" c="dimmed">
                    Lo que una fuente publicó y no se pudo aplicar. Mirar no saca nada de la cola; reprocesar sí.
                </Text>
                <Button variant="default" leftSection={<IconRefresh size={16}/>} loading={queues.isFetching}
                        onClick={() => void queues.refetch()}>
                    Actualizar
                </Button>
            </Group>
            {disabled
                ? <Text size="sm">RabbitMQ está apagado en este despliegue: no hay colas de mensajes muertos que mirar ni reprocesar.</Text>
                : (
                    <DataTable ariaLabel="Colas de mensajes muertos" columns={COLUMNS} rows={data?.queues ?? []} loading={queues.isPending}
                               rowKey={(row) => row.source} rowActions={actions} minWidth={720}
                               emptyText={queues.isError ? 'No se han podido leer las colas.' : 'No hay ninguna fuente de RabbitMQ.'}/>
                )}
            {peeked && <DeadLetterPeekModal peek={peeked} onClose={() => setPeeked(null)}/>}
            {reprocessing && <DeadLetterReprocessModal queue={reprocessing} onClose={() => setReprocessing(null)}/>}
        </Stack>
    )
}
