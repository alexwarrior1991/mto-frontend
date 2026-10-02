import {Button, Group, Modal, Stack, Text} from '@mantine/core'
import {useSyncExternalStore} from 'react'
import {useAuthActions} from './sessionContext.js'
import {sessionExpired} from './sessionExpired.js'

/**
 * La sesion de Keycloak ha caducado o se ha cerrado y el token ya no se puede renovar. No se redirige
 * solo: se perderia un formulario a medias. «Volver a entrar» conserva la URL; «Cerrar» deja copiar lo
 * que haya, y la siguiente llamada lo vuelve a abrir.
 */
export default function SessionExpiredModal() {
    const opened = useSyncExternalStore(sessionExpired.subscribe, sessionExpired.isOpen)
    const {signIn} = useAuthActions()

    return (
        <Modal opened={opened} onClose={sessionExpired.close} title="La sesión ha caducado" centered>
            <Stack>
                <Text>Hay que volver a entrar. Al volver, se abre esta misma pantalla.</Text>
                <Text size="sm" c="dimmed">
                    Si tienes algo sin guardar, cierra este aviso, cópialo y vuelve a entrar.
                </Text>
                <Group justify="flex-end">
                    <Button variant="default" onClick={sessionExpired.close}>Cerrar</Button>
                    <Button onClick={() => signIn()}>Volver a entrar</Button>
                </Group>
            </Stack>
        </Modal>
    )
}
