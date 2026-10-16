import {Badge, Button, Group, Modal, Stack, Text} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {LINEMAN_CATEGORIES, MAX_LINEMEN, MIN_LINEMEN} from '../../api/resources/enums.js'
import {personLabel, unitLabel} from '../../api/resources/values.js'
import {saveErrors} from '../../ui/errors/saveErrors.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import {PeopleMultiSelect} from './ResourcesPickers.jsx'
import {useTeamChange} from './useResources.js'

/** Los campos del servicio que caen en la fecha del diálogo. */
const DATE_ALIASES = Object.freeze({effectiveOn: 'date', joinedOn: 'date'})

/**
 * Los linemen de un equipo, enteros y de una vez (el port de TeamMembersDialog): cambiar varios sin
 * bajar de 2 ni pasar de 6 (PUT /members: los que faltan salen y los nuevos entran en esa fecha), o
 * reactivar un equipo, que vuelve completo (PATCH active=true con sus linemen). Lo evidente se
 * comprueba antes de llamar: de 2 a 6 y sin el jefe; lo demás (alguien que ya es lineman de otro
 * equipo, una persona inactiva) lo dice el servicio con el diálogo abierto.
 *
 * @param {Array} current los resúmenes de los linemen de ahora (vacío al reactivar)
 */
export default function TeamMembersModal({team, current, reactivating = false, onClose}) {
    const form = useForm({
        mode: 'controlled',
        initialValues: {memberPersonIds: current.map((person) => person.id), date: null},
        validate: {
            memberPersonIds: (value) => {
                if (value.length < MIN_LINEMEN || value.length > MAX_LINEMEN) {
                    return `Un equipo trabaja con 2 a 6 linemen, no con ${value.length}`
                }
                return team.head && value.includes(team.head.id) ? `${personLabel(team.head)} es el jefe del equipo: no va también de lineman` : null
            },
        },
    })
    const changing = useTeamChange(team)
    const count = form.values.memberPersonIds.length
    const outOfRule = count < MIN_LINEMEN || count > MAX_LINEMEN

    const save = form.onSubmit((values) => changing.mutate(
        {change: reactivating ? 'reactivate' : 'replace', memberPersonIds: values.memberPersonIds, date: values.date},
        {
            onSuccess: (saved) => {
                notifySuccess(`${reactivating ? 'Reactivado' : 'Linemen cambiados en'} ${unitLabel(saved ?? team)}`)
                onClose()
            },
            onError: saveErrors(form, {aliases: DATE_ALIASES}),
        },
    ))

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="lg"
               title={reactivating ? `Reactivar ${unitLabel(team)}` : `Cambiar los linemen de ${unitLabel(team)}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <Text size="sm">
                        {reactivating
                            ? `Un equipo vuelve completo: con su jefe (${team.head ? personLabel(team.head) : 'vacante'}) y de 2 a 6 linemen.`
                            : 'La lista entera: los que no estén salen del equipo y los nuevos entran, en la misma fecha.'}
                    </Text>
                    <PeopleMultiSelect label="Linemen" withAsterisk categories={LINEMAN_CATEGORIES} current={current}
                                       {...form.getInputProps('memberPersonIds')}/>
                    <Group>
                        <Badge aria-label="Linemen elegidos" variant="light" color={outOfRule ? 'red' : 'green'}>{`${count} de 2 a 6`}</Badge>
                    </Group>
                    <DateInput label={reactivating ? 'Entran el' : 'Desde el'} description="Vacío: hoy" clearable valueFormat={DATE_FORMAT}
                               dateParser={parseTypedDate} placeholder="DD/MM/AAAA" {...form.getInputProps('date')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={changing.isPending}>{reactivating ? 'Reactivar' : 'Guardar'}</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
