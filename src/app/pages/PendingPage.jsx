import {Alert, Button, Group, Stack, Title} from '@mantine/core'
import {IconExternalLink, IconHourglass} from '@tabler/icons-react'
import {useLocation} from 'react-router'
import {useRuntimeConfig} from '../runtimeConfigContext.js'

/**
 * Una pantalla que aun no ha llegado a esta aplicacion. La ruta ya existe (los enlaces de las
 * notificaciones resuelven desde el primer dia) y, mientras convivan los dos frontales, se ofrece la
 * misma ruta en el backoffice.
 */
export default function PendingPage({route, title}) {
    const {backofficeUrl} = useRuntimeConfig()
    const {pathname, search} = useLocation()
    const target = backofficeUrl ? `${backofficeUrl}${pathname}${search}` : null

    return (
        <Stack maw={720}>
            <Title order={2}>{title}</Title>
            <Alert color="blue" icon={<IconHourglass size={18}/>} title={`Llega en la fase ${route.phase}`}>
                Esta pantalla todavía no está en la nueva aplicación.
                {target ? ' Mientras tanto, sigue en el backoffice.' : ''}
            </Alert>
            {target && (
                <Group>
                    <Button component="a" href={target} target="_blank" rel="noopener noreferrer"
                            rightSection={<IconExternalLink size={16}/>}>
                        Abrir en el backoffice
                    </Button>
                </Group>
            )}
        </Stack>
    )
}
