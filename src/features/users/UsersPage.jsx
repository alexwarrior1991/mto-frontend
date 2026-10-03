import {Anchor, Button, CloseButton, Group, Stack, Text, TextInput, Title, Tooltip} from '@mantine/core'
import {useDebouncedValue} from '@mantine/hooks'
import {IconBan, IconCheck, IconId, IconPencil, IconPlus, IconRefresh, IconSearch, IconTrash} from '@tabler/icons-react'
import {useState} from 'react'
import {Link, useNavigate} from 'react-router'
import {fullNameOf} from '../../api/users/users.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import {formatDateTime, yesNo} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import TriStateFilter from '../../ui/TriStateFilter.jsx'
import UserEditorModal from './UserEditorModal.jsx'
import {DELETE_USER_WARNING, enabledText, userDetailPath, usersCountText} from './userTexts.js'
import {listFilter, USERS_PAGE_SIZE, useDeleteUser, useSetEnabled, useUserList} from './useUsers.js'

const TYPING_DELAY_MS = 400

/**
 * usuarios: los usuarios del realm (el port de UsersView), en una lista paginada en el servidor.
 *
 * - Cada página es una sola petición a GET /api/users con first y max (50) y trae su total. La API no
 *   ordena, así que las columnas tampoco.
 * - La búsqueda por texto y el filtro por atributo se excluyen, porque el servicio los rechaza juntos
 *   (400 SEARCH-400): escribir en uno deshabilita el otro, y lo deshabilitado no viaja. Un atributo mal
 *   formado se marca y no pide nada.
 * - Los botones siguen los permisos del servicio: nuevo, modificar y activar o desactivar piden
 *   users-write; borrar, users-delete; abrir la ficha, solo leer.
 */
export default function UsersPage() {
    const session = useSession()
    const canWrite = session.has(P.USERS_WRITE)
    const canDelete = session.has(P.USERS_DELETE)
    const navigate = useNavigate()

    const [search, setSearch] = useState('')
    const [attribute, setAttribute] = useState('')
    const [enabled, setEnabled] = useState(null)
    const [typedSearch] = useDebouncedValue(search, TYPING_DELAY_MS)
    const [typedAttribute] = useDebouncedValue(attribute, TYPING_DELAY_MS)
    // Lo que tiene texto deshabilita al otro en cuanto se escribe; y si los dos llegaran con texto, la
    // búsqueda gana (listFilter): el atributo nunca viaja con ella.
    const searchDisabled = Boolean(attribute.trim())
    const attributeDisabled = Boolean(search.trim())
    const attributeError = typedAttribute.trim() && listFilter({attribute: typedAttribute}) === null ? 'clave:valor, sin espacios' : null

    const filter = listFilter({search: typedSearch, attribute: typedAttribute, enabled})
    // La página vuelve a la primera en cuanto cambia lo que se pide.
    const listKey = JSON.stringify(filter)
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1
    const list = useUserList(filter, page)

    // null: cerrado; {user: null}: alta; {user}: modificación.
    const [editing, setEditing] = useState(null)
    const [deleting, setDeleting] = useState(null)
    const toggling = useSetEnabled()
    const removing = useDeleteUser()

    const toggle = (user) => toggling.mutate({user, enabled: user.enabled !== true}, {
        onSuccess: (updated) => notifySuccess(enabledText(updated)),
    })
    const confirmDelete = () => {
        const user = deleting
        removing.mutate(user, {
            onSuccess: () => {
                notifySuccess(`Borrado ${user.username}`)
                setDeleting(null)
            },
            onError: () => setDeleting(null),
        })
    }
    const open = (user) => navigate(userDetailPath(user.id))

    const columns = [
        {
            key: 'username',
            label: 'Usuario',
            render: (user) => <Anchor component={Link} to={userDetailPath(user.id)} size="sm">{user.username}</Anchor>,
        },
        {key: 'name', label: 'Nombre', render: fullNameOf},
        {key: 'email', label: 'Email', render: (user) => user.email ?? ''},
        {key: 'emailVerified', label: 'Verificado', render: (user) => yesNo(user.emailVerified)},
        {key: 'enabled', label: 'Activo', render: (user) => yesNo(user.enabled)},
        {key: 'createdAt', label: 'Creado', render: (user) => formatDateTime(user.createdAt)},
    ]

    const actions = (user) => (
        <>
            <RowActionButton label={`Abrir la ficha de ${user.username}`} tooltip="Abrir la ficha" icon={IconId} onClick={() => open(user)}/>
            {canWrite && (
                <>
                    <RowActionButton label={`Modificar ${user.username}`} tooltip="Modificar" icon={IconPencil}
                                     onClick={() => setEditing({user})}/>
                    {user.enabled === true
                        ? <RowActionButton label={`Desactivar ${user.username}`} tooltip="Desactivar" icon={IconBan}
                                           onClick={() => toggle(user)}/>
                        : <RowActionButton label={`Activar ${user.username}`} tooltip="Activar" icon={IconCheck}
                                           onClick={() => toggle(user)}/>}
                </>
            )}
            {canDelete && (
                <RowActionButton label={`Borrar ${user.username}`} tooltip="Borrar" icon={IconTrash} color="red"
                                 onClick={() => setDeleting(user)}/>
            )}
        </>
    )

    const filtering = Boolean(filter?.search || filter?.attributes.length || enabled !== null)

    return (
        <Stack>
            <Title order={2}>Usuarios</Title>
            <Group justify="space-between" align="flex-end" gap="sm">
                <Group gap="sm" align="flex-end">
                    <TextInput aria-label="Buscar por usuario, email o nombre" placeholder="Buscar por usuario, email o nombre" w={280}
                               leftSection={<IconSearch size={16}/>} value={search} disabled={searchDisabled}
                               onChange={(event) => setSearch(event.currentTarget.value)}
                               rightSection={search
                                   ? <CloseButton size="sm" aria-label="Borrar la búsqueda" onClick={() => setSearch('')}/>
                                   : null}/>
                    <Tooltip label="Un atributo exacto del usuario. No se combina con la búsqueda: el servicio rechaza las dos a la vez"
                             multiline w={280} withArrow>
                        <TextInput aria-label="Atributo clave:valor" placeholder="Atributo clave:valor" w={220} value={attribute}
                                   disabled={attributeDisabled} error={attributeError}
                                   onChange={(event) => setAttribute(event.currentTarget.value)}
                                   rightSection={attribute
                                       ? <CloseButton size="sm" aria-label="Borrar el atributo" onClick={() => setAttribute('')}/>
                                       : null}/>
                    </Tooltip>
                    <TriStateFilter label="Estado" labels={['Todos', 'Activos', 'Desactivados']} value={enabled} onChange={setEnabled}/>
                    <Button variant="default" leftSection={<IconRefresh size={16}/>} loading={list.isFetching}
                            onClick={() => void list.refetch()}>
                        Recargar
                    </Button>
                    <Text size="sm" c="dimmed" aria-live="polite">{list.data ? usersCountText(list.data.total) : ''}</Text>
                </Group>
                {canWrite && <Button leftSection={<IconPlus size={16}/>} onClick={() => setEditing({user: null})}>Nuevo</Button>}
            </Group>
            <ServerDataTable ariaLabel="Usuarios" columns={columns} rows={list.data?.content ?? []} loading={list.isLoading}
                             emptyText={emptyText(list, filtering)} sort={null} onSortChange={() => {}}
                             page={page} pageSize={USERS_PAGE_SIZE} totalElements={list.data?.total ?? 0}
                             onPageChange={(next) => setPaging({key: listKey, page: next})}
                             rowActions={actions} onRowDoubleClick={open}/>
            {editing && <UserEditorModal user={editing.user} onClose={() => setEditing(null)}/>}
            {deleting && (
                <ConfirmModal title={`Borrar usuario ${deleting.username}`} confirmLabel="Borrar" loading={removing.isPending}
                              onConfirm={confirmDelete} onClose={() => setDeleting(null)}>
                    {DELETE_USER_WARNING}
                </ConfirmModal>
            )}
        </Stack>
    )
}

function emptyText(list, filtering) {
    if (list.isError) {
        return 'No se ha podido leer la lista.'
    }
    return filtering ? 'Nada coincide con la búsqueda.' : 'No hay usuarios.'
}
