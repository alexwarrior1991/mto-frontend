/**
 * Las fichas que un módulo enlaza desde otro, fuera de los dos: recursos enlaza el turno que dejó una
 * ubicación, y mantenimiento las usa como suyas (maintenanceRoutes.js las reexporta). Las rutas son las
 * del backoffice. Un id va codificado en la ruta.
 */

export const SHIFTS_PATH = '/mantenimiento/turnos'

export function shiftPath(id) {
    return `${SHIFTS_PATH}/${encodeURIComponent(id)}`
}
