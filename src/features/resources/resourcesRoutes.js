/**
 * Las rutas del módulo de recursos, las mismas que el backoffice (ResourcesRoutes). Los segmentos
 * literales de la flota (tablero, modelos, aparcamientos) ganan a :vehicleId. Un id va codificado en
 * la ruta.
 */

export const PEOPLE_PATH = '/recursos/personal'
export const ORGANIZATION_PATH = '/recursos/organigrama'
export const FLEET_PATH = '/recursos/flota'
export const BOARD_PATH = '/recursos/flota/tablero'
export const VEHICLE_TYPES_PATH = '/recursos/flota/modelos'
export const PARKING_SITES_PATH = '/recursos/flota/aparcamientos'

export function unitPath(id) {
    return `${ORGANIZATION_PATH}/${encodeURIComponent(id)}`
}

export function vehiclePath(id) {
    return `${FLEET_PATH}/${encodeURIComponent(id)}`
}
