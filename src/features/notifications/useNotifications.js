import {keepPreviousData, useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {getActivityEvent, searchAccess, searchActivity} from '../../api/notification/activity.js'
import {
    deadLetterQueues, loadedRules, peekDeadLetters, reprocessDeadLetters, retryDelivery, searchDeliveries, sendBroadcast, sendTestEmail,
    sourcesStatus,
} from '../../api/notification/admin.js'
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

/**
 * La administración del servicio (notificaciones/administracion), con las claves
 * ['notifications', 'admin', …]. Cada pestaña pide lo suyo al abrirse y con su «Actualizar»: nada se
 * sondea. La campana y la bandeja no se releen desde aquí.
 */
export function adminKey(...parts) {
    return notificationKey('admin', ...parts)
}

export function useSourcesStatus() {
    return useQuery({queryKey: adminKey('sources'), queryFn: ({signal}) => sourcesStatus({signal}), staleTime: NOT_FRESH})
}

export function useDeadLetterQueues() {
    return useQuery({queryKey: adminKey('dead-letters'), queryFn: ({signal}) => deadLetterQueues({signal}), staleTime: NOT_FRESH})
}

/**
 * Mirar una cola: una llamada al pulsar, y lo que se ve es lo que llegó en ella. Si falla, el aviso lo
 * da queryClient.js y devuelve null: no se abre nada.
 */
export function usePeekDeadLetters() {
    const queryClient = useQueryClient()
    return async (source) => {
        try {
            return await queryClient.fetchQuery({
                queryKey: adminKey('dead-letter-peek', source),
                queryFn: ({signal}) => peekDeadLetters(source, {}, {signal}),
                staleTime: NOT_FRESH,
                gcTime: 0,
            })
        } catch {
            return null
        }
    }
}

/** Una pasada de reproceso. Si termina bien se releen las colas, que ya no guardan lo mismo; si falla, no. */
export function useReprocessDeadLetters(source) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (max) => reprocessDeadLetters(source, max),
        onSuccess: () => void queryClient.invalidateQueries({queryKey: adminKey('dead-letters')}),
    })
}

export function useDeliveries(params) {
    return useQuery({
        queryKey: adminKey('deliveries', params),
        queryFn: ({signal}) => searchDeliveries(params, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

/** Reintentar una entrega. Salga bien o no, la lista se relee: la entrega ya no está como se pintó. */
export function useRetryDelivery() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (id) => retryDelivery(id),
        onSettled: () => void refreshDeliveries(queryClient),
    })
}

export function useLoadedRules() {
    return useQuery({queryKey: adminKey('rules'), queryFn: ({signal}) => loadedRules({signal}), staleTime: NOT_FRESH})
}

/**
 * El correo de prueba y el aviso general. Los dos dejan entregas: se releen si su pestaña ya se abrió
 * (una consulta que nadie ha montado no se pide). El error lo trata el diálogo, que lo lleva a su campo.
 */
export function useSendTestEmail() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (to) => sendTestEmail(to),
        meta: {notifyError: false},
        onSuccess: () => void refreshDeliveries(queryClient),
    })
}

export function useSendBroadcast() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (request) => sendBroadcast(request),
        meta: {notifyError: false},
        onSuccess: () => void refreshDeliveries(queryClient),
    })
}

function refreshDeliveries(queryClient) {
    return queryClient.invalidateQueries({queryKey: adminKey('deliveries')})
}
