import {Button, Group, Modal, Stack, Text, Textarea} from '@mantine/core'
import {useState} from 'react'

/**
 * Una cancelación con su motivo, obligatorio (el port de ReasonDialog): la de una orden, una tarea o
 * un turno, y el motivo de cerrar o descartar un defecto. Si el servicio la rechaza, el diálogo sigue
 * abierto con lo escrito; quien lo abre lo cierra cuando sale bien.
 *
 * @param {Function} onConfirm el motivo, recortado
 */
export default function ReasonModal({title, children, confirmLabel, confirmColor = 'red', loading = false, onConfirm, onClose}) {
    const [reason, setReason] = useState('')
    const [error, setError] = useState(null)
    const confirm = () => {
        const value = reason.trim()
        if (!value) {
            setError('El motivo es obligatorio')
            return
        }
        onConfirm(value)
    }
    return (
        <Modal opened onClose={onClose} title={title} closeOnClickOutside={false}>
            <Stack>
                <Text size="sm">{children}</Text>
                <Textarea label="Motivo" withAsterisk rows={3} value={reason} error={error}
                          onChange={(event) => {
                              setReason(event.currentTarget.value)
                              setError(null)
                          }}/>
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose} disabled={loading}>Volver</Button>
                    <Button color={confirmColor} loading={loading} onClick={confirm}>{confirmLabel}</Button>
                </Group>
            </Stack>
        </Modal>
    )
}
