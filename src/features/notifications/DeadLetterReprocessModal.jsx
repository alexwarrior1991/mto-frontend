import {Button, Group, Modal, NumberInput, Stack, Text} from '@mantine/core'
import {useState} from 'react'
import {isReprocessMax, REPROCESS_DEFAULT, REPROCESS_MAX, REPROCESS_MIN} from '../../api/notification/admin.js'
import {REPROCESS_OUTCOME} from '../../api/notification/enums.js'
import DataTable from '../../ui/DataTable.jsx'
import {reprocessExplanation, reprocessSummary} from './adminTexts.js'
import {useReprocessDeadLetters} from './useNotifications.js'

const RANGE = `Entre ${REPROCESS_MIN} y ${REPROCESS_MAX} mensajes`

const text = (value) => value ?? ''

const COLUMNS = [
    {key: 'messageId', label: 'Mensaje', render: (row) => text(row.messageId)},
    {key: 'eventType', label: 'Tipo', render: (row) => text(row.eventType)},
    {key: 'routingKey', label: 'Clave de enrutado', render: (row) => text(row.routingKey)},
    {key: 'outcome', label: 'Resultado', render: (row) => REPROCESS_OUTCOME.label(row.outcome)},
    {key: 'reason', label: 'Motivo', render: (row) => text(row.reason)},
]

/**
 * Reprocesar la cola de mensajes muertos de una fuente (POST /admin/dead-letters/{source}/reprocess?max=,
 * el port de DeadLetterReprocessDialog). El diálogo dice qué va a pasar, pide cuántos mensajes como
 * mucho (de 1 a 100, 20 de partida) y, al terminar, enseña en el mismo sitio qué fue de cada uno; las
 * colas se releen.
 *
 * - Fuera de rango no se llama: el servicio respondería 400 VAL-001, y vacío mandaría su 20 sin que
 *   nadie lo haya pedido.
 * - Un fallo (SRC-404, SRC-409, SRC-503) se avisa con el diálogo abierto, y las colas no se releen.
 * - Nada lo repite solo: cada pasada es un clic.
 */
export default function DeadLetterReprocessModal({queue, onClose}) {
    const [max, setMax] = useState(REPROCESS_DEFAULT)
    const [error, setError] = useState(null)
    const [result, setResult] = useState(null)
    const reprocessing = useReprocessDeadLetters(queue.source)
    const title = `Reprocesar los mensajes muertos de ${queue.source}`

    const run = (event) => {
        event.preventDefault()
        if (!isReprocessMax(max)) {
            setError(RANGE)
            return
        }
        setError(null)
        reprocessing.mutate(max, {onSuccess: setResult})
    }

    return (
        <Modal opened onClose={onClose} title={title} closeOnClickOutside={false} size="xl">
            <form onSubmit={run} noValidate>
                <Stack>
                    <Text size="sm">{reprocessExplanation(queue)}</Text>
                    <NumberInput label="Máximo de mensajes" description={RANGE} w={220} allowDecimal={false} clampBehavior="none"
                                 min={REPROCESS_MIN} max={REPROCESS_MAX} value={max} error={error}
                                 onChange={(value) => {
                                     setMax(value)
                                     setError(null)
                                 }}/>
                    {result && (
                        <>
                            <Text size="sm" aria-live="polite">{reprocessSummary(result)}</Text>
                            <DataTable ariaLabel="Resultado del reproceso" columns={COLUMNS} rows={result.results}
                                       rowKey={(row) => result.results.indexOf(row)} emptyText="No se sacó ningún mensaje."/>
                        </>
                    )}
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cerrar</Button>
                        <Button type="submit" loading={reprocessing.isPending}>Reprocesar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
