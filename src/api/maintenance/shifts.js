import {idOrNull, numberOrNull, textOrNull, withoutNulls} from '../bodies.js'
import {instantToLocalDateTime, localDateTimeToInstant, toInstantParam, toLocalDateParam} from '../dates.js'
import {apiFetch} from '../http.js'
import {buildMergePatch, MERGE_PATCH} from '../mergePatch.js'
import {sortWithTieBreak, toPage, toPageParams} from '../paging.js'
import {categoriesAtLeast, categoryRank} from '../resources/enums.js'
import {personLabel, unitLabel} from '../resources/values.js'
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
 *   Un aislador o un seccionador que une dos vías está en las dos (`connectedTrackId`): vale un turno
 *   de cualquiera, y la búsqueda admite varias vías (`trackId` repetido) para pedirlos de una vez.
 * - La dotación (jefe, supervisor, linemen), los vehículos y los instrumentos son de mto-resources y
 *   viajan por sus ids; linemen, vehículos e instrumentos son conjuntos, y quitarlos todos viaja a null.
 *   En el alta, lo que no se dice de la dotación y los vehículos lo copia el servicio de un equipo de
 *   mto-resources. Sin resources-read no viajan: no se pueden elegir. Las demás reglas (de 2 a 6
 *   linemen para iniciar, las plazas, el remolque, una persona o un vehículo en otro turno del día, nada
 *   caducado a la fecha del turno, un conductor habilitado distinto por vehículo al iniciar) las dice el
 *   servicio con 409 SHF-001; un instrumento que aún no ha llegado allí por evento es un 404 MSI-404.
 * - Al cerrar, cada vehículo dice dónde se deja (`parkings`): un sitio de mto-resources, una vía y su
 *   kp, o un texto. Solo viaja lo rellenado; sin nada, vale el estacionamiento del turno.
 */

/** El jefe de un turno es cualquiera menos un operario; su supervisor, de supervisor para arriba. */
export const SHIFT_LEADER_CATEGORIES = Object.freeze(categoriesAtLeast(categoryRank('TEAM_LEADER')))
export const SHIFT_SUPERVISOR_CATEGORIES = Object.freeze(categoriesAtLeast(categoryRank('SUPERVISOR')))

/** Sin columna elegida, el más reciente primero. */
export const BY_SHIFT_DATE_DESC = 'shiftDate,desc'

/**
 * Una página de turnos con sus filtros; lo vacío no viaja. La página empieza en 1. `trackId` es una
 * vía o una lista: con varias, los turnos que recorren alguna, cada uno una vez.
 */
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

/**
 * Las vías en las que se trabaja un activo: la suya y, si une dos, la conectada; sin vía propia, la de
 * respaldo (la de su orden). Sin repetir y sin vacíos: es lo que se busca en los turnos.
 */
export function tracksOf(asset, fallbackTrackId = null) {
    const own = asset?.trackId ?? fallbackTrackId
    return [own, asset?.connectedTrackId].filter((track, index, all) => track !== null && track !== undefined && all.indexOf(track) === index)
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

/**
 * Saca del turno una tarea abierta: vuelve a su orden, pendiente y sin turno, como lo no terminado al
 * cerrar. Una terminada o cancelada se queda (409 TRN-001), y un turno cerrado ya no cambia.
 */
export function unassignTaskFromShift(shiftId, taskId) {
    return apiFetch(maintenancePath('shifts', shiftId, 'tasks', taskId, 'unassign'), {method: 'POST'})
}

export function shiftRevisionsPath(id) {
    return maintenancePath('shifts', id, 'revisions')
}

/** Lo que el formulario guarda de un turno leído (o de uno nuevo, con null y la fecha de hoy, como en el backoffice). */
export function shiftFormValues(shift, {today = null} = {}) {
    return {
        shiftDate: shift?.shiftDate ?? today,
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
        teamLeaderPersonId: shift?.teamLeader?.id ?? null,
        supervisorPersonId: shift?.supervisor?.id ?? null,
        linemanPersonIds: (shift?.linemen ?? []).map((person) => person.id),
        vehicleIds: (shift?.vehicles ?? []).map((vehicle) => vehicle.vehicleId),
        instrumentIds: (shift?.instruments ?? []).map((instrument) => instrument.id),
    }
}

/** La dotación, los vehículos y los instrumentos del formulario, por sus ids. */
function crewValues(values) {
    return {
        teamLeaderPersonId: values.teamLeaderPersonId || null,
        supervisorPersonId: values.supervisorPersonId || null,
        linemanPersonIds: values.linemanPersonIds ?? [],
        vehicleIds: values.vehicleIds ?? [],
        instrumentIds: values.instrumentIds ?? [],
    }
}

function nonEmpty(list) {
    return list.length > 0 ? list : null
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

/**
 * El alta: lo vacío no viaja. Sin base ni vehículo, el servicio pone los del equipo, y con un equipo de
 * mto-resources también la dotación y los vehículos que no se digan. Sin resources-read no viajan, ni
 * los instrumentos.
 */
export function shiftRequest(values, {readsResources = false} = {}) {
    const request = requestValues(values)
    const crew = crewValues(values)
    return withoutNulls({
        ...request,
        blockingDisconnectorIds: nonEmpty(request.blockingDisconnectorIds),
        ...(readsResources
            ? {...crew, linemanPersonIds: nonEmpty(crew.linemanPersonIds), vehicleIds: nonEmpty(crew.vehicleIds),
                instrumentIds: nonEmpty(crew.instrumentIds)}
            : {}),
    })
}

const PATCHABLE = Object.freeze(['shiftDate', 'teamId', 'baseName', 'vehicle', 'possessionType', 'plannedStart', 'plannedEnd',
    'blockingDisconnectorIds', 'earthingPoints', 'parkingPlace', 'executionPackageId', 'trackIds', 'startKp', 'endKp', 'personnel',
    'measurementEquipment', 'observations'])
const CREW = Object.freeze(['teamLeaderPersonId', 'supervisorPersonId', 'linemanPersonIds', 'vehicleIds', 'instrumentIds'])

/**
 * Lo que cambió de un turno, lo vaciado y su versión, o null si nada. Vías, seccionadores, linemen,
 * vehículos e instrumentos se comparan como conjunto, y los instantes como instantes: el servicio los
 * devuelve sin milisegundos. Sin resources-read la dotación, los vehículos y los instrumentos no viajan.
 */
export function shiftPatch(original, values, {readsResources = false} = {}) {
    return buildMergePatch({
        ...original,
        teamId: original.team?.id ?? null,
        plannedStart: toInstantParam(original.plannedStart) ?? null,
        plannedEnd: toInstantParam(original.plannedEnd) ?? null,
        blockingDisconnectorIds: (original.blockingDisconnectors ?? []).map((disconnector) => disconnector.id),
        ...crewValues(shiftFormValues(original)),
    }, {...requestValues(values), ...crewValues(values)}, {
        fields: readsResources ? [...PATCHABLE, ...CREW] : PATCHABLE,
        numberFields: ['startKp', 'endKp', 'executionPackageId'],
        setFields: ['blockingDisconnectorIds', 'trackIds', 'linemanPersonIds', 'vehicleIds', 'instrumentIds'],
        version: original.version,
    })
}

/** La dotación, los vehículos y los instrumentos de un turno en una línea, para quien no puede elegirlos. */
export function crewText(shift) {
    const named = (list, label) => (list.length === 0 ? '-' : list.map(label).join(', '))
    return [`Jefe: ${shift?.teamLeader ? personLabel(shift.teamLeader) : '-'}`,
        `Supervisor: ${shift?.supervisor ? personLabel(shift.supervisor) : '-'}`,
        `Linemen: ${named(shift?.linemen ?? [], personLabel)}`,
        `Vehículos: ${named(shift?.vehicles ?? [], unitLabel)}`,
        `Instrumentos: ${named(shift?.instruments ?? [], unitLabel)}`].join(' · ')
}

/** Las filas de dónde se deja cada vehículo del turno al cerrarlo, vacías. */
export function parkingFormValues(vehicles) {
    return (vehicles ?? []).map((vehicle) => ({vehicleId: vehicle.vehicleId, parkingSiteId: null, trackId: null, kp: '', description: ''}))
}

function parkingOf(row) {
    return {
        vehicleId: row.vehicleId,
        parkingSiteId: row.parkingSiteId || null,
        trackId: idOrNull(row.trackId),
        kp: numberOrNull(row.kp),
        description: textOrNull(row.description),
    }
}

function isFilled(parking) {
    return parking.parkingSiteId !== null || parking.trackId !== null || parking.kp !== null || parking.description !== null
}

/**
 * Lo evidente de una fila, antes de llamar: un kp va con su vía, y uno de solo vía no se deja con solo un
 * texto. Devuelve {field, message} o null; lo demás lo dice el servicio (409 SHF-001).
 */
export function parkingRowError(row, mobility) {
    const parking = parkingOf(row)
    if (parking.kp !== null && parking.trackId === null) {
        return {field: 'trackId', message: 'Un KP va con su vía'}
    }
    if (isFilled(parking) && mobility === 'RAIL_ONLY' && parking.parkingSiteId === null && parking.trackId === null) {
        return {field: 'description', message: 'Uno de solo vía se deja sobre una vía: un sitio o una vía'}
    }
    return null
}

/**
 * Lo rellenado de cada fila, sin lo que no se dijo, y la fila de la que viene cada una (para llevar un
 * error del servicio, parkings[0].kp, a su fila); null si no hay nada: vale el estacionamiento del turno.
 */
export function parkingsRequest(rows) {
    const sent = (rows ?? []).map((row, index) => ({index, parking: parkingOf(row)})).filter(({parking}) => isFilled(parking))
    return {
        parkings: sent.length === 0 ? null : sent.map(({parking}) => withoutNulls(parking)),
        rowOf: sent.map(({index}) => index),
    }
}

/** Lo que el diálogo de iniciar o cerrar parte de un turno. */
export function transitionFormValues(shift) {
    return {
        when: null,
        voltageCutoffAt: instantToLocalDateTime(shift.voltageCutoffAt),
        netWorkMinutes: '',
        observations: shift.observations ?? '',
        parkings: parkingFormValues(shift.vehicles),
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
        observations: textOrNull(values.observations), parkings: parkingsRequest(values.parkings).parkings})
}
