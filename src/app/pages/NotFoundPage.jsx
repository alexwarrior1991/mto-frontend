import {Anchor, Stack, Text, Title} from '@mantine/core'
import {Link} from 'react-router'
import {usePageTitle} from '../../ui/usePageTitle.js'

export default function NotFoundPage() {
    usePageTitle('No existe')
    return (
        <Stack maw={720}>
            <Title order={2}>Esta pantalla no existe</Title>
            <Text>Puede que el enlace esté mal o que la pantalla se haya retirado.</Text>
            <Anchor component={Link} to="/">Volver al inicio</Anchor>
        </Stack>
    )
}
