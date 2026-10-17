import {Button, Checkbox, Group, Modal, MultiSelect, Select, SimpleGrid, Stack, Textarea, TextInput, Title} from '@mantine/core'
import {useForm} from '@mantine/form'
import {
    capabilityLabel,
    categoriesOf,
    DRIVING_LICENCE,
    RAIL_GEAR_TYPE,
    VEHICLE_CAPABILITIES,
    VEHICLE_CATEGORY,
    VEHICLE_MOBILITY,
    VEHICLE_POWER,
} from '../../api/resources/enums.js'
import {
    figureTravels,
    newVehicleTypeRequest,
    SECTION,
    sectionOffered,
    VEHICLE_TYPE_FIGURES,
    vehicleTypePatch,
} from '../../api/resources/fleet.js'
import {unitLabel} from '../../api/resources/values.js'
import {saveErrors} from '../../ui/errors/saveErrors.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {maxLength, optionalFigure, requiredText, VEHICLE_TYPE_LENGTHS} from './resourcesForms.js'
import {join} from './resourcesTexts.js'
import {useActiveQualificationTypes, useSaveVehicleType} from './useResources.js'

const SECTION_TITLES = Object.freeze({
    [SECTION.GENERAL]: 'Dimensiones y pesos',
    [SECTION.TRACK]: 'En vía',
    [SECTION.ROAD_RAIL]: 'Bivial',
    [SECTION.ROAD]: 'Por carretera',
    [SECTION.CAPABILITY]: 'Capacidades y sus cifras',
})

/**
 * El alta y la modificación de un modelo de vehículo (el port de VehicleTypeEditorDialog), por
 * secciones según su movilidad: las cifras de vía no se ofrecen en uno de solo carretera ni las de
 * carretera en uno de solo vía; el equipo ferroviario (9A, 9B, 9C), los minutos de encarrilado y el
 * acceso preparado, solo en una bivial; la categoría, solo las de su movilidad. Cada capacidad enseña
 * sus cifras y quitarla las vacía. El código y la movilidad no cambian después del alta. Que el modelo
 * sea coherente lo dice el servicio (400 con el motivo), con el diálogo abierto.
 *
 * «Habilitación del conductor» es el tipo de cualificación que exige a quien lo conduce, entre los
 * activos (el leído se ve aunque se haya retirado). En el alta, vacía, el servicio pone la que toca por
 * su movilidad y su permiso; al modificar, vaciarla viaja a null y no exige ninguna. mto-maintenance
 * pide, al iniciar un turno, una persona distinta habilitada por cada vehículo autopropulsado.
 *
 * @param {object|null} type el modelo que se modifica, o null para el alta
 */
export default function VehicleTypeEditorModal({type, onClose}) {
    const creating = type === null
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            code: type?.code ?? '',
            name: type?.name ?? '',
            manufacturer: type?.manufacturer ?? '',
            model: type?.model ?? '',
            mobility: type?.mobility ?? null,
            category: type?.category ?? null,
            selfPropelled: type ? type.selfPropelled !== false : true,
            portable: type?.portable === true,
            power: type?.power ?? null,
            transportModeAuthorised: type?.transportModeAuthorised === true,
            railGearType: type?.railGearType ?? null,
            needsPreparedAccess: type?.needsPreparedAccess === true,
            requiredLicence: type?.requiredLicence ?? null,
            capabilities: [...(type?.capabilities ?? [])],
            requiredDriverQualificationTypeId: type?.requiredDriverQualification?.id ?? null,
            notes: type?.notes ?? '',
            ...Object.fromEntries(VEHICLE_TYPE_FIGURES.map((figure) => [figure.field, type?.[figure.field] == null ? '' : String(type[figure.field])])),
        },
        validate: {
            code: creating ? requiredText('El código es obligatorio', VEHICLE_TYPE_LENGTHS.code) : null,
            name: requiredText('El nombre es obligatorio', VEHICLE_TYPE_LENGTHS.name),
            manufacturer: maxLength(VEHICLE_TYPE_LENGTHS.make),
            model: maxLength(VEHICLE_TYPE_LENGTHS.make),
            mobility: (value) => (value ? null : 'La movilidad es obligatoria'),
            category: (value) => (value ? null : 'La categoría es obligatoria'),
            railGearType: (value, values) => (value || values.mobility !== 'ROAD_RAIL' ? null : 'Una bivial dice su equipo ferroviario'),
            ...Object.fromEntries(VEHICLE_TYPE_FIGURES.map((figure) => [figure.field, (value, values) => (
                figureTravels(figure, values.mobility, values.capabilities) ? optionalFigure(figure)(value) : null)])),
        },
    })
    const saving = useSaveVehicleType()
    const qualificationTypes = useActiveQualificationTypes()
    const {mobility, capabilities} = form.values
    const driverOptions = withCurrentQualification((qualificationTypes.data?.content ?? []).map(qualificationOption),
        type?.requiredDriverQualification)
    const categories = withCurrent(categoriesOf(mobility), type?.category)
    const capabilityOptions = [...Object.entries(VEHICLE_CAPABILITIES).map(([value, label]) => ({value, label})),
        ...(type?.capabilities ?? []).filter((code) => !VEHICLE_CAPABILITIES[code]).map((code) => ({value: code, label: capabilityLabel(code)}))]

    // La categoría de otra movilidad se quita.
    const changeMobility = (next) => {
        form.setFieldValue('mobility', next)
        if (form.values.category && !categoriesOf(next).some((option) => option.value === form.values.category)) {
            form.setFieldValue('category', null)
        }
    }

    const save = form.onSubmit((values) => {
        const body = creating ? newVehicleTypeRequest(values) : vehicleTypePatch(type, values)
        if (body === null) {
            onClose()
            return
        }
        saving.mutate({id: creating ? null : type.id, body}, {
            onSuccess: (saved) => {
                notifySuccess(`Guardado ${unitLabel(saved ?? type)}`)
                onClose()
            },
            onError: saveErrors(form),
        })
    })

    const figuresOf = (section) => VEHICLE_TYPE_FIGURES
        .filter((figure) => figure.section === section && (!figure.capability || capabilities.includes(figure.capability)))
        .map((figure) => <TextInput key={figure.field} label={figure.label} {...form.getInputProps(figure.field)}/>)
    const section = (key, children) => (sectionOffered(key, mobility)
        ? (
            <Stack key={key} gap="xs" aria-label={SECTION_TITLES[key]} role="group">
                <Title order={5}>{SECTION_TITLES[key]}</Title>
                <SimpleGrid cols={{base: 1, sm: 3}}>{children}</SimpleGrid>
            </Stack>
        )
        : null)

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="xl" title={creating ? 'Nuevo modelo de vehículo' : `Modificar ${unitLabel(type)}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <SimpleGrid cols={{base: 1, sm: 3}}>
                        <TextInput label="Código" withAsterisk={creating} readOnly={!creating} description="Letras, cifras, ., - y _"
                                   maxLength={VEHICLE_TYPE_LENGTHS.code} {...form.getInputProps('code')}/>
                        <TextInput label="Nombre" withAsterisk maxLength={VEHICLE_TYPE_LENGTHS.name} {...form.getInputProps('name')}/>
                        <TextInput label="Fabricante" maxLength={VEHICLE_TYPE_LENGTHS.make} {...form.getInputProps('manufacturer')}/>
                        <TextInput label="Modelo" maxLength={VEHICLE_TYPE_LENGTHS.make} {...form.getInputProps('model')}/>
                        <Select label="Movilidad" withAsterisk={creating} readOnly={!creating} allowDeselect={false}
                                description={creating ? 'No cambia después: decide qué cifras lleva' : 'No cambia'}
                                data={creating ? VEHICLE_MOBILITY.selectable() : [{value: type.mobility, label: VEHICLE_MOBILITY.label(type.mobility)}]}
                                {...form.getInputProps('mobility')} onChange={changeMobility}/>
                        <Select label="Categoría" withAsterisk searchable data={categories} {...form.getInputProps('category')}/>
                        <Select label="Propulsión" clearable data={VEHICLE_POWER.selectable()} {...form.getInputProps('power')}/>
                        <Checkbox label="Autopropulsado" mt="lg" {...form.getInputProps('selfPropelled', {type: 'checkbox'})}/>
                        <Checkbox label="Portátil (se pone a mano)" mt="lg" {...form.getInputProps('portable', {type: 'checkbox'})}/>
                        <Select label="Habilitación del conductor" clearable searchable data={driverOptions} nothingFoundMessage="Ninguna"
                                clearButtonProps={{'aria-label': 'Quitar la habilitación del conductor'}}
                                description={creating ? 'Vacía: la de su movilidad y su permiso' : 'Vacía: no exige ninguna'}
                                {...form.getInputProps('requiredDriverQualificationTypeId')}/>
                    </SimpleGrid>
                    {section(SECTION.GENERAL, figuresOf(SECTION.GENERAL))}
                    {section(SECTION.TRACK, [
                        ...figuresOf(SECTION.TRACK),
                        <Checkbox key="transport" label="Autorizado a circular por vía abierta" mt="lg"
                                  {...form.getInputProps('transportModeAuthorised', {type: 'checkbox'})}/>,
                    ])}
                    {section(SECTION.ROAD_RAIL, [
                        <Select key="gear" label="Equipo ferroviario" withAsterisk data={RAIL_GEAR_TYPE.selectable()}
                                {...form.getInputProps('railGearType')}/>,
                        ...figuresOf(SECTION.ROAD_RAIL),
                        <Checkbox key="access" label="Necesita un acceso preparado (no le vale un paso a nivel)" mt="lg"
                                  {...form.getInputProps('needsPreparedAccess', {type: 'checkbox'})}/>,
                    ])}
                    {section(SECTION.ROAD, [
                        ...figuresOf(SECTION.ROAD),
                        <Select key="licence" label="Permiso de conducir" clearable data={DRIVING_LICENCE.selectable()}
                                {...form.getInputProps('requiredLicence')}/>,
                    ])}
                    {section(SECTION.CAPABILITY, [
                        <MultiSelect key="capabilities" label="Capacidades" clearable searchable data={capabilityOptions}
                                     {...form.getInputProps('capabilities')}/>,
                        ...figuresOf(SECTION.CAPABILITY),
                    ])}
                    <Textarea label="Notas" rows={2} {...form.getInputProps('notes')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={saving.isPending}>Guardar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}

/** La categoría leída se ve aunque no sea de la lista (una desconocida). */
function withCurrent(options, current) {
    if (!current || options.some((option) => option.value === current)) {
        return options
    }
    return [{value: current, label: VEHICLE_CATEGORY.label(current)}, ...options]
}

function qualificationOption(type) {
    return {value: type.id, label: join(type.code, type.name)}
}

/** La habilitación leída se ve aunque ya no esté entre las activas: si no, el campo la leería vacía y la mandaría a vaciar. */
function withCurrentQualification(options, current) {
    if (!current || options.some((option) => option.value === current.id)) {
        return options
    }
    return [qualificationOption(current), ...options]
}
