import {Button, Group, Modal, Stack} from '@mantine/core'
import {ApiError} from '../../api/errors.js'
import {createMaster, updateMaster} from '../../api/configuration/masters.js'
import {notifyApiError, notifyMessages} from '../../ui/errors/notifyError.js'
import {applyServerErrors} from '../../ui/errors/serverValidation.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {useMasterMutation} from './useMasters.js'

/**
 * El marco de un editor de maestro (el port de MasterEditorDialog): título, guardar y cancelar. Al
 * guardar, el editor arma el cuerpo con buildBody, que es la fila leída entera con lo cambiado encima.
 * Si va bien: «Guardado», el diálogo se cierra y se releen las listas. Si el servicio dice que no, sus
 * errores caen en su campo (los nombres del formulario son los del servicio) y el resto es un aviso
 * con su «Referencia». El diálogo sigue abierto con lo escrito, también con un 409 CON-001, que pide
 * recargar.
 */
export default function MasterEditorModal({master, creating, form, buildBody, onClose, size = 'xl', children}) {
    const saving = useMasterMutation(
        (body) => (creating ? createMaster(master.path, body) : updateMaster(master.path, body)),
        {handlesErrors: true},
    )

    const save = form.onSubmit((values) => {
        saving.mutate(buildBody(values), {
            onSuccess: () => {
                notifySuccess('Guardado')
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
        <Modal opened onClose={onClose} closeOnClickOutside={false} size={size}
               title={`${creating ? 'Alta de' : 'Modificar'} ${master.singular}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    {children}
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={saving.isPending}>Guardar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
