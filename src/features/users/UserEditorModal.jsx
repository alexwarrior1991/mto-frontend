import {Button, Checkbox, Group, Modal, MultiSelect, PasswordInput, SimpleGrid, Stack, Textarea, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {ApiError} from '../../api/errors.js'
import {changedUserRequest, newUserRequest, REQUIRED_ACTION} from '../../api/users/users.js'
import {notifyApiError, notifyMessages} from '../../ui/errors/notifyError.js'
import {applyServerErrors} from '../../ui/errors/serverValidation.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {readAttributes} from './userAttributes.js'
import {
    attributesError,
    emailError,
    initialUserValues,
    MAX_LENGTH,
    maxLengthError,
    MIN_PASSWORD_LENGTH,
    optionalPasswordError,
    USERNAME_HINT,
    usernameError,
} from './userForms.js'
import {useSaveUser} from './useUsers.js'

/**
 * El alta o la modificación de un usuario (el port de UserEditorDialog).
 *
 * - En el alta se escribe todo, también si nace activo, una contraseña temporal y lo que Keycloak le
 *   pedirá al entrar. Lo vacío no viaja.
 * - En la modificación el nombre de usuario no cambia y solo viaja lo que cambió: el PUT de mto-users
 *   es parcial (null no toca, '' vacía) y los atributos van enteros o no van. Si no cambió nada, el
 *   diálogo se cierra sin llamar.
 * - Las propiedades se llaman como los campos del servicio: un error por campo cae en su sitio y el
 *   diálogo sigue abierto con lo escrito. Lo demás es un aviso con su «Referencia».
 *
 * @param {object|null} user el usuario leído que se modifica, o null para un alta
 */
export default function UserEditorModal({user, onClose}) {
    const creating = user === null
    const form = useForm({
        mode: 'controlled',
        initialValues: initialUserValues(user),
        validate: {
            username: (value) => (creating ? usernameError(value) ?? maxLengthError(value) : null),
            firstName: maxLengthError,
            lastName: maxLengthError,
            email: (value) => emailError(value) ?? maxLengthError(value),
            temporaryPassword: (value) => (creating ? optionalPasswordError(value) : null),
            attributes: attributesError,
        },
    })
    const saving = useSaveUser()

    const done = (saved) => {
        notifySuccess(`Guardado ${saved.username}`)
        onClose()
    }
    const failed = (error) => {
        if (error instanceof ApiError && error.hasFieldErrors) {
            notifyMessages(applyServerErrors(form, error))
        } else {
            notifyApiError(error)
        }
    }

    const save = form.onSubmit((values) => {
        const attributes = readAttributes(values.attributes).value
        if (creating) {
            saving.mutate({body: newUserRequest({...values, attributes})}, {onSuccess: done, onError: failed})
            return
        }
        const body = changedUserRequest(user, {...values, attributes})
        if (body === null) {
            onClose()
            return
        }
        saving.mutate({userId: user.id, body}, {onSuccess: done, onError: failed})
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="xl"
               title={creating ? 'Alta de usuario' : `Modificar usuario ${user.username}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <TextInput label="Usuario" withAsterisk={creating} readOnly={!creating} maxLength={MAX_LENGTH}
                                   description={creating ? USERNAME_HINT : undefined} data-autofocus={creating || undefined}
                                   {...form.getInputProps('username')}/>
                        <TextInput label="Email" type="email" maxLength={MAX_LENGTH} data-autofocus={!creating || undefined}
                                   {...form.getInputProps('email')}/>
                        <TextInput label="Nombre" maxLength={MAX_LENGTH} {...form.getInputProps('firstName')}/>
                        <TextInput label="Apellidos" maxLength={MAX_LENGTH} {...form.getInputProps('lastName')}/>
                        <Checkbox label="Email verificado" {...form.getInputProps('emailVerified', {type: 'checkbox'})}/>
                        {creating && <Checkbox label="Activo" {...form.getInputProps('enabled', {type: 'checkbox'})}/>}
                    </SimpleGrid>
                    {creating && (
                        <>
                            <PasswordInput label="Contraseña temporal"
                                           description={`Al menos ${MIN_PASSWORD_LENGTH} caracteres; la persona la cambia al entrar`}
                                           autoComplete="new-password" {...form.getInputProps('temporaryPassword')}/>
                            <MultiSelect label="Acciones requeridas al entrar" data={REQUIRED_ACTION.selectable()} clearable
                                         {...form.getInputProps('requiredActions')}/>
                        </>
                    )}
                    <Textarea label="Atributos (clave=valor por línea)" description="Una clave repetida acumula valores" rows={4}
                              resize="vertical" {...form.getInputProps('attributes')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={saving.isPending}>Guardar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
