import {ActionIcon, Box, Group, Loader, Table, Text, VisuallyHidden} from '@mantine/core'
import {IconChevronDown, IconChevronRight} from '@tabler/icons-react'
import {useState} from 'react'

/**
 * Un árbol con columnas (el port del TreeGrid de Vaadin del backoffice): el Tree de Mantine no tiene
 * columnas. Es una tabla con role="treegrid" en la que cada fila dice su nivel (aria-level) y, si
 * tiene hijas, si está desplegada (aria-expanded), con un botón para plegarla o desplegarla. Llega
 * desplegado entero: lo que pinta es pequeño (el organigrama, decenas de filas).
 *
 * @param {Array} roots las filas de arriba; las hijas, en children(row)
 * @param {Array<{key: string, label: string, render: Function}>} columns la primera lleva el árbol
 * @param {Function} rowLabel fila → su nombre, para el botón de plegar
 * @param {Function|null} [rowActions] fila → acciones; con ella la columna de acciones existe siempre
 */
export default function TreeTable({
    ariaLabel, roots, columns, rowLabel, children = (row) => row.children ?? [], rowKey = (row) => row.id,
    rowActions = null, onRowDoubleClick = null, loading = false, emptyText, minWidth = 720,
}) {
    const [collapsed, setCollapsed] = useState(() => new Set())
    const toggle = (key) => setCollapsed((current) => {
        const next = new Set(current)
        if (next.has(key)) {
            next.delete(key)
        } else {
            next.add(key)
        }
        return next
    })

    const visible = []
    const walk = (rows, level) => {
        for (const row of rows) {
            const key = rowKey(row)
            const below = children(row)
            visible.push({row, key, level, hasChildren: below.length > 0, expanded: !collapsed.has(key)})
            if (below.length > 0 && !collapsed.has(key)) {
                walk(below, level + 1)
            }
        }
    }
    walk(roots ?? [], 1)
    const columnCount = columns.length + (rowActions ? 1 : 0)
    const [first, ...rest] = columns

    return (
        <Table.ScrollContainer minWidth={minWidth}>
            <Table striped highlightOnHover withTableBorder verticalSpacing="xs" role="treegrid" aria-label={ariaLabel} aria-busy={loading}>
                <Table.Thead>
                    <Table.Tr>
                        {columns.map((column) => <Table.Th key={column.key} w={column.width}>{column.label}</Table.Th>)}
                        {rowActions && <Table.Th w={1}><VisuallyHidden>Acciones</VisuallyHidden></Table.Th>}
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {visible.length === 0 && (
                        <Table.Tr>
                            <Table.Td colSpan={columnCount}>
                                {loading
                                    ? <Group gap="xs"><Loader size="xs"/><Text size="sm">Cargando…</Text></Group>
                                    : <Text size="sm" c="dimmed">{emptyText}</Text>}
                            </Table.Td>
                        </Table.Tr>
                    )}
                    {visible.map(({row, key, level, hasChildren, expanded}) => (
                        <Table.Tr key={key} aria-level={level} aria-expanded={hasChildren ? expanded : undefined}
                                  onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}>
                            <Table.Td role="gridcell">
                                <Group gap={4} wrap="nowrap" pl={(level - 1) * 20}>
                                    {hasChildren
                                        ? (
                                            <ActionIcon variant="subtle" size="sm" onClick={() => toggle(key)}
                                                        aria-label={`${expanded ? 'Plegar' : 'Desplegar'} ${rowLabel(row)}`}>
                                                {expanded ? <IconChevronDown size={14}/> : <IconChevronRight size={14}/>}
                                            </ActionIcon>
                                        )
                                        : <Box w={22}/>}
                                    {first.render(row)}
                                </Group>
                            </Table.Td>
                            {rest.map((column) => <Table.Td key={column.key} role="gridcell">{column.render(row)}</Table.Td>)}
                            {rowActions && <Table.Td role="gridcell"><Group gap={4} wrap="nowrap">{rowActions(row)}</Group></Table.Td>}
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Table.ScrollContainer>
    )
}
