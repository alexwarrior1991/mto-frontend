import {defineEnum} from '../enums.js'

/**
 * Los enumerados de mto-resources, tolerantes a lo desconocido (UNKNOWN, «Desconocido», que no se
 * ofrece en los desplegables).
 *
 * El rango de cada categoría está copiado del servicio solo para no ofrecer en un selector lo que va a
 * fallar: el jefe de una unidad tiene una categoría de rango igual o mayor que la que pide su nivel.
 * Quien decide es el servicio (409 UNI-001). Una categoría desconocida tiene rango 0.
 */

export const PERSON_CATEGORY = defineEnum({
    WORKER: 'Operario',
    TEAM_LEADER: 'Jefe de equipo',
    SUPERVISOR: 'Supervisor',
    CHIEF_SUPERVISOR: 'Jefe de supervisores',
    CHIEF_MAINTENANCE: 'Jefe de mantenimiento',
    CHIEF_CONSTRUCTION: 'Jefe de construcción',
    PROJECT_MANAGER: 'Jefe de proyecto',
})

const CATEGORY_RANK = Object.freeze({
    WORKER: 1,
    TEAM_LEADER: 2,
    SUPERVISOR: 3,
    CHIEF_SUPERVISOR: 4,
    CHIEF_MAINTENANCE: 5,
    CHIEF_CONSTRUCTION: 5,
    PROJECT_MANAGER: 6,
})

export function categoryRank(category) {
    return CATEGORY_RANK[category] ?? 0
}

/** Las categorías que llegan a un rango: el jefe de un turno es cualquiera menos un operario (atLeast(2)). */
export function categoriesAtLeast(rank) {
    return PERSON_CATEGORY.values.filter((category) => categoryRank(category) >= rank)
}

export const PERSON_EMPLOYER = defineEnum({
    OWN: 'Propio',
    SUBCONTRACTOR: 'Subcontrata',
})
