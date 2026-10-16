import {Button, Group, Modal, Select, SimpleGrid, Stack, Text, TextInput} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {useState} from 'react'
import {headCategories, LINEMAN_CATEGORIES, MAX_LINEMEN, MIN_LINEMEN, UNIT_KIND, WORK_DISCIPLINE} from '../../api/resources/enums.js'
import {disciplineUnder, newUnitRequest, parentsFor, unitPatch} from '../../api/resources/units.js'
import {unitLabel} from '../../api/resources/values.js'
import {saveErrors} from '../../ui/errors/saveErrors.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import {ReferencesMultiSelect} from '../maintenance/MaintenancePickers.jsx'
import {useConfigurationNames} from '../maintenance/useMaintenanceNames.js'
import {PeopleMultiSelect, PersonSelect} from './ResourcesPickers.jsx'
import {requiredText, UNIT_LENGTHS} from './resourcesForms.js'
import {useSaveUnit} from './useResources.js'

/**
 * El alta y la modificación de una unidad del organigrama (el port de UnitEditorDialog).
 *
 * - Lo que decide sin llamar sale del árbol ya cargado y de las reglas copiadas del servicio, solo
 *   para no ofrecer lo que va a fallar: el padre, de un nivel estrictamente superior y de su disciplina;
 *   la disciplina, la del padre si la tiene; el jefe, de las categorías de su nivel.
 * - Un equipo nace completo: su jefe y de 2 a 6 linemen, que no sean el jefe, comprobados antes de
 *   llamar. Lo demás (UNI-001, UNI-409, VAL-001) lo dice el servicio con el diálogo abierto.
 * - La modificación no cambia el código, el nivel ni la disciplina; es un merge-patch con lo que
 *   cambió y la versión leída. Sin config-read los EP se ven como #id y no viajan.
 *
 * @param {object|null} unit la unidad que se modifica, o null para el alta
 * @param {object|null} [parent] al dar de alta, el padre ya elegido (desde su fila o su ficha)
 * @param {Array} tree el árbol del organigrama, para los candidatos a padre
 * @param {Function} [onSaved] (unidad guardada) después de guardar
 */
export default function UnitEditorModal({unit, parent = null, tree, onClose, onSaved = () => {}}) {
    const creating = unit === null
    const names = useConfigurationNames()
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            code: unit?.code ?? '',
            name: unit?.name ?? '',
            kind: creating ? null : unit.kind,
            parentId: creating ? parent?.id ?? null : unit.parent?.id ?? null,
            discipline: creating ? disciplineUnder(tree, parent?.id) : unit.discipline ?? null,
            headPersonId: unit?.head?.id ?? null,
            executionPackageIds: [...(unit?.executionPackageIds ?? [])].sort((a, b) => a - b).map(String),
            memberPersonIds: [],
            joinedOn: null,
        },
        validate: {
            code: creating ? requiredText('El código es obligatorio', UNIT_LENGTHS.code) : null,
            name: requiredText('El nombre es obligatorio', UNIT_LENGTHS.name),
            kind: (value) => (value ? null : 'El nivel es obligatorio'),
            parentId: (value, values) => (value || values.kind === 'PROJECT'
                ? null : 'Una unidad cuelga de otra de un nivel superior; solo un proyecto no cuelga de nada'),
            discipline: (value, values) => (value || values.kind === 'PROJECT' ? null : 'Nada por encima tiene disciplina: dila'),
            headPersonId: (value, values) => (value || values.kind !== 'TEAM' ? null : 'Un equipo trabaja siempre con su jefe'),
            memberPersonIds: (value, values) => {
                if (!creating || values.kind !== 'TEAM') {
                    return null
                }
                if (value.length < MIN_LINEMEN || value.length > MAX_LINEMEN) {
                    return `Un equipo nace con 2 a 6 linemen, no con ${value.length}`
                }
                return values.headPersonId && value.includes(values.headPersonId) ? 'El jefe no va también de lineman' : null
            },
        },
    })
    const saving = useSaveUnit()
    // La categoría del jefe elegido: si deja de valer para el nivel, el jefe se quita.
    const [headCategory, setHeadCategory] = useState(unit?.head?.category ?? null)
    const {kind, parentId, discipline} = form.values
    const team = kind === 'TEAM'
    const project = kind === 'PROJECT'
    const inherited = creating ? disciplineUnder(tree, parentId) : null
    const candidates = parentsFor(tree, kind, {discipline: creating ? null : unit.discipline, selfId: unit?.id ?? null})
    const parentOptions = withChosen(candidates.map((node) => ({value: node.id, label: unitLabel(node)})),
        creating ? parent : unit.parent)
    const allowedHeads = headCategories(kind, discipline)

    const keepHead = (level, disc) => {
        if (headCategory && !headCategories(level, disc).includes(headCategory)) {
            form.setFieldValue('headPersonId', null)
            setHeadCategory(null)
        }
    }
    const changeKind = (next) => {
        form.setFieldValue('kind', next)
        keepHead(next, form.values.discipline)
        const stillParent = parentsFor(tree, next, {selfId: unit?.id ?? null}).some((node) => node.id === form.values.parentId)
        if (next === 'PROJECT' || !stillParent) {
            changeParent(null, next)
        }
    }
    const changeParent = (next, level = kind) => {
        form.setFieldValue('parentId', next)
        if (creating) {
            const fromParent = level === 'PROJECT' ? null : disciplineUnder(tree, next)
            const nextDiscipline = fromParent ?? (level === 'PROJECT' ? null : form.values.discipline)
            form.setFieldValue('discipline', nextDiscipline)
            keepHead(level, nextDiscipline)
        }
    }
    const changeDiscipline = (next) => {
        form.setFieldValue('discipline', next)
        keepHead(kind, next)
    }

    const save = form.onSubmit((values) => {
        const body = creating ? newUnitRequest(readable(values)) : unitPatch(unit, readable(values), {readsPackages: names.readsConfiguration})
        if (body === null) {
            onClose()
            return
        }
        saving.mutate({id: creating ? null : unit.id, body}, {
            onSuccess: (saved) => {
                notifySuccess(`Guardada ${unitLabel(saved ?? unit)}`)
                onClose()
                onSaved(saved)
            },
            onError: saveErrors(form),
        })
    })
    // Sin config-read no se eligen EP: no viaja ninguno en el alta y los leídos se quedan como están.
    const readable = (values) => (names.readsConfiguration ? values : {...values, executionPackageIds: creating ? [] : values.executionPackageIds})

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="xl" title={creating ? 'Nueva unidad' : `Modificar ${unitLabel(unit)}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <TextInput label="Código" withAsterisk={creating} readOnly={!creating} maxLength={UNIT_LENGTHS.code}
                                   description="Letras, cifras, - y _; un equipo, el código con el que lo conoce mantenimiento"
                                   {...form.getInputProps('code')}/>
                        <TextInput label="Nombre" withAsterisk maxLength={UNIT_LENGTHS.name} {...form.getInputProps('name')}/>
                        <Select label="Nivel" withAsterisk={creating} readOnly={!creating} data={creating ? UNIT_KIND.selectable() : kindOf(unit)}
                                allowDeselect={false} {...form.getInputProps('kind')} onChange={changeKind}/>
                        {!project && (
                            <Select label="Depende de" withAsterisk searchable data={parentOptions} nothingFoundMessage="Ninguna unidad de un nivel superior"
                                    {...form.getInputProps('parentId')} onChange={(next) => changeParent(next)}/>
                        )}
                        {!project && (
                            <Select label="Disciplina" withAsterisk={!inherited && creating} readOnly={!creating || Boolean(inherited)}
                                    data={WORK_DISCIPLINE.selectable()} allowDeselect={false}
                                    description={creating ? (inherited ? `La de ${unitCode(tree, parentId)}` : 'Nada por encima la tiene: dila') : null}
                                    {...form.getInputProps('discipline')} onChange={changeDiscipline}/>
                        )}
                        <PersonSelect label="Jefe" withAsterisk={team} categories={allowedHeads} current={unit?.head ?? null}
                                      description={team ? 'Un equipo se dirige siempre: el jefe se sustituye, no se quita' : 'Vacío: vacante'}
                                      {...form.getInputProps('headPersonId')} onChange={(next, option) => {
                                          form.setFieldValue('headPersonId', next)
                                          setHeadCategory(option?.person?.category ?? null)
                                      }}/>
                        {names.readsConfiguration
                            ? (
                                <ReferencesMultiSelect label="EP" description="Los paquetes de ejecución en los que trabaja" options={names.packageOptions}
                                                       {...form.getInputProps('executionPackageIds')}/>
                            )
                            : (
                                <TextInput label="EP" readOnly value={(unit?.executionPackageIds ?? []).map((id) => `#${id}`).join(', ')}
                                           description="Sin permiso para leer infraestructura: se quedan como están"/>
                            )}
                        {creating && team && (
                            <PeopleMultiSelect label="Linemen" withAsterisk categories={LINEMAN_CATEGORIES}
                                               description={`${form.values.memberPersonIds.length} de 2 a 6`}
                                               {...form.getInputProps('memberPersonIds')}/>
                        )}
                        {creating && team && (
                            <DateInput label="Entran el" description="Vacío: hoy" clearable valueFormat={DATE_FORMAT} dateParser={parseTypedDate}
                                       placeholder="DD/MM/AAAA" {...form.getInputProps('joinedOn')}/>
                        )}
                    </SimpleGrid>
                    {!creating && <Text size="sm" c="dimmed">El código, el nivel y la disciplina no cambian.</Text>}
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={saving.isPending}>Guardar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}

/** El padre que ya tiene el campo se ve aunque ya no fuera un candidato (desactivado después). */
function withChosen(options, chosen) {
    if (!chosen || options.some((option) => option.value === chosen.id)) {
        return options
    }
    return [{value: chosen.id, label: unitLabel(chosen)}, ...options]
}

function kindOf(unit) {
    return [{value: unit.kind, label: UNIT_KIND.label(unit.kind)}]
}

function unitCode(tree, id) {
    const stack = [...(tree ?? [])]
    while (stack.length > 0) {
        const node = stack.pop()
        if (node.id === id) {
            return node.code
        }
        stack.push(...(node.children ?? []))
    }
    return ''
}
