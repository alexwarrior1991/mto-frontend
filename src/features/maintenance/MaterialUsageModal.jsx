import {Button, Checkbox, Group, Modal, Select, SimpleGrid, Stack, Text, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {isOpenTask, STOCK_REQUEST} from '../../api/maintenance/enums.js'
import {fixedConsumed, fixedPlanned, isInDoubtLine, isReservedLine, materialPatch, materialRequest} from '../../api/maintenance/materials.js'
import {materialLabel} from '../../api/maintenance/values.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import StockPicker from '../stock/StockPicker.jsx'
import {saveErrors} from './maintenanceErrors.js'
import {nonNegativeQuantity, required, toText} from './maintenanceForms.js'
import {IN_DOUBT_HINT} from './maintenanceTexts.js'
import {useSaveMaterial} from './useMaintenance.js'

/**
 * Registrar o modificar una línea de material de una orden (el port de MaterialUsageDialog).
 *
 * - El alta elige material y almacén en mto-stock (pide stock-read; solo lo activo, porque el servicio
 *   rechaza lo retirado) y, si se quiere, una tarea abierta. Fuera de borrador el servicio la reserva
 *   al momento.
 * - La modificación manda solo lo cambiado, con la versión leída. Lo previsto de una línea reservada
 *   no se cambia: se quita y se registra otra vez. Con una petición al almacén sin respuesta no
 *   cambian ni lo previsto ni lo consumido, que viajan en ella; el permiso de consumir de más, sí.
 *
 * Las propiedades del formulario se llaman como los campos de la petición, aunque materialId y
 * warehouseId guarden el resumen elegido: así los errores del servicio caen en su campo.
 *
 * @param {object|null} line la línea que se modifica, o null para un alta
 * @param {Array} tasks las tareas de la orden, para elegir una abierta
 */
export default function MaterialUsageModal({order, line, tasks, onClose}) {
    const creating = line === null
    const planned = !creating && fixedPlanned(line)
    const consumed = !creating && fixedConsumed(line)
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            materialId: null,
            warehouseId: null,
            plannedQuantity: creating ? '' : toText(line.plannedQuantity),
            consumedQuantity: creating ? '' : toText(line.consumedQuantity),
            taskId: null,
            allowOverConsumption: line?.allowOverConsumption === true,
        },
        validate: {
            materialId: creating ? required('El material es obligatorio') : null,
            warehouseId: creating ? required('El almacén es obligatorio') : null,
            plannedQuantity: planned ? null : nonNegativeQuantity('Lo previsto es obligatorio'),
            consumedQuantity: creating || consumed ? null : nonNegativeQuantity('Lo consumido es obligatorio'),
        },
    })
    const saving = useSaveMaterial(order.id)
    const openTasks = (tasks ?? []).filter((task) => isOpenTask(task.status))
        .map((task) => ({value: task.id, label: `${task.sequence} · ${task.description ?? ''}`}))

    const save = form.onSubmit((values) => {
        const body = creating ? materialRequest(values) : materialPatch(line, values)
        if (body === null) {
            onClose()
            return
        }
        saving.mutate({lineId: creating ? null : line.id, body}, {
            onSuccess: (saved) => {
                notifySuccess(creating ? `${saved.materialCode} añadido a ${order.code}` : `${saved.materialCode} guardado`)
                onClose()
            },
            onError: saveErrors(form, {aliases: {materialReference: 'materialId', hasMaterialReference: 'materialId'}}),
        })
    })

    const quantities = (
        <>
            <TextInput label="Previsto" withAsterisk={!planned} inputMode="decimal" readOnly={planned}
                       rightSection={creating ? null : <Text size="xs" c="dimmed">{line.unit}</Text>}
                       description={!creating && isReservedLine(line) && !isInDoubtLine(line)
                           ? 'Tiene reserva en el almacén: para cambiar lo previsto, quita la línea y regístrala de nuevo'
                           : null}
                       {...form.getInputProps('plannedQuantity')}/>
            {!creating && (
                <TextInput label="Consumido" withAsterisk={!consumed} inputMode="decimal" readOnly={consumed}
                           rightSection={<Text size="xs" c="dimmed">{line.unit}</Text>} {...form.getInputProps('consumedQuantity')}/>
            )}
        </>
    )

    return (
        <Modal opened onClose={onClose} size="lg" closeOnClickOutside={false}
               title={creating ? `Nuevo material en ${order.code}` : `Modificar ${materialLabel(line)}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    {creating && order.status !== 'DRAFT' && (
                        <Text size="sm">La orden ya está planificada: la línea se reserva al momento en el almacén.</Text>
                    )}
                    {!creating && isInDoubtLine(line) && (
                        <Text size="sm">{`${STOCK_REQUEST.label(line.stockRequestInDoubt)}. ${IN_DOUBT_HINT}`}</Text>
                    )}
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        {creating && (
                            <>
                                <StockPicker catalogue="materials" label="Material" withAsterisk {...form.getInputProps('materialId')}/>
                                <StockPicker catalogue="warehouses" label="Almacén" withAsterisk {...form.getInputProps('warehouseId')}/>
                            </>
                        )}
                        {quantities}
                        {creating && (
                            <Select label="Tarea" data={openTasks} clearable searchable nothingFoundMessage="Ninguna tarea abierta"
                                    placeholder="Ninguna" {...form.getInputProps('taskId')}/>
                        )}
                    </SimpleGrid>
                    <Checkbox label="Admite consumir más de lo previsto" {...form.getInputProps('allowOverConsumption', {type: 'checkbox'})}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={saving.isPending}>Guardar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
