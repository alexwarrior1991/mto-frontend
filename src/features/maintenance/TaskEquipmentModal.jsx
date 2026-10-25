import {Button, Checkbox, Group, Modal, Stack, Text} from '@mantine/core'
import {useState} from 'react'
import {taskTypeEquipmentPatch} from '../../api/maintenance/catalogs.js'
import {TASK_EQUIPMENT} from '../../api/maintenance/enums.js'
import {notifyApiError} from '../../ui/errors/notifyError.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {useSaveTaskTypeEquipment} from './useMaintenance.js'

/**
 * El equipo que exige un tipo de tarea (el port de TaskEquipmentDialog): plataforma aislada y puesta a
 * tierra. Una tarea de ese tipo solo se asigna, se inicia y se completa en un turno que lo lleva (409
 * SHF-001 del servicio). Viaja como conjunto, con la versión leída; quitarlo todo viaja a null, y lo que
 * esta aplicación no conoce se conserva. Una versión vieja (409 CON-001) se dice con el diálogo abierto.
 */
export default function TaskEquipmentModal({type, onClose}) {
    const [chosen, setChosen] = useState((type.requiredEquipment ?? []).filter((equipment) => TASK_EQUIPMENT.isKnown(equipment)))
    // Lo que esta aplicación no conoce no tiene casilla, pero se dice: se conserva al guardar.
    const unknown = (type.requiredEquipment ?? []).filter((equipment) => !TASK_EQUIPMENT.isKnown(equipment))
    const saving = useSaveTaskTypeEquipment()

    const save = () => {
        const patch = taskTypeEquipmentPatch(type, chosen)
        if (patch === null) {
            onClose()
            return
        }
        saving.mutate({code: type.code, patch}, {
            onSuccess: () => {
                notifySuccess(`Guardado el equipo de ${type.code}`)
                onClose()
            },
            onError: (error) => notifyApiError(error),
        })
    }

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} title={`Equipo que exige ${type.code}`}>
            <Stack>
                <Text size="sm">Una tarea de este tipo solo se trabaja en un turno que lo lleve: la plataforma aislada, en uno de sus vehículos;
                    la puesta a tierra, en un vehículo o en una pértiga de puesta a tierra entre sus instrumentos.</Text>
                <Checkbox.Group label="Equipo exigido" value={chosen} onChange={setChosen}>
                    <Stack gap="xs" mt="xs">
                        {TASK_EQUIPMENT.selectable().map((option) => <Checkbox key={option.value} value={option.value} label={option.label}/>)}
                    </Stack>
                </Checkbox.Group>
                {unknown.length > 0 && <Text size="sm" c="dimmed">{`Exige también, y se conserva: ${unknown.join(', ')}`}</Text>}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>Cancelar</Button>
                    <Button loading={saving.isPending} onClick={save}>Guardar</Button>
                </Group>
            </Stack>
        </Modal>
    )
}
