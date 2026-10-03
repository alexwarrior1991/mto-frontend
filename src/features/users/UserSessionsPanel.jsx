import {Button, Group, Stack, Text, Title} from '@mantine/core'
import {IconCircleX} from '@tabler/icons-react'
import {useState} from 'react'
import {revokeOfflineSession, revokeOfflineSessions, revokeSession, revokeSessions} from '../../api/users/users.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import DataTable from '../../ui/DataTable.jsx'
import {formatDateTime} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import {sessionName, sessionsCountText} from './userTexts.js'
import {useRevokeSessions, useSessions} from './useUsers.js'

const COLUMNS = [
    {key: 'startedAt', label: 'Inicio', render: (session) => formatDateTime(session.startedAt)},
    {key: 'lastAccessAt', label: 'Último acceso', render: (session) => formatDateTime(session.lastAccessAt)},
    {key: 'ipAddress', label: 'IP', render: (session) => session.ipAddress ?? ''},
    {key: 'clients', label: 'Clientes', render: (session) => (session.clients ?? []).join(', ')},
]

/**
 * La pestaña «Sesiones» de la ficha (el port de UserSessionsPanel): las sesiones normales y las
 * offline, que son dos recursos aparte en mto-users. Con users-sessions-write se cierran una a una
 * (sin confirmación) o todas (con confirmación). Cualquier cierre, haya ido bien o no, relee las dos
 * listas: son la foto del servicio, no un estado propio. Una sesión que ya no está, o que no es de
 * esta persona, es un 404 SES-404 que se avisa así.
 */
export default function UserSessionsPanel({userId, canRevoke}) {
    const normal = useSessions(userId, 'normal')
    const offline = useSessions(userId, 'offline')
    const revoking = useRevokeSessions(userId)
    const [confirming, setConfirming] = useState(null)

    const revoke = (call, done) => revoking.mutate(call, {
        onSuccess: () => notifySuccess(done),
        onSettled: () => setConfirming(null),
    })

    return (
        <Stack>
            <SessionSection title="Sesiones" query={normal} countText={(count) => sessionsCountText(count)} canRevoke={canRevoke}
                            revokeAllLabel="Cerrar todas las sesiones" onRevokeAll={() => setConfirming('normal')}
                            rowLabel={(session) => `Cerrar la sesión de ${sessionName(session)}`} rowTooltip="Cerrar esta sesión"
                            onRevoke={(session) => revoke(() => revokeSession(userId, session.id), 'Sesión cerrada')}/>
            <Text size="sm" c="dimmed">
                Desactivar al usuario no cierra sus sesiones ni revoca sus tokens offline: para sacar a alguien hay que desactivar,
                cerrar las sesiones y revocar las offline, en ese orden.
            </Text>
            <SessionSection title="Sesiones offline" query={offline} countText={(count) => sessionsCountText(count, {offline: true})}
                            canRevoke={canRevoke} revokeAllLabel="Revocar todas las sesiones offline" onRevokeAll={() => setConfirming('offline')}
                            rowLabel={(session) => `Revocar la sesión offline de ${sessionName(session)}`} rowTooltip="Revocar esta sesión offline"
                            onRevoke={(session) => revoke(() => revokeOfflineSession(userId, session.id), 'Sesión offline revocada')}/>
            <Text size="sm" c="dimmed">
                Una sesión offline la abre un token con offline_access. Sobrevive a cerrar las sesiones normales y a desactivar al
                usuario (volver a activarlo la recupera); solo revocándola aquí deja de valer.
            </Text>
            {confirming === 'normal' && (
                <ConfirmModal title="Cerrar todas las sesiones" confirmLabel="Cerrar todas" loading={revoking.isPending}
                              onConfirm={() => revoke(() => revokeSessions(userId), 'Sesiones cerradas')} onClose={() => setConfirming(null)}>
                    La persona tendrá que volver a entrar en todos sus clientes. Las sesiones offline no se tocan.
                </ConfirmModal>
            )}
            {confirming === 'offline' && (
                <ConfirmModal title="Revocar todas las sesiones offline" confirmLabel="Revocar todas" loading={revoking.isPending}
                              onConfirm={() => revoke(() => revokeOfflineSessions(userId), 'Sesiones offline revocadas')}
                              onClose={() => setConfirming(null)}>
                    Los tokens offline dejan de valer; un refresco con ellos fallará.
                </ConfirmModal>
            )}
        </Stack>
    )
}

function SessionSection({title, query, countText, canRevoke, revokeAllLabel, onRevokeAll, rowLabel, rowTooltip, onRevoke}) {
    const sessions = query.data ?? []
    return (
        <Stack gap="xs">
            <Group gap="sm" align="baseline">
                <Title order={4}>{title}</Title>
                <Text size="sm" c="dimmed">{query.data ? countText(sessions.length) : ''}</Text>
                {canRevoke && (
                    <Button size="xs" color="red" variant="light" leftSection={<IconCircleX size={14}/>} onClick={onRevokeAll}>
                        {revokeAllLabel}
                    </Button>
                )}
            </Group>
            <DataTable ariaLabel={title} columns={COLUMNS} rows={sessions} loading={query.isPending}
                       emptyText={query.isError ? 'No se han podido leer las sesiones.' : 'Ninguna.'}
                       rowActions={canRevoke
                           ? (session) => (
                               <RowActionButton label={rowLabel(session)} tooltip={rowTooltip} icon={IconCircleX} color="red"
                                                onClick={() => onRevoke(session)}/>
                           )
                           : null}/>
        </Stack>
    )
}
