import {Button, CloseButton, Group, Select, Stack, Text, TextInput, Title} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useDebouncedValue} from '@mantine/hooks'
import {IconBan, IconCircleCheck, IconHistory, IconPencil, IconPlus} from '@tabler/icons-react'
import {useState} from 'react'
import {INSTRUMENT_KIND} from '../../api/resources/enums.js'
import {instrumentRevisionsPath, isActiveInstrument} from '../../api/resources/instruments.js'
import {unitLabel} from '../../api/resources/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import {formatDate} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RevisionsModal from '../../ui/RevisionsModal.jsx'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import TriStateFilter from '../../ui/TriStateFilter.jsx'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import ExpiryBadge from './ExpiryBadge.jsx'
import InstrumentEditorModal from './InstrumentEditorModal.jsx'
import {countText, describeInstrument, instrumentState} from './resourcesTexts.js'
import {RESOURCES_PAGE_SIZE, useInstrumentAction, useInstrumentList} from './useResources.js'

const SEARCH_DELAY_MS = 300

/**
 * Los instrumentos de mto-resources (el port de InstrumentsView): pértigas de puesta a tierra,
 * detectores de tensión y equipos de medida, paginados, buscados y filtrados en el servidor, también
 * por «calibración caduca antes de» (los que hay que llevar a calibrar). Su calibración dice cómo está,
 * como una cualificación. Escribir pide resources-fleet-write; retirar, resources-delete; reactivar es
 * un PATCH active=true. Tienen historial. Es la pantalla a la que lleva el aviso de una calibración que
 * caduca, y de aquí sale lo que se elige en un turno de mantenimiento.
 */
export default function InstrumentsPage({title}) {
    const session = useSession()
    const canWrite = session.has(P.RESOURCES_FLEET_WRITE)
    const canDelete = session.has(P.RESOURCES_DELETE)

    const [search, setSearch] = useState('')
    const [debouncedSearch] = useDebouncedValue(search, SEARCH_DELAY_MS)
    const [kind, setKind] = useState(null)
    const [expiresBefore, setExpiresBefore] = useState(null)
    const [active, setActive] = useState(null)
    const [sort, setSort] = useState(null)
    const filters = {search: debouncedSearch.trim(), kind, calibrationExpiresBefore: expiresBefore, active}
    const listKey = JSON.stringify([filters, sort])
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1
    const list = useInstrumentList({...filters, page, sort})
    const filtering = filters.search !== '' || kind !== null || expiresBefore !== null || active !== null

    // null: cerrado; {instrument: null}: alta; {instrument}: modificación.
    const [editing, setEditing] = useState(null)
    const [history, setHistory] = useState(null)
    const [retiring, setRetiring] = useState(null)
    const acting = useInstrumentAction()
    const retire = () => {
        const instrument = retiring
        acting.mutate({action: 'retire', instrument}, {
            onSuccess: () => notifySuccess(`Retirado ${unitLabel(instrument)}`),
            onSettled: () => setRetiring(null),
        })
    }
    const reactivate = (instrument) => acting.mutate({action: 'reactivate', instrument},
        {onSuccess: () => notifySuccess(`Reactivado ${unitLabel(instrument)}`)})

    const columns = [
        {key: 'code', label: 'Código', sortField: 'code', render: (instrument) => instrument.code},
        {key: 'name', label: 'Nombre', sortField: 'name', render: (instrument) => instrument.name},
        {key: 'kind', label: 'Tipo', sortField: 'kind', render: (instrument) => INSTRUMENT_KIND.label(instrument.kind)},
        {key: 'serial', label: 'N.º de serie', sortField: 'serialNumber', render: (instrument) => instrument.serialNumber ?? ''},
        {key: 'calibratedOn', label: 'Calibrado', sortField: 'calibratedOn', render: (instrument) => formatDate(instrument.calibratedOn)},
        {key: 'expiresOn', label: 'Calibración hasta', sortField: 'calibrationExpiresOn',
            render: (instrument) => formatDate(instrument.calibrationExpiresOn)},
        {key: 'calibration', label: 'Calibración', render: (instrument) => (
            <ExpiryBadge expiresOn={instrument.calibrationExpiresOn} expired={instrument.calibrationExpired ?? null} none="Sin calibración"/>
        )},
        {key: 'active', label: 'Estado', sortField: 'active', render: instrumentState},
    ]
    const actions = (instrument) => (
        <>
            <RowActionButton label={`Historial de ${instrument.code}`} tooltip="Historial" icon={IconHistory} onClick={() => setHistory(instrument)}/>
            {canWrite && (
                <RowActionButton label={`Modificar ${instrument.code}`} tooltip="Modificar" icon={IconPencil} onClick={() => setEditing({instrument})}/>
            )}
            {canDelete && isActiveInstrument(instrument) && (
                <RowActionButton label={`Retirar ${instrument.code}`} tooltip="Retirar" icon={IconBan} color="red" onClick={() => setRetiring(instrument)}/>
            )}
            {canWrite && !isActiveInstrument(instrument) && (
                <RowActionButton label={`Reactivar ${instrument.code}`} tooltip="Reactivar" icon={IconCircleCheck} onClick={() => reactivate(instrument)}/>
            )}
        </>
    )

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group align="flex-end" gap="sm">
                <TextInput label="Buscar" placeholder="Código, nombre, número de serie" w={300} value={search}
                           onChange={(event) => setSearch(event.currentTarget.value)}
                           rightSection={search ? <CloseButton size="sm" aria-label="Borrar la búsqueda" onClick={() => setSearch('')}/> : null}/>
                <Select label="Tipo" placeholder="Todos" w={240} clearable data={INSTRUMENT_KIND.selectable()} value={kind} onChange={setKind}/>
                <DateInput label="Calibración caduca antes de" w={220} clearable valueFormat={DATE_FORMAT} dateParser={parseTypedDate}
                           placeholder="DD/MM/AAAA" value={expiresBefore} onChange={setExpiresBefore}/>
                <TriStateFilter label="Estado" labels={['Todos', 'Activos', 'Retirados']} value={active} onChange={setActive}/>
            </Group>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">{list.data ? countText(list.data.totalElements, 'instrumento', 'instrumentos') : ''}</Text>
                {canWrite && <Button leftSection={<IconPlus size={16}/>} onClick={() => setEditing({instrument: null})}>Nuevo instrumento</Button>}
            </Group>
            <ServerDataTable ariaLabel={title} columns={columns} rows={list.data?.content ?? []} loading={list.isPending}
                             emptyText={list.isError ? 'No se ha podido leer la lista.' : (filtering ? 'Ningún instrumento coincide con los filtros.'
                                 : 'No hay instrumentos.')}
                             sort={sort} onSortChange={setSort} page={page} pageSize={RESOURCES_PAGE_SIZE}
                             totalElements={list.data?.totalElements ?? 0} onPageChange={(next) => setPaging({key: listKey, page: next})}
                             rowActions={actions} onRowDoubleClick={canWrite ? (instrument) => setEditing({instrument}) : null} minWidth={1100}/>
            {editing && <InstrumentEditorModal instrument={editing.instrument} onClose={() => setEditing(null)}/>}
            {history && (
                <RevisionsModal label={history.code} path={instrumentRevisionsPath(history.id)} describe={describeInstrument}
                                onClose={() => setHistory(null)}/>
            )}
            {retiring && (
                <ConfirmModal title={`Retirar ${unitLabel(retiring)}`} confirmLabel="Retirar" cancelLabel="Volver" loading={acting.isPending}
                              onConfirm={retire} onClose={() => setRetiring(null)}>
                    No se borra: los turnos que ya lo llevan lo siguen nombrando, y deja de ofrecerse en los nuevos. Se puede reactivar.
                </ConfirmModal>
            )}
        </Stack>
    )
}
