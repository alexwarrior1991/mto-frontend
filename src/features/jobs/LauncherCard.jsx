import {Card, Stack, Text, Title} from '@mantine/core'
import {useId} from 'react'

/**
 * El marco de un lanzador: su título, una línea de ayuda y sus controles. Es una región con nombre,
 * que es como la encuentran un lector de pantalla y los tests.
 */
export default function LauncherCard({title, hint, children}) {
    const titleId = useId()
    return (
        <Card withBorder padding="md" radius="md" component="section" aria-labelledby={titleId}>
            <Stack gap="sm">
                <div>
                    <Title order={3} size="h5" id={titleId}>{title}</Title>
                    <Text size="sm" c="dimmed">{hint}</Text>
                </div>
                {children}
            </Stack>
        </Card>
    )
}
