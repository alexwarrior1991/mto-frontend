import {Button, Group, Modal, Select, SimpleGrid, Stack, Textarea, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {DRIVING_LICENCE, QUALIFICATION_KIND} from '../../api/resources/enums.js'
import {newQualificationTypeRequest, qualificationTypePatch, takesDrivingLicence} from '../../api/resources/qualifications.js'
import {unitLabel} from '../../api/resources/values.js'
import {saveErrors} from '../../ui/errors/saveErrors.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {maxLength, optionalFigure, QUALIFICATION_TYPE_LENGTHS, requiredText} from './resourcesForms.js'
import {useSaveQualificationType} from './useResources.js'

const VALIDITY_MONTHS = optionalFigure({integers: 0, decimals: 0, min: 1})

/**
 * El alta y la modificación de un tipo de cualificación (el port de QualificationTypeEditorDialog). El
 * permiso de conducir (B, C o C+E) solo se ofrece, y se exige, en un permiso de conducir: pasar a otra
 * clase lo vacía. La vigencia habitual, en meses enteros, es opcional. El código no cambia después del
 * alta, y uno repetido es un 409 QTY-409 con el diálogo abierto. La modificación es un merge-patch con
 * lo cambiado y la versión leída; sin cambios, se cierra sin llamar.
 *
 * @param {object|null} type el tipo que se modifica, o null para el alta
 */
export default function QualificationTypeEditorModal({type, onClose}) {
    const creating = type === null
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            code: type?.code ?? '',
            name: type?.name ?? '',
            kind: type?.kind ?? null,
            drivingLicence: type?.drivingLicence ?? null,
            validityMonths: type?.validityMonths == null ? '' : String(type.validityMonths),
            description: type?.description ?? '',
        },
        validate: {
            code: creating ? requiredText('El código es obligatorio', QUALIFICATION_TYPE_LENGTHS.code) : null,
            name: requiredText('El nombre es obligatorio', QUALIFICATION_TYPE_LENGTHS.name),
            kind: (value) => (value ? null : 'La clase es obligatoria'),
            drivingLicence: (value, values) => (value || !takesDrivingLicence(values.kind) ? null : 'Un permiso de conducir dice cuál'),
            validityMonths: VALIDITY_MONTHS,
            description: maxLength(QUALIFICATION_TYPE_LENGTHS.description),
        },
    })
    const saving = useSaveQualificationType()

    const save = form.onSubmit((values) => {
        const body = creating ? newQualificationTypeRequest(values) : qualificationTypePatch(type, values)
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

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="lg"
               title={creating ? 'Nuevo tipo de cualificación' : `Modificar ${unitLabel(type)}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <TextInput label="Código" withAsterisk={creating} readOnly={!creating} description="Letras, cifras, ., - y _; no cambia"
                                   maxLength={QUALIFICATION_TYPE_LENGTHS.code} {...form.getInputProps('code')}/>
                        <TextInput label="Nombre" withAsterisk maxLength={QUALIFICATION_TYPE_LENGTHS.name} {...form.getInputProps('name')}/>
                        <Select label="Clase" withAsterisk allowDeselect={false} data={withCurrent(QUALIFICATION_KIND, type?.kind)}
                                {...form.getInputProps('kind')}/>
                        {takesDrivingLicence(form.values.kind) && (
                            <Select label="Permiso de conducir" withAsterisk data={withCurrent(DRIVING_LICENCE, type?.drivingLicence)}
                                    {...form.getInputProps('drivingLicence')}/>
                        )}
                        <TextInput label="Vigencia habitual (meses)" inputMode="numeric" {...form.getInputProps('validityMonths')}/>
                    </SimpleGrid>
                    <Textarea label="Descripción" rows={2} maxLength={QUALIFICATION_TYPE_LENGTHS.description} {...form.getInputProps('description')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={saving.isPending}>Guardar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}

/** Lo leído se ve aunque el enumerado no lo conozca: un valor nuevo del servicio, como «Desconocido». */
function withCurrent(enumeration, current) {
    const options = enumeration.selectable()
    return !current || enumeration.isKnown(current) ? options : [{value: current, label: enumeration.label(current)}, ...options]
}
