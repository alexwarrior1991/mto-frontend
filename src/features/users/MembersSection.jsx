import {Anchor, Stack, Text, Title} from '@mantine/core'
import {useState} from 'react'
import {Link} from 'react-router'
import {fullNameOf} from '../../api/users/users.js'
import DataTable from '../../ui/DataTable.jsx'
import {yesNo} from '../../ui/format.js'
import OffsetPager from '../../ui/OffsetPager.jsx'
import {userDetailPath} from './userTexts.js'
import {MEMBERS_PAGE_SIZE, useMembers} from './useUsers.js'

const COLUMNS = [
    {
        key: 'username',
        label: 'Usuario',
        render: (user) => <Anchor component={Link} to={userDetailPath(user.id)} size="sm">{user.username}</Anchor>,
    },
    {key: 'name', label: 'Nombre', render: fullNameOf},
    {key: 'email', label: 'Email', render: (user) => user.email ?? ''},
    {key: 'enabled', label: 'Activo', render: (user) => yesNo(user.enabled)},
]

/**
 * Quién tiene un perfil o un rol (el port de MembersPanel): una lista sin total, paseada con
 * anteriores y siguientes (OffsetPager), en páginas de 50. Cada miembro enlaza a su ficha. Lo que se
 * pasea empieza siempre en la primera página: quien la usa le pone key por lo que enseña.
 *
 * @param {Array} queryKey la clave de lo que se pasea, sin la página
 * @param {Function} fetchPage ({first, max}, {signal}) → los usuarios de esa página
 */
export default function MembersSection({title, note, queryKey, fetchPage}) {
    const [page, setPage] = useState(1)
    const members = useMembers(queryKey, fetchPage, page)
    const rows = members.data ?? []

    return (
        <Stack gap="xs">
            <Title order={4}>{title}</Title>
            <Text size="sm" c="dimmed">{note}</Text>
            <DataTable ariaLabel={title} columns={COLUMNS} rows={rows} loading={members.isPending}
                       emptyText={members.isError ? 'No se han podido leer los miembros.' : 'Nadie en esta página.'}/>
            <OffsetPager page={page} pageSize={MEMBERS_PAGE_SIZE} rows={rows} loading={members.isFetching} onChange={setPage}/>
        </Stack>
    )
}
