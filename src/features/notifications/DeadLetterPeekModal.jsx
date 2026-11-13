import {Button, Group, Modal, Stack, Text} from '@mantine/core'
import DataTable from '../../ui/DataTable.jsx'
import {formatDateTime} from '../../ui/format.js'
import {aggregateText, deathText, inboxRecordText, peekSummary} from './adminTexts.js'

const text = (value) => value ?? ''

const COLUMNS = [
    {key: 'messageId', label: 'Mensaje', render: (row) => text(row.message?.messageId)},
    {key: 'eventType', label: 'Tipo', render: (row) => text(row.message?.eventType)},
    {key: 'routingKey', label: 'Clave de enrutado', render: (row) => text(row.message?.routingKey)},
    {key: 'exchange', label: 'Exchange', render: (row) => text(row.message?.exchange)},
    {key: 'sourceService', label: 'Origen', render: (row) => text(row.message?.sourceService)},
    {key: 'aggregate', label: 'Agregado', render: (row) => aggregateText(row.message)},
    {key: 'death', label: 'Motivo del broker', render: (row) => deathText(row.message)},
    {key: 'deadLetteredAt', label: 'Apartado', render: (row) => formatDateTime(row.message?.deadLetteredAt)},
    {
        key: 'payloadBytes', label: 'Tamaño',
        render: (row) => (typeof row.message?.payloadBytes === 'number' ? `${row.message.payloadBytes} B` : ''),
    },
    {key: 'problem', label: 'Problema', render: (row) => text(row.message?.problem)},
    {key: 'inbox', label: 'Inbox', render: (row) => inboxRecordText(row.inbox)},
]

/**
 * Los primeros mensajes de una cola de mensajes muertos, que siguen en ella (el port de
 * DeadLetterPeekDialog): de dónde venía cada uno, por qué lo apartó el broker, por qué no llegaría al
 * inbox (problem) y lo que el inbox guarda de él. Nunca el cuerpo: el servicio no lo da (un mensaje
 * descartado por su firma puede traer cualquier cosa). Mirar no cambia nada: al cerrar no se relee.
 */
export default function DeadLetterPeekModal({peek, onClose}) {
    const title = `Mensajes muertos de ${peek.source}`
    return (
        <Modal opened onClose={onClose} title={title} size="90rem">
            <Stack>
                <Text size="sm">{peekSummary(peek)}</Text>
                <DataTable ariaLabel={title} columns={COLUMNS} rows={peek.peeked} minWidth={1400}
                           rowKey={(row) => peek.peeked.indexOf(row)} emptyText="La cola no tiene mensajes."/>
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>Cerrar</Button>
                </Group>
            </Stack>
        </Modal>
    )
}
