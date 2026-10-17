import {Button, Group, Modal, Select, SimpleGrid, Stack, Textarea, TextInput} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {VEHICLE_DOCUMENT_KIND} from '../../api/resources/enums.js'
import {offeredDocumentKinds, vehicleDocumentFormValues, vehicleDocumentPatch, vehicleDocumentRequest} from '../../api/resources/vehicles.js'
import {unitLabel} from '../../api/resources/values.js'
import {saveErrors} from '../../ui/errors/saveErrors.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import {dateNotBefore, EXPIRY_LENGTHS, maxLength, required} from './resourcesForms.js'
import {useSaveVehicleDocument} from './useResources.js'

/**
 * El alta y la modificación de un documento de un vehículo (el port de VehicleDocumentDialog). En el
 * alta se elige su tipo entre los que el vehículo no tiene ya (409 VDO-409); después no cambia, y
 * renovarlo es cambiar su caducidad, que es obligatoria y no se vacía. Se exige lo evidente: el tipo, la
 * caducidad, que no sea anterior a la expedición, y la longitud de cada columna. La modificación es un
 * merge-patch con lo cambiado y la versión leída; sin cambios, se cierra sin llamar.
 *
 * @param {object} vehicle el vehículo
 * @param {object|null} document el que se modifica, o null para el alta
 * @param {object[]} held los que ya tiene, cuyos tipos el alta no ofrece
 */
export default function VehicleDocumentModal({vehicle, document, held, onClose}) {
    const creating = document === null
    const form = useForm({
        mode: 'controlled',
        initialValues: vehicleDocumentFormValues(document),
        validate: {
            kind: creating ? required('El tipo es obligatorio') : null,
            reference: maxLength(EXPIRY_LENGTHS.reference),
            expiresOn: (value, values) => required('La caducidad es obligatoria')(value)
                ?? dateNotBefore('issuedOn', 'La caducidad no puede ser anterior a la expedición')(value, values),
            notes: maxLength(EXPIRY_LENGTHS.notes),
        },
    })
    const saving = useSaveVehicleDocument(vehicle.id)

    const save = form.onSubmit((values) => {
        const body = creating ? vehicleDocumentRequest(values) : vehicleDocumentPatch(document, values)
        if (body === null) {
            onClose()
            return
        }
        saving.mutate({id: creating ? null : document.id, body}, {
            onSuccess: (saved) => {
                notifySuccess(`Guardado ${VEHICLE_DOCUMENT_KIND.label(saved?.kind ?? values.kind ?? document.kind)} de ${vehicle.code}`)
                onClose()
            },
            onError: saveErrors(form),
        })
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="lg"
               title={creating ? `Nuevo documento de ${unitLabel(vehicle)}` : `Modificar ${VEHICLE_DOCUMENT_KIND.label(document.kind)} de ${unitLabel(vehicle)}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    {creating
                        ? (
                            <Select label="Tipo" withAsterisk data={offeredDocumentKinds(VEHICLE_DOCUMENT_KIND.selectable(), held)}
                                    description="Los que aún no tiene" nothingFoundMessage="Ninguno" {...form.getInputProps('kind')}/>
                        )
                        : (
                            <TextInput label="Tipo" readOnly description="No cambia: renovarlo es cambiar su caducidad"
                                       value={VEHICLE_DOCUMENT_KIND.label(document.kind)}/>
                        )}
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <TextInput label="Referencia" maxLength={EXPIRY_LENGTHS.reference} {...form.getInputProps('reference')}/>
                        <DateInput label="Expedido" clearable valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                                   {...form.getInputProps('issuedOn')}/>
                        <DateInput label="Caduca" withAsterisk valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
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
