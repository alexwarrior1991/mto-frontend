import {MOVEMENT_TYPE} from '../../api/stock/movements.js'
import {referenceLabel} from '../../api/stock/values.js'
import {formatDateTime, formatQuantity} from '../../ui/format.js'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import {STOCK_PAGE_SIZE} from './useStock.js'

/**
 * Las columnas del libro de movimientos (el port de MovementGrid), las mismas en el libro entero y en
 * el de un material. La cantidad es la que da el servicio con su signo (signedQuantity), también la de
 * un tipo de apunte que esta versión no conoce, que se pinta «Desconocido».
 *
 * @param {object} list la consulta de la página
 * @param {boolean} withMaterial si lleva la columna del material (en el de un material sobra)
 */
export default function MovementsTable({ariaLabel, list, page, onPageChange, sort, onSortChange, withMaterial, emptyText}) {
    return (
        <ServerDataTable ariaLabel={ariaLabel} columns={columns(withMaterial)} rows={list.data?.content ?? []}
                         loading={list.isPending} emptyText={list.isError ? 'No se ha podido leer el libro.' : emptyText}
                         sort={sort} onSortChange={onSortChange} page={page} pageSize={STOCK_PAGE_SIZE}
                         totalElements={list.data?.totalElements ?? 0} onPageChange={onPageChange} minWidth={960}/>
    )
}

function columns(withMaterial) {
    return [
        {key: 'occurredAt', label: 'Fecha', sortField: 'occurredAt', render: (row) => formatDateTime(row.occurredAt)},
        {key: 'type', label: 'Tipo', render: (row) => MOVEMENT_TYPE.label(row.type)},
        ...(withMaterial ? [{key: 'material', label: 'Material', render: (row) => referenceLabel(row.material)}] : []),
        {key: 'warehouse', label: 'Almacén', render: (row) => row.warehouse?.code ?? ''},
        {key: 'quantity', label: 'Cantidad', sortField: 'quantity', render: (row) => formatQuantity(row.signedQuantity)},
        {key: 'counterpart', label: 'Proveedor / proyecto', render: (row) => row.supplier?.code ?? row.project?.code ?? ''},
        {
            key: 'reservation', label: 'Reserva',
            render: (row) => (row.reservation ? `${formatQuantity(row.reservation.quantity)} reservados` : ''),
        },
        {key: 'externalReference', label: 'Referencia', render: (row) => row.externalReference ?? ''},
        {key: 'createdBy', label: 'Por', render: (row) => row.audit?.createdBy ?? ''},
    ]
}
