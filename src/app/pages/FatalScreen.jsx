import {Button, Text} from '@mantine/core'
import FullPageMessage from '../../ui/FullPageMessage.jsx'

/** No hay configuracion valida (/config.json): sin ella no se sabe ni a que Keycloak ir. */
export default function FatalScreen({error}) {
    return (
        <FullPageMessage
            title="No se puede arrancar la aplicación"
            action={<Button onClick={() => window.location.reload()}>Reintentar</Button>}>
            <Text>Falta su configuración (/config.json) o no es válida.</Text>
            <Text size="sm" c="dimmed">{error?.message ?? String(error)}</Text>
        </FullPageMessage>
    )
}
