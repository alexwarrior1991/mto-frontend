import {Button, Checkbox, Group, Modal, SegmentedControl, Select, SimpleGrid, Stack, Text, Textarea, TextInput} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {REPAIR_KIND} from '../../api/resources/enums.js'
import {isLiveRepair, repairFormValues, repairPatch, repairRequest} from '../../api/resources/repairs.js'
import {unitLabel} from '../../api/resources/values.js'
import {saveErrors} from '../../ui/errors/saveErrors.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import {dateNotBefore, maxLength, optionalFigure, REPAIR_LENGTHS, required, requiredText} from './resourcesForms.js'
import {useSaveRepair} from './useResources.js'

/**
 * El alta y la modificación de una reparación de un vehículo (el port de RepairDialog).
 *
 * - En el alta se elige si se planifica (dice desde cuándo) o si el vehículo entra en el taller ahora.
 *   Si inmoviliza (por defecto sí), abierta lo deja «En reparación»; planificada o abierta, fuera de los
 *   turnos de esas fechas.
 * - Al modificar, las fechas previstas solo se cambian planificada o abierta, y si inmoviliza, solo
 *   planificada: lo demás sería el 409 REP-001.
 * - Se comprueba lo evidente (la clase, la descripción, desde cuándo una planificada, un fin que no sea
 *   anterior al inicio, las cifras con su columna); lo demás lo dice el servicio con el diálogo abierto.
 *
 * @param {object} vehicle el vehículo
 * @param {object|null} repair la que se modifica, o null para el alta
 */
export default function RepairModal({vehicle, repair, onClose}) {
    const creating = repair === null
    const datesEditable = creating || isLiveRepair(repair)
    const immobilisesEditable = creating || repair.status === 'PLANNED'
    const form = useForm({
        mode: 'controlled',
        initialValues: repairFormValues(repair),
        validate: {
            kind: required('La clase es obligatoria'),
            description: requiredText('La descripción es obligatoria', REPAIR_LENGTHS.description),
            workshop: maxLength(REPAIR_LENGTHS.workshop),
            plannedFrom: (value, values) => (values.status === 'PLANNED' && !value ? 'Una planificada dice desde cuándo' : null),
            plannedTo: dateNotBefore('plannedFrom', 'El fin previsto no puede ser anterior al inicio'),
            odometerKm: optionalFigure({integers: 0, decimals: 0, min: 0}),
            engineHours: optionalFigure({integers: 9, decimals: 1}),
            cost: optionalFigure({integers: 10, decimals: 2}),
        },
    })
    const saving = useSaveRepair(vehicle.id)

    const save = form.onSubmit((values) => {
        const body = creating ? repairRequest(values) : repairPatch(repair, values)
        if (body === null) {
            onClose()
            return
        }
        saving.mutate({id: creating ? null : repair.id, body}, {
            onSuccess: (saved) => {
                notifySuccess(`Guardada ${saved?.code ?? repair?.code ?? 'la reparación'} de ${vehicle.code}`)
                onClose()
            },
            onError: saveErrors(form),
        })
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="lg"
               title={creating ? `Nueva reparación de ${unitLabel(vehicle)}` : `Modificar ${repair.code} de ${unitLabel(vehicle)}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    {creating && (
                        <SegmentedControl aria-label="Cuándo" data={[{value: 'PLANNED', label: 'Planificada'}, {value: 'OPEN', label: 'Abierta ahora'}]}
                                          {...form.getInputProps('status')}/>
                    )}
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <Select label="Clase" withAsterisk allowDeselect={false} data={REPAIR_KIND.selectable()} {...form.getInputProps('kind')}/>
                        <TextInput label="Taller" maxLength={REPAIR_LENGTHS.workshop} {...form.getInputProps('workshop')}/>
                    </SimpleGrid>
                    <Textarea label="Descripción" withAsterisk rows={2} maxLength={REPAIR_LENGTHS.description} {...form.getInputProps('description')}/>
                    <Checkbox label="Inmoviliza el vehículo" disabled={!immobilisesEditable}
                              description={immobilisesEditable ? 'Abierta, lo deja «En reparación»; planificada o abierta, fuera de los turnos de esas fechas'
                                  : 'Se decide antes de abrirla'}
                              {...form.getInputProps('immobilises', {type: 'checkbox'})}/>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <DateInput label="Previsto desde" withAsterisk={form.values.status === 'PLANNED' && creating} clearable
                                   disabled={!datesEditable} valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                                   {...form.getInputProps('plannedFrom')}/>
                        <DateInput label="Previsto hasta" clearable disabled={!datesEditable} valueFormat={DATE_FORMAT} dateParser={parseTypedDate}
                                   placeholder="DD/MM/AAAA" {...form.getInputProps('plannedTo')}/>
                    </SimpleGrid>
                    {!datesEditable && <Text size="xs" c="dimmed">Cerrada o cancelada: sus fechas previstas ya no cambian.</Text>}
                    <SimpleGrid cols={{base: 1, sm: 3}}>
                        <TextInput label="Km" {...form.getInputProps('odometerKm')}/>
                        <TextInput label="Horas de motor" {...form.getInputProps('engineHours')}/>
                        <TextInput label="Coste" {...form.getInputProps('cost')}/>
                    </SimpleGrid>
                    <Textarea label="Notas" rows={2} {...form.getInputProps('notes')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={saving.isPending}>Guardar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
