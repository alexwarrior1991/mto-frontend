import {Group, Loader, Pagination, Table, Text, UnstyledButton, VisuallyHidden} from '@mantine/core'
import {IconChevronDown, IconChevronUp, IconSelector} from '@tabler/icons-react'

const CONTROL_LABELS = Object.freeze({
    first: 'Primera página',
    previous: 'Página anterior',
    next: 'Página siguiente',
    last: 'Última página',
})

/**
 * Una lista paginada en el servidor: el port del Grid con setItems(fetch, count) del backoffice. La
 * tabla no pide nada: pinta la página que le dan y avisa de lo que la persona elige (página y orden)
 * para que la pantalla la vuelva a pedir. La página empieza en 1.
 *
 * El orden es de una sola columna y da la vuelta ascendente → descendente → sin orden. Sin orden, la
 * pantalla no manda sort y ordena el servicio.
 *
 * @param {Array<{key: string, label: string, sortField?: string, render: Function, width?: number}>} columns
 * @param {{field: string, direction: 'asc'|'desc'}|null} sort
 * @param {Function|null} [rowActions] fila → acciones; con ella la columna de acciones existe siempre
 */
export default function ServerDataTable({
    ariaLabel, columns, rows, loading = false, emptyText, sort, onSortChange,
    page, pageSize, totalElements, onPageChange, rowActions = null, onRowDoubleClick = null,
    rowKey = (row) => row.id, minWidth = 720,
}) {
    const totalPages = Math.max(1, Math.ceil((totalElements ?? 0) / pageSize))
    const columnCount = columns.length + (rowActions ? 1 : 0)
    const changeSort = (field) => onSortChange(nextSort(sort, field))

    return (
        <>
            <Table.ScrollContainer minWidth={minWidth}>
                <Table striped highlightOnHover withTableBorder verticalSpacing="xs" aria-label={ariaLabel} aria-busy={loading}>
                    <Table.Thead>
                        <Table.Tr>
                            {columns.map((column) => (column.sortField
                                ? <SortableHeader key={column.key} column={column} sort={sort} onSort={changeSort}/>
                                : <Table.Th key={column.key} w={column.width}>{column.label}</Table.Th>))}
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
                        {rows.map((row) => (
                            <Table.Tr key={rowKey(row)} onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}>
                                {columns.map((column) => <Table.Td key={column.key}>{column.render(row)}</Table.Td>)}
                                {rowActions && <Table.Td><Group gap={4} wrap="nowrap">{rowActions(row)}</Group></Table.Td>}
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
            {totalPages > 1 && (
                <Group justify="flex-end">
                    <Pagination total={totalPages} value={Math.min(page, totalPages)} onChange={onPageChange} withEdges
                                getControlProps={(control) => ({'aria-label': CONTROL_LABELS[control]})}
                                getItemProps={(item) => ({'aria-label': `Página ${item}`})}/>
                </Group>
            )}
        </>
    )
}

/** El orden siguiente al pulsar una columna: ascendente, descendente y sin orden. */
function nextSort(sort, field) {
    if (sort?.field !== field) {
        return {field, direction: 'asc'}
    }
    return sort.direction === 'asc' ? {field, direction: 'desc'} : null
}

function SortableHeader({column, sort, onSort}) {
    const active = sort?.field === column.sortField
    const ascending = sort?.direction === 'asc'
    const Icon = !active ? IconSelector : ascending ? IconChevronUp : IconChevronDown
    return (
        <Table.Th w={column.width} aria-sort={active ? (ascending ? 'ascending' : 'descending') : 'none'}>
            <UnstyledButton onClick={() => onSort(column.sortField)}>
                <Group gap={4} wrap="nowrap">
                    <Text size="sm" fw={700}>{column.label}</Text>
                    <Icon size={14} aria-hidden/>
                </Group>
            </UnstyledButton>
        </Table.Th>
    )
}
