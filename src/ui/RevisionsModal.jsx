import {Button, Group, Modal, Stack, Text} from '@mantine/core'
import {keepPreviousData, useQuery} from '@tanstack/react-query'
import {useState} from 'react'
import {NotFoundError} from '../api/errors.js'
import {listRevisions, REVISION_OPERATION, REVISIONS_PAGE_SIZE} from '../api/revisions.js'
import {formatDateTime} from './format.js'
import ServerDataTable from './ServerDataTable.jsx'

const NO_SORT = () => {
}

/**
 * El historial de una fila (el port de RevisionsDialog): las revisiones paginadas en el servidor, la
 * más reciente primero, con su número, cuándo, qué operación, quién, por qué camino (HTTP, MESSAGING,
 * SYSTEM o BASELINE, la foto inicial), cómo quedó la fila y su correlación.
 *
 * Sin revisiones el servicio responde 404: el diálogo dice «sin historial todavía» y no se avisa de
 * nada (meta.silentNotFound). Cualquier otro fallo es un aviso, como siempre.
 *
 * @param {string} label cómo se llama la fila, para el título («MAT-001 - Hilo de contacto»)
 * @param {string} path la ruta de su historial
 * @param {Function} describe la entidad de una revisión → una línea con cómo quedó
 */
export default function RevisionsModal({label, path, describe, onClose}) {
    const [page, setPage] = useState(1)
    const revisions = useQuery({
        queryKey: ['revisions', path, page],
        queryFn: ({signal}) => listRevisions(path, {page}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: 0,
        meta: {silentNotFound: true},
    })
    const none = revisions.error instanceof NotFoundError
    const rows = revisions.data?.content ?? []
    const total = revisions.data?.totalElements ?? 0

    return (
        <Modal opened onClose={onClose} title={`Historial de ${label}`} size="90rem">
            <Stack>
                {none
                    ? <Text size="sm">Sin historial todavía: el servicio no guarda ninguna revisión de esta fila.</Text>
                    : (
                        <>
                            <Text size="sm" c="dimmed" aria-live="polite">{revisions.data ? countText(total) : ''}</Text>
                            <ServerDataTable ariaLabel={`Historial de ${label}`} columns={columns(describe)} rows={rows}
                                             rowKey={(row) => row.revision?.revision} loading={revisions.isPending}
                                             emptyText={revisions.isError ? 'No se ha podido leer el historial.' : 'Sin revisiones.'}
                                             sort={null} onSortChange={NO_SORT} page={page} pageSize={REVISIONS_PAGE_SIZE}
                                             totalElements={total} onPageChange={setPage} minWidth={960}/>
                        </>
                    )}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>Cerrar</Button>
                </Group>
            </Stack>
        </Modal>
    )
}

function columns(describe) {
    return [
        {key: 'revision', label: 'Revisión', render: (row) => row.revision?.revision ?? ''},
        {key: 'revisionAt', label: 'Cuándo', render: (row) => formatDateTime(row.revision?.revisionAt)},
        {key: 'operation', label: 'Operación', render: (row) => REVISION_OPERATION.label(row.revision?.operation)},
        {key: 'author', label: 'Quién', render: (row) => row.revision?.author ?? ''},
        {key: 'source', label: 'Origen', render: (row) => row.revision?.source ?? ''},
        {key: 'entity', label: 'Cómo quedó', render: (row) => (row.entity ? describe(row.entity) : '')},
        {key: 'correlationId', label: 'Correlación', render: (row) => row.revision?.correlationId ?? ''},
    ]
}

function countText(total) {
    return `${total} ${total === 1 ? 'revisión' : 'revisiones'}, la más reciente primero`
}
