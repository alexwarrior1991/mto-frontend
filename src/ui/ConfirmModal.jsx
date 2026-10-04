import {Button, Group, Modal, Stack, Text} from '@mantine/core'

/**
 * Pedir confirmacion antes de algo que no se deshace (borrar, cancelar...). El texto dice lo que pasa
 * de verdad en el servicio, no lo que seria comodo; el boton de confirmar lleva el verbo. Junto a un
 * «Cancelar la reserva», el otro boton dice «Volver» (cancelLabel), para que los dos no se llamen igual.
 */
export default function ConfirmModal({
    title, children, confirmLabel, cancelLabel = 'Cancelar', confirmColor = 'red', loading = false, onConfirm, onClose,
}) {
    return (
        <Modal opened onClose={onClose} title={title} closeOnClickOutside={!loading}>
            <Stack>
                <Text size="sm">{children}</Text>
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose} disabled={loading}>{cancelLabel}</Button>
                    <Button color={confirmColor} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
                </Group>
            </Stack>
        </Modal>
    )
}
