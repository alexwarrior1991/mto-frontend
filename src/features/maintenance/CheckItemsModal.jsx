import {Badge, Button, Checkbox, Group, Modal, Select, Stack, Text, TextInput} from '@mantine/core'
import {useState} from 'react'
import {CHECK_ITEM_RESULT} from '../../api/maintenance/enums.js'
import {checkItemPatch, itemsInOrder, shownResult} from '../../api/maintenance/tasks.js'
import {formatQuantity} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {toText} from './maintenanceForms.js'
import {useSaveTaskCheckItem} from './useMaintenance.js'

/**
 * Un checklist punto a punto (el port de CheckItemsDialog): el de una tarea abierta o el de una
 * inspección. Cada punto se guarda por separado, con su versión, y se repinta con lo que devuelve el
 * servicio, que es quien dice si quedó fuera de rango y quien rechaza un OK fuera de rango sin ajustar
 * (422 INS-001). Para completar una tarea, los puntos con medida tienen que tener resultado.
 *
 * @param {Array} items los puntos como se leyeron
 * @param {Function} save (punto, cambio) → una promesa de los puntos como quedaron
 */
export default function CheckItemsModal({title, items, save, onClose}) {
    const [current, setCurrent] = useState(items)
    return (
        <Modal opened onClose={onClose} title={title} size="90rem">
            <Stack>
                {itemsInOrder(current).map((item) => (
                    <CheckItemRow key={`${item.id}-${item.version}`} item={item}
                                  save={(patch) => save(item, patch).then((updated) => setCurrent(updated))}/>
                ))}
                {current.length === 0 && <Text size="sm" c="dimmed">Sin puntos.</Text>}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>Cerrar</Button>
                </Group>
            </Stack>
        </Modal>
    )
}

/**
 * El checklist de una tarea abierta, desde su orden o desde un turno: cada punto se guarda en la tarea
 * de su orden, y la respuesta es la tarea entera.
 *
 * @param {string} [name] cómo se nombra la tarea en el título: «la tarea 1», «la tarea 1 de MO-000001»
 */
export function TaskChecklistModal({task, name = `la tarea ${task.sequence}`, onClose}) {
    const saving = useSaveTaskCheckItem(task.orderId, task.id)
    const save = (item, patch) => saving.mutateAsync({itemId: item.id, patch}).then((updated) => updated?.checkItems ?? [])
    return <CheckItemsModal title={`Checklist de ${name}`} items={task.checkItems ?? []} save={save} onClose={onClose}/>
}

function CheckItemRow({item, save}) {
    const [values, setValues] = useState({
        measuredValue: toText(item.measuredValue),
        adjusted: item.adjusted === true,
        valueAfterAdjustment: toText(item.valueAfterAdjustment),
        itemResult: shownResult(item),
        notes: item.notes ?? '',
    })
    const [saving, setSaving] = useState(false)
    const change = (field) => (value) => setValues((previous) => ({...previous, [field]: value}))
    const range = present(item.minValue) || present(item.maxValue)
        ? ` (${formatQuantity(item.minValue)} - ${formatQuantity(item.maxValue)}${item.unit ? ` ${item.unit}` : ''})`
        : ''

    const submit = () => {
        const patch = checkItemPatch(item, values)
        if (patch === null) {
            return
        }
        setSaving(true)
        save(patch)
            .then(() => notifySuccess(`Guardado ${item.code}`))
            .catch(() => {
                // El aviso lo da la consulta; el punto se queda como lo escribió la persona.
            })
            .finally(() => setSaving(false))
    }

    return (
        <Stack gap={4} role="group" aria-label={`Punto ${item.code}`}>
            <Group gap="xs">
                <Text size="sm" fw={500}>{`${item.code} ${item.label ?? ''}${range}`}</Text>
                {item.outOfRange === true && <Badge color="red" variant="light">Fuera de rango</Badge>}
            </Group>
            <Group align="flex-end" gap="sm" wrap="wrap">
                <TextInput label="Medida" w={120} inputMode="decimal" value={values.measuredValue}
                           onChange={(event) => change('measuredValue')(event.currentTarget.value)}/>
                <Checkbox label="Ajustado" checked={values.adjusted} onChange={(event) => change('adjusted')(event.currentTarget.checked)}/>
                <TextInput label="Tras el ajuste" w={130} inputMode="decimal" value={values.valueAfterAdjustment}
                           onChange={(event) => change('valueAfterAdjustment')(event.currentTarget.value)}/>
                <Select label="Resultado" w={160} clearable data={CHECK_ITEM_RESULT.selectable()} value={values.itemResult}
                        onChange={change('itemResult')}/>
                <TextInput label="Notas" w={240} value={values.notes} onChange={(event) => change('notes')(event.currentTarget.value)}/>
                <Button size="xs" loading={saving} onClick={submit} aria-label={`Guardar ${item.code}`}>Guardar</Button>
            </Group>
        </Stack>
    )
}

function present(value) {
    return value !== null && value !== undefined
}
