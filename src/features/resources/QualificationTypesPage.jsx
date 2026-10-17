import {Button, CloseButton, Group, Select, Stack, Text, TextInput, Title} from '@mantine/core'
import {useDebouncedValue} from '@mantine/hooks'
import {IconBan, IconCircleCheck, IconPencil, IconPlus} from '@tabler/icons-react'
import {useState} from 'react'
import {DRIVING_LICENCE, QUALIFICATION_KIND} from '../../api/resources/enums.js'
import {isActiveQualificationType} from '../../api/resources/qualifications.js'
import {unitLabel} from '../../api/resources/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import TriStateFilter from '../../ui/TriStateFilter.jsx'
import QualificationTypeEditorModal from './QualificationTypeEditorModal.jsx'
import {countText} from './resourcesTexts.js'
import {RESOURCES_PAGE_SIZE, useQualificationTypeAction, useQualificationTypeList} from './useResources.js'

const SEARCH_DELAY_MS = 300

/**
 * El catálogo de tipos de cualificación de mto-resources (el port de QualificationTypesView), paginado,
 * buscado y filtrado en el servidor: permisos de conducir (con cuál), habilitaciones de vehículo, de
 * seguridad y otras, con su vigencia habitual. Darlos de alta y modificarlos pide resources-write;
 * retirarlos (un DELETE: nadie nuevo lo recibe, quien lo tiene lo conserva), resources-delete; volver a
 * ofrecerlo es un PATCH active=true. No tienen historial: son un catálogo.
 */
export default function QualificationTypesPage({title}) {
    const session = useSession()
    const canWrite = session.has(P.RESOURCES_WRITE)
    const canDelete = session.has(P.RESOURCES_DELETE)

    const [search, setSearch] = useState('')
    const [debouncedSearch] = useDebouncedValue(search, SEARCH_DELAY_MS)
    const [kind, setKind] = useState(null)
    const [active, setActive] = useState(null)
    const [sort, setSort] = useState(null)
    const filters = {search: debouncedSearch.trim(), kind, active}
    const listKey = JSON.stringify([filters, sort])
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1
    const list = useQualificationTypeList({...filters, page, sort})
    const filtering = filters.search !== '' || kind !== null || active !== null

    // null: cerrado; {type: null}: alta; {type}: modificación.
    const [editing, setEditing] = useState(null)
    const [retiring, setRetiring] = useState(null)
    const acting = useQualificationTypeAction()
    const retire = () => {
        const type = retiring
        acting.mutate({action: 'retire', type}, {
            onSuccess: () => notifySuccess(`Retirado ${unitLabel(type)}`),
            onSettled: () => setRetiring(null),
        })
    }
    const offerAgain = (type) => acting.mutate({action: 'offer', type}, {onSuccess: () => notifySuccess(`Se vuelve a ofrecer ${unitLabel(type)}`)})

    const columns = [
        {key: 'code', label: 'Código', sortField: 'code', render: (type) => type.code},
        {key: 'name', label: 'Nombre', sortField: 'name', render: (type) => type.name},
        {key: 'kind', label: 'Clase', sortField: 'kind', render: (type) => QUALIFICATION_KIND.label(type.kind)},
        {key: 'licence', label: 'Permiso', render: (type) => DRIVING_LICENCE.label(type.drivingLicence)},
        {key: 'validity', label: 'Vigencia', render: (type) => (type.validityMonths == null ? '' : countText(type.validityMonths, 'mes', 'meses'))},
        {key: 'active', label: 'Estado', sortField: 'active', render: (type) => (isActiveQualificationType(type) ? 'Activo' : 'Retirado')},
    ]
    const actions = (type) => (
        <>
            {canWrite && (
                <RowActionButton label={`Modificar ${type.code}`} tooltip="Modificar" icon={IconPencil} onClick={() => setEditing({type})}/>
            )}
            {canDelete && isActiveQualificationType(type) && (
                <RowActionButton label={`Retirar ${type.code}`} tooltip="Retirar" icon={IconBan} color="red" onClick={() => setRetiring(type)}/>
            )}
            {canWrite && !isActiveQualificationType(type) && (
                <RowActionButton label={`Volver a ofrecer ${type.code}`} tooltip="Volver a ofrecer" icon={IconCircleCheck}
                                 onClick={() => offerAgain(type)}/>
            )}
        </>
    )

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group align="flex-end" gap="sm">
                <TextInput label="Buscar" placeholder="Código o nombre" w={280} value={search} onChange={(event) => setSearch(event.currentTarget.value)}
                           rightSection={search ? <CloseButton size="sm" aria-label="Borrar la búsqueda" onClick={() => setSearch('')}/> : null}/>
                <Select label="Clase" placeholder="Todas" w={240} clearable data={QUALIFICATION_KIND.selectable()} value={kind} onChange={setKind}/>
                <TriStateFilter label="Estado" labels={['Todos', 'Activos', 'Retirados']} value={active} onChange={setActive}/>
            </Group>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">{list.data ? countText(list.data.totalElements, 'tipo', 'tipos') : ''}</Text>
                {canWrite && <Button leftSection={<IconPlus size={16}/>} onClick={() => setEditing({type: null})}>Nuevo tipo</Button>}
            </Group>
            <ServerDataTable ariaLabel={title} columns={columns} rows={list.data?.content ?? []} loading={list.isPending}
                             emptyText={list.isError ? 'No se ha podido leer la lista.' : (filtering ? 'Ningún tipo coincide con los filtros.'
                                 : 'No hay tipos de cualificación.')}
                             sort={sort} onSortChange={setSort} page={page} pageSize={RESOURCES_PAGE_SIZE}
                             totalElements={list.data?.totalElements ?? 0} onPageChange={(next) => setPaging({key: listKey, page: next})}
                             rowActions={actions} onRowDoubleClick={canWrite ? (type) => setEditing({type}) : null} minWidth={900}/>
            {editing && <QualificationTypeEditorModal type={editing.type} onClose={() => setEditing(null)}/>}
            {retiring && (
                <ConfirmModal title={`Retirar ${unitLabel(retiring)}`} confirmLabel="Retirar" cancelLabel="Volver" loading={acting.isPending}
                              onConfirm={retire} onClose={() => setRetiring(null)}>
                    No se borra: nadie nuevo lo recibe, y quien ya lo tiene lo conserva. Se puede volver a ofrecer.
                </ConfirmModal>
            )}
        </Stack>
    )
}
