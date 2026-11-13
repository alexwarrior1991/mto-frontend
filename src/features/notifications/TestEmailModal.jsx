import {Button, Group, Modal, Stack, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {emailProblem} from '../../api/notification/admin.js'
import {saveErrors} from '../../ui/errors/saveErrors.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {useSendTestEmail} from './useNotifications.js'

/**
 * Un correo de prueba (POST /admin/test-email, el port de TestEmailDialog): el servicio crea una
 * notificación para quien llama y una entrega directa a la dirección. Responde 202: el correo sale
 * después, y cómo le fue se ve en la pestaña Entregas. Aquí solo se exige lo evidente (una dirección
 * con forma de email); lo demás lo dice el servicio, en su campo y con el diálogo abierto. Sin
 * confirmación: solo le llega a la dirección escrita y a la bandeja de quien lo manda.
 *
 * @param {Function} onSent la notificación creada, para decir lo último que se mandó
 */
export default function TestEmailModal({onSent, onClose}) {
    // La propiedad se llama como el campo de la petición, para que su error caiga en su campo.
    const form = useForm({mode: 'controlled', initialValues: {to: ''}, validate: {to: emailProblem}})
    const sending = useSendTestEmail()

    const send = form.onSubmit(({to}) => {
        const address = to.trim()
        sending.mutate(address, {
            onSuccess: (sent) => {
                notifySuccess(`Correo de prueba en cola para ${address}: cómo le va se ve en Entregas`)
                onSent(sent)
                onClose()
            },
            onError: saveErrors(form),
        })
    })

    return (
        <Modal opened onClose={onClose} title="Correo de prueba" closeOnClickOutside={false}>
            <form onSubmit={send} noValidate>
                <Stack>
                    <TextInput label="Para" withAsterisk placeholder="ops@mto.local" data-autofocus
                               description="Recibe un mensaje de prueba; a ti te queda la notificación en la bandeja"
                               {...form.getInputProps('to')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={sending.isPending}>Enviar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
