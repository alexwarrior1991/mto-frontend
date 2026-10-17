import {Button, Group, Stack, Text} from '@mantine/core'
import {IconPencil, IconPlus, IconTrash} from '@tabler/icons-react'
import {useState} from 'react'
import {QUALIFICATION_KIND} from '../../api/resources/enums.js'
import {personLabel} from '../../api/resources/values.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import DataTable from '../../ui/DataTable.jsx'
import {formatDate} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ExpiryBadge from './ExpiryBadge.jsx'
import QualificationModal from './QualificationModal.jsx'
import {countText, join} from './resourcesTexts.js'
import {usePersonQualifications, useRemovePersonQualification} from './useResources.js'

/**
 * Las cualificaciones de una persona (el port de PersonQualificationsPanel), enteras y por el código
 * de su tipo: su tipo, su referencia, cuándo se expidió, cuándo caduca y cómo está («Caducada», «Caduca
 * en N días» si faltan 30 o menos, «Vigente» o «No caduca»). Darlas de alta y modificarlas pide
 * resources-write; quitarlas, resources-delete y confirmación. Renovar una es cambiar su caducidad: cada
 * tipo está una vez.
 */
export default function PersonQualificationsPanel({person, canWrite, canDelete}) {
    const qualifications = usePersonQualifications(person.id)
    // null: cerrado; {qualification: null}: alta; {qualification}: modificación.
    const [editing, setEditing] = useState(null)
    const [removing, setRemoving] = useState(null)
    const removal = useRemovePersonQualification(person.id)
    const rows = qualifications.data ?? []

    const remove = () => {
        const qualification = removing
        removal.mutate(qualification, {
            onSuccess: () => notifySuccess(`Quitada ${qualification.qualificationType?.code} de ${person.code}`),
            onSettled: () => setRemoving(null),
        })
    }

    const columns = [
        {key: 'type', label: 'Tipo', render: (row) => join(row.qualificationType?.code, row.qualificationType?.name)},
        {key: 'kind', label: 'Clase', render: (row) => QUALIFICATION_KIND.label(row.qualificationType?.kind)},
        {key: 'reference', label: 'Referencia', render: (row) => row.reference ?? ''},
        {key: 'issuedOn', label: 'Expedida', render: (row) => formatDate(row.issuedOn)},
        {key: 'expiresOn', label: 'Caduca', render: (row) => formatDate(row.expiresOn)},
        {key: 'state', label: 'Estado', render: (row) => <ExpiryBadge expiresOn={row.expiresOn} expired={row.expired ?? null}/>},
    ]
    const actions = canWrite || canDelete
        ? (row) => (
            <>
                {canWrite && (
                    <RowActionButton label={`Modificar ${row.qualificationType?.code}`} tooltip="Modificar" icon={IconPencil}
                                     onClick={() => setEditing({qualification: row})}/>
                )}
                {canDelete && (
                    <RowActionButton label={`Quitar ${row.qualificationType?.code}`} tooltip="Quitar" icon={IconTrash} color="red"
                                     onClick={() => setRemoving(row)}/>
                )}
            </>
        )
        : null

    return (
        <Stack>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">
                    {qualifications.data ? countText(rows.length, 'cualificación', 'cualificaciones') : ''}
                </Text>
                {canWrite && (
                    <Button leftSection={<IconPlus size={16}/>} onClick={() => setEditing({qualification: null})}>Añadir cualificación</Button>
                )}
            </Group>
            <DataTable ariaLabel={`Cualificaciones de ${person.code}`} columns={columns} rows={rows} loading={qualifications.isPending}
                       emptyText={qualifications.isError ? 'No se han podido leer sus cualificaciones.' : 'No tiene cualificaciones.'}
                       rowActions={actions} minWidth={900}/>
            {editing && <QualificationModal person={person} qualification={editing.qualification} held={rows} onClose={() => setEditing(null)}/>}
            {removing && (
                <ConfirmModal title={`Quitar ${removing.qualificationType?.code} de ${personLabel(person)}`} confirmLabel="Quitar" cancelLabel="Volver"
                              loading={removal.isPending} onConfirm={remove} onClose={() => setRemoving(null)}>
                    Se borra de la persona (el historial la guarda). Si solo ha caducado, renovarla es cambiar su caducidad. Sin ella, deja de
                    valer para lo que la exige: un vehículo que pide esa habilitación a su conductor.
                </ConfirmModal>
            )}
        </Stack>
    )
}
