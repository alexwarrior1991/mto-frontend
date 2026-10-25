import {Badge, Button, CloseButton, Group, MultiSelect, Stack, Text, TextInput, Title} from '@mantine/core'
import {useDebouncedValue} from '@mantine/hooks'
import {IconArrowRight, IconBan, IconCircleCheck, IconHistory, IconPencil, IconPlus} from '@tabler/icons-react'
import {useState} from 'react'
import {useNavigate, useSearchParams} from 'react-router'
import {PERSON_CATEGORY} from '../../api/resources/enums.js'
import {isActivePerson, personRevisionsPath} from '../../api/resources/people.js'
import {personLabel, unitLabel} from '../../api/resources/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import {shortId} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RevisionsModal from '../../ui/RevisionsModal.jsx'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import TriStateFilter from '../../ui/TriStateFilter.jsx'
import PersonEditorModal from './PersonEditorModal.jsx'
import {PEOPLE_PATH, personPath} from './resourcesRoutes.js'
import {countText, DEACTIVATE_PERSON_TEXT, describePerson, employerText, personState} from './resourcesTexts.js'
import {RESOURCES_PAGE_SIZE, usePeopleList, usePersonAction, useUnit} from './useResources.js'

const SEARCH_DELAY_MS = 300

/**
 * El personal de mto-resources (el port de PeopleView), paginado, buscado y filtrado en el servidor.
 *
 * - Toda persona tiene ficha, con o sin usuario de Keycloak.
 * - No se borra nunca: desactivar es un DELETE (resources-delete) y reactivar, un PATCH active=true
 *   (resources-write). Quien dirige una unidad no se desactiva hasta que tenga otro jefe, y un lineman
 *   sale de su equipo hoy salvo que lo dejara con menos de 2: lo dice el servicio (409 UNI-001).
 * - Una fila abre la ficha de la persona (con sus cualificaciones) con doble clic o con su botón; un clic
 *   no abre nada. La columna de acciones existe siempre: abrir y el historial son lectura.
 * - Con ?unitId= (desde la ficha de una unidad) enseña solo quien la dirige y sus linemen de ahora; un
 *   id que no es un UUID no filtra. El nombre de la unidad se pide a su servicio, y si no se puede
 *   leer se enseña el id. «Quitar» vuelve a la lista entera.
 */
export default function PeoplePage({title}) {
    const session = useSession()
    const canWrite = session.has(P.RESOURCES_WRITE)
    const canDelete = session.has(P.RESOURCES_DELETE)

    const [search, setSearch] = useState('')
    const [debouncedSearch] = useDebouncedValue(search, SEARCH_DELAY_MS)
    const [categories, setCategories] = useState([])
    const [active, setActive] = useState(null)
    const [sort, setSort] = useState(null)
    const navigate = useNavigate()
    const [params] = useSearchParams()
    const unitId = uuidOrNull(params.get('unitId'))
    const unit = useUnit(unitId, {notFound: false})
    const filters = {search: debouncedSearch.trim(), categories, unitId, active}
    // La página vuelve a la primera en cuanto cambia lo que se pide.
    const listKey = JSON.stringify([filters, sort])
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1
    const list = usePeopleList({...filters, page, sort})
    const filtering = filters.search !== '' || categories.length > 0 || unitId !== null || active !== null

    // null: cerrado; {person: null}: alta; {person}: modificación.
    const [editing, setEditing] = useState(null)
    const [history, setHistory] = useState(null)
    const [deactivating, setDeactivating] = useState(null)
    const acting = usePersonAction()

    const deactivate = () => {
        const person = deactivating
        acting.mutate({action: 'deactivate', person}, {
            onSuccess: () => notifySuccess(`Desactivada ${personLabel(person)}`),
            onSettled: () => setDeactivating(null),
        })
    }
    const reactivate = (person) => acting.mutate({action: 'reactivate', person},
        {onSuccess: () => notifySuccess(`Reactivada ${personLabel(person)}`)})
    const open = (person) => navigate(personPath(person.id))

    const columns = [
        {key: 'code', label: 'Código', sortField: 'code', render: (person) => person.code},
        {key: 'name', label: 'Nombre', sortField: 'lastName', render: (person) => person.fullName},
        {key: 'category', label: 'Categoría', sortField: 'category', render: (person) => PERSON_CATEGORY.label(person.category)},
        {key: 'employer', label: 'Empresa', render: employerText},
        {key: 'username', label: 'Usuario', sortField: 'username', render: (person) => person.username ?? ''},
        {key: 'employeeNumber', label: 'N.º empleado', render: (person) => person.employeeNumber ?? ''},
        {key: 'phone', label: 'Teléfono', render: (person) => person.phone ?? ''},
        {key: 'active', label: 'Estado', sortField: 'active', render: personState},
    ]

    const actions = (person) => (
        <>
            <RowActionButton label={`Abrir ${person.code}`} tooltip="Abrir" icon={IconArrowRight} onClick={() => open(person)}/>
            <RowActionButton label={`Historial de ${person.code}`} tooltip="Historial" icon={IconHistory} onClick={() => setHistory(person)}/>
            {canWrite && (
                <RowActionButton label={`Modificar ${person.code}`} tooltip="Modificar" icon={IconPencil} onClick={() => setEditing({person})}/>
            )}
            {canDelete && isActivePerson(person) && (
                <RowActionButton label={`Desactivar ${person.code}`} tooltip="Desactivar" icon={IconBan} color="red"
                                 onClick={() => setDeactivating(person)}/>
            )}
            {canWrite && !isActivePerson(person) && (
                <RowActionButton label={`Reactivar ${person.code}`} tooltip="Reactivar" icon={IconCircleCheck} onClick={() => reactivate(person)}/>
            )}
        </>
    )

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group align="flex-end" gap="sm">
                <TextInput label="Buscar" placeholder="Código, nombre, usuario, número de empleado" w={320} value={search}
                           onChange={(event) => setSearch(event.currentTarget.value)}
                           rightSection={search ? <CloseButton size="sm" aria-label="Borrar la búsqueda" onClick={() => setSearch('')}/> : null}/>
                <MultiSelect label="Categoría" placeholder={categories.length === 0 ? 'Todas' : undefined} w={320} clearable
                             data={PERSON_CATEGORY.selectable()} value={categories} onChange={setCategories}/>
                <TriStateFilter label="Estado" labels={['Todas', 'Activas', 'Inactivas']} value={active} onChange={setActive}/>
                {unitId && (
                    <Group gap={4} align="center" pb={6}>
                        <Badge aria-label="Filtro de unidad" variant="light">{`Unidad: ${unit.data ? unitLabel(unit.data) : shortId(unitId)}`}</Badge>
                        <CloseButton size="sm" aria-label="Quitar el filtro de unidad" onClick={() => navigate(PEOPLE_PATH)}/>
                    </Group>
                )}
            </Group>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">{list.data ? countText(list.data.totalElements, 'persona', 'personas') : ''}</Text>
                {canWrite && <Button leftSection={<IconPlus size={16}/>} onClick={() => setEditing({person: null})}>Nueva persona</Button>}
            </Group>
            <ServerDataTable ariaLabel={title} columns={columns} rows={list.data?.content ?? []} loading={list.isPending}
                             emptyText={emptyText(list, filtering)} sort={sort} onSortChange={setSort} page={page}
                             pageSize={RESOURCES_PAGE_SIZE} totalElements={list.data?.totalElements ?? 0}
                             onPageChange={(next) => setPaging({key: listKey, page: next})} rowActions={actions}
                             onRowDoubleClick={open} minWidth={1100}/>
            {editing && <PersonEditorModal person={editing.person} onClose={() => setEditing(null)}/>}
            {history && (
                <RevisionsModal label={history.code} path={personRevisionsPath(history.id)} describe={describePerson}
                                onClose={() => setHistory(null)}/>
            )}
            {deactivating && (
                <ConfirmModal title={`Desactivar ${personLabel(deactivating)}`} confirmLabel="Desactivar" cancelLabel="Volver"
                              loading={acting.isPending} onConfirm={deactivate} onClose={() => setDeactivating(null)}>
                    {DEACTIVATE_PERSON_TEXT}
                </ConfirmModal>
            )}
        </Stack>
    )
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function uuidOrNull(value) {
    return value && UUID.test(value) ? value : null
}

function emptyText(list, filtering) {
    if (list.isError) {
        return 'No se ha podido leer la lista.'
    }
    return filtering ? 'Ninguna persona coincide con los filtros.' : 'No hay personas.'
}
