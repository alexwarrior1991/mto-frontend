import {Button, Group, Modal, Select, SimpleGrid, Stack, Textarea} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {absenceFormValues, absencePatch, absenceRequest} from '../../api/resources/absences.js'
import {ABSENCE_KIND} from '../../api/resources/enums.js'
import {personLabel} from '../../api/resources/values.js'
import {saveErrors} from '../../ui/errors/saveErrors.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import {ABSENCE_LENGTHS, dateNotBefore, maxLength, required} from './resourcesForms.js'
import {useSaveAbsence} from './useResources.js'

/**
 * El alta y la modificación de una ausencia de una persona (el port de AbsenceDialog). Solo se exige lo
 * evidente: la clase, las dos fechas y un fin que no sea anterior al inicio. Que no se solape con otra
 * suya lo dice el servicio (409 ABS-001), con el diálogo abierto. La modificación es un merge-patch con lo
 * que cambió y la versión leída; sin cambios, se cierra sin llamar.
 *
 * @param {object} person la persona
 * @param {object|null} absence la que se modifica, o null para el alta
 */
export default function AbsenceModal({person, absence, onClose}) {
    const creating = absence === null
    const form = useForm({
        mode: 'controlled',
        initialValues: absenceFormValues(absence),
        validate: {
            kind: required('La clase es obligatoria'),
            startsOn: required('El inicio es obligatorio'),
            endsOn: (value, values) => required('El fin es obligatorio')(value)
                ?? dateNotBefore('startsOn', 'El fin no puede ser anterior al inicio')(value, values),
            notes: maxLength(ABSENCE_LENGTHS.notes),
        },
    })
    const saving = useSaveAbsence(person.id)

    const save = form.onSubmit((values) => {
        const body = creating ? absenceRequest(values) : absencePatch(absence, values)
        if (body === null) {
            onClose()
            return
        }
        saving.mutate({id: creating ? null : absence.id, body}, {
            onSuccess: () => {
                notifySuccess(`Guardada la ausencia de ${person.code}`)
                onClose()
            },
            onError: saveErrors(form),
        })
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="lg"
               title={creating ? `Nueva ausencia de ${personLabel(person)}` : `Modificar la ausencia de ${personLabel(person)}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <Select label="Clase" withAsterisk allowDeselect={false} data={ABSENCE_KIND.selectable()}
                            description="Solo la ve Recursos: mantenimiento recibe las fechas" {...form.getInputProps('kind')}/>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <DateInput label="Desde" withAsterisk valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                                   {...form.getInputProps('startsOn')}/>
                        <DateInput label="Hasta" withAsterisk valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                                   description="Incluido" {...form.getInputProps('endsOn')}/>
                    </SimpleGrid>
                    <Textarea label="Notas" rows={2} maxLength={ABSENCE_LENGTHS.notes} {...form.getInputProps('notes')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={saving.isPending}>Guardar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
