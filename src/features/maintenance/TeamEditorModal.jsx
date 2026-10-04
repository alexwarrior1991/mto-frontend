import {Button, Checkbox, Group, Modal, SimpleGrid, Stack, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {teamRequest} from '../../api/maintenance/catalogs.js'
import {teamLabel} from '../../api/maintenance/values.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {maxLength, requiredText} from './maintenanceForms.js'
import {ReferencesMultiSelect} from './MaintenancePickers.jsx'
import {saveErrors} from './maintenanceErrors.js'
import {useSaveTeam} from './useMaintenance.js'

const CODE_LENGTH = 16
const TEXT_LENGTH = 120

/**
 * El alta o la modificación de un equipo (el port de TeamEditorDialog). El PUT de equipos es completo:
 * se manda todo lo que el editor enseña, y base o vehículo vaciados se borran. No hay borrado; un
 * equipo se retira desmarcando «Activo». Un código repetido es un 409 TEA-409, que se avisa con el
 * diálogo abierto.
 *
 * @param {object|null} team el equipo que se modifica, o null para un alta
 */
export default function TeamEditorModal({team, packageOptions, onClose}) {
    const creating = team === null
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            code: team?.code ?? '',
            name: team?.name ?? '',
            baseName: team?.baseName ?? '',
            vehicle: team?.vehicle ?? '',
            active: team ? team.active === true : true,
            executionPackageIds: [...(team?.executionPackageIds ?? [])].sort((left, right) => left - right).map(String),
        },
        validate: {
            code: requiredText('El código es obligatorio', CODE_LENGTH),
            name: requiredText('El nombre es obligatorio', TEXT_LENGTH),
            baseName: maxLength(TEXT_LENGTH),
            vehicle: maxLength(TEXT_LENGTH),
        },
    })
    const saving = useSaveTeam()

    const save = form.onSubmit((values) => {
        saving.mutate({id: creating ? null : team.id, body: teamRequest(values, {creating})}, {
            onSuccess: (saved) => {
                notifySuccess(`Guardado ${teamLabel(saved ?? values)}`)
                onClose()
            },
            onError: saveErrors(form),
        })
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="lg" title={creating ? 'Nuevo equipo' : `Modificar el equipo ${team.code}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <TextInput label="Código" withAsterisk maxLength={CODE_LENGTH} {...form.getInputProps('code')}/>
                        <TextInput label="Nombre" withAsterisk maxLength={TEXT_LENGTH} {...form.getInputProps('name')}/>
                        <TextInput label="Base" maxLength={TEXT_LENGTH} {...form.getInputProps('baseName')}/>
                        <TextInput label="Vehículo" maxLength={TEXT_LENGTH} {...form.getInputProps('vehicle')}/>
                    </SimpleGrid>
                    <ReferencesMultiSelect label="Paquetes de ejecución" options={packageOptions} {...form.getInputProps('executionPackageIds')}/>
                    {!creating && (
                        <Checkbox label="Activo" description="Desmarcarlo lo retira: deja de ofrecerse al asignar órdenes y turnos"
                                  {...form.getInputProps('active', {type: 'checkbox'})}/>
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
