import {defineEnum} from '../enums.js'
import {ApiError, emptyProblem} from '../errors.js'
import {apiFetch} from '../http.js'
import {maintenancePath} from './values.js'

/**
 * Las operaciones de fondo de mto-maintenance (el port de OperationClient y TaskGeneration): lo que
 * sigue en el servicio cuando una llamada con Prefer: respond-async no termina en su espera, hoy generar
 * las tareas de un EP grande. El 202 trae la operación; su Location es la ruta interna del servicio y no
 * se sigue: se pregunta por su id (GET /operations/{id}) cada 2 s, como los trabajos de configuración.
 * Al terminar, `result` es el cuerpo de la llamada síncrona, o `error` el error que habría dado.
 */

/** Lo que se le pide al servicio al generar: la respuesta de siempre si termina en 5 s, la operación si no. */
export const GENERATION_PREFER = 'respond-async, wait=5'
export const FOLLOW_INTERVAL_MS = 2000

/** Tolerante: uno nuevo es UNKNOWN, que se da por terminado para no preguntar sin fin. */
export const OPERATION_STATUS = defineEnum({QUEUED: 'En cola', RUNNING: 'En marcha', SUCCEEDED: 'Terminada', FAILED: 'Fallida'})

export function isFinishedOperation(operation) {
    const status = OPERATION_STATUS.parse(operation?.status)
    return status !== 'QUEUED' && status !== 'RUNNING'
}

export function getOperation(id, {signal} = {}) {
    return apiFetch(maintenancePath('operations', id), {signal})
}

/**
 * El error de una operación fallida como el que habría dado la llamada síncrona, para decirlo con la
 * tabla de siempre; una abandonada (su instancia dejó de latir) es OPS-410, con estado 500.
 */
export function operationError(operation) {
    const status = operation?.error?.status ?? 500
    return ApiError.of(status, {
        problem: {...emptyProblem(), status, code: operation?.error?.errorCode ?? null, detail: operation?.error?.message ?? null},
        operation: `GET ${maintenancePath('operations', operation?.id ?? '')}`,
    })
}
