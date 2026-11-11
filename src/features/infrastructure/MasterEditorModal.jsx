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
 * Si va bien: «Guardado», el diálogo se cierra y se releen las listas. Si el servicio dice que no, el
 * diálogo sigue abierto con lo escrito, también con un 409 CON-001, que pide recargar.
 *
 * mto-configuration dice cada error con la ruta de su campo desde la raíz del cuerpo, y ninguno se
 * pierde (applyServerErrors): el de un campo del maestro cae en su campo (poleType; los nombres del
 * formulario son los del servicio), el de un elemento de una lista, en el campo de la lista
 * (sectionings[1]), el de un hijo que el editor lleva en su tabla, debajo de esa tabla con su fila y
 * su campo (cantilevers[1].cantileverType, por childErrors), y cualquier otro es un aviso con su ruta
 * delante (disconnectors[0].connectedTrackId).
 *
 * @param {Object<string, Function>} [childErrors] colección de hijos del cuerpo → quien pinta sus
 *        errores ({cantilevers: setCantileverErrors})
 */
export default function MasterEditorModal({master, creating, form, buildBody, childErrors = {}, onClose, size = 'xl', children}) {
    const saving = useMasterMutation(
        (body) => (creating ? createMaster(master.path, body) : updateMaster(master.path, body)),
        {handlesErrors: true},
    )

    const save = form.onSubmit((values) => {
        // Lo que se dijo de los hijos en el intento anterior ya no vale.
        Object.values(childErrors).forEach((show) => show([]))
        saving.mutate(buildBody(values), {
            onSuccess: () => {
                notifySuccess('Guardado')
                onClose()
            },
            onError: (error) => {
                if (error instanceof ApiError && error.hasFieldErrors) {
                    notifyMessages(applyServerErrors(form, error, {children: childErrors}))
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
