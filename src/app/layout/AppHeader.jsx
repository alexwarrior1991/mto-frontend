import {Anchor, Badge, Burger, Button, Group, Text} from '@mantine/core'
import {IconLogout} from '@tabler/icons-react'
import {Link} from 'react-router'
import {useAuthActions, useSession} from '../../auth/sessionContext.js'
import {useRuntimeConfig} from '../runtimeConfigContext.js'

/** La barra de arriba: la aplicacion, el entorno, quien ha entrado y salir. La campana llega en la fase 7. */
export default function AppHeader({menuOpened, onToggleMenu}) {
    const session = useSession()
    const {signOut} = useAuthActions()
    const {environment} = useRuntimeConfig()

    return (
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
                <Burger opened={menuOpened} onClick={onToggleMenu} hiddenFrom="sm" size="sm" aria-label="Abrir el menú"/>
                <Anchor component={Link} to="/" fw={700} size="lg" c="inherit" underline="never">MTO</Anchor>
                {environment && <Badge variant="light" color="orange">{environment}</Badge>}
            </Group>
            <Group gap="sm" wrap="nowrap">
                <Text size="sm" c="dimmed" visibleFrom="xs">{session.username}</Text>
                <Button variant="subtle" leftSection={<IconLogout size={16}/>} onClick={() => signOut()}>Salir</Button>
            </Group>
        </Group>
    )
}
