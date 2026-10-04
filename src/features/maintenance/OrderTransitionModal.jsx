import {Button, Checkbox, Group, Modal, Stack, Text, Textarea, TextInput} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {toLocalDateParam} from '../../api/dates.js'
import {ConflictError} from '../../api/errors.js'
import {ORDER_STATUS} from '../../api/maintenance/enums.js'
import {transitionRequest} from '../../api/maintenance/orders.js'
import {errorMessage} from '../../ui/errors/messages.js'
import {notifyApiError} from '../../ui/errors/notifyError.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import {saveErrors} from './maintenanceErrors.js'
import {TeamSelect} from './MaintenancePickers.jsx'
import {useOrderTransition, useTeams} from './useMaintenance.js'

const USER_LENGTH = 100

/** Las transiciones con datos; cancelar va aparte, con su motivo. */
const TRANSITIONS = Object.freeze({
    plan: Object.freeze({label: 'Planificar', text: 'Al planificar se reservan en el almacén los materiales de la orden.'}),
    assign: Object.freeze({label: 'Asignar', text: null}),
    start: Object.freeze({label: 'Iniciar', text: 'La orden pasa a en curso: sus tareas ya se pueden trabajar en un turno de su vía.'}),
    complete: Object.freeze({label: 'Completar', text: null}),
})

/**
 * Una transición de la orden con sus datos (el port de OrderTransitionDialog): planificar, con la
 * fecha, que no puede ser pasada; asignar, a un equipo, a una persona o a los dos; iniciar; y
 * completar, con sus notas de cierre y, con maintenance-supervise, force. La ficha solo la ofrece en
 * su estado de origen; si aun así el servicio la rechaza (409 TRN-001), el aviso lo dice y el diálogo
 * sigue abierto.
 *
 * @param {'plan'|'assign'|'start'|'complete'} kind
 * @param {boolean} canForce si se ofrece force al completar (write y supervise)
 */
export default function OrderTransitionModal({kind, order, canForce, onClose}) {
    const transition = TRANSITIONS[kind]
    const today = toLocalDateParam(new Date())
    const teams = useTeams()
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            plannedDate: order.plannedDate && order.plannedDate >= today ? order.plannedDate : today,
            teamId: order.team?.id ?? null,
            assignedUser: order.assignedUser ?? '',
            closingNotes: order.closingNotes ?? '',
            force: false,
            comment: '',
        },
        validate: {
            plannedDate: (value) => (kind === 'plan' && !value ? 'La fecha es obligatoria' : null),
            teamId: (value, values) => (kind === 'assign' && !value && !String(values.assignedUser ?? '').trim()
                ? 'Hace falta un equipo, una persona o los dos'
                : null),
            assignedUser: (value) => (String(value ?? '').trim().length > USER_LENGTH ? `Como mucho ${USER_LENGTH} caracteres` : null),
        },
    })
    const moving = useOrderTransition(order.id)
    const fieldErrors = saveErrors(form)

    const confirm = form.onSubmit((values) => {
        moving.mutate({transition: kind, body: transitionRequest(kind, values)}, {
            onSuccess: (result) => {
                notifySuccess(`${result.code}: ${ORDER_STATUS.label(result.status).toLowerCase()}`)
                onClose()
            },
            onError: (error) => {
                if (kind === 'complete' && error instanceof ConflictError && error.code === 'MAT-001') {
                    notifyApiError(error, {message: `${errorMessage(error)} ${completeHint(canForce)}`})
                    return
                }
                fieldErrors(error)
            },
        })
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} title={`${transition.label} ${order.code}`}>
            <form onSubmit={confirm} noValidate>
                <Stack>
                    {transition.text && <Text size="sm">{transition.text}</Text>}
                    {kind === 'plan' && (
                        <DateInput label="Prevista" withAsterisk minDate={today} valueFormat={DATE_FORMAT} dateParser={parseTypedDate}
                                   placeholder="DD/MM/AAAA" {...form.getInputProps('plannedDate')}/>
                    )}
                    {kind === 'assign' && (
                        <>
                            <TeamSelect label="Equipo" teams={teams.data} current={order.team} {...form.getInputProps('teamId')}/>
                            <TextInput label="Persona" maxLength={USER_LENGTH} {...form.getInputProps('assignedUser')}/>
                        </>
                    )}
                    {kind === 'complete' && (
                        <>
                            <Textarea label="Notas de cierre" description="Obligatorias si no se completó ninguna tarea" rows={3}
                                      {...form.getInputProps('closingNotes')}/>
                            {canForce && (
                                <Checkbox label="Completar aunque haya líneas de material sin sincronizar con el almacén"
                                          description="Queda escrito en las notas de cierre" {...form.getInputProps('force', {type: 'checkbox'})}/>
                            )}
                        </>
                    )}
                    <Textarea label="Comentario para el historial" rows={2} {...form.getInputProps('comment')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Volver</Button>
                        <Button type="submit" loading={moving.isPending}>{transition.label}</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}

function completeHint(canForce) {
    return canForce
        ? 'Sincroniza las líneas fallidas o rechazadas en la pestaña Materiales, o marca completar aunque haya líneas sin sincronizar.'
        : 'Sincroniza las líneas fallidas o rechazadas en la pestaña Materiales, o pide a quien supervisa que la complete igualmente.'
}
