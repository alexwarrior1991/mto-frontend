/**
 * Las rutas del módulo de recursos, las mismas que el backoffice (ResourcesRoutes). Los segmentos
 * literales de la flota (tablero, modelos, aparcamientos) ganan a :vehicleId. Un id va codificado en
 * la ruta. mto-notification enlaza a la ficha de una persona y a la de un vehículo (una caducidad que
 * se acerca) y a los instrumentos (una calibración).
 */

export const PEOPLE_PATH = '/recursos/personal'
export const ORGANIZATION_PATH = '/recursos/organigrama'
export const FLEET_PATH = '/recursos/flota'
export const BOARD_PATH = '/recursos/flota/tablero'
export const VEHICLE_TYPES_PATH = '/recursos/flota/modelos'
export const PARKING_SITES_PATH = '/recursos/flota/aparcamientos'
export const QUALIFICATION_TYPES_PATH = '/recursos/cualificaciones'
export const INSTRUMENTS_PATH = '/recursos/instrumentos'

export function personPath(id) {
    return `${PEOPLE_PATH}/${encodeURIComponent(id)}`
}

export function unitPath(id) {
    return `${ORGANIZATION_PATH}/${encodeURIComponent(id)}`
}

export function vehiclePath(id) {
    return `${FLEET_PATH}/${encodeURIComponent(id)}`
}
