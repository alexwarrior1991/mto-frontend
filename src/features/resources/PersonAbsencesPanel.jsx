import {Button, Group, Stack, Text} from '@mantine/core'
import {IconPencil, IconPlus, IconTrash} from '@tabler/icons-react'
import {useState} from 'react'
import {absenceDays} from '../../api/resources/absences.js'
import {ABSENCE_KIND} from '../../api/resources/enums.js'
import {personLabel} from '../../api/resources/values.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import DataTable from '../../ui/DataTable.jsx'
import {formatDate} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import AbsenceModal from './AbsenceModal.jsx'
import {countText} from './resourcesTexts.js'
import {usePersonAbsences, useRemoveAbsence} from './useResources.js'

/**
 * Las ausencias de una persona (el port de PersonAbsencesPanel), en el orden del servicio (la más reciente
 * primero): su clase, desde y hasta (los dos incluidos), cuántos días y sus notas. Darlas de alta y
 * modificarlas pide resources-write; quitarlas, resources-delete y confirmación. Una de una clase que no se
 * conoce no ofrece nada. Mantenimiento no deja a la persona en un turno de esas fechas.
 */
export default function PersonAbsencesPanel({person, canWrite, canDelete}) {
    const absences = usePersonAbsences(person.id)
    // null: cerrado; {absence: null}: alta; {absence}: modificación.
    const [editing, setEditing] = useState(null)
    const [removing, setRemoving] = useState(null)
    const removal = useRemoveAbsence(person.id)
    const rows = absences.data ?? []

    const remove = () => {
        const absence = removing
        removal.mutate(absence, {
            onSuccess: () => notifySuccess(`Quitada la ausencia de ${person.code} desde ${formatDate(absence.startsOn)}`),
            onSettled: () => setRemoving(null),
        })
    }

    const columns = [
        {key: 'kind', label: 'Clase', render: (row) => ABSENCE_KIND.label(row.kind)},
        {key: 'startsOn', label: 'Desde', render: (row) => formatDate(row.startsOn)},
        {key: 'endsOn', label: 'Hasta', render: (row) => formatDate(row.endsOn)},
        {key: 'days', label: 'Días', render: (row) => absenceDays(row) ?? ''},
        {key: 'notes', label: 'Notas', render: (row) => row.notes ?? ''},
    ]
    const actions = canWrite || canDelete
        ? (row) => ABSENCE_KIND.isKnown(row.kind) && (
            <>
                {canWrite && (
                    <RowActionButton label={`Modificar la ausencia desde ${formatDate(row.startsOn)}`} tooltip="Modificar" icon={IconPencil}
                                     onClick={() => setEditing({absence: row})}/>
                )}
                {canDelete && (
                    <RowActionButton label={`Quitar la ausencia desde ${formatDate(row.startsOn)}`} tooltip="Quitar" icon={IconTrash} color="red"
                                     onClick={() => setRemoving(row)}/>
                )}
            </>
        )
        : null

    return (
        <Stack>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">{absences.data ? countText(rows.length, 'ausencia', 'ausencias') : ''}</Text>
                {canWrite && <Button leftSection={<IconPlus size={16}/>} onClick={() => setEditing({absence: null})}>Nueva ausencia</Button>}
            </Group>
            <DataTable ariaLabel={`Ausencias de ${person.code}`} columns={columns} rows={rows} loading={absences.isPending}
                       emptyText={absences.isError ? 'No se han podido leer sus ausencias.' : 'No tiene ausencias.'}
                       rowActions={actions} minWidth={720}/>
            {editing && <AbsenceModal person={person} absence={editing.absence} onClose={() => setEditing(null)}/>}
            {removing && (
                <ConfirmModal title={`Quitar la ausencia de ${personLabel(person)}`} confirmLabel="Quitar" cancelLabel="Volver"
                              loading={removal.isPending} onConfirm={remove} onClose={() => setRemoving(null)}>
                    Se borra (el historial la guarda) y la persona vuelve a estar disponible del {formatDate(removing.startsOn)} al{' '}
                    {formatDate(removing.endsOn)} para los turnos de mantenimiento.
                </ConfirmModal>
            )}
        </Stack>
    )
}
