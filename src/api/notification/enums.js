import {defineEnum} from '../enums.js'

/**
 * Los enumerados de mto-notification, tolerantes a lo desconocido (UNKNOWN, «Desconocido», que no se
 * ofrece en los desplegables): una categoría, una gravedad, una clase de actor o un resultado nuevos
 * en el servicio se pintan como desconocidos en vez de romper la pantalla.
 */

/**
 * Las categorías del registro y de las notificaciones que salen de él. ACCESS es distinta: los
 * accesos tienen su pantalla y su permiso, y el registro general la rechaza como filtro (400).
 */
export const ACTIVITY_CATEGORY = defineEnum({
    ACCESS: 'Accesos',
    USERS: 'Usuarios',
    CONFIGURATION: 'Configuración',
    MAINTENANCE: 'Mantenimiento',
    STOCK: 'Almacén',
    FIELD: 'Campo',
    RESOURCES: 'Recursos',
    SYSTEM: 'Sistema',
})

/** La gravedad de una línea del registro o de una notificación. */
export const ACTIVITY_SEVERITY = defineEnum({
    INFO: 'Información',
    WARNING: 'Aviso',
    CRITICAL: 'Crítica',
})

/** Quién está detrás de un evento: una persona, la cuenta de servicio de otro servicio o nadie en concreto. */
export const ACTOR_KIND = defineEnum({
    PERSON: 'Persona',
    SERVICE: 'Servicio',
    SYSTEM: 'Sistema',
})

/**
 * Cómo acabó un acceso: FAILURE son los logins fallidos, las rachas, los bloqueos y los logouts
 * fallidos; SUCCESS, el resto. Viaja como filtro y vuelve en cada línea.
 */
export const ACCESS_OUTCOME = defineEnum({
    SUCCESS: 'Correcto',
    FAILURE: 'Fallido',
})

/** Lo que admite el filtro del registro: todas las categorías menos los accesos, que van por su pantalla. */
export function activityCategories() {
    return ACTIVITY_CATEGORY.selectable().filter((option) => option.value !== 'ACCESS')
}

/**
 * Los de la administración del servicio (/admin/**). Un estado nuevo se pinta «Desconocido» y no abre
 * nada: una entrega en un estado que esta versión no conoce no ofrece reintentar.
 */

/** Cómo está una entrega por un canal que empuja (hoy, el correo). */
export const DELIVERY_STATUS = defineEnum({
    PENDING: 'Pendiente',
    IN_PROGRESS: 'En curso',
    SENT: 'Enviada',
    FAILED: 'Fallida',
    SKIPPED: 'Omitida',
})

/** A qué va una entrega: a una audiencia que aún se expande o a un destinatario ya resuelto. */
export const DELIVERY_SCOPE = defineEnum({
    AUDIENCE: 'Audiencia',
    RECIPIENT: 'Destinatario',
})

/** Cómo está un mensaje de una fuente en el inbox del servicio. */
export const INBOX_MESSAGE_STATUS = defineEnum({
    RECEIVED: 'Recibido',
    PROCESSING: 'En proceso',
    PROCESSED: 'Procesado',
    FAILED: 'Fallido',
})

/** Los dos lectores de Keycloak: los accesos y los eventos de administración. */
export const SOURCE_CURSOR_KIND = defineEnum({
    KEYCLOAK_LOGIN: 'Accesos de Keycloak',
    KEYCLOAK_ADMIN: 'Administración de Keycloak',
})

/** Qué fue de un mensaje muerto al reprocesarlo. */
export const REPROCESS_OUTCOME = defineEnum({
    PROCESSED: 'Procesado',
    DUPLICATE: 'Duplicado',
    FAILED: 'Fallido',
})

/** Por qué paró una pasada de reproceso; las etiquetas van detrás de «paró porque …». */
export const REPROCESS_STOP = defineEnum({
    EMPTY: 'la cola se quedó sin mensajes',
    MAX: 'se alcanzó el máximo pedido',
    TIME_BUDGET: 'se agotó el tiempo de la pasada (10 s)',
})
