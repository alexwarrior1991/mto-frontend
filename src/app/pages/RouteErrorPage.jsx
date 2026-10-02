import {Alert, Anchor, Stack, Text, Title} from '@mantine/core'
import {IconBug} from '@tabler/icons-react'
import {Link, useRouteError} from 'react-router'

/** Un fallo al pintar una pantalla (un error de programacion, no de la API: esos son avisos). */
export default function RouteErrorPage() {
    const error = useRouteError()
    return (
        <Stack maw={720} p="md">
            <Title order={2}>Algo ha fallado al pintar esta pantalla</Title>
            <Alert color="red" icon={<IconBug size={18}/>}>
                <Text size="sm">{error?.message ?? String(error)}</Text>
            </Alert>
            <Anchor component={Link} to="/">Volver al inicio</Anchor>
        </Stack>
    )
}
