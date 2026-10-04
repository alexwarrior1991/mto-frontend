import {endOfDayInstant, startOfDayInstant, toYearMonthParam} from '../dates.js'
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

/**
 * Lo que viaja de una consulta del avance: paquete, vía y tipo de activo, y las fechas como el
 * comienzo del primer día y el último instante del último, en la zona del navegador.
 */
function progressQuery({executionPackageId = null, trackId = null, assetType = null, from = null, to = null} = {}) {
    return {executionPackageId, trackId, assetType, from: from ? startOfDayInstant(from) : null, to: to ? endOfDayInstant(to) : null}
}

/** El avance del preventivo: activos revisados y km cubiertos, en total y por paquete, vía y tipo. */
export function getProgressReport(query, {signal} = {}) {
    return apiFetch(maintenancePath('reports', 'progress'), {query: progressQuery(query), signal})
}

export function downloadProgressReport(query, format) {
    return downloadFile(maintenancePath('reports', 'progress'), {query: {...progressQuery(query), format}, fallbackName: `avance.${format}`})
}

/** El resumen de un mes (YYYY-MM, obligatorio: sin él el servicio responde 400), de un paquete o de todos. */
export function getMonthlyReport({month, executionPackageId = null}, {signal} = {}) {
    return apiFetch(maintenancePath('reports', 'monthly'), {query: {month: toYearMonthParam(month), executionPackageId}, signal})
}

export function downloadMonthlyReport({month, executionPackageId = null}, format) {
    const yearMonth = toYearMonthParam(month)
    return downloadFile(maintenancePath('reports', 'monthly'), {query: {month: yearMonth, executionPackageId, format},
        fallbackName: `mensual-${yearMonth}.${format}`})
}
