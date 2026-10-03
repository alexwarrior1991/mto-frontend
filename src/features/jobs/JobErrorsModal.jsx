import {Button, Group, Modal, Stack, Table, Text} from '@mantine/core'
import {hasErrorReport} from '../../api/configuration/jobs.js'

/**
 * Lo que falló en un trabajo (el port de JobErrorsDialog): el error global, si lo hubo, y los primeros
 * errores por elemento, que el servicio acota (el recuento entero es failedItems). Recibe el detalle
 * ya pedido a la familia: las filas de la lista no traen los errores por elemento.
 */
export default function JobErrorsModal({label, job, onClose}) {
    const shown = job.itemErrors.length
    return (
        <Modal opened onClose={onClose} size="min(60rem, 96vw)" title={`Errores de ${label}`}>
            <Stack>
                {job.error?.trim() && <Text>Error global: {job.error}</Text>}
                {job.failedItems > shown && <Text size="sm">{truncatedText(job, shown)}</Text>}
                {shown > 0 && (
                    <Table.ScrollContainer minWidth={560}>
                        <Table striped withTableBorder verticalSpacing="xs" aria-label="Errores por elemento">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Posición</Table.Th>
                                    <Table.Th>Operación</Table.Th>
                                    <Table.Th>Código</Table.Th>
                                    <Table.Th>Motivo</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {job.itemErrors.map((item, position) => (
                                    // El servicio no da un id por error: su posición en la lista lo es.
                                    <Table.Tr key={position}>
                                        <Table.Td>{item.index ?? ''}</Table.Td>
                                        <Table.Td>{item.operation ?? ''}</Table.Td>
                                        <Table.Td>{item.code ?? ''}</Table.Td>
                                        <Table.Td>{item.message ?? ''}</Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                )}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>Cerrar</Button>
                </Group>
            </Stack>
        </Modal>
    )
}

/** Cuántos fallaron y cuántos detalla el servicio; el informe de una importación los trae todos. */
function truncatedText(job, shown) {
    const what = shown > 0
        ? `${job.failedItems} elementos fallidos; el servicio solo detalla los primeros ${shown}.`
        : `${job.failedItems} elementos fallidos, sin detalle del servicio.`
    return hasErrorReport(job) ? `${what} El informe descargable los trae todos.` : what
}
