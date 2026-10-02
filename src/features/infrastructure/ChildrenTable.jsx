import {Button, Group, Stack, Table, Text, VisuallyHidden} from '@mantine/core'
import {IconPencil, IconPlus, IconTrash} from '@tabler/icons-react'
import {useState} from 'react'
import RowActionButton from '../../ui/RowActionButton.jsx'

/**
 * Una colección de hijos dentro del editor de su padre (el port de ChildrenEditor): las ménsulas de un
 * perfil o las agujas de un aislador. Añadir, modificar y quitar trabajan sobre la lista del editor, y
 * nada sale hasta guardar el padre.
 *
 * El editor guarda si la lista se tocó: para el servicio la colección que llega es el estado final y el
 * hijo que falta se borra, así que una lista que nadie tocó viaja a null y una tocada va entera.
 *
 * @param {Array} items la lista de trabajo
 * @param {Function} onChange lista → nada; el editor la marca como tocada
 * @param {Function} itemLabel (hijo, índice) → cómo se nombra en los botones («Modificar ménsula 1 · PT1»)
 * @param {Function} renderDialog ({child, onAccept, onClose}) → el diálogo de un hijo; child es null
 *        en un alta
 */
export default function ChildrenTable({title, items, onChange, max = Infinity, columns, itemLabel, emptyText, renderDialog}) {
    // null: cerrado; {index: -1}: alta; {index: n}: modificación del hijo n.
    const [editing, setEditing] = useState(null)

    const accept = (child) => {
        if (editing.index < 0) {
            onChange([...items, child])
        } else {
            onChange(items.map((item, index) => (index === editing.index ? child : item)))
        }
        setEditing(null)
    }

    return (
        <Stack gap="xs">
            <Group justify="space-between" align="center">
                <Group gap="xs" align="baseline">
                    <Text fw={600} size="sm">{title}</Text>
                    <Text size="xs" c="dimmed">Se guardan con el padre</Text>
                </Group>
                <Button size="xs" variant="light" leftSection={<IconPlus size={14}/>} disabled={items.length >= max}
                        onClick={() => setEditing({index: -1})}>
                    Añadir
                </Button>
            </Group>
            <Table.ScrollContainer minWidth={560}>
                <Table withTableBorder verticalSpacing={4} aria-label={title}>
                    <Table.Thead>
                        <Table.Tr>
                            {columns.map((column) => <Table.Th key={column.key}>{column.label}</Table.Th>)}
                            <Table.Th w={1}><VisuallyHidden>Acciones</VisuallyHidden></Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {items.length === 0 && (
                            <Table.Tr>
                                <Table.Td colSpan={columns.length + 1}><Text size="sm" c="dimmed">{emptyText}</Text></Table.Td>
                            </Table.Tr>
                        )}
                        {/* Los hijos nuevos aún no tienen id: la posición es lo único estable mientras se edita. */}
                        {items.map((item, index) => (
                            <Table.Tr key={index}>
                                {columns.map((column) => <Table.Td key={column.key}>{column.render(item)}</Table.Td>)}
                                <Table.Td>
                                    <Group gap={4} wrap="nowrap">
                                        <RowActionButton label={`Modificar ${itemLabel(item, index)}`} tooltip="Modificar"
                                                         icon={IconPencil} onClick={() => setEditing({index})}/>
                                        <RowActionButton label={`Quitar ${itemLabel(item, index)}`} tooltip="Quitar" icon={IconTrash}
                                                         color="red" onClick={() => onChange(items.filter((_, other) => other !== index))}/>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
            {editing && renderDialog({
                child: editing.index < 0 ? null : items[editing.index],
                onAccept: accept,
                onClose: () => setEditing(null),
            })}
        </Stack>
    )
}
