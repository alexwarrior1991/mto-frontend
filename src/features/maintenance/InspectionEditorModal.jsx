import {Button, Group, Modal, Select, SimpleGrid, Stack, Text, Textarea, TextInput} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {toLocalDateParam} from '../../api/dates.js'
import {INSPECTION_KIND, INSPECTION_RESULT, recordsInspections, SHIFT_STATUS} from '../../api/maintenance/enums.js'
import {inspectionFormValues, inspectionPatch, inspectionRequest} from '../../api/maintenance/inspections.js'
import {tracksOf} from '../../api/maintenance/shifts.js'
import {assetLabel, teamLabel} from '../../api/maintenance/values.js'
import {formatDate} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import {saveErrors} from './maintenanceErrors.js'
import {maxLength, optionalKp, required} from './maintenanceForms.js'
import {AssetPicker} from './MaintenancePickers.jsx'
import {useRecentShiftsOn, useSaveInspection} from './useMaintenance.js'

const INSPECTOR_LENGTH = 100

/**
 * El alta y la modificación de una inspección (el port de InspectionEditorDialog e InspectionForm).
 * El alta elige el activo, o lo trae de la orden de inspección desde la que se abre (y queda como su
 * origen); la plantilla activa del tipo de activo la copia el servicio. Que el resultado case con los
 * puntos lo comprueba el servicio (422 INS-001), con el diálogo abierto. El alta puede llevar el turno
 * en que se hizo, entre los recientes de las vías del activo que se han trabajado: sale en su parte, y
 * uno que no le vale es un 409 SHF-001 con el diálogo abierto. La modificación manda solo lo cambiado,
 * con la versión leída, y no cambia el turno.
 *
 * @param {object|null} inspection la que se modifica, o null para un alta
 * @param {object|null} [originOrder] la orden de inspección desde la que se da de alta
 * @param {Function} [onSaved] inspección guardada → lo que haga la pantalla
 */
export default function InspectionEditorModal({inspection, originOrder = null, onClose, onSaved = () => {}}) {
    const creating = inspection === null
    const pickAsset = creating && originOrder === null
    const form = useForm({
        mode: 'controlled',
        initialValues: inspectionFormValues(inspection, {today: toLocalDateParam(new Date())}),
        validate: {
            assetId: pickAsset ? required('El activo es obligatorio') : null,
            inspectionDate: required('La fecha es obligatoria'),
            result: required('El resultado es obligatorio'),
            inspector: maxLength(INSPECTOR_LENGTH),
            kp: optionalKp,
        },
    })
    const saving = useSaveInspection()
    // El activo de la inspección: el de la orden de la que sale o el elegido. Sus turnos, los de su vía
    // y los de la conectada; solo uno trabajado (en curso o cerrado) la registra.
    const asset = creating ? originOrder?.asset ?? form.getValues().assetId : null
    const shifts = useRecentShiftsOn(asset ? tracksOf(asset) : null)
    const shiftOptions = (shifts.data?.content ?? []).filter((shift) => recordsInspections(shift.status))
        .map((shift) => ({value: shift.id, label: shiftLabel(shift)}))

    const save = form.onSubmit((values) => {
        const body = creating
            ? inspectionRequest(values, {asset: originOrder?.asset ?? null, originOrderId: originOrder?.id ?? null})
            : inspectionPatch(inspection, values)
        if (body === null) {
            onClose()
            return
        }
        saving.mutate({id: creating ? null : inspection.id, body}, {
            onSuccess: (saved) => {
                notifySuccess(`Guardada ${saved.code}`)
                onClose()
                onSaved(saved)
            },
            onError: saveErrors(form),
        })
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="lg" title={creating ? 'Nueva inspección' : `Modificar ${inspection.code}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    {creating && originOrder && (
                        <Text size="sm">{`Inspección de la orden ${originOrder.code} sobre ${assetLabel(originOrder.asset)}.`}</Text>
                    )}
                    {pickAsset && (
                        <AssetPicker label="Activo" withAsterisk {...form.getInputProps('assetId')} onChange={(picked) => {
                            // Otro activo, otras vías: el turno elegido podría no recorrerlas.
                            form.setFieldValue('assetId', picked)
                            form.setFieldValue('shiftId', null)
                        }}/>
                    )}
                    {creating && (
                        <Select label="Turno" clearable searchable placeholder={asset ? 'Ninguno' : 'Elige antes el activo'} disabled={!asset}
                                description="Opcional: el turno en curso o cerrado de su vía en que se hizo; sale en su parte"
                                nothingFoundMessage="Ningún turno de su vía" data={shiftOptions} {...form.getInputProps('shiftId')}/>
                    )}
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <DateInput label="Fecha" withAsterisk valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                                   {...form.getInputProps('inspectionDate')}/>
                        <Select label="Resultado" withAsterisk allowDeselect={false} data={INSPECTION_RESULT.selectable()}
                                {...form.getInputProps('result')}/>
                        <Select label="Tipo" allowDeselect={false} data={INSPECTION_KIND.selectable()} {...form.getInputProps('inspectionKind')}/>
                        <TextInput label="Inspector" maxLength={INSPECTOR_LENGTH} {...form.getInputProps('inspector')}/>
                        <TextInput label="KP" inputMode="decimal" {...form.getInputProps('kp')}/>
                    </SimpleGrid>
                    <Textarea label="Descripción" rows={2} {...form.getInputProps('description')}/>
                    <Textarea label="Defectos observados" rows={2} {...form.getInputProps('detectedDefects')}/>
                    <Textarea label="Acciones recomendadas" rows={2} {...form.getInputProps('recommendedActions')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={saving.isPending}>Guardar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}

function shiftLabel(shift) {
    return [shift.code, formatDate(shift.shiftDate), shift.team ? teamLabel(shift.team) : null, SHIFT_STATUS.label(shift.status)]
        .filter(Boolean).join(' · ')
}
