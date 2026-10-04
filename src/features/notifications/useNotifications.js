import {keepPreviousData, useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {getActivityEvent, searchAccess, searchActivity} from '../../api/notification/activity.js'
import {markAllRead, markRead, searchInbox, unreadCount} from '../../api/notification/inbox.js'

/**
 * Las consultas y las escrituras del módulo, con las claves ['notifications', …]. Nada se da por fresco:
 * la bandeja, el registro y los accesos cambian solos, con lo que pasa en el dominio.
 */

/** Cada cuánto vuelve a pedir la campana su contador con la pantalla abierta: el REFRESH_PERIOD del backoffice. */
export const UNREAD_REFRESH_MS = 30_000

const NOT_FRESH = 0

export function notificationKey(...parts) {
    return ['notifications', ...parts]
}

/**
 * El contador de la campana: al entrar y cada 30 s, nunca con la pestaña oculta. Un fallo no se avisa
 * (cada 30 s sería ruido; la bandeja lo dirá al abrirse) y el número se queda como estaba: React Query
 * conserva lo último que leyó.
 */
export function useUnreadCount() {
    return useQuery({
        queryKey: notificationKey('unread-count'),
        queryFn: ({signal}) => unreadCount({signal}),
        refetchInterval: UNREAD_REFRESH_MS,
        refetchIntervalInBackground: false,
        staleTime: NOT_FRESH,
        meta: {notifyError: false},
    })
}

export function useInbox(params) {
    return useQuery({
        queryKey: notificationKey('inbox', params),
        queryFn: ({signal}) => searchInbox(params, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

/**
 * Marcar como leída una, o todas. Después se releen la bandeja y la campana, sin esperarlas: quien
 * abre una notificación sigue su enlace en cuanto el servicio la ha marcado.
 */
export function useMarkRead() {
    const queryClient = useQueryClient()
    return useMutation({mutationFn: (id) => markRead(id), onSuccess: () => void refreshInbox(queryClient)})
}

export function useMarkAllRead() {
    const queryClient = useQueryClient()
    return useMutation({mutationFn: () => markAllRead(), onSuccess: () => void refreshInbox(queryClient)})
}

function refreshInbox(queryClient) {
    return Promise.all([
        queryClient.invalidateQueries({queryKey: notificationKey('inbox')}),
        queryClient.invalidateQueries({queryKey: notificationKey('unread-count')}),
    ])
}

export function useActivityList(params) {
    return useQuery({
        queryKey: notificationKey('activity', params),
        queryFn: ({signal}) => searchActivity(params, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

/** Una línea del registro entera, con su payload, que la lista no trae. Su fallo lo dice su diálogo. */
export function useActivityEvent(id) {
    return useQuery({
        queryKey: notificationKey('activity-event', id),
        queryFn: ({signal}) => getActivityEvent(id, {signal}),
        enabled: Boolean(id),
        meta: {notifyError: false},
    })
}

/** Los accesos. Con una IP a medio escribir no se piden (enabled), porque el servicio la rechazaría. */
export function useAccessList(params, {enabled = true} = {}) {
    return useQuery({
        queryKey: notificationKey('access', params),
        queryFn: ({signal}) => searchAccess(params, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
        enabled,
    })
}
