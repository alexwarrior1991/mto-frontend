import {downloadFile} from '../download.js'
import {apiFetch} from '../http.js'
import {maintenancePath} from './values.js'

/**
 * Los informes de mto-maintenance: el port de ReportClient del backoffice. Cada informe se pide por su
 * ruta en JSON, que es lo que se pinta, o con format=xlsx|pdf como fichero, que se descarga con el
 * token de la persona (api/download.js). Las cifras son del servicio: aquí no se suma nada.
 */

/** El parte diario de un turno: su cabecera, los recuentos y una fila por tarea trabajada. */
export function getShiftReport(shiftId, {signal} = {}) {
    return apiFetch(maintenancePath('shifts', shiftId, 'report'), {signal})
}

/** El parte como fichero; el nombre lo propone el servicio (shift-report-<fecha>-<código>). */
export function downloadShiftReport(shiftId, format, {fallbackName = `parte.${format}`} = {}) {
    return downloadFile(maintenancePath('shifts', shiftId, 'report'), {query: {format}, fallbackName})
}
