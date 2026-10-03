import {Group, Loader, Table, Text, VisuallyHidden} from '@mantine/core'

/**
 * Una tabla de una lista que ya está entera en la pantalla: las pestañas de una ficha, los catálogos
 * y los miembros. No pagina ni ordena; para una lista paginada en el servidor está ServerDataTable.
 *
 * @param {Array<{key: string, label: string, render: Function, width?: number}>} columns
 * @param {Function|null} [rowActions] fila → acciones; con ella la columna de acciones existe siempre
 * @param {*} [selectedKey] la clave de la fila elegida, que se marca
 */
export default function DataTable({
    ariaLabel, columns, rows, loading = false, emptyText, rowActions = null, rowKey = (row) => row.id,
    selectedKey = null, minWidth = 480,
}) {
    const columnCount = columns.length + (rowActions ? 1 : 0)
    return (
        <Table.ScrollContainer minWidth={minWidth}>
            <Table striped highlightOnHover withTableBorder verticalSpacing="xs" aria-label={ariaLabel} aria-busy={loading}>
                <Table.Thead>
                    <Table.Tr>
                        {columns.map((column) => <Table.Th key={column.key} w={column.width}>{column.label}</Table.Th>)}
                        {rowActions && <Table.Th w={1}><VisuallyHidden>Acciones</VisuallyHidden></Table.Th>}
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {rows.length === 0 && (
                        <Table.Tr>
                            <Table.Td colSpan={columnCount}>
                                {loading
                                    ? <Group gap="xs"><Loader size="xs"/><Text size="sm">Cargando…</Text></Group>
                                    : <Text size="sm" c="dimmed">{emptyText}</Text>}
                            </Table.Td>
                        </Table.Tr>
                    )}
                    {rows.map((row) => {
                        const key = rowKey(row)
                        return (
                            <Table.Tr key={key} bg={key === selectedKey ? 'var(--mantine-primary-color-light)' : undefined}>
                                {columns.map((column) => <Table.Td key={column.key}>{column.render(row)}</Table.Td>)}
                                {rowActions && <Table.Td><Group gap={4} wrap="nowrap">{rowActions(row)}</Group></Table.Td>}
                            </Table.Tr>
                        )
                    })}
                </Table.Tbody>
            </Table>
        </Table.ScrollContainer>
    )
}
