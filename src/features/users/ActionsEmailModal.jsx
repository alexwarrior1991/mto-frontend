import {Button, Group, Modal, MultiSelect, NumberInput, Stack, Text} from '@mantine/core'
import {useForm} from '@mantine/form'
import {ApiError} from '../../api/errors.js'
import {REQUIRED_ACTION} from '../../api/users/users.js'
import {notifyApiError, notifyMessages} from '../../ui/errors/notifyError.js'
import {applyServerErrors} from '../../ui/errors/serverValidation.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {lifespanError, MIN_LIFESPAN_SECONDS} from './userForms.js'
import {useSendActionsEmail} from './useUsers.js'

/**
 * Mandar a la persona un enlace con las acciones elegidas (el port de ExecuteActionsEmailDialog).
 * Keycloak manda el correo; sin email no hay a quién, así que no se puede enviar, y sin SMTP en el
 * realm el servicio responde 502 con su detalle: el aviso lo dice y el diálogo sigue abierto.
 */
export default function ActionsEmailModal({user, onClose}) {
    const hasEmail = typeof user.email === 'string' && user.email.trim() !== ''
    const form = useForm({
        mode: 'controlled',
        initialValues: {actions: [], lifespanSeconds: ''},
        validate: {
            actions: (value) => (value.length > 0 ? null : 'Elige al menos una acción'),
            lifespanSeconds: lifespanError,
        },
    })
    const sending = useSendActionsEmail(user.id)

    const send = form.onSubmit((values) => {
        sending.mutate(values, {
            onSuccess: () => {
                notifySuccess(`Correo enviado a ${user.email}`)
                onClose()
            },
            onError: (error) => {
                if (error instanceof ApiError && error.hasFieldErrors) {
                    notifyMessages(applyServerErrors(form, error))
                } else {
                    notifyApiError(error)
                }
            },
        })
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} title={`Correo de acciones para ${user.username}`}>
            <form onSubmit={send} noValidate>
                <Stack>
                    <Text size="sm">
                        {hasEmail
                            ? `Keycloak manda a ${user.email} un enlace con las acciones elegidas; la persona las completa al abrirlo.`
                            : 'El usuario no tiene email: Keycloak no tiene a quién mandar el enlace.'}
                    </Text>
                    <MultiSelect label="Acciones" withAsterisk data={REQUIRED_ACTION.selectable()} clearable data-autofocus
                                 {...form.getInputProps('actions')}/>
                    <NumberInput label="Validez del enlace (segundos)" allowDecimal={false} allowNegative={false} clampBehavior="none"
                                 description={`Vacío: la que tenga el realm por defecto; al menos ${MIN_LIFESPAN_SECONDS}`}
                                 {...form.getInputProps('lifespanSeconds')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={sending.isPending} disabled={!hasEmail}>Enviar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
