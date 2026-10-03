import {Badge, Button, Center, Group, Loader, Stack, Text, Title} from '@mantine/core'
import {IconArrowLeft, IconBan, IconCheck, IconDoorExit, IconKey, IconMail, IconPencil, IconRefresh, IconTrash} from '@tabler/icons-react'
import {useQueryClient} from '@tanstack/react-query'
import {useState} from 'react'
import {Navigate, useNavigate, useParams} from 'react-router'
import {NotFoundError} from '../../api/errors.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import {errorMessage} from '../../ui/errors/messages.js'
import {notifyApiError} from '../../ui/errors/notifyError.js'
import LazyTabs from '../../ui/LazyTabs.jsx'
import {notifySuccess} from '../../ui/notifySuccess.js'
import ActionsEmailModal from './ActionsEmailModal.jsx'
import ResetPasswordModal from './ResetPasswordModal.jsx'
import UserCredentialsPanel from './UserCredentialsPanel.jsx'
import UserEditorModal from './UserEditorModal.jsx'
import UserProfilesPanel from './UserProfilesPanel.jsx'
import UserRolesPanel from './UserRolesPanel.jsx'
import UserSessionsPanel from './UserSessionsPanel.jsx'
import {
    attributesText,
    DELETE_USER_WARNING,
    enabledText,
    pendingActionsText,
    takeOutDoneText,
    takeOutFailedText,
    userSummary,
} from './userTexts.js'
import {useDeleteUser, useSetEnabled, usersKey, useTakeOut, useUser} from './useUsers.js'

const LIST_PATH = '/usuarios'

/**
 * usuarios/:userId: la ficha de una persona (el port de UserDetailView). Cada usuario empieza de cero
 * (key por id): nada de una ficha se queda en la de otra.
 */
export default function UserDetailPage() {
    const {userId} = useParams()
    return <UserDetail key={userId} userId={userId}/>
}

/**
 * La cabecera, los botones que permite la sesión y las cuatro pestañas, que piden sus datos la primera
 * vez que se abren (LazyTabs) y solo se pintan con la cabecera cargada.
 *
 * - Un usuario que no existe se dice «No existe el usuario …» y la ficha vuelve a la lista.
 * - Activar, desactivar y modificar pintan lo que devuelve el servicio.
 * - «Sacar a la persona» son tres llamadas en su orden y pide users-write y users-sessions-write a la vez.
 */
function UserDetail({userId}) {
    const session = useSession()
    const canWrite = session.has(P.USERS_WRITE)
    const navigate = useNavigate()
    const queryClient = useQueryClient()

    const [deleted, setDeleted] = useState(false)
    const user = useUser(userId, {enabled: !deleted})
    const toggling = useSetEnabled()
    const takingOut = useTakeOut(userId)
    const removing = useDeleteUser()
    // El diálogo abierto: 'edit', 'password', 'email', 'takeOut' o 'delete'.
    const [dialog, setDialog] = useState(null)
    const close = () => setDialog(null)

    if (deleted || user.error instanceof NotFoundError) {
        return <Navigate to={LIST_PATH} replace/>
    }
    if (user.isError && !user.data) {
        return (
            <Stack align="flex-start">
                <Text>No se ha podido leer el usuario: {errorMessage(user.error)}</Text>
                <Group>
                    <Button variant="default" leftSection={<IconArrowLeft size={16}/>} onClick={() => navigate(LIST_PATH)}>
                        Volver a la lista
                    </Button>
                    <Button leftSection={<IconRefresh size={16}/>} loading={user.isFetching} onClick={() => void user.refetch()}>
                        Reintentar
                    </Button>
                </Group>
            </Stack>
        )
    }
    if (!user.data) {
        return <Center py="xl"><Loader aria-label="Cargando el usuario"/></Center>
    }

    const current = user.data
    const toggle = () => toggling.mutate({user: current, enabled: current.enabled !== true}, {
        onSuccess: (updated) => notifySuccess(enabledText(updated)),
    })
    const takeOut = () => takingOut.mutate(undefined, {
        onSuccess: (result) => {
            close()
            if (result.failed === null) {
                notifySuccess(takeOutDoneText(current.username))
            } else {
                notifyApiError(result.error, {message: takeOutFailedText(current.username, result, errorMessage(result.error))})
            }
        },
    })
    const remove = () => removing.mutate(current, {
        onSuccess: () => {
            notifySuccess(`Borrado ${current.username}`)
            // Primero se deja de pedir la cabecera; después se olvida, para no volver a enseñar a quien ya no existe.
            setDeleted(true)
            queryClient.removeQueries({queryKey: usersKey('user', userId), exact: true})
        },
        onError: close,
    })

    const pending = pendingActionsText(current)
    const attributes = attributesText(current)

    return (
        <Stack>
            <Group gap="sm" align="center">
                <Title order={2}>{current.username}</Title>
                <Badge color={current.enabled === true ? 'teal' : 'red'} variant="light">
                    {current.enabled === true ? 'Activo' : 'Desactivado'}
                </Badge>
                <Badge color={current.emailVerified === true ? 'teal' : 'gray'} variant="light">
                    {current.emailVerified === true ? 'Email verificado' : 'Email sin verificar'}
                </Badge>
            </Group>
            <Text size="sm">{userSummary(current)}</Text>
            {pending && <Text size="sm" c="red">{pending}</Text>}
            {attributes && <Text size="sm" c="dimmed">{attributes}</Text>}
            <Group gap="sm">
                <Button variant="default" leftSection={<IconArrowLeft size={16}/>} onClick={() => navigate(LIST_PATH)}>
                    Volver a la lista
                </Button>
                {canWrite && (
                    <>
                        <Button leftSection={<IconPencil size={16}/>} onClick={() => setDialog('edit')}>Modificar</Button>
                        <Button variant="default" loading={toggling.isPending} onClick={toggle}
                                leftSection={current.enabled === true ? <IconBan size={16}/> : <IconCheck size={16}/>}>
                            {current.enabled === true ? 'Desactivar' : 'Activar'}
                        </Button>
                    </>
                )}
                {session.has(P.USERS_PASSWORD_RESET) && (
                    <Button variant="default" leftSection={<IconKey size={16}/>} onClick={() => setDialog('password')}>
                        Contraseña temporal
                    </Button>
                )}
                {canWrite && (
                    <Button variant="default" leftSection={<IconMail size={16}/>} onClick={() => setDialog('email')}>
                        Acciones por correo
                    </Button>
                )}
                {session.hasAll(P.USERS_WRITE, P.USERS_SESSIONS_WRITE) && (
                    <Button color="red" variant="light" leftSection={<IconDoorExit size={16}/>} onClick={() => setDialog('takeOut')}>
                        Sacar a la persona
                    </Button>
                )}
                {session.has(P.USERS_DELETE) && (
                    <Button color="red" variant="light" leftSection={<IconTrash size={16}/>} onClick={() => setDialog('delete')}>
                        Borrar
                    </Button>
                )}
            </Group>
            <LazyTabs tabs={[
                {
                    value: 'profiles',
                    label: 'Perfiles',
                    render: () => <UserProfilesPanel userId={userId} canWrite={session.has(P.USERS_PROFILES_WRITE)}/>,
                },
                {
                    value: 'roles',
                    label: 'Roles de cliente',
                    render: () => <UserRolesPanel userId={userId} canWrite={session.has(P.USERS_ROLES_WRITE)}/>,
                },
                {
                    value: 'sessions',
                    label: 'Sesiones',
                    render: () => <UserSessionsPanel userId={userId} canRevoke={session.has(P.USERS_SESSIONS_WRITE)}/>,
                },
                {
                    value: 'credentials',
                    label: 'Credenciales',
                    render: () => <UserCredentialsPanel userId={userId} canRemove={session.has(P.USERS_CREDENTIALS_WRITE)}/>,
                },
            ]}/>
            {dialog === 'edit' && <UserEditorModal user={current} onClose={close}/>}
            {dialog === 'password' && <ResetPasswordModal user={current} onClose={close}/>}
            {dialog === 'email' && <ActionsEmailModal user={current} onClose={close}/>}
            {dialog === 'takeOut' && (
                <ConfirmModal title={`Sacar a ${current.username}`} confirmLabel="Sacar" loading={takingOut.isPending}
                              onConfirm={takeOut} onClose={close}>
                    Se desactiva, se cierran sus sesiones y se revocan sus sesiones offline, en ese orden. No se borra nada: podrá volver
                    cuando alguien vuelva a activarle.
                </ConfirmModal>
            )}
            {dialog === 'delete' && (
                <ConfirmModal title={`Borrar usuario ${current.username}`} confirmLabel="Borrar" loading={removing.isPending}
                              onConfirm={remove} onClose={close}>
                    {DELETE_USER_WARNING}
                </ConfirmModal>
            )}
        </Stack>
    )
}
