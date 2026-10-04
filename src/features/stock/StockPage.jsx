import {Badge, Group, Paper, SimpleGrid, Stack, Text, Title} from '@mantine/core'
import {IconEye} from '@tabler/icons-react'
import {useState} from 'react'
import {referenceLabel, summaryOf} from '../../api/stock/values.js'
import {formatQuantity} from '../../ui/format.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import MovementsTable from './MovementsTable.jsx'
import StockOperations from './StockOperations.jsx'
import StockPicker from './StockPicker.jsx'
import {countText} from './stockTexts.js'
import {STOCK_PAGE_SIZE, useLowStock, useMaterialLedger, useMaterialStock} from './useStock.js'

const LOW_STOCK_COLUMNS = Object.freeze([
    {key: 'code', label: 'Código', render: (row) => row.code},
    {key: 'name', label: 'Nombre', render: (row) => row.name},
    {key: 'unitOfMeasure', label: 'Unidad', render: (row) => row.unitOfMeasure ?? ''},
    {key: 'minimumStockLevel', label: 'Mínimo', render: (row) => formatQuantity(row.minimumStockLevel)},
])

const NO_SORT = () => {
}

/**
 * Las existencias (el port de StockView): la entrada «Existencias» del menú. Se elige un material y,
 * si se quiere, un almacén, y se ven las cifras que calcula mto-stock (físico, reservado por las
 * reservas activas, disponible, el mínimo y si está bajo mínimo), el libro de ese material y los
 * botones de operar. Debajo, los materiales activos bajo mínimo del almacén elegido, o de todos; su
 * fila elige el material. Aquí no se calcula nada: las cifras son las del servicio.
 *
 * Los desplegables ofrecen también lo retirado, para ver lo que tiene un material o un almacén que ya
 * no se usa.
 */
export default function StockPage({title}) {
    const [material, setMaterial] = useState(null)
    const [warehouse, setWarehouse] = useState(null)
    const [ledgerSort, setLedgerSort] = useState(null)
    const ledgerKey = JSON.stringify([material?.id, warehouse?.id, ledgerSort])
    const [ledgerPaging, setLedgerPaging] = useState({key: ledgerKey, page: 1})
    const ledgerPage = ledgerPaging.key === ledgerKey ? ledgerPaging.page : 1
    const lowStockKey = warehouse?.id ?? null
    const [lowStockPaging, setLowStockPaging] = useState({key: lowStockKey, page: 1})
    const lowStockPage = lowStockPaging.key === lowStockKey ? lowStockPaging.page : 1

    const figures = useMaterialStock(material?.id ?? null, warehouse?.id ?? null)
    const ledger = useMaterialLedger(material?.id ?? null, {warehouseId: warehouse?.id ?? null, page: ledgerPage, sort: ledgerSort})
    const lowStock = useLowStock({warehouseId: warehouse?.id ?? null, page: lowStockPage})

    const prefill = () => ({material, warehouse})

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group align="flex-end" gap="sm">
                <StockPicker catalogue="materials" label="Material" w={360} includeRetired value={material} onChange={setMaterial}/>
                <StockPicker catalogue="warehouses" label="Almacén" w={260} includeRetired placeholder="Todos los almacenes"
                             value={warehouse} onChange={setWarehouse}/>
                <StockOperations prefill={prefill}/>
            </Group>
            {material && figures.data && <Figures stock={figures.data}/>}
            {material && (
                <>
                    <Title order={4}>Movimientos de {referenceLabel(material)}{warehouse ? ` en ${warehouse.code}` : ''}</Title>
                    <MovementsTable ariaLabel="Movimientos del material" list={ledger} page={ledgerPage} sort={ledgerSort}
                                    onSortChange={setLedgerSort} onPageChange={(next) => setLedgerPaging({key: ledgerKey, page: next})}
                                    withMaterial={false} emptyText="Sin movimientos."/>
                </>
            )}
            <Group gap="sm" align="baseline">
                <Title order={4}>Bajo mínimo</Title>
                <Text size="sm" c="dimmed" aria-live="polite">
                    {lowStock.data ? countText(lowStock.data.totalElements, 'material', 'materiales') : ''}
                </Text>
            </Group>
            <ServerDataTable ariaLabel="Bajo mínimo" columns={LOW_STOCK_COLUMNS} rows={lowStock.data?.content ?? []}
                             loading={lowStock.isPending}
                             emptyText={lowStock.isError ? 'No se ha podido leer la lista.' : 'Ningún material está bajo mínimo.'}
                             sort={null} onSortChange={NO_SORT} page={lowStockPage} pageSize={STOCK_PAGE_SIZE}
                             totalElements={lowStock.data?.totalElements ?? 0}
                             onPageChange={(next) => setLowStockPaging({key: lowStockKey, page: next})}
                             rowActions={(row) => (
                                 <RowActionButton label={`Ver las existencias de ${row.code}`} tooltip="Ver sus existencias" icon={IconEye}
                                                  onClick={() => setMaterial(summaryOf(row))}/>
                             )}/>
        </Stack>
    )
}

function Figures({stock}) {
    return (
        <Paper component="section" withBorder p="md" aria-label="Existencias del material">
            <Group gap="xl" align="center">
                <SimpleGrid cols={{base: 2, sm: 4}} spacing="xl">
                    <Figure label="Físico" value={stock.onHandQuantity}/>
                    <Figure label="Reservado" value={stock.activeReservedQuantity}/>
                    <Figure label="Disponible" value={stock.availableQuantity}/>
                    <Figure label="Mínimo" value={stock.minimumStockLevel}/>
                </SimpleGrid>
                {stock.lowStock === true && <Badge color="red" size="lg">Bajo mínimo</Badge>}
            </Group>
        </Paper>
    )
}

function Figure({label, value}) {
    return (
        <div role="group" aria-label={label}>
            <Text size="xs" c="dimmed">{label}</Text>
            <Text size="xl" fw={600}>{formatQuantity(value)}</Text>
        </div>
    )
}
