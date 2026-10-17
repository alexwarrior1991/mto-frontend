import {Badge, Button, Center, Group, Loader, Stack, Text, Title} from '@mantine/core'
import {IconArrowLeft, IconBan, IconCircleCheck, IconHistory, IconPencil, IconRefresh} from '@tabler/icons-react'
import {useState} from 'react'
import {Navigate, useNavigate, useParams} from 'react-router'
import {NotFoundError} from '../../api/errors.js'
import {PERSON_CATEGORY} from '../../api/resources/enums.js'
import {isActivePerson, personRevisionsPath} from '../../api/resources/people.js'
import {personLabel} from '../../api/resources/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import {errorMessage} from '../../ui/errors/messages.js'
import LazyTabs from '../../ui/LazyTabs.jsx'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RevisionsModal from '../../ui/RevisionsModal.jsx'
import PersonEditorModal from './PersonEditorModal.jsx'
import PersonQualificationsPanel from './PersonQualificationsPanel.jsx'
import {PEOPLE_PATH} from './resourcesRoutes.js'
import {DEACTIVATE_PERSON_TEXT, describePerson, employerText, join, personState} from './resourcesTexts.js'
import {usePerson, usePersonAction} from './useResources.js'

/** recursos/personal/:personId: la ficha de una persona (el port de PersonDetailView), con key por id. */
export default function PersonDetailPage() {
    const {personId} = useParams()
    return <PersonDetail key={personId} personId={personId}/>
}

/**
 * La cabecera de una persona (su código y su nombre, su categoría, su empresa, su usuario y si está
 * activa), con lo que la lista ofrece de ella: modificar y reactivar piden resources-write; desactivar,
 * resources-delete y confirmación. La pestaña «Cualificaciones» pide sus datos al abrirse. Es la ficha a
 * la que lleva el aviso de una cualificación que caduca.
 */
function PersonDetail({personId}) {
    const session = useSession()
    const canWrite = session.has(P.RESOURCES_WRITE)
    const canDelete = session.has(P.RESOURCES_DELETE)
    const navigate = useNavigate()
    const person = usePerson(personId)
    // El diálogo abierto: 'edit', 'deactivate' o 'history'.
    const [dialog, setDialog] = useState(null)
    const close = () => setDialog(null)
    const acting = usePersonAction()

    if (person.error instanceof NotFoundError) {
        return <Navigate to={PEOPLE_PATH} replace/>
    }
    if (person.isError && !person.data) {
        return (
            <Stack align="flex-start">
                <Text>No se ha podido leer la persona: {errorMessage(person.error)}</Text>
                <Group>
                    <Button variant="default" leftSection={<IconArrowLeft size={16}/>} onClick={() => navigate(PEOPLE_PATH)}>Volver al personal</Button>
                    <Button leftSection={<IconRefresh size={16}/>} loading={person.isFetching} onClick={() => void person.refetch()}>Reintentar</Button>
                </Group>
            </Stack>
        )
    }
    if (!person.data) {
        return <Center py="xl"><Loader aria-label="Cargando la persona"/></Center>
    }

    const current = person.data
    const active = isActivePerson(current)
    const deactivate = () => acting.mutate({action: 'deactivate', person: current}, {
        onSuccess: () => notifySuccess(`Desactivada ${personLabel(current)}`),
        onSettled: close,
    })
    const reactivate = () => acting.mutate({action: 'reactivate', person: current},
        {onSuccess: () => notifySuccess(`Reactivada ${personLabel(current)}`)})

    return (
        <Stack>
            <Group gap="sm" align="center">
                <Title order={2}>{personLabel(current)}</Title>
                <Badge variant="light">{PERSON_CATEGORY.label(current.category)}</Badge>
                <Badge aria-label="Estado de la persona" variant="light" color={active ? 'green' : 'gray'}>{personState(current)}</Badge>
            </Group>
            <Text size="sm" aria-label="Resumen de la persona">
                {join(`Empresa: ${employerText(current)}`, `Usuario: ${current.username ?? '-'}`,
                    current.employeeNumber ? `N.º empleado ${current.employeeNumber}` : null, current.phone ? `Teléfono ${current.phone}` : null)}
            </Text>
            <Group gap="sm">
                <Button variant="default" leftSection={<IconArrowLeft size={16}/>} onClick={() => navigate(PEOPLE_PATH)}>Volver al personal</Button>
                <Button variant="default" leftSection={<IconHistory size={16}/>} onClick={() => setDialog('history')}>Historial</Button>
                {canWrite && <Button leftSection={<IconPencil size={16}/>} onClick={() => setDialog('edit')}>Modificar</Button>}
                {canDelete && active && (
                    <Button color="red" variant="light" leftSection={<IconBan size={16}/>} onClick={() => setDialog('deactivate')}>Desactivar</Button>
                )}
                {canWrite && !active && (
                    <Button leftSection={<IconCircleCheck size={16}/>} loading={acting.isPending} onClick={reactivate}>Reactivar</Button>
                )}
            </Group>
            <LazyTabs tabs={[{value: 'qualifications', label: 'Cualificaciones',
                render: () => <PersonQualificationsPanel person={current} canWrite={canWrite} canDelete={canDelete}/>}]}/>
            {dialog === 'edit' && <PersonEditorModal person={current} onClose={close}/>}
            {dialog === 'history' && (
                <RevisionsModal label={current.code} path={personRevisionsPath(current.id)} describe={describePerson} onClose={close}/>
            )}
            {dialog === 'deactivate' && (
                <ConfirmModal title={`Desactivar ${personLabel(current)}`} confirmLabel="Desactivar" cancelLabel="Volver" loading={acting.isPending}
                              onConfirm={deactivate} onClose={close}>
                    {DEACTIVATE_PERSON_TEXT}
                </ConfirmModal>
            )}
        </Stack>
    )
}
