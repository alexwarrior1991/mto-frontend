/**
 * Las rutas del módulo de mantenimiento, las mismas que el backoffice (MaintenanceRoutes):
 * mto-notification enlaza a la ficha de una orden (/mantenimiento/ordenes/{id}) y el correo la hace
 * absoluta. Un id va codificado en la ruta. La de un turno vive en ../links.js, porque recursos la enlaza
 * también, y se reexporta aquí.
 */

export {SHIFTS_PATH, shiftPath} from '../links.js'

export const ORDERS_PATH = '/mantenimiento'
export const ASSETS_PATH = '/mantenimiento/activos'
export const INSPECTIONS_PATH = '/mantenimiento/inspecciones'
export const DEFECTS_PATH = '/mantenimiento/defectos'
export const REPORTS_PATH = '/mantenimiento/informes'

export function orderPath(id) {
    return `/mantenimiento/ordenes/${encodeURIComponent(id)}`
}

export function inspectionPath(id) {
    return `${INSPECTIONS_PATH}/${encodeURIComponent(id)}`
}

export function defectPath(id) {
    return `${DEFECTS_PATH}/${encodeURIComponent(id)}`
}
