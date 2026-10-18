import {Button, Group, Modal, Select, SimpleGrid, Stack, Text, Textarea, TextInput} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {toLocalDateParam} from '../../api/dates.js'
import {POSSESSION} from '../../api/maintenance/enums.js'
import {
    crewText,
    SHIFT_LEADER_CATEGORIES,
    SHIFT_SUPERVISOR_CATEGORIES,
    shiftFormValues,
    shiftPatch,
    shiftRequest,
} from '../../api/maintenance/shifts.js'
import {LINEMAN_CATEGORIES} from '../../api/resources/enums.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {DATE_FORMAT, DATE_TIME_FORMAT, parseTypedDate, parseTypedDateTime} from '../../ui/typedDates.js'
import {InstrumentsMultiSelect, PeopleMultiSelect, PersonSelect, VehiclesMultiSelect} from '../resources/ResourcesPickers.jsx'
import {saveErrors} from './maintenanceErrors.js'
import {dateTimeAfter, kpAfter, maxLength, optionalKp, required} from './maintenanceForms.js'
import {AssetsMultiPicker, ReferenceSelect, ReferencesMultiSelect, TeamSelect} from './MaintenancePickers.jsx'
import {useConfigurationNames} from './useMaintenanceNames.js'
import {useSaveShift, useTeams} from './useMaintenance.js'

const TEXT_LENGTH = 120
const EARTHING_LENGTH = 500
const PARKING_LENGTH = 255
const MEASUREMENT_LENGTH = 500

/**
 * El alta y la modificación de un turno planificado o en curso (el port de ShiftEditorDialog y
 * ShiftForm). Fecha, posesión y vías (al menos una) son obligatorias y no se vacían; los seccionadores
 * que se abren se buscan en el servidor. La modificación manda solo lo que cambió, con vías y
 * seccionadores enteros si cambiaron, y la versión leída. Que una vía desviada pida posesión total lo
 * dice el servicio al trabajar sus tareas.
 *
 * La dotación, los vehículos y los instrumentos son de mto-resources y se buscan allí con
 * resources-read: el jefe, cualquiera menos un operario; el supervisor, de supervisor para arriba; los
 * linemen, operarios o jefes de equipo; los vehículos, activos y disponibles; los instrumentos, activos.
 * En el alta, la dotación y los vehículos que se dejen vacíos los copia el servicio del equipo si es de
 * mto-resources. Las demás reglas (de 2 a 6 linemen para iniciar, las plazas, el remolque, una persona o
 * un vehículo en otro turno del día, nada caducado a la fecha del turno, un conductor habilitado
 * distinto por vehículo al iniciar) las dice el servicio con 409 SHF-001, con el diálogo abierto; un
 * instrumento que aún no le ha llegado es un 404 MSI-404. Sin resources-read se leen y no viajan.
 *
 * Las propiedades del formulario se llaman como los campos de la petición, para que los errores del
 * servicio caigan en su campo.
 *
 * @param {object|null} shift el turno que se modifica, o null para un alta
 * @param {Function} [onSaved] turno guardado → lo que haga la pantalla (abrir la ficha del nuevo)
 */
export default function ShiftEditorModal({shift, onClose, onSaved = () => {}}) {
    const creating = shift === null
    const readsResources = useSession().has(P.RESOURCES_READ)
    const names = useConfigurationNames({tracks: true})
    const teams = useTeams()
    const form = useForm({
        mode: 'controlled',
        initialValues: shiftFormValues(shift, {today: toLocalDateParam(new Date())}),
        validate: {
            shiftDate: required('La fecha es obligatoria'),
            possessionType: required('La posesión es obligatoria'),
            trackIds: required('Al menos una vía'),
            startKp: optionalKp,
            endKp: (value, values) => optionalKp(value) ?? kpAfter('startKp', 'El KP final tiene que ser mayor que el inicial')(value, values),
            plannedEnd: dateTimeAfter('plannedStart', 'El fin previsto tiene que ser posterior al inicio'),
            baseName: maxLength(TEXT_LENGTH),
            vehicle: maxLength(TEXT_LENGTH),
            earthingPoints: maxLength(EARTHING_LENGTH),
            parkingPlace: maxLength(PARKING_LENGTH),
            measurementEquipment: maxLength(MEASUREMENT_LENGTH),
        },
    })
    const saving = useSaveShift()

    const save = form.onSubmit((values) => {
        const body = creating ? shiftRequest(values, {readsResources}) : shiftPatch(shift, values, {readsResources})
        if (body === null) {
            onClose()
            return
        }
        saving.mutate({id: creating ? null : shift.id, body}, {
            onSuccess: (saved) => {
                notifySuccess(`Guardado ${saved.code}`)
                onClose()
                onSaved(saved)
            },
            onError: saveErrors(form),
        })
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="xl" title={creating ? 'Nuevo turno' : `Modificar ${shift.code}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <DateInput label="Fecha" withAsterisk valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                                   {...form.getInputProps('shiftDate')}/>
                        <Select label="Posesión" withAsterisk allowDeselect={false} data={POSSESSION.selectable()}
                                description="Parcial entre semana; los grupos 3 y 5 y las vías desviadas piden total"
                                {...form.getInputProps('possessionType')}/>
                    </SimpleGrid>
                    <ReferencesMultiSelect label="Vías" withAsterisk options={names.trackOptions} {...form.getInputProps('trackIds')}/>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <TeamSelect label="Equipo" teams={teams.data} current={shift?.team ?? null} {...form.getInputProps('teamId')}/>
                        <ReferenceSelect label="Paquete de ejecución" options={names.packageOptions} {...form.getInputProps('executionPackageId')}/>
                        <TextInput label="KP inicial" inputMode="decimal" {...form.getInputProps('startKp')}/>
                        <TextInput label="KP final" inputMode="decimal" {...form.getInputProps('endKp')}/>
                        <DateInput label="Inicio previsto" withTime clearable valueFormat={DATE_TIME_FORMAT} dateParser={parseTypedDateTime}
                                   placeholder="DD/MM/AAAA HH:mm" {...form.getInputProps('plannedStart')}/>
                        <DateInput label="Fin previsto" withTime clearable valueFormat={DATE_TIME_FORMAT} dateParser={parseTypedDateTime}
                                   placeholder="DD/MM/AAAA HH:mm" {...form.getInputProps('plannedEnd')}/>
                    </SimpleGrid>
                    <AssetsMultiPicker label="Seccionadores que se abren" type="DISCONNECTOR" current={shift?.blockingDisconnectors ?? []}
                                       {...form.getInputProps('blockingDisconnectorIds')}/>
                    {readsResources && (
                        <>
                            <SimpleGrid cols={{base: 1, sm: 2}}>
                                <PersonSelect label="Jefe del turno" categories={SHIFT_LEADER_CATEGORIES} current={shift?.teamLeader ?? null}
                                              description={creating ? 'Vacío: el del equipo, si es de mto-resources' : null}
                                              {...form.getInputProps('teamLeaderPersonId')}/>
                                <PersonSelect label="Supervisor" categories={SHIFT_SUPERVISOR_CATEGORIES} current={shift?.supervisor ?? null}
                                              description={creating ? 'Vacío: el del equipo, si es de mto-resources' : null}
                                              {...form.getInputProps('supervisorPersonId')}/>
                            </SimpleGrid>
                            <PeopleMultiSelect label="Linemen" categories={LINEMAN_CATEGORIES} current={shift?.linemen ?? []}
                                               description={creating ? 'Vacío: los del equipo, si es de mto-resources. Para iniciar, de 2 a 6'
                                                   : 'Para iniciar, de 2 a 6'}
                                               {...form.getInputProps('linemanPersonIds')}/>
                            <VehiclesMultiSelect label="Vehículos" current={shift?.vehicles ?? []}
                                                 description={creating ? 'Vacío: el del equipo, si es de mto-resources' : null}
                                                 {...form.getInputProps('vehicleIds')}/>
                            <InstrumentsMultiSelect label="Instrumentos" current={shift?.instruments ?? []}
                                                    description="Pértigas, detectores y equipos de medida, con la calibración vigente a la fecha del turno"
                                                    {...form.getInputProps('instrumentIds')}/>
                        </>
                    )}
                    {!readsResources && !creating && <Text size="sm" aria-label="Dotación del turno">{crewText(shift)}</Text>}
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <TextInput label="Base" maxLength={TEXT_LENGTH} description={creating ? 'Vacía: la del equipo' : null}
                                   {...form.getInputProps('baseName')}/>
                        <TextInput label="Vehículo" maxLength={TEXT_LENGTH} description={creating ? 'Vacío: el del equipo' : null}
                                   {...form.getInputProps('vehicle')}/>
                        <TextInput label="Puntos de puesta a tierra" maxLength={EARTHING_LENGTH} {...form.getInputProps('earthingPoints')}/>
                        <TextInput label="Estacionamiento" maxLength={PARKING_LENGTH} {...form.getInputProps('parkingPlace')}/>
                        <TextInput label="Equipos de medida" maxLength={MEASUREMENT_LENGTH}
                                   description={readsResources ? 'Texto de los turnos de antes: los instrumentos se eligen arriba' : null}
                                   {...form.getInputProps('measurementEquipment')}/>
                    </SimpleGrid>
                    <Textarea label="Personal" rows={2} {...form.getInputProps('personnel')}/>
                    <Textarea label="Observaciones" rows={3} {...form.getInputProps('observations')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={saving.isPending}>Guardar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
