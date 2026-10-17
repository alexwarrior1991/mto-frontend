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

/** Por dónde se mueve un modelo de vehículo: es lo que deciden las reglas de la flota. */
export const VEHICLE_MOBILITY = defineEnum({
    RAIL_ONLY: 'Solo vía',
    ROAD_RAIL: 'Bivial',
    ROAD_ONLY: 'Solo carretera',
})

/** Si va por la vía: uno de solo vía o una bivial. */
export function runsOnTrack(mobility) {
    return mobility === 'RAIL_ONLY' || mobility === 'ROAD_RAIL'
}

/** Si va por carretera: uno de solo carretera o una bivial. */
export function runsOnRoad(mobility) {
    return mobility === 'ROAD_ONLY' || mobility === 'ROAD_RAIL'
}

/**
 * Qué es un modelo de vehículo. Cada categoría es de una sola movilidad, copiada del servicio solo para
 * no ofrecer en el editor lo que va a fallar (400).
 */
export const VEHICLE_CATEGORY = defineEnum({
    CATENARY_TOWER_CAR: 'Dresina de catenaria',
    WIRING_TRAIN: 'Tren de tendido',
    TRACK_MAINTENANCE_CAR: 'Dresina de vía',
    INSPECTION_CAR: 'Vehículo de auscultación',
    LOCOMOTIVE: 'Locomotora',
    RAIL_WAGON: 'Vagón o plataforma',
    TROLLEY: 'Vagoneta',
    ROAD_RAIL_MEWP: 'Plataforma elevadora bivial',
    ROAD_RAIL_TRUCK: 'Camión bivial',
    ROAD_RAIL_EXCAVATOR: 'Excavadora bivial',
    ROAD_RAIL_TRACTOR: 'Tractor bivial',
    ROAD_RAIL_TRAILER: 'Remolque bivial',
    VAN: 'Furgoneta',
    PICKUP: 'Pick-up',
    CREW_BUS: 'Autobús de personal',
    CRANE_TRUCK: 'Camión grúa',
    TRUCK: 'Camión',
    LOW_LOADER: 'Góndola',
    CAR: 'Turismo',
})

const CATEGORY_MOBILITY = Object.freeze({
    CATENARY_TOWER_CAR: 'RAIL_ONLY', WIRING_TRAIN: 'RAIL_ONLY', TRACK_MAINTENANCE_CAR: 'RAIL_ONLY', INSPECTION_CAR: 'RAIL_ONLY',
    LOCOMOTIVE: 'RAIL_ONLY', RAIL_WAGON: 'RAIL_ONLY', TROLLEY: 'RAIL_ONLY', ROAD_RAIL_MEWP: 'ROAD_RAIL', ROAD_RAIL_TRUCK: 'ROAD_RAIL',
    ROAD_RAIL_EXCAVATOR: 'ROAD_RAIL', ROAD_RAIL_TRACTOR: 'ROAD_RAIL', ROAD_RAIL_TRAILER: 'ROAD_RAIL', VAN: 'ROAD_ONLY', PICKUP: 'ROAD_ONLY',
    CREW_BUS: 'ROAD_ONLY', CRANE_TRUCK: 'ROAD_ONLY', TRUCK: 'ROAD_ONLY', LOW_LOADER: 'ROAD_ONLY', CAR: 'ROAD_ONLY',
})

/** Las categorías de una movilidad, para el desplegable del editor; sin movilidad, todas. */
export function categoriesOf(mobility) {
    return VEHICLE_CATEGORY.selectable().filter((option) => !mobility || CATEGORY_MOBILITY[option.value] === mobility)
}

export const VEHICLE_POWER = defineEnum({
    DIESEL: 'Diésel',
    ELECTRIC: 'Eléctrico',
    BATTERY: 'Batería',
    HYBRID: 'Híbrido',
    MANUAL: 'Manual',
})

/** El equipo ferroviario de una bivial (EN 15746). Solo lo lleva una bivial, y siempre. */
export const RAIL_GEAR_TYPE = defineEnum({
    RAIL_WHEEL_DRIVE: '9A · tracción en la rueda ferroviaria',
    FRICTION_DRIVE: '9B · tracción por fricción del neumático',
    ROAD_WHEEL_DRIVE: '9C · neumático sobre el carril',
})

export const DRIVING_LICENCE = defineEnum({B: 'B', C: 'C', C_E: 'C+E'})

/**
 * Lo que sabe hacer un modelo. Las capacidades viajan como texto y no pasan por defineEnum: el conjunto
 * viaja entero al modificarlo, y una que el servicio estrene tiene que volver tal cual. Una desconocida
 * se pinta con su código.
 */
export const VEHICLE_CAPABILITIES = Object.freeze({
    CRANE: 'Grúa',
    ELEVATING_PLATFORM: 'Plataforma elevadora',
    INSULATED_PLATFORM: 'Plataforma aislada',
    ROTATING_PLATFORM: 'Plataforma giratoria',
    PANTOGRAPH: 'Pantógrafo',
    CONTACT_WIRE_HOLDER: 'Soporte del hilo de contacto',
    WIRE_DRUM: 'Bobina de hilo',
    OCS_MEASURING: 'Medición de catenaria',
    TRACK_MEASURING: 'Medición de vía',
    EARTHING: 'Puesta a tierra',
    TOWING: 'Remolca',
    CREW_CABIN: 'Cabina de personal',
    WORKSHOP: 'Taller',
})

export function capabilityLabel(code) {
    return VEHICLE_CAPABILITIES[code] ?? code
}

export const PARKING_SITE_KIND = defineEnum({
    SIDING: 'Apartadero',
    STATION_TRACK: 'Vía de estación',
    DEPOT: 'Cochera',
    WORKSHOP: 'Taller',
    ROAD_PARKING: 'Aparcamiento de carretera',
    ACCESS_AREA: 'Zona de acceso',
})

export const VEHICLE_OWNER = defineEnum({OWN: 'Propio', LEASED: 'Alquilado', SUBCONTRACTOR: 'Subcontrata'})

/** Cómo está un vehículo; uno que no está operativo dice por qué. Disponible es activo y operativo o limitado. */
export const VEHICLE_STATUS = defineEnum({
    OPERATIONAL: 'Operativo',
    LIMITED: 'Limitado',
    UNDER_REPAIR: 'En reparación',
    OUT_OF_SERVICE: 'Fuera de servicio',
})

/**
 * Dónde está un vehículo. UNKNOWN es aquí un valor del servicio («no se sabe dónde está», lo que deja un
 * turno sin aparcamiento), además de lo que se lee de un valor que la aplicación no conoce.
 */
export const LOCATION_KIND = defineEnum({
    PARKED: 'Aparcado',
    ON_TRACK: 'En vía',
    ON_ROAD: 'Por carretera',
    IN_WORKSHOP: 'En taller',
    ATTACHED: 'Con otro vehículo',
    UNKNOWN: 'Desconocida',
})

/**
 * Lo que se puede registrar de un vehículo de esta movilidad, copiado de FleetRules solo para no
 * ofrecer lo que va a fallar (409 VEH-001): uno de solo vía nunca va por carretera, uno de solo
 * carretera nunca está en la vía.
 */
export function recordableKinds(mobility) {
    switch (mobility) {
        case 'RAIL_ONLY':
            return ['PARKED', 'ON_TRACK', 'IN_WORKSHOP', 'ATTACHED', 'UNKNOWN']
        case 'ROAD_ONLY':
            return ['PARKED', 'ON_ROAD', 'IN_WORKSHOP', 'ATTACHED', 'UNKNOWN']
        case 'ROAD_RAIL':
            return ['PARKED', 'ON_TRACK', 'ON_ROAD', 'IN_WORKSHOP', 'ATTACHED', 'UNKNOWN']
        default:
            return ['UNKNOWN']
    }
}

export const VEHICLE_ATTACHMENT = defineEnum({TOWED: 'Remolcado', CARRIED: 'Transportado'})

export const LOCATION_SOURCE = defineEnum({MANUAL: 'A mano', SHIFT: 'Turno', FIELD: 'Campo', TELEMATICS: 'Telemática'})

/**
 * La clase de un tipo de cualificación. Un permiso de conducir dice cuál (B, C o C+E), y solo él: lo
 * exige el servicio (400 VAL-001), y el editor solo lo ofrece con esa clase.
 */
export const QUALIFICATION_KIND = defineEnum({
    DRIVING_LICENCE: 'Permiso de conducir',
    VEHICLE_OPERATION: 'Habilitación de vehículo',
    SAFETY: 'Seguridad',
    OTHER: 'Otra',
})

/** Un documento de un vehículo con su caducidad: uno de cada tipo por vehículo (409 VDO-409). */
export const VEHICLE_DOCUMENT_KIND = defineEnum({
    ROAD_INSPECTION: 'Inspección técnica (ITV)',
    RAIL_INSPECTION: 'Inspección ferroviaria',
    INSURANCE: 'Seguro',
    CRANE_CERTIFICATE: 'Certificado de la grúa',
    PLATFORM_CERTIFICATE: 'Certificado de la plataforma',
    OTHER: 'Otro',
})

/** Un instrumento del turno: pértigas de puesta a tierra, detectores de tensión y equipos de medida. */
export const INSTRUMENT_KIND = defineEnum({
    EARTHING_POLE: 'Pértiga de puesta a tierra',
    VOLTAGE_DETECTOR: 'Detector de tensión',
    MEASURING: 'Equipo de medida',
    OTHER: 'Otro',
})
