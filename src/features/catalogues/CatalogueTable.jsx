import {ActionIcon, Checkbox, Group, Loader, Table, Text, Tooltip, UnstyledButton, VisuallyHidden} from '@mantine/core'
import {IconChevronDown, IconChevronUp, IconPencil, IconSelector, IconTrash} from '@tabler/icons-react'
import {formatDateTime} from '../../ui/format.js'

/**
 * Las filas de un catalogo: codigo, descripcion, el tipo en los tres que lo llevan, si esta activa y
 * quien la toco por ultima vez. Las casillas (para los lotes) y las acciones de cada fila salen solo
 * con su permiso; esconderlas es cortesia, porque quien manda es el 403 del servicio.
 *
 * @param {object|null} selection {selected: Set de ids, toggle(id), toggleAll()} o null sin lotes
 * @param {string|null} emptyText lo que se dice cuando no hay filas que ensenar
 */
export default function CatalogueTable({resource, rows, loading, emptyText, sort, onSort, selection, onEdit, onDelete}) {
    const parent = resource.parent ?? null
    const withActions = Boolean(onEdit || onDelete)
    const columns = 5 + (parent ? 1 : 0) + (selection ? 1 : 0) + (withActions ? 1 : 0)
    const selectedShown = selection ? rows.filter((row) => selection.selected.has(row.id)).length : 0

    return (
        <Table.ScrollContainer minWidth={720}>
            <Table striped highlightOnHover withTableBorder verticalSpacing="xs" aria-label="Entradas del catálogo">
                <Table.Thead>
                    <Table.Tr>
                        {selection && (
                            <Table.Th w={40}>
                                <Checkbox aria-label="Seleccionar todas" disabled={rows.length === 0}
                                          checked={rows.length > 0 && selectedShown === rows.length}
                                          indeterminate={selectedShown > 0 && selectedShown < rows.length}
                                          onChange={selection.toggleAll}/>
                            </Table.Th>
                        )}
                        <SortableHeader label="Código" column="code" sort={sort} onSort={onSort}/>
                        <SortableHeader label="Descripción" column="description" sort={sort} onSort={onSort}/>
                        {parent && <Table.Th>{parent.label}</Table.Th>}
                        <Table.Th>Activo</Table.Th>
                        <Table.Th>Modificado</Table.Th>
                        <Table.Th>Por</Table.Th>
                        {withActions && <Table.Th w={80}><VisuallyHidden>Acciones</VisuallyHidden></Table.Th>}
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {rows.length === 0 && (
                        <Table.Tr>
                            <Table.Td colSpan={columns}>
                                {loading
                                    ? <Group gap="xs"><Loader size="xs"/><Text size="sm">Cargando…</Text></Group>
                                    : <Text size="sm" c="dimmed">{emptyText}</Text>}
                            </Table.Td>
                        </Table.Tr>
                    )}
                    {rows.map((row) => (
                        <Table.Tr key={row.id} onDoubleClick={onEdit ? () => onEdit(row) : undefined}>
                            {selection && (
                                <Table.Td>
                                    <Checkbox aria-label={`Seleccionar ${row.code}`} checked={selection.selected.has(row.id)}
                                              onChange={() => selection.toggle(row.id)}/>
                                </Table.Td>
                            )}
                            <Table.Td>{row.code}</Table.Td>
                            <Table.Td>{row.description}</Table.Td>
                            {parent && <Table.Td>{row[parent.field]?.code ?? ''}</Table.Td>}
                            <Table.Td>{row.enabled === true ? 'Sí' : 'No'}</Table.Td>
                            <Table.Td>{formatDateTime(row.versionDate)}</Table.Td>
                            <Table.Td>{row.versionUser ?? ''}</Table.Td>
                            {withActions && (
                                <Table.Td>
                                    <Group gap={4} wrap="nowrap">
                                        {onEdit && (
                                            <Tooltip label="Modificar" withArrow>
                                                <ActionIcon variant="subtle" aria-label={`Modificar ${row.code}`}
                                                            onClick={() => onEdit(row)}>
                                                    <IconPencil size={16}/>
                                                </ActionIcon>
                                            </Tooltip>
                                        )}
                                        {onDelete && (
                                            <Tooltip label="Borrar" withArrow>
                                                <ActionIcon variant="subtle" color="red" aria-label={`Borrar ${row.code}`}
                                                            onClick={() => onDelete(row)}>
                                                    <IconTrash size={16}/>
                                                </ActionIcon>
                                            </Tooltip>
                                        )}
                                    </Group>
                                </Table.Td>
                            )}
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Table.ScrollContainer>
    )
}

function SortableHeader({label, column, sort, onSort}) {
    const active = sort.column === column
    const ascending = sort.direction === 'asc'
    const Icon = !active ? IconSelector : ascending ? IconChevronUp : IconChevronDown
    return (
        <Table.Th aria-sort={active ? (ascending ? 'ascending' : 'descending') : 'none'}>
            <UnstyledButton onClick={() => onSort(column)}>
                <Group gap={4} wrap="nowrap">
                    <Text size="sm" fw={700}>{label}</Text>
                    <Icon size={14} aria-hidden/>
                </Group>
            </UnstyledButton>
        </Table.Th>
    )
}
