import {ActionIcon, CopyButton, Group, Stack, Text, Tooltip} from '@mantine/core'
import {IconCheck, IconCopy} from '@tabler/icons-react'

/** El contenido de un aviso de error: el mensaje y, debajo, la referencia para buscarlo en los logs. */
export default function ErrorNotice({message, reference}) {
    return (
        <Stack gap={4}>
            <Text size="sm">{message}</Text>
            {reference && (
                <Group gap={4} wrap="nowrap">
                    <Text size="xs" c="dimmed">Referencia: {reference}</Text>
                    <CopyButton value={reference}>
                        {({copied, copy}) => (
                            <Tooltip label={copied ? 'Copiada' : 'Copiar la referencia'} withArrow>
                                <ActionIcon size="xs" variant="subtle" color="gray" onClick={copy}
                                            aria-label="Copiar la referencia">
                                    {copied ? <IconCheck size={12}/> : <IconCopy size={12}/>}
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </CopyButton>
                </Group>
            )}
        </Stack>
    )
}
