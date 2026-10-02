import {Center, Loader, Paper, Stack, Text, Title} from '@mantine/core'

/**
 * Un mensaje a pantalla completa, para cuando no hay aplicacion que ensenar todavia: entrando, sin
 * Keycloak, sin config.json.
 */
export default function FullPageMessage({title, children, action, loading = false}) {
    return (
        <Center mih="100vh" p="md">
            <Paper withBorder radius="md" p="xl" maw={560} w="100%">
                <Stack gap="md" align={loading ? 'center' : 'stretch'}>
                    {loading && <Loader aria-label={title}/>}
                    <Title order={3}>{title}</Title>
                    {typeof children === 'string' ? <Text>{children}</Text> : children}
                    {action}
                </Stack>
            </Paper>
        </Center>
    )
}
