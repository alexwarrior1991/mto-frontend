import {Button, Checkbox, Group, Modal, Stack, Text} from '@mantine/core'
import {useState} from 'react'
import {activeTaskTypes} from '../../api/maintenance/catalogs.js'
import {generateRequest} from '../../api/maintenance/tasks.js'
import {formatQuantity} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {kpRange} from './maintenanceTexts.js'
import {TaskTypesSelect} from './MaintenancePickers.jsx'
import {useGenerateTasks, useTaskTypes} from './useMaintenance.js'

/**
 * Generar las tareas de un preventivo sobre un tramo (el port de GenerateTasksDialog): una por perfil
 * habilitado del tramo, con los tipos elegidos (sin ninguno, los del servicio: grupos 1, 2 y 4). Los
 * perfiles que ya tienen tarea se saltan, así que repetirlo no duplica. Lo que resulta lo cuenta el
 * servicio y se enseña tal cual.
 */
export default function GenerateTasksModal({order, onClose}) {
    const types = useTaskTypes()
    const [codes, setCodes] = useState([])
    const [withChecklist, setWithChecklist] = useState(false)
    const generating = useGenerateTasks(order.id)
    const generate = () => generating.mutate(generateRequest({taskTypeCodes: codes, withChecklist}), {
        onSuccess: (result) => {
            notifySuccess(generatedText(result))
            onClose()
        },
    })
    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="lg" title={`Generar tareas de ${order.code}`}>
            <Stack>
                <Text size="sm">
                    {`Una tarea por cada perfil habilitado entre los KP ${kpRange(order.startKp, order.endKp)} del tramo; los que ya tienen `
                        + 'tarea se saltan.'}
                </Text>
                <TaskTypesSelect label="Tipos de tarea" types={activeTaskTypes(types.data)} value={codes} onChange={setCodes}
                                 description="Vacío: los del plan para cada perfil de vía principal (grupos 1, 2 y 4)"/>
                <Checkbox label="Con la checklist de la plantilla de perfil" checked={withChecklist}
                          onChange={(event) => setWithChecklist(event.currentTarget.checked)}/>
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose} disabled={generating.isPending}>Volver</Button>
                    <Button loading={generating.isPending} onClick={generate}>Generar</Button>
                </Group>
            </Stack>
        </Modal>
    )
}

function generatedText(result) {
    return `Tareas nuevas: ${result.createdTasks}; perfiles que ya tenían tarea: ${result.skippedProfiles}. Total: ${result.totalTasks}, `
        + `unos ${formatQuantity(result.estimatedMinutes)} min en ${result.estimatedShifts} ${result.estimatedShifts === 1 ? 'turno' : 'turnos'}.`
}
