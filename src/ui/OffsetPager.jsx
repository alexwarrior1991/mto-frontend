import {Button, Group, Text} from '@mantine/core'
import {IconChevronLeft, IconChevronRight} from '@tabler/icons-react'
import {hasNextOffsetPage} from '../api/paging.js'

/**
 * Anteriores y siguientes para una lista sin total, como los miembros de un perfil o de un rol (el
 * port de OffsetPager del backoffice). Una página llena es la única señal de que puede haber más, así
 * que «Siguientes» solo se ofrece cuando la última llegó llena; si el total es múltiplo del tamaño,
 * la última página llega vacía.
 *
 * Mientras llega la siguiente página no se ofrece ninguno de los dos, para que un doble clic no salte
 * una.
 *
 * @param {number} page la página que se ve, desde 1
 * @param {Array} rows las filas de esa página
 */
export default function OffsetPager({page, pageSize, rows, loading = false, onChange}) {
    return (
        <Group gap="xs" justify="flex-end">
            <Button variant="default" size="xs" leftSection={<IconChevronLeft size={14}/>}
                    disabled={loading || page <= 1} onClick={() => onChange(page - 1)}>
                Anteriores
            </Button>
            <Text size="sm" c="dimmed">Página {page}</Text>
            <Button variant="default" size="xs" rightSection={<IconChevronRight size={14}/>}
                    disabled={loading || !hasNextOffsetPage(rows, pageSize)} onClick={() => onChange(page + 1)}>
                Siguientes
            </Button>
        </Group>
    )
}
