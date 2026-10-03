import {keepPreviousData, useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {toOffsetParams} from '../../api/paging.js'
import {assignProfile, getProfile, getUserProfiles, listProfiles, removeProfile} from '../../api/users/profiles.js'
import {addClientRoles, getUserRoles, listClientRoles, listClients, removeClientRoles} from '../../api/users/roles.js'
import {
    createUser,
    deleteCredential,
    deleteUser,
    getUser,
    isAttributeFilter,
    listCredentials,
    listOfflineSessions,
    listSessions,
    resetPassword,
    searchUsers,
    sendActionsEmail,
    setUserEnabled,
    takeOut,
    updateUser,
} from '../../api/users/users.js'

/**
 * Las consultas y las escrituras del módulo de usuarios.
 *
 * Las claves van todas bajo ['users', …]:
 * - la lista: ['users', 'list', filtro, página];
 * - la cabecera de una ficha: ['users', 'user', id];
 * - cada pestaña, con su propia clave: ['users', 'assigned-profiles', id], ['users', 'assigned-roles', id],
 *   ['users', 'sessions', id, 'normal' | 'offline'] y ['users', 'credentials', id];
 * - los catálogos: ['users', 'profiles'], ['users', 'profile', nombre], ['users', 'clients'] y
 *   ['users', 'client-roles', cliente], y sus miembros por página.
 *
 * La cabecera no es prefijo de sus pestañas: releerla no relee lo que se pintó con una respuesta.
 *
 * Asignar o quitar un perfil o un rol, activar y modificar pintan lo que devuelve el servicio, que es
 * lo que Keycloak tiene ya (mto-users lo relee antes de responder), sin volver a pedirlo. Lo demás se
 * relee; una pestaña que no se ha abierto no tiene consulta y no se pide.
 */

/** Las filas de cada página de la lista, como el backoffice. */
export const USERS_PAGE_SIZE = 50

/** Los miembros de un perfil o de un rol, por página. */
export const MEMBERS_PAGE_SIZE = 50

export function usersKey(...parts) {
    return ['users', ...parts]
}

/**
 * Lo que la lista pide. La búsqueda y el atributo se excluyen porque el servicio los rechaza juntos
 * (400 SEARCH-400): con texto en los dos, gana la búsqueda. Un atributo mal formado no pide nada.
 *
 * @returns {{search: string|null, attributes: string[], enabled: boolean|null}|null}
 */
export function listFilter({search = '', attribute = '', enabled = null} = {}) {
    const text = search.trim()
    if (text) {
        return {search: text, attributes: [], enabled}
    }
    const pair = attribute.trim()
    if (pair && !isAttributeFilter(pair)) {
        return null
    }
    return {search: null, attributes: pair ? [pair] : [], enabled}
}

/**
 * Una página de la lista, con su total, en una sola petición (first y max). Mientras llega la
 * siguiente se sigue viendo la anterior; con un atributo mal formado, también.
 */
export function useUserList(filter, page) {
    return useQuery({
        queryKey: usersKey('list', filter, page),
        queryFn: ({signal}) => searchUsers({...filter, ...toOffsetParams({page, size: USERS_PAGE_SIZE})}, {signal}),
        enabled: filter !== null,
        placeholderData: keepPreviousData,
    })
}

/** La cabecera de la ficha. Un 404 se dice «No existe el usuario …», una vez, y la ficha vuelve a la lista. */
export function useUser(userId, {enabled = true} = {}) {
    return useQuery({
        queryKey: usersKey('user', userId),
        queryFn: ({signal}) => getUser(userId, {signal}),
        enabled,
        meta: {notFoundMessage: `No existe el usuario ${userId}`},
    })
}

export function useAssignedProfiles(userId) {
    return useQuery({
        queryKey: usersKey('assigned-profiles', userId),
        queryFn: ({signal}) => getUserProfiles(userId, {signal}),
    })
}

export function useAssignedRoles(userId) {
    return useQuery({
        queryKey: usersKey('assigned-roles', userId),
        queryFn: ({signal}) => getUserRoles(userId, {signal}),
    })
}

/** Las sesiones normales o las offline: son la foto del servicio, así que no se dan por frescas. */
export function useSessions(userId, kind) {
    return useQuery({
        queryKey: usersKey('sessions', userId, kind),
        queryFn: ({signal}) => (kind === 'offline' ? listOfflineSessions(userId, {signal}) : listSessions(userId, {signal})),
        staleTime: 0,
    })
}

export function useCredentials(userId) {
    return useQuery({
        queryKey: usersKey('credentials', userId),
        queryFn: ({signal}) => listCredentials(userId, {signal}),
    })
}

export function useProfileCatalogue({enabled = true} = {}) {
    return useQuery({queryKey: usersKey('profiles'), queryFn: ({signal}) => listProfiles({signal}), enabled})
}

/** Lo que concede un perfil. */
export function useProfile(name) {
    return useQuery({
        queryKey: usersKey('profile', name),
        queryFn: ({signal}) => getProfile(name, {signal}),
        enabled: Boolean(name),
    })
}

export function useClients({enabled = true} = {}) {
    return useQuery({queryKey: usersKey('clients'), queryFn: ({signal}) => listClients({signal}), enabled})
}

export function useClientRoles(clientId) {
    return useQuery({
        queryKey: usersKey('client-roles', clientId),
        queryFn: ({signal}) => listClientRoles(clientId, {signal}),
        enabled: Boolean(clientId),
    })
}

/**
 * Una página de miembros de un perfil o de un rol: una lista sin total, al estilo de Keycloak.
 *
 * @param {Array} key la clave de lo que se pasea, sin la página
 * @param {Function} fetchPage ({first, max}, {signal}) → los usuarios de esa página
 */
export function useMembers(key, fetchPage, page) {
    return useQuery({
        queryKey: [...key, page],
        queryFn: ({signal}) => fetchPage(toOffsetParams({page, size: MEMBERS_PAGE_SIZE}), {signal}),
        placeholderData: keepPreviousData,
    })
}

/**
 * El alta o la modificación desde el editor, que trata él mismo sus errores (van a sus campos). La
 * modificación pinta en la ficha el usuario que devuelve el servicio.
 */
export function useSaveUser() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({userId = null, body}) => (userId === null ? createUser(body) : updateUser(userId, body)),
        meta: {notifyError: false},
        onSuccess: (saved, {userId = null}) => {
            if (userId !== null) {
                queryClient.setQueryData(usersKey('user', userId), saved)
            }
            return queryClient.invalidateQueries({queryKey: usersKey('list')})
        },
    })
}

/** Activar o desactivar: reversible, sin confirmación. La ficha pinta lo que devuelve el servicio. */
export function useSetEnabled() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({user, enabled}) => setUserEnabled(user.id, enabled),
        onSuccess: (updated, {user}) => {
            queryClient.setQueryData(usersKey('user', user.id), updated)
            return queryClient.invalidateQueries({queryKey: usersKey('list')})
        },
    })
}

export function useDeleteUser() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (user) => deleteUser(user.id),
        onSuccess: () => queryClient.invalidateQueries({queryKey: usersKey('list')}),
    })
}

/**
 * La contraseña, desde su diálogo, que trata él mismo sus errores. Después se releen la cabecera (con
 * una temporal, Keycloak añade «Cambiar la contraseña» a las acciones pendientes) y las credenciales.
 */
export function useResetPassword(userId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (request) => resetPassword(userId, request),
        meta: {notifyError: false},
        onSuccess: () => Promise.all([
            queryClient.invalidateQueries({queryKey: usersKey('user', userId)}),
            queryClient.invalidateQueries({queryKey: usersKey('credentials', userId)}),
        ]),
    })
}

/** El correo de acciones, desde su diálogo, que trata él mismo sus errores. No cambia nada que se vea. */
export function useSendActionsEmail(userId) {
    return useMutation({
        mutationFn: (request) => sendActionsEmail(userId, request),
        meta: {notifyError: false},
    })
}

/**
 * Asignar o quitar un perfil: se pinta la lista que devuelve el servicio. Un perfil es un rol de realm,
 * así que la pestaña de roles (si se abrió) se relee.
 */
export function useProfileAssignment(userId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({name, assign}) => (assign ? assignProfile(userId, name) : removeProfile(userId, name)),
        onSuccess: (profiles) => {
            queryClient.setQueryData(usersKey('assigned-profiles', userId), profiles)
            return queryClient.invalidateQueries({queryKey: usersKey('assigned-roles', userId)})
        },
    })
}

/** Añadir o quitar roles de un cliente: se pintan los roles que devuelve el servicio. */
export function useRoleAssignment(userId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({clientId, roles, assign}) => (assign
            ? addClientRoles(userId, clientId, roles)
            : removeClientRoles(userId, clientId, roles)),
        onSuccess: (roles) => queryClient.setQueryData(usersKey('assigned-roles', userId), roles),
    })
}

/** Cerrar sesiones: haya ido bien o no, se releen las dos listas, que son la foto del servicio. */
export function useRevokeSessions(userId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (revoke) => revoke(),
        onSettled: () => queryClient.invalidateQueries({queryKey: usersKey('sessions', userId)}),
    })
}

/** Quitar una credencial: haya ido bien o no, se releen. */
export function useDeleteCredential(userId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (credential) => deleteCredential(userId, credential.id),
        onSettled: () => queryClient.invalidateQueries({queryKey: usersKey('credentials', userId)}),
    })
}

/**
 * «Sacar a la persona»: nunca falla como mutación, porque takeOut devuelve el paso que falló. Después
 * se releen la cabecera, la lista y las sesiones (si su pestaña se abrió), haya llegado hasta el final
 * o no.
 */
export function useTakeOut(userId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: () => takeOut(userId),
        onSuccess: () => Promise.all([
            queryClient.invalidateQueries({queryKey: usersKey('user', userId)}),
            queryClient.invalidateQueries({queryKey: usersKey('list')}),
            queryClient.invalidateQueries({queryKey: usersKey('sessions', userId)}),
        ]),
    })
}
