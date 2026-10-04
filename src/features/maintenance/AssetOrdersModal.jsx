import {Button, Group, Modal, Stack} from '@mantine/core'
import {IconExternalLink} from '@tabler/icons-react'
import {useState} from 'react'
import {useNavigate} from 'react-router'
import {ORDER_STATUS, ORDER_TYPE} from '../../api/maintenance/enums.js'
import {assetLabel} from '../../api/maintenance/values.js'
import {formatDate} from '../../ui/format.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import {orderPath} from './maintenanceRoutes.js'
import {progress} from './maintenanceTexts.js'
import {MAINTENANCE_PAGE_SIZE, useAssetOrders} from './useMaintenance.js'

const COLUMNS = Object.freeze([
    {key: 'code', label: 'Código', sortField: 'code', render: (order) => order.code},
    {key: 'title', label: 'Título', render: (order) => order.title},
    {key: 'type', label: 'Tipo', render: (order) => ORDER_TYPE.label(order.type)},
    {key: 'status', label: 'Estado', sortField: 'status', render: (order) => ORDER_STATUS.label(order.status)},
    {key: 'plannedDate', label: 'Prevista', sortField: 'plannedDate', render: (order) => formatDate(order.plannedDate)},
    {key: 'tasks', label: 'Tareas', render: (order) => progress(order.completedTaskCount, order.taskCount)},
])

/** Las órdenes de un activo (el port de AssetOrdersDialog), paginadas en el servidor y la más reciente primero; cada una abre su ficha. */
export default function AssetOrdersModal({asset, onClose}) {
    const navigate = useNavigate()
    const [sort, setSort] = useState(null)
    const [paging, setPaging] = useState({sort: null, page: 1})
    const page = paging.sort === sort ? paging.page : 1
    const orders = useAssetOrders(asset.id, {page, sort})
    const label = assetLabel(asset)
    const open = (order) => {
        onClose()
        navigate(orderPath(order.id))
    }
    return (
        <Modal opened onClose={onClose} title={`Órdenes de ${label}`} size="70rem">
            <Stack>
                <ServerDataTable ariaLabel={`Órdenes de ${label}`} columns={COLUMNS} rows={orders.data?.content ?? []} loading={orders.isPending}
                                 emptyText={orders.isError ? 'No se ha podido leer la lista.' : 'El activo no tiene órdenes.'}
                                 sort={sort} onSortChange={setSort} page={page} pageSize={MAINTENANCE_PAGE_SIZE}
                                 totalElements={orders.data?.totalElements ?? 0} onPageChange={(next) => setPaging({sort, page: next})}
                                 onRowDoubleClick={open}
                                 rowActions={(order) => <RowActionButton label={`Abrir ${order.code}`} tooltip="Abrir la orden" icon={IconExternalLink}
                                                                         onClick={() => open(order)}/>}/>
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>Cerrar</Button>
                </Group>
            </Stack>
        </Modal>
    )
}
