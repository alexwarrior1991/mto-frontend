import {Button, Group, Modal, Stack, Text} from '@mantine/core'

/**
 * Pedir confirmacion antes de algo que no se deshace (borrar, cancelar...). El texto dice lo que pasa
 * de verdad en el servicio, no lo que seria comodo; el boton de confirmar lleva el verbo.
 */
export default function ConfirmModal({title, children, confirmLabel, confirmColor = 'red', loading = false, onConfirm, onClose}) {
    return (
        <Modal opened onClose={onClose} title={title} closeOnClickOutside={!loading}>
            <Stack>
                <Text size="sm">{children}</Text>
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose} disabled={loading}>Cancelar</Button>
                    <Button color={confirmColor} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
                </Group>
            </Stack>
        </Modal>
    )
}
