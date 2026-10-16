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

/**
 * El nivel de una unidad del organigrama, del proyecto al equipo. Las reglas de abajo están copiadas
 * de OrganizationRules de mto-resources solo para no ofrecer lo que va a fallar: un padre de un nivel
 * estrictamente superior (un proyecto no cuelga de nada) y un jefe de la categoría del nivel. Quien
 * decide es el servicio (409 UNI-001). Un nivel desconocido no ofrece nada.
 */
export const UNIT_KIND = defineEnum({
    PROJECT: 'Proyecto',
    DEPARTMENT: 'Departamento',
    CHIEF_SUPERVISION: 'Jefatura de supervisores',
    SUPERVISION: 'Supervisión',
    TEAM: 'Equipo',
})

const UNIT_LEVEL = Object.freeze({PROJECT: 5, DEPARTMENT: 4, CHIEF_SUPERVISION: 3, SUPERVISION: 2, TEAM: 1})

export function unitLevel(kind) {
    return UNIT_LEVEL[kind] ?? 0
}

/** Si una unidad de este nivel puede colgar de una de parentKind: de un nivel estrictamente superior. */
export function canHangFrom(kind, parentKind) {
    return kind !== 'PROJECT' && unitLevel(kind) > 0 && unitLevel(parentKind) > unitLevel(kind)
}

/**
 * Las categorías de quien puede dirigir una unidad de este nivel: un equipo, un jefe de equipo o más;
 * una supervisión, un supervisor o más. Un departamento lo dirige el jefe de su disciplina o el de
 * proyecto, nunca el de la otra.
 */
export function headCategories(kind, discipline) {
    switch (kind) {
        case 'PROJECT':
            return ['PROJECT_MANAGER']
        case 'DEPARTMENT':
            return discipline === 'CONSTRUCTION' ? ['CHIEF_CONSTRUCTION', 'PROJECT_MANAGER'] : ['CHIEF_MAINTENANCE', 'PROJECT_MANAGER']
        case 'CHIEF_SUPERVISION':
            return categoriesAtLeast(categoryRank('CHIEF_SUPERVISOR'))
        case 'SUPERVISION':
            return categoriesAtLeast(categoryRank('SUPERVISOR'))
        case 'TEAM':
            return categoriesAtLeast(categoryRank('TEAM_LEADER'))
        default:
            return []
    }
}

/** Un lineman es un operario o un jefe de equipo que va de lineman con otro. */
export const LINEMAN_CATEGORIES = Object.freeze(['WORKER', 'TEAM_LEADER'])

/** La regla de un equipo: un jefe, siempre, y de 2 a 6 linemen. */
export const MIN_LINEMEN = 2
export const MAX_LINEMEN = 6

export const WORK_DISCIPLINE = defineEnum({
    MAINTENANCE: 'Mantenimiento',
    CONSTRUCTION: 'Construcción',
})
