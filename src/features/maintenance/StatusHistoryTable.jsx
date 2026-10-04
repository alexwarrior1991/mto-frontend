import DataTable from '../../ui/DataTable.jsx'
import {formatDateTime} from '../../ui/format.js'

/**
 * Los cambios de estado de una orden o de un defecto, como los guarda el servicio (el port de
 * StatusHistoryPanel): el primero es el alta, sin estado anterior. Es la otra mitad de la historia,
 * junto al historial de revisiones: dice por qué cambió, con el comentario o el motivo.
 *
 * @param {Function} statusLabel cómo se nombra un estado, que llega como texto
 */
export default function StatusHistoryTable({ariaLabel, query, statusLabel}) {
    const columns = [
        {key: 'changedAt', label: 'Fecha', render: (change) => formatDateTime(change.changedAt)},
        {key: 'from', label: 'De', render: (change) => (change.previousStatus ? statusLabel(change.previousStatus) : '')},
        {key: 'to', label: 'A', render: (change) => statusLabel(change.newStatus)},
        {key: 'changedBy', label: 'Por', render: (change) => change.changedBy ?? ''},
        {key: 'comment', label: 'Comentario', render: (change) => change.comment ?? ''},
    ]
    return (
        <DataTable ariaLabel={ariaLabel} columns={columns} rows={query.data ?? []} loading={query.isPending}
                   emptyText={query.isError ? 'No se ha podido leer el historial de estados.' : 'Sin cambios de estado.'}/>
    )
}
