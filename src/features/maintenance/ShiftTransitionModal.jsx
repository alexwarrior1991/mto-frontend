import {Button, Group, Modal, Stack, Text, Textarea, TextInput} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {SHIFT_STATUS} from '../../api/maintenance/enums.js'
import {shiftTransitionRequest, transitionFormValues} from '../../api/maintenance/shifts.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {DATE_TIME_FORMAT, parseTypedDateTime} from '../../ui/typedDates.js'
import {saveErrors} from './maintenanceErrors.js'
import {optionalNonNegativeInteger} from './maintenanceForms.js'
import {useShiftTransition} from './useMaintenance.js'

const TRANSITIONS = Object.freeze({
    start: {label: 'Iniciar', when: 'Inicio real'},
    close: {label: 'Cerrar', when: 'Fin real'},
})

/**
 * Iniciar o cerrar un turno (el port de ShiftTransitionDialog). Lo que se deja vacío lo pone el
 * servicio: el inicio o el fin reales, ahora; los minutos netos, desde el corte de tensión (o el
 * inicio) hasta el fin. Al cerrar, las tareas que no se terminaron vuelven a su orden sin cancelarse.
 * Si el estado cambió entre medias (409 TRN-001) o el servicio rechaza una hora, el diálogo sigue
 * abierto.
 *
 * @param {'start'|'close'} kind
 */
export default function ShiftTransitionModal({kind, shift, onClose}) {
    const transition = TRANSITIONS[kind]
    const form = useForm({
        mode: 'controlled',
        initialValues: transitionFormValues(shift),
        validate: {netWorkMinutes: kind === 'close' ? optionalNonNegativeInteger : null},
    })
    const saving = useShiftTransition(shift.id)

    const save = form.onSubmit((values) => {
        saving.mutate({transition: kind, body: shiftTransitionRequest(kind, values)}, {
            onSuccess: (updated) => {
                notifySuccess(`${updated.code}: ${SHIFT_STATUS.label(updated.status).toLowerCase()}`)
                onClose()
            },
            onError: saveErrors(form, {aliases: {actualStart: 'when', actualEnd: 'when'}}),
        })
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} title={`${transition.label} ${shift.code}`}>
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
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Volver</Button>
                        <Button type="submit" loading={saving.isPending}>{transition.label}</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
