import {Button, Checkbox, Group, Modal, SimpleGrid, Stack, Textarea, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {activeTaskTypes} from '../../api/maintenance/catalogs.js'
import {taskPatch, taskRequest} from '../../api/maintenance/tasks.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {maxLength, requiredText} from './maintenanceForms.js'
import {saveErrors} from './maintenanceErrors.js'
import {AssetPicker, TaskTypesSelect} from './MaintenancePickers.jsx'
import {useSaveTask, useTaskTypes} from './useMaintenance.js'

const DESCRIPTION_LENGTH = 500
const USER_LENGTH = 100

/**
 * El alta o la modificación de una tarea abierta de una orden (el port de TaskEditorDialog). El activo
 * se elige en el alta, buscado en el servidor, y ya no cambia. Los tipos son los del plan, y si cambian
 * van enteros; uno que ya no está en el catálogo sigue en la tarea mientras nadie lo quite. En la
 * modificación se añaden las notas y los defectos encontrados, y solo viaja lo que cambió.
 *
 * @param {object|null} task la tarea que se modifica, o null para un alta
 */
export default function TaskEditorModal({order, task, onClose}) {
    const creating = task === null
    const types = useTaskTypes()
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            description: task?.description ?? '',
            assetId: null,
            assignedUser: task?.assignedUser ?? '',
            taskTypeCodes: task?.taskTypeCodes ?? [],
            withChecklist: false,
            notes: task?.notes ?? '',
            defectsFound: task?.defectsFound ?? '',
        },
        validate: {
            description: requiredText('La descripción es obligatoria', DESCRIPTION_LENGTH),
            assignedUser: maxLength(USER_LENGTH),
        },
    })
    const saving = useSaveTask(order.id)

    const save = form.onSubmit((values) => {
        const body = creating ? taskRequest(values) : taskPatch(task, values)
        if (body === null) {
            onClose()
            return
        }
        saving.mutate({taskId: creating ? null : task.id, body}, {
            onSuccess: (saved) => {
                notifySuccess(creating ? `Tarea ${saved?.sequence ?? ''} añadida a ${order.code}` : `Tarea ${task.sequence} guardada`)
                onClose()
            },
            onError: saveErrors(form),
        })
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="xl"
               title={creating ? `Nueva tarea en ${order.code}` : `Tarea ${task.sequence} de ${order.code}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <Textarea label="Descripción" withAsterisk rows={2} maxLength={DESCRIPTION_LENGTH} {...form.getInputProps('description')}/>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        {creating && (
                            <AssetPicker label="Activo" description="Opcional: el perfil, seccionador o aislador en el que se trabaja"
                                         {...form.getInputProps('assetId')}/>
                        )}
                        <TextInput label="Asignada a" maxLength={USER_LENGTH} {...form.getInputProps('assignedUser')}/>
                    </SimpleGrid>
                    <TaskTypesSelect label="Tipos de tarea" types={activeTaskTypes(types.data)} {...form.getInputProps('taskTypeCodes')}/>
                    {creating
                        ? <Checkbox label="Con la checklist de la plantilla del activo" {...form.getInputProps('withChecklist', {type: 'checkbox'})}/>
                        : (
                            <SimpleGrid cols={{base: 1, sm: 2}}>
                                <Textarea label="Notas" rows={3} {...form.getInputProps('notes')}/>
                                <Textarea label="Defectos encontrados" rows={3} {...form.getInputProps('defectsFound')}/>
                            </SimpleGrid>
                        )}
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={saving.isPending}>Guardar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
