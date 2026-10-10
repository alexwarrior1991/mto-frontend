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
