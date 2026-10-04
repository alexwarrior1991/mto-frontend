import {Button, Checkbox, Group, Modal, Select, SimpleGrid, Stack, Text, Textarea, TextInput} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {IconPlus, IconTrash} from '@tabler/icons-react'
import {useRef, useState} from 'react'
import {DEFECT_SEVERITY} from '../../api/maintenance/enums.js'
import {completeRequest} from '../../api/maintenance/tasks.js'
import {assetLabel, teamLabel} from '../../api/maintenance/values.js'
import {codeAndName} from '../../api/stock/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import DataTable from '../../ui/DataTable.jsx'
import {formatDate, formatQuantity} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import StockPicker from '../stock/StockPicker.jsx'
import {saveErrors} from './maintenanceErrors.js'
import {maxLength, positiveQuantity, required, requiredText} from './maintenanceForms.js'
import {TaskTypesSelect} from './MaintenancePickers.jsx'
import {useCompleteTask, useInProgressShifts, useTaskTypes} from './useMaintenance.js'

const CORRECTION_LENGTH = 120
const DESCRIPTION_LENGTH = 4000

/**
 * Completar una tarea: la fila del parte del turno (el port de CompleteTaskDialog).
 *
 * - Se trabaja en un turno en curso de la vía de la tarea: fijo si se abre desde el turno, y a elegir
 *   entre los en curso de su vía si se abre desde la orden.
 * - Lleva los defectos encontrados (resueltos en el turno o, si el trabajo no se terminó, abiertos con
 *   su fecha de reparación) y los materiales usados, que el servicio registra como líneas de la orden
 *   ya consumidas y reserva en mto-stock. Elegir materiales pide stock-read.
 * - Si el turno no admite el trabajo (409 SHF-001) o la orden no está en curso, el aviso lo dice y el
 *   diálogo sigue abierto con lo escrito.
 *
 * @param {string|number|null} trackId la vía en la que buscar turnos en curso si no viene shift
 * @param {object|null} shift el turno, o null para elegirlo
 * @param {string} [name] cómo se nombra la tarea: «la tarea 1», «la tarea 1 de MO-000001»
 */
export default function CompleteTaskModal({orderId, trackId, task, shift, name = `la tarea ${task.sequence}`, onClose}) {
    const session = useSession()
    const pickMaterials = session.has(P.STOCK_READ)
    const types = useTaskTypes()
    const shifts = useInProgressShifts(trackId, {enabled: shift === null})
    const [inlineDefects, setInlineDefects] = useState([])
    const [materials, setMaterials] = useState([])
    // El diálogo de añadir abierto: 'defect' o 'material'.
    const [adding, setAdding] = useState(null)
    // Lo añadido aquí no tiene id hasta que el servicio lo guarde: uno propio, solo para la tabla.
    const added = useRef(0)
    const withId = (item) => ({...item, id: `local-${++added.current}`})
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            shiftId: shift?.id ?? null,
            taskTypeCodes: task.taskTypeCodes ?? [],
            notes: task.notes ?? '',
            defectsFound: task.defectsFound ?? '',
            workComplete: true,
            repairPlannedDate: null,
        },
        validate: {shiftId: required('Hace falta un turno en curso de su vía')},
    })
    const completing = useCompleteTask(orderId)
    const candidates = shift ? [shift] : shifts.data?.content ?? []
    const workComplete = form.getValues().workComplete

    const save = form.onSubmit((values) => {
        completing.mutate({taskId: task.id, body: completeRequest(task, values, {inlineDefects, materials})}, {
            onSuccess: () => {
                notifySuccess(`Tarea ${task.sequence} completada`)
                onClose()
            },
            onError: saveErrors(form),
        })
    })

    const defectColumns = [
        {key: 'severity', label: 'Gravedad', render: (defect) => DEFECT_SEVERITY.label(defect.severity)},
        {key: 'description', label: 'Descripción', render: (defect) => defect.description},
        {key: 'correctionType', label: 'Corrección', render: (defect) => defect.correctionType ?? ''},
    ]
    const materialColumns = [
        {key: 'material', label: 'Material', render: (line) => codeAndName(line.material.code, line.material.name)},
        {key: 'warehouse', label: 'Almacén', render: (line) => codeAndName(line.warehouse.code, line.warehouse.name)},
        {key: 'quantity', label: 'Cantidad', render: (line) => `${formatQuantity(line.quantity)}${line.material.unitOfMeasure ? ` ${line.material.unitOfMeasure}` : ''}`},
    ]

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="xl"
               title={`Completar ${name}${task.asset ? ` · ${assetLabel(task.asset)}` : ''}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <Select label="Turno" withAsterisk readOnly={shift !== null} allowDeselect={false}
                                description={shift ? null : 'Los turnos en curso de la vía de la tarea'}
                                nothingFoundMessage="Ningún turno en curso en su vía" placeholder={shift ? null : 'Elige un turno en curso'}
                                data={candidates.map((candidate) => ({value: candidate.id, label: shiftLabel(candidate)}))}
                                {...form.getInputProps('shiftId')}/>
                        <TaskTypesSelect label="Tipos de tarea" types={types.data} description="Deciden si el trabajo pide posesión total"
                                         {...form.getInputProps('taskTypeCodes')}/>
                        <Textarea label="Notas" rows={2} {...form.getInputProps('notes')}/>
                        <Textarea label="Defectos encontrados (texto del parte)" rows={2} {...form.getInputProps('defectsFound')}/>
                        <Checkbox label="Trabajo terminado en este turno" description="Si no, los defectos quedan abiertos con su fecha de reparación"
                                  {...form.getInputProps('workComplete', {type: 'checkbox'})}/>
                        <DateInput label="Reparación prevista" disabled={workComplete} clearable valueFormat={DATE_FORMAT} dateParser={parseTypedDate}
                                   placeholder="DD/MM/AAAA" {...form.getInputProps('repairPlannedDate')}/>
                    </SimpleGrid>
                    <Text fw={500}>Defectos encontrados</Text>
                    <DataTable ariaLabel={`Defectos de ${name}`} columns={defectColumns} rows={inlineDefects} emptyText="Ningún defecto." rowActions={(defect) => (
                                   <RowActionButton label={`Quitar el defecto ${defect.description}`} tooltip="Quitar" icon={IconTrash} color="red"
                                                    onClick={() => setInlineDefects((list) => list.filter((item) => item !== defect))}/>
                               )}/>
                    <Group>
                        <Button variant="default" leftSection={<IconPlus size={16}/>} onClick={() => setAdding('defect')}>Añadir defecto</Button>
                    </Group>
                    <Text fw={500}>Materiales usados</Text>
                    {pickMaterials
                        ? (
                            <>
                                <DataTable ariaLabel={`Materiales de ${name}`} columns={materialColumns} rows={materials}
                                           emptyText="Ningún material." rowActions={(line) => (
                                               <RowActionButton label={`Quitar ${codeAndName(line.material.code, line.material.name)}`} tooltip="Quitar"
                                                                icon={IconTrash} color="red"
                                                                onClick={() => setMaterials((list) => list.filter((item) => item !== line))}/>
                                           )}/>
                                <Group>
                                    <Button variant="default" leftSection={<IconPlus size={16}/>} onClick={() => setAdding('material')}>Añadir material</Button>
                                </Group>
                            </>
                        )
                        : <Text size="sm" c="dimmed">Elegir materiales pide leer el almacén (stock-read).</Text>}
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Volver</Button>
                        <Button type="submit" loading={completing.isPending}>Completar</Button>
                    </Group>
                </Stack>
            </form>
            {/* Fuera del formulario: el envío de un diálogo anidado no puede llegar al de este. */}
            {adding === 'defect' && (
                <InlineDefectModal onAdd={(defect) => setInlineDefects((list) => [...list, withId(defect)])} onClose={() => setAdding(null)}/>
            )}
            {adding === 'material' && (
                <MaterialLineModal onAdd={(line) => setMaterials((list) => [...list, withId(line)])} onClose={() => setAdding(null)}/>
            )}
        </Modal>
    )
}

function shiftLabel(shift) {
    return [shift.code, formatDate(shift.shiftDate), shift.team ? teamLabel(shift.team) : null].filter(Boolean).join(' · ')
}

/** Un defecto encontrado: gravedad y descripción obligatorias. */
function InlineDefectModal({onAdd, onClose}) {
    const form = useForm({
        mode: 'controlled',
        initialValues: {severity: null, description: '', technicalNotes: '', correctionType: '', partsReplaced: ''},
        validate: {
            severity: required('La gravedad es obligatoria'),
            description: requiredText('La descripción es obligatoria', DESCRIPTION_LENGTH),
            correctionType: maxLength(CORRECTION_LENGTH),
        },
    })
    const add = form.onSubmit((values) => {
        onAdd({...values, description: values.description.trim()})
        onClose()
    })
    return (
        <Modal opened onClose={onClose} title="Defecto encontrado" size="lg">
            <form onSubmit={add} noValidate>
                <Stack>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <Select label="Gravedad" withAsterisk data={DEFECT_SEVERITY.selectable()} {...form.getInputProps('severity')}/>
                        <TextInput label="Tipo de corrección" maxLength={CORRECTION_LENGTH} {...form.getInputProps('correctionType')}/>
                    </SimpleGrid>
                    <Textarea label="Descripción" withAsterisk rows={2} {...form.getInputProps('description')}/>
                    <Textarea label="Notas técnicas" rows={2} {...form.getInputProps('technicalNotes')}/>
                    <TextInput label="Piezas cambiadas" {...form.getInputProps('partsReplaced')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Volver</Button>
                        <Button type="submit">Añadir</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}

/** Un material usado: material y almacén activos buscados en mto-stock, y una cantidad mayor que cero. */
function MaterialLineModal({onAdd, onClose}) {
    const form = useForm({
        mode: 'controlled',
        initialValues: {material: null, warehouse: null, quantity: ''},
        validate: {
            material: required('El material es obligatorio'),
            warehouse: required('El almacén es obligatorio'),
            quantity: positiveQuantity,
        },
    })
    const add = form.onSubmit((values) => {
        onAdd({...values, quantity: values.quantity.trim()})
        onClose()
    })
    return (
        <Modal opened onClose={onClose} title="Material usado">
            <form onSubmit={add} noValidate>
                <Stack>
                    <StockPicker catalogue="materials" label="Material" withAsterisk {...form.getInputProps('material')}/>
                    <StockPicker catalogue="warehouses" label="Almacén" withAsterisk {...form.getInputProps('warehouse')}/>
                    <TextInput label="Cantidad" withAsterisk inputMode="decimal" {...form.getInputProps('quantity')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Volver</Button>
                        <Button type="submit">Añadir</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
