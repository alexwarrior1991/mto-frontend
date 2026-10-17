import {Button, Group, Stack, Text} from '@mantine/core'
import {IconPencil, IconPlus, IconTrash} from '@tabler/icons-react'
import {useState} from 'react'
import {VEHICLE_DOCUMENT_KIND} from '../../api/resources/enums.js'
import {unitLabel} from '../../api/resources/values.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import DataTable from '../../ui/DataTable.jsx'
import {formatDate} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ExpiryBadge from './ExpiryBadge.jsx'
import {countText} from './resourcesTexts.js'
import {useRemoveVehicleDocument, useVehicleDocuments} from './useResources.js'
import VehicleDocumentModal from './VehicleDocumentModal.jsx'

/**
 * Los documentos de un vehículo con su caducidad (el port de VehicleDocumentsPanel): la ITV, la
 * inspección ferroviaria, el seguro y los certificados de la grúa y de la plataforma, uno de cada tipo,
 * con cómo está cada uno («Caducado», «Caduca en N días» si faltan 30 o menos, «Vigente»). Darlos de
 * alta y modificarlos pide resources-fleet-write; quitarlos, resources-delete y confirmación. Uno
 * caducado deja el vehículo fuera de los turnos de mantenimiento.
 */
export default function VehicleDocumentsPanel({vehicle, canWrite, canDelete}) {
    const documents = useVehicleDocuments(vehicle.id)
    // null: cerrado; {document: null}: alta; {document}: modificación.
    const [editing, setEditing] = useState(null)
    const [removing, setRemoving] = useState(null)
    const removal = useRemoveVehicleDocument(vehicle.id)
    const rows = documents.data ?? []

    const remove = () => {
        const document = removing
        removal.mutate(document, {
            onSuccess: () => notifySuccess(`Quitado ${VEHICLE_DOCUMENT_KIND.label(document.kind)} de ${vehicle.code}`),
            onSettled: () => setRemoving(null),
        })
    }

    const columns = [
        {key: 'kind', label: 'Tipo', render: (row) => VEHICLE_DOCUMENT_KIND.label(row.kind)},
        {key: 'reference', label: 'Referencia', render: (row) => row.reference ?? ''},
        {key: 'issuedOn', label: 'Expedido', render: (row) => formatDate(row.issuedOn)},
        {key: 'expiresOn', label: 'Caduca', render: (row) => formatDate(row.expiresOn)},
        {key: 'state', label: 'Estado', render: (row) => <ExpiryBadge expiresOn={row.expiresOn} expired={row.expired ?? null} expiredLabel="Caducado"/>},
    ]
    // Uno de un tipo que esta aplicación no conoce no se modifica ni se quita aquí: no se sabría decir qué es.
    const actions = canWrite || canDelete
        ? (row) => (VEHICLE_DOCUMENT_KIND.isKnown(row.kind)
            ? (
                <>
                    {canWrite && (
                        <RowActionButton label={`Modificar ${VEHICLE_DOCUMENT_KIND.label(row.kind)}`} tooltip="Modificar" icon={IconPencil}
                                         onClick={() => setEditing({document: row})}/>
                    )}
                    {canDelete && (
                        <RowActionButton label={`Quitar ${VEHICLE_DOCUMENT_KIND.label(row.kind)}`} tooltip="Quitar" icon={IconTrash} color="red"
                                         onClick={() => setRemoving(row)}/>
                    )}
                </>
            )
            : null)
        : null

    return (
        <Stack>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">{documents.data ? countText(rows.length, 'documento', 'documentos') : ''}</Text>
                {canWrite && <Button leftSection={<IconPlus size={16}/>} onClick={() => setEditing({document: null})}>Añadir documento</Button>}
            </Group>
            <DataTable ariaLabel={`Documentos de ${vehicle.code}`} columns={columns} rows={rows} loading={documents.isPending}
                       emptyText={documents.isError ? 'No se han podido leer sus documentos.' : 'No tiene documentos.'} rowActions={actions}
                       minWidth={800}/>
            {editing && <VehicleDocumentModal vehicle={vehicle} document={editing.document} held={rows} onClose={() => setEditing(null)}/>}
            {removing && (
                <ConfirmModal title={`Quitar ${VEHICLE_DOCUMENT_KIND.label(removing.kind)} de ${unitLabel(vehicle)}`} confirmLabel="Quitar"
                              cancelLabel="Volver" loading={removal.isPending} onConfirm={remove} onClose={() => setRemoving(null)}>
                    Se borra del vehículo (el historial lo guarda). Si solo ha caducado, renovarlo es cambiar su caducidad.
                </ConfirmModal>
            )}
        </Stack>
    )
}
