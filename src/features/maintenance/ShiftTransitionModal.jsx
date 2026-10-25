import {Button, Fieldset, Group, Modal, Select, SimpleGrid, Stack, Text, Textarea, TextInput} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {SHIFT_STATUS} from '../../api/maintenance/enums.js'
import {parkingRowError, parkingsRequest, shiftTransitionRequest, transitionFormValues} from '../../api/maintenance/shifts.js'
import {unitLabel} from '../../api/resources/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {DATE_TIME_FORMAT, parseTypedDateTime} from '../../ui/typedDates.js'
import {ReferenceSelect} from '../infrastructure/ReferencePickers.jsx'
import {useConfigurationNames} from '../infrastructure/useConfigurationNames.js'
import {useParkingSites} from '../resources/useResources.js'
import {saveErrors} from './maintenanceErrors.js'
import {optionalKp, optionalNonNegativeInteger} from './maintenanceForms.js'
import {useShiftTransition} from './useMaintenance.js'

const TRANSITIONS = Object.freeze({
    start: {label: 'Iniciar', when: 'Inicio real'},
    close: {label: 'Cerrar', when: 'Fin real'},
})
const PARKING_FIELDS = Object.freeze(['parkingSiteId', 'trackId', 'kp', 'description', 'vehicleId'])

/** Un sitio que alcanza un vehículo por su movilidad: uno de solo vía, con acceso por vía; uno de solo carretera, por carretera. */
function reaches(site, mobility) {
    if (mobility === 'RAIL_ONLY') {
        return site.railAccess === true
    }
    if (mobility === 'ROAD_ONLY') {
        return site.roadAccess === true
    }
    return true
}

/**
 * Iniciar o cerrar un turno (el port de ShiftTransitionDialog). Lo que se deja vacío lo pone el
 * servicio: el inicio o el fin reales, ahora; los minutos netos, desde el corte de tensión (o el
 * inicio) hasta el fin. Al cerrar, las tareas que no se terminaron vuelven a su orden sin cancelarse,
 * y cada vehículo del turno dice dónde se deja (el port de ParkingRows): un sitio que alcanza por su
 * movilidad (con resources-read), una vía y su kp (con config-read, y no en uno de solo carretera) o un
 * texto. Solo viaja lo rellenado; lo evidente se dice en su fila antes de llamar, y sus errores del
 * servicio (parkings[0].kp) caen también en su fila. Si el estado cambió entre medias (409 TRN-001), el
 * servicio rechaza una hora o un aparcamiento (409 SHF-001), el diálogo sigue abierto.
 *
 * @param {'start'|'close'} kind
 */
export default function ShiftTransitionModal({kind, shift, onClose}) {
    const transition = TRANSITIONS[kind]
    const vehicles = kind === 'close' ? shift.vehicles ?? [] : []
    const readsResources = useSession().has(P.RESOURCES_READ)
    const names = useConfigurationNames({tracks: true})
    const sites = useParkingSites({enabled: readsResources && vehicles.length > 0})
    const form = useForm({
        mode: 'controlled',
        initialValues: transitionFormValues(shift),
        validate: (values) => {
            const errors = {}
            if (kind === 'close') {
                const minutes = optionalNonNegativeInteger(values.netWorkMinutes)
                if (minutes) {
                    errors.netWorkMinutes = minutes
                }
                values.parkings.forEach((row, index) => {
                    const kp = optionalKp(row.kp)
                    const rule = kp ? {field: 'kp', message: kp} : parkingRowError(row, vehicles[index]?.mobility)
                    if (rule) {
                        errors[`parkings.${index}.${rule.field}`] = rule.message
                    }
                })
            }
            return errors
        },
    })
    const saving = useShiftTransition(shift.id)

    const save = form.onSubmit((values) => {
        // Un error del servicio sobre parkings[i] es de la fila de la que salió el i-ésimo que se mandó.
        const aliases = {actualStart: 'when', actualEnd: 'when'}
        parkingsRequest(values.parkings).rowOf.forEach((row, sent) => {
            for (const field of PARKING_FIELDS) {
                aliases[`parkings[${sent}].${field}`] = `parkings.${row}.${field === 'vehicleId' ? 'description' : field}`
            }
        })
        saving.mutate({transition: kind, body: shiftTransitionRequest(kind, values)}, {
            onSuccess: (updated) => {
                notifySuccess(`${updated.code}: ${SHIFT_STATUS.label(updated.status).toLowerCase()}`)
                onClose()
            },
            onError: saveErrors(form, {aliases}),
        })
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size={vehicles.length > 0 ? 'xl' : 'md'} title={`${transition.label} ${shift.code}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    {kind === 'close' && <Text size="sm">Las tareas que no se terminaron vuelven a su orden, sin cancelarse.</Text>}
                    <DateInput label={transition.when} description="Vacío: ahora" withTime clearable valueFormat={DATE_TIME_FORMAT}
                               dateParser={parseTypedDateTime} placeholder="DD/MM/AAAA HH:mm" {...form.getInputProps('when')}/>
                    <DateInput label="Corte de tensión" withTime clearable valueFormat={DATE_TIME_FORMAT} dateParser={parseTypedDateTime}
                               placeholder="DD/MM/AAAA HH:mm" {...form.getInputProps('voltageCutoffAt')}/>
                    {kind === 'close' && (
                        <>
                            <TextInput label="Minutos netos de trabajo" inputMode="numeric"
                                       description="Vacío: los calcula el servicio desde el corte de tensión (o el inicio)"
                                       {...form.getInputProps('netWorkMinutes')}/>
                            <Textarea label="Observaciones" rows={3} {...form.getInputProps('observations')}/>
                        </>
                    )}
                    {vehicles.length > 0 && (
                        <Stack gap="xs">
                            <Text fw={500}>Dónde queda cada vehículo</Text>
                            <Text size="sm" c="dimmed">Solo viaja lo rellenado; un vehículo sin nada se queda en el estacionamiento del turno.</Text>
                            {vehicles.map((vehicle, index) => (
                                <Fieldset key={vehicle.vehicleId} legend={unitLabel(vehicle)} aria-label={`Dónde queda ${vehicle.code}`}>
                                    <SimpleGrid cols={{base: 1, sm: 4}}>
                                        {readsResources && (
                                            <Select label="Sitio" clearable searchable
                                                    data={(sites.data?.content ?? []).filter((site) => reaches(site, vehicle.mobility))
                                                        .map((site) => ({value: site.id, label: unitLabel(site)}))}
                                                    {...form.getInputProps(`parkings.${index}.parkingSiteId`)}/>
                                        )}
                                        {names.readsConfiguration && vehicle.mobility !== 'ROAD_ONLY' && (
                                            <>
                                                <ReferenceSelect label="Vía" options={names.trackOptions}
                                                                 {...form.getInputProps(`parkings.${index}.trackId`)}/>
                                                <TextInput label="KP" inputMode="decimal" {...form.getInputProps(`parkings.${index}.kp`)}/>
                                            </>
                                        )}
                                        <TextInput label="Descripción" maxLength={500} {...form.getInputProps(`parkings.${index}.description`)}/>
                                    </SimpleGrid>
                                </Fieldset>
                            ))}
                        </Stack>
                    )}
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Volver</Button>
                        <Button type="submit" loading={saving.isPending}>{transition.label}</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
