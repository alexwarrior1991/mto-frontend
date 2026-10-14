import {Button, Checkbox, Group, Modal, Stack, Text} from '@mantine/core'
import {useState} from 'react'
import {activeTaskTypes} from '../../api/maintenance/catalogs.js'
import {generateRequest, skippedOf} from '../../api/maintenance/tasks.js'
import {formatQuantity} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {kpRange} from './maintenanceTexts.js'
import {TaskTypesSelect} from './MaintenancePickers.jsx'
import {useGenerateTasks, useTaskTypes} from './useMaintenance.js'

/**
 * Generar las tareas de un preventivo sobre un tramo (el port de GenerateTasksDialog): una por perfil
 * habilitado del tramo y, si se marca, una por aislador de sección que lo toca (también los de otra vía
 * que conectan con esta), con los tipos elegidos. Sin ninguno, los del servicio para cada activo: grupos
 * 1, 2 y 4 en un perfil, RG-03 en un aislador, que pide posesión total. Lo que ya tiene tarea se salta,
 * así que repetirlo no duplica: para tipos distintos se genera dos veces. Lo que resulta lo cuenta el
 * servicio y se enseña tal cual.
 */
export default function GenerateTasksModal({order, onClose}) {
    const types = useTaskTypes()
    const [codes, setCodes] = useState([])
    const [withChecklist, setWithChecklist] = useState(false)
    const [withInsulators, setWithInsulators] = useState(false)
    const generating = useGenerateTasks(order.id)
    const generate = () => generating.mutate(generateRequest({taskTypeCodes: codes, withChecklist, withInsulators}), {
        onSuccess: (result) => {
            notifySuccess(generatedText(result, withInsulators))
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
                <Checkbox label="También los aisladores de sección del tramo (RG-03, posesión total)" checked={withInsulators}
                          description="Los de esta vía y los de otra que conectan con ella, entre los perfiles que los rodean"
                          onChange={(event) => setWithInsulators(event.currentTarget.checked)}/>
                <TaskTypesSelect label="Tipos de tarea" types={activeTaskTypes(types.data)} value={codes} onChange={setCodes}
                                 description={withInsulators
                                     ? 'Para todo lo generado. Vacío: grupos 1, 2 y 4 en cada perfil y RG-03 en cada aislador'
                                     : 'Vacío: los del plan para cada perfil de vía principal (grupos 1, 2 y 4)'}/>
                <Checkbox label="Con la checklist de la plantilla de cada activo" checked={withChecklist}
                          onChange={(event) => setWithChecklist(event.currentTarget.checked)}/>
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose} disabled={generating.isPending}>Volver</Button>
                    <Button loading={generating.isPending} onClick={generate}>Generar</Button>
                </Group>
            </Stack>
        </Modal>
    )
}

function generatedText(result, withInsulators) {
    const skipped = withInsulators ? `activos que ya tenían tarea: ${skippedOf(result)}` : `perfiles que ya tenían tarea: ${result.skippedProfiles}`
    return `Tareas nuevas: ${result.createdTasks}; ${skipped}. Total: ${result.totalTasks}, `
        + `unos ${formatQuantity(result.estimatedMinutes)} min en ${result.estimatedShifts} ${result.estimatedShifts === 1 ? 'turno' : 'turnos'}.`
}
