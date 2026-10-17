import {Button, Group, Modal, Select, SimpleGrid, Stack, Textarea, TextInput} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {INSTRUMENT_KIND} from '../../api/resources/enums.js'
import {instrumentPatch, newInstrumentRequest} from '../../api/resources/instruments.js'
import {unitLabel} from '../../api/resources/values.js'
import {saveErrors} from '../../ui/errors/saveErrors.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import {dateNotBefore, INSTRUMENT_LENGTHS, maxLength, requiredText} from './resourcesForms.js'
import {useSaveInstrument} from './useResources.js'

/**
 * El alta y la modificación de un instrumento (el port de InstrumentEditorDialog). Se exige lo
 * evidente: código, nombre y tipo, la longitud de cada columna y una calibración que no caduque antes
 * de hacerse. El código no cambia después del alta, y uno repetido es un 409 INT-409 con el diálogo
 * abierto. Sin fecha de caducidad no tiene calibración que vigilar. La modificación es un merge-patch
 * con lo cambiado y la versión leída; sin cambios, se cierra sin llamar.
 *
 * @param {object|null} instrument el que se modifica, o null para el alta
 */
export default function InstrumentEditorModal({instrument, onClose}) {
    const creating = instrument === null
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            code: instrument?.code ?? '',
            name: instrument?.name ?? '',
            kind: instrument?.kind ?? null,
            serialNumber: instrument?.serialNumber ?? '',
            calibratedOn: instrument?.calibratedOn ?? null,
            calibrationExpiresOn: instrument?.calibrationExpiresOn ?? null,
            notes: instrument?.notes ?? '',
        },
        validate: {
            code: creating ? requiredText('El código es obligatorio', INSTRUMENT_LENGTHS.code) : null,
            name: requiredText('El nombre es obligatorio', INSTRUMENT_LENGTHS.name),
            kind: (value) => (value ? null : 'El tipo es obligatorio'),
            serialNumber: maxLength(INSTRUMENT_LENGTHS.serialNumber),
            calibrationExpiresOn: dateNotBefore('calibratedOn', 'La calibración no puede caducar antes de hacerse'),
            notes: maxLength(INSTRUMENT_LENGTHS.notes),
        },
    })
    const saving = useSaveInstrument()
    const kinds = INSTRUMENT_KIND.isKnown(instrument?.kind) || !instrument?.kind
        ? INSTRUMENT_KIND.selectable()
        : [{value: instrument.kind, label: INSTRUMENT_KIND.label(instrument.kind)}, ...INSTRUMENT_KIND.selectable()]

    const save = form.onSubmit((values) => {
        const body = creating ? newInstrumentRequest(values) : instrumentPatch(instrument, values)
        if (body === null) {
            onClose()
            return
        }
        saving.mutate({id: creating ? null : instrument.id, body}, {
            onSuccess: (saved) => {
                notifySuccess(`Guardado ${unitLabel(saved ?? instrument)}`)
                onClose()
            },
            onError: saveErrors(form),
        })
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="lg" title={creating ? 'Nuevo instrumento' : `Modificar ${unitLabel(instrument)}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <TextInput label="Código" withAsterisk={creating} readOnly={!creating} description="Letras, cifras, ., - y _; no cambia"
                                   maxLength={INSTRUMENT_LENGTHS.code} {...form.getInputProps('code')}/>
                        <TextInput label="Nombre" withAsterisk maxLength={INSTRUMENT_LENGTHS.name} {...form.getInputProps('name')}/>
                        <Select label="Tipo" withAsterisk allowDeselect={false} data={kinds} {...form.getInputProps('kind')}/>
                        <TextInput label="Número de serie" maxLength={INSTRUMENT_LENGTHS.serialNumber} {...form.getInputProps('serialNumber')}/>
                        <DateInput label="Calibrado" clearable valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                                   {...form.getInputProps('calibratedOn')}/>
                        <DateInput label="Calibración hasta" clearable valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                                   description="Con ella caducada no entra en un turno" {...form.getInputProps('calibrationExpiresOn')}/>
                    </SimpleGrid>
                    <Textarea label="Notas" rows={2} maxLength={INSTRUMENT_LENGTHS.notes} {...form.getInputProps('notes')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={saving.isPending}>Guardar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
