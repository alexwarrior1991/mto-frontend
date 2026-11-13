import {ActionIcon, Alert, Button, Checkbox, Group, Modal, Stack, Text, TextInput, Title, Tooltip} from '@mantine/core'
import {IconArrowDown, IconArrowUp, IconPlus, IconTrash} from '@tabler/icons-react'
import {useState} from 'react'
import {inPlanOrder, TEMPLATE_ITEM_CODE, TEMPLATE_LENGTHS, TEMPLATE_MAX_ITEMS, templateRequest} from '../../api/maintenance/catalogs.js'
import {ASSET_TYPE} from '../../api/maintenance/enums.js'
import {notifyApiError, notifyMessages} from '../../ui/errors/notifyError.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {templateVersionErrors, toText} from './maintenanceForms.js'
import {templateVersionNotice} from './maintenanceTexts.js'
import {useCreateInspectionTemplate} from './useMaintenance.js'

const RULES = Object.freeze({maxItems: TEMPLATE_MAX_ITEMS, codePattern: TEMPLATE_ITEM_CODE})

/** Los campos de un punto que tienen su sitio en la fila; requiresMeasure cae en el texto. */
const ITEM_FIELDS = Object.freeze({code: 'code', label: 'label', unit: 'unit', minValue: 'minValue', maxValue: 'maxValue', requiresMeasure: 'label'})

// La clave de cada fila en pantalla: una fila se mueve con sus campos y sus errores.
let rowSequence = 0

/** Una fila del editor con lo que trae un punto leído, o vacía. */
function newRow(item = null) {
    rowSequence += 1
    return {
        key: rowSequence,
        code: toText(item?.code), label: toText(item?.label), unit: toText(item?.unit),
        minValue: toText(item?.minValue), maxValue: toText(item?.maxValue), requiresMeasure: item?.requiresMeasure === true,
    }
}

const ITEM_FIELD = /^items\[(\d+)]\.([A-Za-z]+)$/
const ITEM_ELEMENT = /^items\[(\d+)]$/

/**
 * La versión siguiente de la plantilla de inspección de un tipo de activo (el port de
 * InspectionTemplateVersionDialog): su nombre y la lista ENTERA de puntos en orden, partiendo de los de
 * la versión de la que se sale (vacía si el tipo no tiene ninguna).
 *
 * - Una versión no cambia sus puntos nunca: cambiar un checklist es crear otra versión, que nace activa
 *   y deja como anterior a la activa. El aviso de arriba lo dice antes; no hay un segundo «¿seguro?».
 * - replacesVersion es el número de la activa del tipo tal como se leyó, y no viaja si no había: si
 *   entre medias otra persona creó o activó otra, el servicio responde 409 CON-001 sin escribir nada,
 *   el diálogo sigue abierto y la lista no se relee sola.
 * - Lo evidente se comprueba antes de llamar con las reglas del servicio. Sus errores por campo caen en
 *   el nombre, en el campo de su fila (items[1].code; la posición en la lista que se mandó es la fila en
 *   pantalla) o bajo la lista (items, y «Fila 2: …» de items[1]); lo demás se avisa con su ruta delante.
 *
 * @param {string} assetType el tipo de activo de la versión nueva
 * @param {object|null} base la versión de la que se parte (su nombre y sus puntos), o null para empezar vacía
 * @param {object|null} active la versión activa del tipo tal como se leyó, o null si no tiene
 * @param {Function} onSaved la versión creada, para elegirla en la lista
 */
export default function InspectionTemplateVersionModal({assetType, base, active, onSaved, onClose}) {
    const type = ASSET_TYPE.label(assetType)
    const [name, setName] = useState(toText(base?.name))
    const [rows, setRows] = useState(() => inPlanOrder(base?.items).map((item) => newRow(item)))
    // {name, list, rows: {clave de la fila: {code, label, unit, minValue, maxValue}}}
    const [errors, setErrors] = useState({name: null, list: null, rows: {}})
    const creating = useCreateInspectionTemplate()

    // Añadir, quitar, subir o bajar borra el error de la lista.
    const reorder = (change) => {
        setRows(change)
        setErrors((current) => ({...current, list: null}))
    }
    const move = (index, offset) => reorder((current) => {
        const next = [...current]
        const [row] = next.splice(index, 1)
        next.splice(index + offset, 0, row)
        return next
    })
    const edit = (key, field, value) => {
        setRows((current) => current.map((row) => (row.key === key ? {...row, [field]: value} : row)))
        setErrors((current) => ({...current, rows: {...current.rows, [key]: {...current.rows[key], [field]: null}}}))
    }

    const save = (event) => {
        event.preventDefault()
        const found = templateVersionErrors({name, items: rows}, RULES)
        setErrors({name: found.name, list: found.list, rows: Object.fromEntries(rows.map((row, index) => [row.key, found.items[index]]))})
        if (!found.valid) {
            return
        }
        const sent = rows
        creating.mutate(templateRequest({assetType, name, items: sent, replacesVersion: active?.version ?? null}), {
            onSuccess: (created) => {
                notifySuccess(`Creada la versión ${created.version} de la plantilla de ${type}, ya activa`)
                onSaved(created)
                onClose()
            },
            onError: (error) => {
                if (!error?.hasFieldErrors) {
                    notifyApiError(error)
                    return
                }
                showServerErrors(error.fieldErrors, sent)
            },
        })
    }

    /** Cada error del servicio en su campo, en el de su fila o bajo la lista; lo demás, avisado con su ruta. */
    const showServerErrors = (fieldErrors, sent) => {
        const next = {name: null, list: null, rows: {}}
        const ofTheList = []
        const unattributed = []
        for (const item of fieldErrors) {
            const message = item.message ?? item.code ?? 'Valor no válido'
            const field = item.field ?? ''
            const inRow = ITEM_FIELD.exec(field)
            const element = ITEM_ELEMENT.exec(field)
            const row = inRow ? sent[Number(inRow[1])] : null
            if (field === 'name') {
                next.name = message
            } else if (row && ITEM_FIELDS[inRow[2]]) {
                next.rows[row.key] = {...next.rows[row.key], [ITEM_FIELDS[inRow[2]]]: message}
            } else if (field === 'items') {
                ofTheList.push(message)
            } else if (element) {
                ofTheList.push(`Fila ${Number(element[1]) + 1}: ${message}`)
            } else {
                unattributed.push(field ? `${field}: ${message}` : message)
            }
        }
        next.list = ofTheList.length > 0 ? ofTheList.join('. ') : null
        setErrors(next)
        notifyMessages(unattributed)
    }

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="90rem" title={`Nueva versión de la plantilla de ${type}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <Alert variant="light" color="blue">{templateVersionNotice(assetType, base, active)}</Alert>
                    <TextInput label="Nombre" withAsterisk maxLength={TEMPLATE_LENGTHS.name} value={name} error={errors.name}
                               onChange={(event) => {
                                   setName(event.currentTarget.value)
                                   setErrors((current) => ({...current, name: null}))
                               }}/>
                    <Title order={4}>Puntos, en su orden</Title>
                    {rows.map((row, index) => {
                        const position = index + 1
                        const rowErrors = errors.rows[row.key] ?? {}
                        const text = (field, label, placeholder, width, extra = {}) => (
                            <TextInput aria-label={`Punto ${position}: ${label}`} placeholder={placeholder} w={width} value={row[field]}
                                       error={rowErrors[field]} onChange={(event) => edit(row.key, field, event.currentTarget.value)} {...extra}/>
                        )
                        return (
                            <Group key={row.key} role="group" aria-label={`Punto ${position}`} align="flex-start" gap="xs" wrap="nowrap">
                                {text('code', 'código', 'Código', 150, {maxLength: TEMPLATE_LENGTHS.code})}
                                {text('label', 'texto', 'Texto del punto', undefined, {maxLength: TEMPLATE_LENGTHS.label, style: {flex: 1}})}
                                {text('unit', 'unidad', 'Unidad', 100, {maxLength: TEMPLATE_LENGTHS.unit})}
                                {text('minValue', 'mínimo', 'Mínimo', 110, {inputMode: 'decimal'})}
                                {text('maxValue', 'máximo', 'Máximo', 110, {inputMode: 'decimal'})}
                                <Checkbox mt={8} label="Exige medida" aria-label={`Punto ${position}: exige medida`} checked={row.requiresMeasure}
                                          onChange={(event) => edit(row.key, 'requiresMeasure', event.currentTarget.checked)}/>
                                <Group gap={2} mt={4} wrap="nowrap">
                                    <RowButton label={`Subir el punto ${position}`} icon={IconArrowUp} disabled={index === 0}
                                               onClick={() => move(index, -1)}/>
                                    <RowButton label={`Bajar el punto ${position}`} icon={IconArrowDown} disabled={index === rows.length - 1}
                                               onClick={() => move(index, 1)}/>
                                    <RowButton label={`Quitar el punto ${position}`} icon={IconTrash} color="red"
                                               onClick={() => reorder((current) => current.filter((other) => other.key !== row.key))}/>
                                </Group>
                            </Group>
                        )
                    })}
                    {errors.list && <Text size="sm" c="red" role="alert">{errors.list}</Text>}
                    <Group>
                        <Button variant="default" leftSection={<IconPlus size={16}/>} disabled={rows.length >= TEMPLATE_MAX_ITEMS}
                                onClick={() => reorder((current) => [...current, newRow()])}>
                            Añadir punto
                        </Button>
                    </Group>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={creating.isPending}>Crear y activar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}

function RowButton({label, icon: Icon, color, disabled = false, onClick}) {
    return (
        <Tooltip label={label} withArrow>
            <ActionIcon variant="subtle" color={color} aria-label={label} disabled={disabled} onClick={onClick}>
                <Icon size={16}/>
            </ActionIcon>
        </Tooltip>
    )
}
