import {Button, Group, Modal, Select, SimpleGrid, Stack, Textarea, TextInput} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {
    offeredQualificationTypes,
    personQualificationFormValues,
    personQualificationPatch,
    personQualificationRequest,
} from '../../api/resources/qualifications.js'
import {personLabel} from '../../api/resources/values.js'
import {saveErrors} from '../../ui/errors/saveErrors.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import {dateNotBefore, EXPIRY_LENGTHS, maxLength, required} from './resourcesForms.js'
import {join} from './resourcesTexts.js'
import {useActiveQualificationTypes, useSavePersonQualification} from './useResources.js'

/**
 * El alta y la modificación de una cualificación de una persona (el port de QualificationDialog).
 *
 * - En el alta se elige su tipo entre los activos que la persona no tiene ya: cada tipo está una vez
 *   (409 QUA-001), y renovar una es cambiar su caducidad. El tipo no cambia después.
 * - Solo se exige lo evidente: el tipo, la longitud de cada columna y una caducidad que no sea anterior
 *   a la expedición. Lo demás lo dice el servicio con el diálogo abierto.
 * - La modificación es un merge-patch con lo que cambió y la versión leída; todo se puede vaciar (sin
 *   caducidad, no caduca). Sin cambios, se cierra sin llamar.
 *
 * Las propiedades del formulario se llaman como los campos de la petición, para que los errores del
 * servicio caigan en su campo.
 *
 * @param {object} person la persona
 * @param {object|null} qualification la que se modifica, o null para el alta
 * @param {object[]} held las que ya tiene, que el alta no ofrece
 */
export default function QualificationModal({person, qualification, held, onClose}) {
    const creating = qualification === null
    const types = useActiveQualificationTypes({enabled: creating})
    const form = useForm({
        mode: 'controlled',
        initialValues: personQualificationFormValues(qualification),
        validate: {
            qualificationTypeId: creating ? required('El tipo es obligatorio') : null,
            reference: maxLength(EXPIRY_LENGTHS.reference),
            expiresOn: dateNotBefore('issuedOn', 'La caducidad no puede ser anterior a la expedición'),
            notes: maxLength(EXPIRY_LENGTHS.notes),
        },
    })
    const saving = useSavePersonQualification(person.id)
    const offered = offeredQualificationTypes(types.data?.content, held)
    const chosen = creating ? offered.find((type) => type.id === form.values.qualificationTypeId) : qualification.qualificationType
    const typeLabel = (type) => join(type?.code, type?.name)

    const save = form.onSubmit((values) => {
        const body = creating ? personQualificationRequest(values) : personQualificationPatch(qualification, values)
        if (body === null) {
            onClose()
            return
        }
        saving.mutate({id: creating ? null : qualification.id, body}, {
            onSuccess: (saved) => {
                notifySuccess(`Guardada ${(saved?.qualificationType ?? chosen)?.code ?? ''} de ${person.code}`)
                onClose()
            },
            onError: saveErrors(form),
        })
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="lg"
               title={creating ? `Nueva cualificación de ${personLabel(person)}` : `Modificar ${qualification.qualificationType?.code} de ${personLabel(person)}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    {creating
                        ? (
                            <Select label="Tipo" withAsterisk searchable data={offered.map((type) => ({value: type.id, label: typeLabel(type)}))}
                                    description="Los activos que aún no tiene" nothingFoundMessage="Ninguno" {...form.getInputProps('qualificationTypeId')}/>
                        )
                        : <TextInput label="Tipo" readOnly description="No cambia: renovarla es cambiar su caducidad" value={typeLabel(chosen)}/>}
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <TextInput label="Referencia" maxLength={EXPIRY_LENGTHS.reference} {...form.getInputProps('reference')}/>
                        <DateInput label="Expedida" clearable valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                                   {...form.getInputProps('issuedOn')}/>
                        <DateInput label="Caduca" clearable valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                                   description={chosen?.validityMonths ? `Vacía: no caduca. Vigencia habitual: ${chosen.validityMonths} meses`
                                       : 'Vacía: no caduca'}
                                   {...form.getInputProps('expiresOn')}/>
                    </SimpleGrid>
                    <Textarea label="Notas" rows={2} maxLength={EXPIRY_LENGTHS.notes} {...form.getInputProps('notes')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={saving.isPending}>Guardar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
