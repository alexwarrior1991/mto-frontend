import {Button, Group, Modal, Stack} from '@mantine/core'
import {ApiError} from '../../api/errors.js'
import {notifyApiError, notifyMessages} from '../../ui/errors/notifyError.js'
import {applyServerErrors} from '../../ui/errors/serverValidation.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {useSaveCatalogueEntry} from './useStock.js'

/**
 * El marco de un editor de catálogo del almacén: título, guardar y cancelar. Al guardar, el editor
 * arma el cuerpo con buildBody (el alta sin active, la modificación con él). Si va bien: «Guardado» con
 * el código y el diálogo se cierra. Si el servicio dice que no, sus errores por campo caen en su campo
 * (los nombres del formulario son los del servicio) y el resto es un aviso con su «Referencia», con el
 * diálogo abierto y lo escrito en él: un código repetido, por ejemplo.
 */
export default function CatalogueEditorFrame({catalogue, row, title, form, buildBody, onClose, size = 'lg', children}) {
    const saving = useSaveCatalogueEntry(catalogue)

    const save = form.onSubmit((values) => {
        saving.mutate({id: row?.id ?? null, body: buildBody(values)}, {
            onSuccess: () => {
                notifySuccess(`Guardado ${values.code.trim()}`)
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
        <Modal opened onClose={onClose} closeOnClickOutside={false} size={size} title={title}>
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
