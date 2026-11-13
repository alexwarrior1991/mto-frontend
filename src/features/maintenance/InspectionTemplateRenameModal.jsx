import {Button, Group, Modal, Stack, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {TEMPLATE_LENGTHS, templateRenamePatch} from '../../api/maintenance/catalogs.js'
import {saveErrors} from '../../ui/errors/saveErrors.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {requiredText} from './maintenanceForms.js'
import {useRenameInspectionTemplate} from './useMaintenance.js'

/**
 * Renombrar una versión de una plantilla de inspección (el port de InspectionTemplateRenameDialog): es
 * lo único suyo, con si es la activa, que cambia en su sitio. Viaja como merge-patch con el nombre y el
 * lockVersion leído, nunca version (que aquí es el número de la versión); el mismo nombre se cierra sin
 * llamar. Una versión vieja (409 CON-001) y una que no existe (404 TPL-404) se dicen con el diálogo
 * abierto, sin releer la lista.
 *
 * @param {object} template la versión
 * @param {string} label cómo se nombra: «la versión 2 de Perfil»
 */
export default function InspectionTemplateRenameModal({template, label, onClose}) {
    const form = useForm({
        mode: 'controlled',
        initialValues: {name: template.name ?? ''},
        validate: {name: requiredText('El nombre es obligatorio', TEMPLATE_LENGTHS.name)},
    })
    const renaming = useRenameInspectionTemplate()

    const save = form.onSubmit(({name}) => {
        const patch = templateRenamePatch(template, name)
        if (patch === null) {
            onClose()
            return
        }
        renaming.mutate({id: template.id, patch}, {
            onSuccess: () => {
                notifySuccess(`Renombrada ${label}`)
                onClose()
            },
            onError: saveErrors(form),
        })
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} title={`Renombrar ${label}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <TextInput label="Nombre" withAsterisk data-autofocus maxLength={TEMPLATE_LENGTHS.name} {...form.getInputProps('name')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={renaming.isPending}>Guardar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
