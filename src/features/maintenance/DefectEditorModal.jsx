import {Button, Group, Modal, Select, SimpleGrid, Stack, Text, Textarea, TextInput} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {defectFormValues, defectPatch, defectRequest} from '../../api/maintenance/defects.js'
import {DEFECT_SEVERITY} from '../../api/maintenance/enums.js'
import {assetLabel} from '../../api/maintenance/values.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {DATE_FORMAT, DATE_TIME_FORMAT, parseTypedDate, parseTypedDateTime} from '../../ui/typedDates.js'
import {saveErrors} from './maintenanceErrors.js'
import {kpNotBefore, maxLength, optionalKp, required, requiredText} from './maintenanceForms.js'
import {AssetPicker} from './MaintenancePickers.jsx'
import {useSaveDefect} from './useMaintenance.js'

const CORRECTION_LENGTH = 120
const DESCRIPTION_LENGTH = 4000

/**
 * El alta y la modificación de un defecto (el port de DefectEditorDialog y DefectForm). El alta elige
 * el activo, o lo trae de la orden desde cuya ficha se abre (y queda vinculado a ella); gravedad y
 * descripción son obligatorias. Sin fecha de detección, ahora; una futura la rechaza el servicio. La
 * modificación, mientras no esté cerrado ni descartado, manda solo lo cambiado, con la versión leída.
 *
 * @param {object|null} defect el que se modifica, o null para un alta
 * @param {object|null} [order] la orden desde cuya ficha se da de alta
 * @param {Function} [onSaved] defecto guardado → lo que haga la pantalla
 */
export default function DefectEditorModal({defect, order = null, onClose, onSaved = () => {}}) {
    const creating = defect === null
    const pickAsset = creating && order === null
    const form = useForm({
        mode: 'controlled',
        initialValues: defectFormValues(defect),
        validate: {
            assetId: pickAsset ? required('El activo es obligatorio') : null,
            severity: required('La gravedad es obligatoria'),
            description: requiredText('La descripción es obligatoria', DESCRIPTION_LENGTH),
            correctionType: maxLength(CORRECTION_LENGTH),
            startKp: creating ? optionalKp : null,
            endKp: creating ? (value, values) => optionalKp(value) ?? kpNotBefore('startKp')(value, values) : null,
        },
    })
    const saving = useSaveDefect()

    const save = form.onSubmit((values) => {
        const body = creating ? defectRequest(values, {asset: order?.asset ?? null, orderId: order?.id ?? null}) : defectPatch(defect, values)
        if (body === null) {
            onClose()
            return
        }
        saving.mutate({id: creating ? null : defect.id, body}, {
            onSuccess: (saved) => {
                notifySuccess(`Guardado ${saved.code}`)
                onClose()
                onSaved(saved)
            },
            onError: saveErrors(form),
        })
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="lg" title={creating ? 'Nuevo defecto' : `Modificar ${defect.code}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    {creating && order && (
                        <Text size="sm">{`Defecto de la orden ${order.code} sobre ${assetLabel(order.asset)}; queda vinculado a ella.`}</Text>
                    )}
                    {pickAsset && <AssetPicker label="Activo" withAsterisk {...form.getInputProps('assetId')}/>}
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <Select label="Gravedad" withAsterisk data={DEFECT_SEVERITY.selectable()} {...form.getInputProps('severity')}/>
                        <DateInput label="Reparación prevista" clearable valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                                   {...form.getInputProps('repairPlannedDate')}/>
                        {creating && (
                            <>
                                <DateInput label="Detectado" description="Vacío: ahora" withTime clearable valueFormat={DATE_TIME_FORMAT}
                                           dateParser={parseTypedDateTime} placeholder="DD/MM/AAAA HH:mm" {...form.getInputProps('detectedAt')}/>
                                <div/>
                                <TextInput label="KP inicial" inputMode="decimal" {...form.getInputProps('startKp')}/>
                                <TextInput label="KP final" inputMode="decimal" {...form.getInputProps('endKp')}/>
                            </>
                        )}
                    </SimpleGrid>
                    <Textarea label="Descripción" withAsterisk rows={2} {...form.getInputProps('description')}/>
                    <Textarea label="Notas técnicas" rows={2} {...form.getInputProps('technicalNotes')}/>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <TextInput label="Tipo de corrección" maxLength={CORRECTION_LENGTH} {...form.getInputProps('correctionType')}/>
                        <TextInput label="Piezas cambiadas" {...form.getInputProps('partsReplaced')}/>
                    </SimpleGrid>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={saving.isPending}>Guardar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
