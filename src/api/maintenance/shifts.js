import {idOrNull, numberOrNull, textOrNull, withoutNulls} from '../bodies.js'
import {instantToLocalDateTime, localDateTimeToInstant, toInstantParam, toLocalDateParam} from '../dates.js'
import {apiFetch} from '../http.js'
import {buildMergePatch, MERGE_PATCH} from '../mergePatch.js'
import {sortWithTieBreak, toPage, toPageParams} from '../paging.js'
import {maintenancePath} from './values.js'

/**
 * Los turnos nocturnos: el port de ShiftClient y de ShiftForm y ShiftTransitionDialog del backoffice.
 *
 * - Un turno va PLANNED → IN_PROGRESS → CLOSED, o CANCELLED mientras no esté cerrado. Planificado o en
 *   curso se modifica, admite tareas y se cancela; lo demás es un 409 TRN-001.
 * - Fecha, posesión y al menos una vía son obligatorias, y no se vacían. Las vías (ids de
 *   mto-configuration) y los seccionadores que se abren son conjuntos: si cambian, van enteros, y sin
 *   seccionadores viaja null, que en un merge-patch es «ninguno abierto».
 * - Iniciar y cerrar llevan lo que se escribió; lo vacío lo pone el servicio (ahora, y los minutos
 *   netos desde el corte de tensión o el inicio). Al cerrar, las tareas sin terminar vuelven a su
 *   orden sin cancelarse.
 * - Una tarea solo se trabaja en un turno en curso que recorra su vía, con una posesión compatible
 *   (409 SHF-001 si no): asignar es una llamada por tarea, para que el servicio compruebe cada una.
 */

/** Sin columna elegida, el más reciente primero. */
export const BY_SHIFT_DATE_DESC = 'shiftDate,desc'

/** Una página de turnos con sus filtros; lo vacío no viaja. La página empieza en 1. */
export async function searchShifts({
    dateFrom = null, dateTo = null, teamId = null, trackId = null, executionPackageId = null, status = null, possessionType = null,
    page = 1, size = 50, sort = null,
} = {}, {signal} = {}) {
    const body = await apiFetch(maintenancePath('shifts'), {
        query: {
            dateFrom: toLocalDateParam(dateFrom), dateTo: toLocalDateParam(dateTo), teamId, trackId, executionPackageId, status, possessionType,
            ...toPageParams({page, size}), sort: sortWithTieBreak(sort, BY_SHIFT_DATE_DESC),
        },
        signal,
    })
    return toPage(body)
}

/** Los turnos en curso de una vía: donde se puede trabajar una tarea de esa vía. */
export function inProgressShiftsOn(trackId, {signal} = {}) {
    return searchShifts({trackId, status: 'IN_PROGRESS', size: 50}, {signal})
}

export function getShift(id, {signal} = {}) {
    return apiFetch(maintenancePath('shifts', id), {signal})
}

/** 201 con el turno, planificado. */
export function createShift(body) {
    return apiFetch(maintenancePath('shifts'), {method: 'POST', json: body})
}

export function patchShift(id, patch) {
    return apiFetch(maintenancePath('shifts', id), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/** Iniciar o cerrar, con su cuerpo. */
export function transitionShift(id, transition, body) {
    if (transition !== 'start' && transition !== 'close') {
        throw new Error(`Transicion de turno desconocida: ${transition}`)
    }
    return apiFetch(maintenancePath('shifts', id, transition), {method: 'POST', json: body})
}

export function cancelShift(id, reason) {
    return apiFetch(maintenancePath('shifts', id, 'cancel'), {method: 'POST', json: {reason}})
}

/** Las tareas asignadas al turno, de todas sus órdenes; con status, solo las de ese estado. */
export function listShiftTasks(id, {status = null, signal} = {}) {
    return apiFetch(maintenancePath('shifts', id, 'tasks'), {query: {status}, signal})
}

/** Los perfiles de las tareas del turno, en el orden físico de la vía. */
export function listShiftProfiles(id, {status = null, signal} = {}) {
    return apiFetch(maintenancePath('shifts', id, 'profiles'), {query: {status}, signal})
}

/** Asigna una tarea pendiente al turno; el servicio comprueba vía y posesión (409 SHF-001). */
export function assignTaskToShift(shiftId, taskId) {
    return apiFetch(maintenancePath('shifts', shiftId, 'tasks', taskId), {method: 'POST'})
}

export function shiftRevisionsPath(id) {
    return maintenancePath('shifts', id, 'revisions')
}

/** Lo que el formulario guarda de un turno leído (o de uno nuevo, con null). */
export function shiftFormValues(shift) {
    return {
        shiftDate: shift?.shiftDate ?? null,
        possessionType: shift?.possessionType ?? 'PARTIAL',
        trackIds: (shift?.trackIds ?? []).map(String),
        teamId: shift?.team?.id ?? null,
        executionPackageId: shift?.executionPackageId === null || shift?.executionPackageId === undefined ? null : String(shift.executionPackageId),
        startKp: shift?.startKp === null || shift?.startKp === undefined ? '' : String(shift.startKp),
        endKp: shift?.endKp === null || shift?.endKp === undefined ? '' : String(shift.endKp),
        plannedStart: instantToLocalDateTime(shift?.plannedStart),
        plannedEnd: instantToLocalDateTime(shift?.plannedEnd),
        blockingDisconnectorIds: (shift?.blockingDisconnectors ?? []).map((disconnector) => disconnector.id),
        baseName: shift?.baseName ?? '',
        vehicle: shift?.vehicle ?? '',
        earthingPoints: shift?.earthingPoints ?? '',
        parkingPlace: shift?.parkingPlace ?? '',
        measurementEquipment: shift?.measurementEquipment ?? '',
        personnel: shift?.personnel ?? '',
        observations: shift?.observations ?? '',
    }
}

/** Del formulario a los tipos de la petición: ids como número, fechas y horas como Instant. */
function requestValues(values) {
    return {
        shiftDate: toLocalDateParam(values.shiftDate) ?? null,
        teamId: values.teamId || null,
        baseName: textOrNull(values.baseName),
        vehicle: textOrNull(values.vehicle),
        possessionType: values.possessionType ?? null,
        plannedStart: localDateTimeToInstant(values.plannedStart) ?? null,
        plannedEnd: localDateTimeToInstant(values.plannedEnd) ?? null,
        blockingDisconnectorIds: values.blockingDisconnectorIds ?? [],
        earthingPoints: textOrNull(values.earthingPoints),
        parkingPlace: textOrNull(values.parkingPlace),
        executionPackageId: idOrNull(values.executionPackageId),
        trackIds: (values.trackIds ?? []).map(Number).sort((left, right) => left - right),
        startKp: numberOrNull(values.startKp),
        endKp: numberOrNull(values.endKp),
        personnel: textOrNull(values.personnel),
        measurementEquipment: textOrNull(values.measurementEquipment),
        observations: textOrNull(values.observations),
    }
}

/** El alta: lo vacío no viaja. Sin base ni vehículo, el servicio pone los del equipo. */
export function shiftRequest(values) {
    const request = requestValues(values)
    return withoutNulls({...request, blockingDisconnectorIds: request.blockingDisconnectorIds.length > 0 ? request.blockingDisconnectorIds : null})
}

const PATCHABLE = Object.freeze(['shiftDate', 'teamId', 'baseName', 'vehicle', 'possessionType', 'plannedStart', 'plannedEnd',
    'blockingDisconnectorIds', 'earthingPoints', 'parkingPlace', 'executionPackageId', 'trackIds', 'startKp', 'endKp', 'personnel',
    'measurementEquipment', 'observations'])

/**
 * Lo que cambió de un turno, lo vaciado y su versión, o null si nada. Vías y seccionadores se comparan
 * como conjunto, y los instantes como instantes: el servicio los devuelve sin milisegundos.
 */
export function shiftPatch(original, values) {
    return buildMergePatch({
        ...original,
        teamId: original.team?.id ?? null,
        plannedStart: toInstantParam(original.plannedStart) ?? null,
        plannedEnd: toInstantParam(original.plannedEnd) ?? null,
        blockingDisconnectorIds: (original.blockingDisconnectors ?? []).map((disconnector) => disconnector.id),
    }, requestValues(values), {
        fields: PATCHABLE,
        numberFields: ['startKp', 'endKp', 'executionPackageId'],
        setFields: ['blockingDisconnectorIds', 'trackIds'],
        version: original.version,
    })
}

/** Lo que el diálogo de iniciar o cerrar parte de un turno. */
export function transitionFormValues(shift) {
    return {
        when: null,
        voltageCutoffAt: instantToLocalDateTime(shift.voltageCutoffAt),
        netWorkMinutes: '',
        observations: shift.observations ?? '',
    }
}

/**
 * El cuerpo de iniciar o cerrar: lo vacío no viaja y lo pone el servicio. Al cerrar, además, los
 * minutos netos y las observaciones.
 *
 * @param {'start'|'close'} transition
 */
export function shiftTransitionRequest(transition, values) {
    const when = localDateTimeToInstant(values.when) ?? null
    const voltageCutoffAt = localDateTimeToInstant(values.voltageCutoffAt) ?? null
    if (transition === 'start') {
        return withoutNulls({actualStart: when, voltageCutoffAt})
    }
    return withoutNulls({actualEnd: when, voltageCutoffAt, netWorkMinutes: numberOrNull(values.netWorkMinutes),
        observations: textOrNull(values.observations)})
}
