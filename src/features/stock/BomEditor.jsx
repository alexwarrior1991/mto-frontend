import {Button, Group, Stack, Table, Text, TextInput, Title} from '@mantine/core'
import {IconPlus, IconTrash} from '@tabler/icons-react'
import {useState} from 'react'
import {referenceLabel} from '../../api/stock/values.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import {positiveQuantity} from './stockForms.js'
import StockPicker from './StockPicker.jsx'
import {quantityWithUnit} from './stockTexts.js'

/**
 * La lista de materiales de un conjunto dentro de su editor (el port de BomEditor): las líneas y una
 * fila para añadir otra, con el material buscado en el servidor (solo lo activo) y la cantidad por
 * conjunto. Añadir un material que ya está sustituye su cantidad en su sitio, así que no hay líneas
 * repetidas y cambiar una es volver a añadirla; quitar una no pide confirmación, porque nada se
 * guarda hasta «Guardar». Al guardar va entera: la que llega al servicio sustituye a la anterior.
 *
 * @param {Array<{materialId: string, material: object, quantity: string}>} value las líneas
 * @param {Function} onChange las líneas como quedan
 * @param {string|null} [error] lo que se dice de la lista entera (vacía, o un material repetido para el servicio)
 * @param {Function} [lineError] índice → el error del servicio en esa línea
 */
export default function BomEditor({value: lines, onChange, error = null, lineError = () => null}) {
    const [material, setMaterial] = useState(null)
    const [quantity, setQuantity] = useState('')
    const [draftErrors, setDraftErrors] = useState({})

    const add = () => {
        const errors = {material: material ? null : 'Elige el material', quantity: positiveQuantity(quantity)}
        setDraftErrors(errors)
        if (errors.material || errors.quantity) {
            return
        }
        const line = {materialId: material.id, material, quantity: quantity.trim()}
        const index = lines.findIndex((existing) => existing.materialId === material.id)
        onChange(index === -1 ? [...lines, line] : lines.map((existing, at) => (at === index ? line : existing)))
        setMaterial(null)
        setQuantity('')
    }

    const remove = (materialId) => onChange(lines.filter((line) => line.materialId !== materialId))

    return (
        <Stack gap="xs">
            <Title order={4}>Lista de materiales</Title>
            <Group align="flex-start" gap="sm" wrap="nowrap">
                <StockPicker catalogue="materials" label="Material" style={{flex: 1}} value={material} error={draftErrors.material}
                             onChange={(next) => {
                                 setMaterial(next)
                                 setDraftErrors((current) => ({...current, material: null}))
                             }}/>
                <TextInput label="Cantidad por conjunto" inputMode="decimal" w={170} value={quantity} error={draftErrors.quantity}
                           onChange={(event) => {
                               setQuantity(event.currentTarget.value)
                               setDraftErrors((current) => ({...current, quantity: null}))
                           }}
                           onKeyDown={(event) => {
                               if (event.key === 'Enter') {
                                   event.preventDefault()
                                   add()
                               }
                           }}/>
                <Button type="button" variant="light" mt={25} leftSection={<IconPlus size={16}/>} onClick={add}>Añadir</Button>
            </Group>
            <Table withTableBorder verticalSpacing="xs" aria-label="Lista de materiales">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Material</Table.Th>
                        <Table.Th>Por conjunto</Table.Th>
                        <Table.Th w={1}><Text span size="xs" c="dimmed">Quitar</Text></Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {lines.length === 0 && (
                        <Table.Tr>
                            <Table.Td colSpan={3}><Text size="sm" c="dimmed">Sin materiales todavía.</Text></Table.Td>
                        </Table.Tr>
                    )}
                    {lines.map((line, index) => (
                        <Table.Tr key={line.materialId}>
                            <Table.Td>
                                {referenceLabel(line.material)}
                                {lineError(index) && <Text size="xs" c="red">{lineError(index)}</Text>}
                            </Table.Td>
                            <Table.Td>{quantityWithUnit(line.quantity, line.material)}</Table.Td>
                            <Table.Td>
                                <RowActionButton label={`Quitar ${line.material?.code ?? 'la línea'}`} tooltip="Quitar" icon={IconTrash} color="red"
                                                 onClick={() => remove(line.materialId)}/>
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
            {error && <Text size="sm" c="red" role="alert">{error}</Text>}
        </Stack>
    )
}
