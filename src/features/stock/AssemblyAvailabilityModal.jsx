import {Badge, Button, Group, Modal, Stack, Table, Text} from '@mantine/core'
import {useState} from 'react'
import {referenceLabel} from '../../api/stock/values.js'
import {formatDateTime, formatQuantity} from '../../ui/format.js'
import StockPicker from './StockPicker.jsx'
import {entryLabel, producibleText} from './stockTexts.js'
import {useAssemblyAvailability} from './useStock.js'

/**
 * Cuántos conjuntos se podrían montar ahora en un almacén, y qué componente lo limita (el port de
 * AssemblyAvailabilityDialog). El almacén es obligatorio, porque el stock es por almacén, y sin él no
 * se pide nada. El cálculo es del servicio (GET /assemblies/{id}/availability): un conjunto no tiene
 * stock propio y aquí no se divide nada. Es una consulta, así que lo puede pedir quien solo lee.
 */
export default function AssemblyAvailabilityModal({assembly, onClose}) {
    const [warehouse, setWarehouse] = useState(null)
    const availability = useAssemblyAvailability(assembly.id, warehouse?.id ?? null)
    const result = warehouse ? availability.data : null

    return (
        <Modal opened onClose={onClose} size="xl" title={`Disponibilidad de ${entryLabel(assembly)}`}>
            <Stack>
                <StockPicker catalogue="warehouses" label="Almacén" description="El stock es por almacén: elige uno para calcular"
                             value={warehouse} onChange={setWarehouse}/>
                {result && (
                    <>
                        <Text size="xl" fw={700} aria-live="polite">
                            {producibleText(result.availableQuantity, result.warehouse?.code ?? warehouse.code)}
                        </Text>
                        <Text size="sm" c="dimmed">
                            Calculado el {formatDateTime(result.calculatedAt)}; el componente que limita está marcado.
                        </Text>
                        <Table withTableBorder verticalSpacing="xs" aria-label="Componentes">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Material</Table.Th>
                                    <Table.Th>Por conjunto</Table.Th>
                                    <Table.Th>Físico</Table.Th>
                                    <Table.Th>Reservado</Table.Th>
                                    <Table.Th>Disponible</Table.Th>
                                    <Table.Th>Montables</Table.Th>
                                    <Table.Th>Limita</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {(result.components ?? []).map((component) => (
                                    <Table.Tr key={component.material?.id}>
                                        <Table.Td>{referenceLabel(component.material)}</Table.Td>
                                        <Table.Td>{formatQuantity(component.requiredQuantityPerAssembly)}</Table.Td>
                                        <Table.Td>{formatQuantity(component.onHandQuantity)}</Table.Td>
                                        <Table.Td>{formatQuantity(component.activeReservedQuantity)}</Table.Td>
                                        <Table.Td>{formatQuantity(component.availableQuantity)}</Table.Td>
                                        <Table.Td>{formatQuantity(component.producibleAssemblyQuantity)}</Table.Td>
                                        <Table.Td>{component.limitingComponent === true && <Badge color="orange">Limita</Badge>}</Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </>
                )}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>Cerrar</Button>
                </Group>
            </Stack>
        </Modal>
    )
}
