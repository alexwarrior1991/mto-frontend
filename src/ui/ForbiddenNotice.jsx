import {Alert, Code, Group, Stack, Text, Title} from '@mantine/core'
import {IconLock} from '@tabler/icons-react'

/** Lo que se ve en una pantalla para la que no hay permiso. Es una ayuda, no la seguridad: esa es el 403 del servicio. */
export default function ForbiddenNotice({title, missing = []}) {
    return (
        <Stack>
            {title && <Title order={2}>{title}</Title>}
            <Alert color="orange" icon={<IconLock size={18}/>} title="No tienes permiso para abrir esta pantalla">
                {missing.length > 0 && (
                    <Group gap="xs">
                        <Text size="sm">Te falta:</Text>
                        {missing.map((permission) => <Code key={permission}>{permission}</Code>)}
                    </Group>
                )}
            </Alert>
        </Stack>
    )
}
