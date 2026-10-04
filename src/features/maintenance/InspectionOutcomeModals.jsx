import {Button, Checkbox, Group, Modal, Select, SimpleGrid, Stack, Text, Textarea, TextInput} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {DEFECT_SEVERITY, PRIORITY} from '../../api/maintenance/enums.js'
import {correctiveOrderRequest, defectFromInspectionRequest} from '../../api/maintenance/inspections.js'
import {notifyApiError} from '../../ui/errors/notifyError.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import {maxLength} from './maintenanceForms.js'
import {TeamSelect} from './MaintenancePickers.jsx'
import {useInspectionOutcome, useTeams} from './useMaintenance.js'

const TITLE_LENGTH = 255

/**
 * Lo que una inspección genera (el port de InspectionOutcomeDialogs): su defecto y su orden
 * correctiva. Lo que se deja vacío lo pone el servicio: la gravedad sale del resultado y la
 * descripción, de lo observado; una inspección insegura da una orden urgente y crítica. Las dos
 * llamadas son idempotentes, así que repetirlas devuelve lo mismo.
 */

/** El defecto de una inspección. Uno leve solo se registra marcando force; el servicio lo rechaza si no (422 INS-001). */
export function DefectFromInspectionModal({inspection, onClose}) {
    const form = useForm({mode: 'controlled', initialValues: {severity: null, description: '', technicalNotes: '', force: false}})
    const creating = useInspectionOutcome(inspection.id)
    const save = form.onSubmit((values) => {
        creating.mutate({kind: 'defect', body: defectFromInspectionRequest(values)}, {
            onSuccess: (defect) => {
                notifySuccess(`Defecto ${defect.code} creado`)
                onClose()
            },
            onError: (error) => notifyApiError(error),
        })
    })
    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} title={`Defecto de ${inspection.code}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <Select label="Gravedad" clearable data={DEFECT_SEVERITY.selectable()} placeholder="La del resultado de la inspección"
                            description="Vacía: la que corresponde al resultado de la inspección" {...form.getInputProps('severity')}/>
                    <Textarea label="Descripción" rows={2} description="Vacía: los defectos observados en la inspección"
                              {...form.getInputProps('description')}/>
                    <Textarea label="Notas técnicas" rows={2} {...form.getInputProps('technicalNotes')}/>
                    {inspection.result === 'MINOR_DEFECT' && (
                        <Checkbox label="Registrar como defecto aunque sea leve" {...form.getInputProps('force', {type: 'checkbox'})}/>
                    )}
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Volver</Button>
                        <Button type="submit" loading={creating.isPending}>Crear el defecto</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}

/** La orden correctiva de una inspección; creada, la ficha la abre. */
export function CorrectiveOrderModal({inspection, onClose, onCreated}) {
    const teams = useTeams()
    const form = useForm({
        mode: 'controlled',
        initialValues: {title: '', description: '', priority: null, plannedDate: null, teamId: null},
        validate: {title: maxLength(TITLE_LENGTH)},
    })
    const creating = useInspectionOutcome(inspection.id)
    const save = form.onSubmit((values) => {
        creating.mutate({kind: 'order', body: correctiveOrderRequest(values)}, {
            onSuccess: (order) => {
                notifySuccess(`Orden ${order.code} creada`)
                onClose()
                onCreated(order)
            },
            onError: (error) => notifyApiError(error),
        })
    })
    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="lg" title={`Orden correctiva de ${inspection.code}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    {inspection.result === 'UNSAFE' && <Text size="sm">La inspección es insegura: la orden será urgente y crítica.</Text>}
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <TextInput label="Título" maxLength={TITLE_LENGTH} description="Vacío: uno con la inspección y el activo"
                                   {...form.getInputProps('title')}/>
                        <Select label="Prioridad" clearable data={PRIORITY.selectable()} {...form.getInputProps('priority')}/>
                        <DateInput label="Prevista" clearable valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                                   {...form.getInputProps('plannedDate')}/>
                        <TeamSelect label="Equipo" teams={teams.data} {...form.getInputProps('teamId')}/>
                    </SimpleGrid>
                    <Textarea label="Descripción" rows={2} {...form.getInputProps('description')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Volver</Button>
                        <Button type="submit" loading={creating.isPending}>Crear la orden</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
