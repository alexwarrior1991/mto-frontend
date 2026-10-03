import {Button, Checkbox, Group, Modal, PasswordInput, Stack} from '@mantine/core'
import {useForm} from '@mantine/form'
import {ApiError, ValidationError} from '../../api/errors.js'
import {errorMessage} from '../../ui/errors/messages.js'
import {notifyApiError, notifyMessages} from '../../ui/errors/notifyError.js'
import {applyServerErrors} from '../../ui/errors/serverValidation.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {MIN_PASSWORD_LENGTH, passwordError} from './userForms.js'
import {useResetPassword} from './useUsers.js'

/**
 * Fijar una contraseña (el port de ResetPasswordDialog): temporal por defecto, para que la persona la
 * cambie al entrar.
 *
 * La política de contraseñas del realm la aplica Keycloak, y mto-users la devuelve como un 400 KC-400
 * con el texto de Keycloak en el detalle y sin errores por campo. Como aquí solo se escribe la
 * contraseña, ese rechazo va a su campo y el diálogo sigue abierto.
 */
export default function ResetPasswordModal({user, onClose}) {
    const form = useForm({
        mode: 'controlled',
        initialValues: {password: '', temporary: true},
        validate: {password: passwordError},
    })
    const saving = useResetPassword(user.id)

    const save = form.onSubmit((values) => {
        saving.mutate(values, {
            onSuccess: () => {
                notifySuccess(`Contraseña fijada para ${user.username}${values.temporary ? ' (temporal)' : ''}`)
                onClose()
            },
            onError: (error) => {
                if (error instanceof ApiError && error.hasFieldErrors) {
                    notifyMessages(applyServerErrors(form, error))
                } else if (error instanceof ValidationError) {
                    form.setFieldError('password', errorMessage(error))
                } else {
                    notifyApiError(error)
                }
            },
        })
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} title={`Contraseña para ${user.username}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <PasswordInput label="Contraseña nueva" withAsterisk autoComplete="new-password" data-autofocus
                                   description={`Al menos ${MIN_PASSWORD_LENGTH} caracteres; la política del realm puede pedir más`}
                                   {...form.getInputProps('password')}/>
                    <Checkbox label="Temporal: la persona tiene que cambiarla al entrar"
                              {...form.getInputProps('temporary', {type: 'checkbox'})}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={saving.isPending}>Fijar contraseña</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
