import {Button, Group, Modal, Stack, Text} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {LINEMAN_CATEGORIES} from '../../api/resources/enums.js'
import {personLabel, unitLabel} from '../../api/resources/values.js'
import {saveErrors} from '../../ui/errors/saveErrors.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import {PersonSelect} from './ResourcesPickers.jsx'
import {useTeamChange} from './useResources.js'

/**
 * Un lineman que entra en un equipo o sale de él (el port de MemberDialogs), cada uno con su fecha
 * (vacía, hoy). Que el equipo no pase de 6 ni baje de 2 ya lo cuida la pestaña, que no ofrece el
 * botón; si aun así llega, o la persona ya es lineman o jefe de otro equipo, el servicio responde 409
 * UNI-001 y el diálogo sigue abierto.
 */

export function AddMemberModal({team, onClose}) {
    const form = useForm({
        mode: 'controlled',
        initialValues: {personId: null, joinedOn: null},
        validate: {
            personId: (value) => {
                if (!value) {
                    return 'Elige quién entra'
                }
                return team.head && value === team.head.id ? `${personLabel(team.head)} es el jefe del equipo: no va también de lineman` : null
            },
        },
    })
    const changing = useTeamChange(team)
    const save = form.onSubmit((values) => changing.mutate({change: 'add', personId: values.personId, date: values.joinedOn}, {
        onSuccess: (saved) => {
            notifySuccess(`Entra un lineman en ${saved?.code ?? team.code}`)
            onClose()
        },
        onError: saveErrors(form),
    }))
    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} title={`Añadir lineman a ${unitLabel(team)}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <PersonSelect label="Lineman" withAsterisk categories={LINEMAN_CATEGORIES} {...form.getInputProps('personId')}/>
                    <DateInput label="Entra el" description="Vacío: hoy" clearable valueFormat={DATE_FORMAT} dateParser={parseTypedDate}
                               placeholder="DD/MM/AAAA" {...form.getInputProps('joinedOn')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={changing.isPending}>Añadir</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}

export function LeaveTeamModal({team, member, onClose}) {
    const form = useForm({mode: 'controlled', initialValues: {leftOn: null}})
    const changing = useTeamChange(team)
    const save = form.onSubmit((values) => changing.mutate({change: 'leave', personId: member.person.id, date: values.leftOn}, {
        onSuccess: (saved) => {
            notifySuccess(`${personLabel(member.person)} sale de ${saved?.code ?? team.code}`)
            onClose()
        },
        onError: saveErrors(form),
    }))
    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} title={`${personLabel(member.person)} sale de ${unitLabel(team)}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <Text size="sm">Deja de ser lineman del equipo desde ese día; su paso por él queda en «Ver también los que salieron».</Text>
                    <DateInput label="Sale el" description="Vacío: hoy" clearable valueFormat={DATE_FORMAT} dateParser={parseTypedDate}
                               placeholder="DD/MM/AAAA" {...form.getInputProps('leftOn')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={changing.isPending}>Sale del equipo</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
