import {ActionIcon, Anchor, Badge, Burger, Button, Group, Text, Tooltip} from '@mantine/core'
import {IconExternalLink, IconLogout} from '@tabler/icons-react'
import {Link, useLocation} from 'react-router'
import {P} from '../../auth/permissions.js'
import {useAuthActions, useSession} from '../../auth/sessionContext.js'
import InboxBell from '../../features/notifications/InboxBell.jsx'
import {useRuntimeConfig} from '../runtimeConfigContext.js'

/**
 * La barra de arriba: la aplicación, el entorno, la misma pantalla en el backoffice (si el entorno lo
 * dice), la campana de la bandeja (solo con notification-inbox), quién ha entrado y salir.
 */
export default function AppHeader({menuOpened, onToggleMenu}) {
    const session = useSession()
    const {signOut} = useAuthActions()
    const {environment, backofficeUrl} = useRuntimeConfig()

    return (
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
                <Burger opened={menuOpened} onClick={onToggleMenu} hiddenFrom="sm" size="sm" aria-label="Abrir el menú"/>
                <Anchor component={Link} to="/" fw={700} size="lg" c="inherit" underline="never">MTO</Anchor>
                {environment && <Badge variant="light" color="orange">{environment}</Badge>}
            </Group>
            <Group gap="sm" wrap="nowrap">
                {backofficeUrl && <BackofficeLink backofficeUrl={backofficeUrl}/>}
                {session.has(P.NOTIFICATION_INBOX) && <InboxBell/>}
                <Text size="sm" c="dimmed" visibleFrom="xs">{session.username}</Text>
                <Button variant="subtle" leftSection={<IconLogout size={16}/>} onClick={() => signOut()}>Salir</Button>
            </Group>
        </Group>
    )
}

/**
 * La misma pantalla en el backoffice, que tiene las mismas rutas: las dos aplicaciones se usan
 * indistintamente. Va con su query (los filtros que la ruta lleva en la URL) y se abre en otra pestaña,
 * para no perder lo que haya en esta; el backoffice entra por el SSO de Keycloak.
 */
function BackofficeLink({backofficeUrl}) {
    const {pathname, search} = useLocation()
    return (
        <Tooltip label="Abrir en el backoffice" withArrow>
            <ActionIcon component="a" href={`${backofficeUrl}${pathname}${search}`} target="_blank" rel="noopener noreferrer"
                        variant="subtle" size="lg" aria-label="Abrir en el backoffice">
                <IconExternalLink size={20}/>
            </ActionIcon>
        </Tooltip>
    )
}
