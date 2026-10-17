import {idOrNull, numberOrNull, textOrNull, withoutNulls} from '../bodies.js'
import {localDateTimeToInstant, startOfDayInstant, startOfNextDayInstant, toLocalDateParam} from '../dates.js'
import {apiFetch} from '../http.js'
import {buildMergePatch, MERGE_PATCH} from '../mergePatch.js'
import {sortWithTieBreak, toPage, toPageParams} from '../paging.js'
import {resourcesPath} from './values.js'

/**
 * Los vehículos de la flota de mto-resources y dónde está cada uno: el port de VehicleClient, VehicleForm
 * y VehicleLocationDialog del backoffice.
 *
 * - Un vehículo (resources-fleet-write) exige lo que pide su modelo: matrícula si va por carretera (y
 *   ninguna en uno de solo vía), número ferroviario si su modelo va por vía abierta (y ninguno en uno de
 *   solo carretera), la empresa si no es propio y el motivo si no está operativo. No se borra: DELETE lo
 *   retira (resources-delete; 409 VEH-001 mientras sea el vehículo por defecto de un equipo).
 * - Sus ubicaciones son solo de añadir (resources-location-write para registrar una a mano); el
 *   historial, la más reciente primero, sin sort.
 * - El tablero: los vehículos activos con posición conocida, por vía y kp, con el vehículo para
 *   desempatar.
 * - Sus documentos con caducidad (ITV, inspección ferroviaria, seguro, certificados de la grúa y de la
 *   plataforma): uno de cada tipo (409 VDO-409; renovarlo es cambiar su caducidad), siempre con su
 *   caducidad, que no se vacía. Escribir pide resources-fleet-write y quitar (un borrado físico que el
 *   historial guarda), resources-delete. Uno caducado deja el vehículo fuera de los turnos (409 SHF-001
 *   de mto-maintenance).
 */

export const BY_CODE = Object.freeze(['code,asc'])
export const BY_TRACK_AND_KP = Object.freeze(['trackId,asc', 'kp,asc'])
export const LOCATIONS_PAGE_SIZE = 20

/** El prefijo con el que un turno de mto-maintenance firma la ubicación que deja. */
export const SHIFT_REFERENCE = 'mto-maintenance:shift:'

export async function searchVehicles({search = '', typeId = null, mobility = null, category = null, status = null, available = null, active = null,
    page = 1, size = 50, sort = null} = {}, {signal} = {}) {
    const body = await apiFetch(resourcesPath('vehicles'), {
        query: {search: textOrNull(search), typeId, mobility, category, status, available, active, ...toPageParams({page, size}),
            sort: sortWithTieBreak(sort, BY_CODE)},
        signal,
    })
    return toPage(body)
}

export function getVehicle(id, {signal} = {}) {
    return apiFetch(resourcesPath('vehicles', id), {signal})
}

/** 201; 409 VEH-409 si el código, la matrícula o el número ferroviario ya los tiene otro. */
export function createVehicle(body) {
    return apiFetch(resourcesPath('vehicles'), {method: 'POST', json: body})
}

export function patchVehicle(id, patch) {
    return apiFetch(resourcesPath('vehicles', id), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/** Retira: 204. */
export function retireVehicle(id) {
    return apiFetch(resourcesPath('vehicles', id), {method: 'DELETE', responseType: 'none'})
}

export function reactivateVehicle(vehicle) {
    return patchVehicle(vehicle.id, {active: true, version: vehicle.version})
}

export function vehicleRevisionsPath(id) {
    return resourcesPath('vehicles', id, 'revisions')
}

export function isActiveVehicle(vehicle) {
    return vehicle?.active === true
}

/** Si el modelo va por carretera: lleva matrícula. Sin modelo todavía, se ofrece. */
export function hasPlate(type) {
    return !type || type.mobility !== 'RAIL_ONLY'
}

/** Si el modelo va por vía: puede llevar número de vehículo ferroviario. */
export function hasRailNumber(type) {
    return !type || type.mobility !== 'ROAD_ONLY'
}

function vehicleValues(values, type) {
    const owner = values.owner ?? 'OWN'
    const status = values.operationalStatus ?? 'OPERATIONAL'
    return {
        name: textOrNull(values.name),
        typeId: values.typeId ?? null,
        registrationPlate: hasPlate(type) ? textOrNull(values.registrationPlate) : null,
        railVehicleNumber: hasRailNumber(type) ? textOrNull(values.railVehicleNumber) : null,
        serialNumber: textOrNull(values.serialNumber),
        manufactureYear: numberOrNull(values.manufactureYear),
        owner,
        ownerCompany: owner === 'OWN' ? null : textOrNull(values.ownerCompany),
        operationalStatus: status,
        statusReason: status === 'OPERATIONAL' ? null : textOrNull(values.statusReason),
        odometerKm: numberOrNull(values.odometerKm),
        engineHours: numberOrNull(values.engineHours),
        notes: textOrNull(values.notes),
    }
}

/** El alta, desde lo escrito en su editor; lo vacío no viaja, ni lo que su modelo no admite. */
export function newVehicleRequest(values, type) {
    return withoutNulls({code: textOrNull(values.code), ...vehicleValues(values, type)})
}

const VEHICLE_FIELDS = Object.freeze(['name', 'typeId', 'registrationPlate', 'railVehicleNumber', 'serialNumber', 'manufactureYear', 'owner',
    'ownerCompany', 'operationalStatus', 'statusReason', 'odometerKm', 'engineHours', 'notes'])

/** La modificación: lo que cambió, lo vaciado a null y la versión. null si no cambió nada. */
export function vehiclePatch(original, values, type) {
    return buildMergePatch({...original, typeId: original.type?.id ?? null}, vehicleValues(values, type), {
        fields: VEHICLE_FIELDS, numberFields: ['manufactureYear', 'odometerKm', 'engineHours'], version: original.version,
    })
}

/** Registrar dónde está; lo vacío no viaja y sin observedAt es ahora. 201; 409 VEH-001 si su movilidad no lo admite. */
export function recordLocation(vehicleId, body) {
    return apiFetch(resourcesPath('vehicles', vehicleId, 'locations'), {method: 'POST', json: body})
}

/**
 * Las ubicaciones de un vehículo, la más reciente primero (sin sort: ordena el servicio). «Desde» y
 * «Hasta» incluyen los dos días enteros: to viaja como el principio del día siguiente, que el servicio
 * no incluye.
 */
export async function listLocations(vehicleId, {from = null, to = null, page = 1, size = LOCATIONS_PAGE_SIZE} = {}, {signal} = {}) {
    const body = await apiFetch(resourcesPath('vehicles', vehicleId, 'locations'), {
        query: {from: from ? startOfDayInstant(from) : null, to: to ? startOfNextDayInstant(to) : null, ...toPageParams({page, size})},
        signal,
    })
    return toPage(body)
}

/** El tablero: por vía y kp, con el vehículo para desempatar; un remolcado se encuentra por dónde está su portador. */
export async function fleetPositions({executionPackageId = null, trackId = null, kind = null, page = 1, size = 50} = {}, {signal} = {}) {
    const body = await apiFetch(resourcesPath('vehicles', 'positions'), {
        query: {executionPackageId, trackId, kind, ...toPageParams({page, size}), sort: sortWithTieBreak(null, BY_TRACK_AND_KP, 'vehicleId,asc')},
        signal,
    })
    return toPage(body)
}

/** Dónde está de verdad una fila del tablero: la del portador si va con otro, si no la suya. */
export function whereOf(row) {
    return row?.effective ?? row?.position ?? null
}

/** El turno de mto-maintenance que dejó una ubicación, si fue uno. */
export function shiftIdOf(location) {
    const reference = location?.sourceReference
    if (typeof reference !== 'string' || !reference.startsWith(SHIFT_REFERENCE)) {
        return null
    }
    const id = reference.slice(SHIFT_REFERENCE.length)
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null
}

/** Qué campos lleva cada tipo de ubicación; lo que no se ve no viaja. */
export function locationFields(kind, mobility, {readsConfiguration = true} = {}) {
    const parked = kind === 'PARKED'
    const onTrack = kind === 'ON_TRACK'
    const onRoad = kind === 'ON_ROAD'
    const track = readsConfiguration && (onTrack || (parked && mobility !== 'ROAD_ONLY'))
    return {
        site: parked || kind === 'IN_WORKSHOP',
        executionPackageId: readsConfiguration && (parked || onTrack || onRoad),
        trackId: track,
        kp: track,
        accessPoint: mobility === 'ROAD_RAIL' && (onTrack || onRoad),
        coordinates: parked || onRoad,
        carrier: kind === 'ATTACHED',
    }
}

/** La petición con lo que se ve; lo vacío no viaja. */
export function locationRequest(values, mobility, options = {}) {
    const shown = locationFields(values.kind, mobility, options)
    return withoutNulls({
        kind: values.kind,
        parkingSiteId: shown.site ? values.parkingSiteId ?? null : null,
        executionPackageId: shown.executionPackageId ? idOrNull(values.executionPackageId) : null,
        trackId: shown.trackId ? idOrNull(values.trackId) : null,
        kp: shown.kp ? numberOrNull(values.kp) : null,
        latitude: shown.coordinates ? numberOrNull(values.latitude) : null,
        longitude: shown.coordinates ? numberOrNull(values.longitude) : null,
        accessPoint: shown.accessPoint ? textOrNull(values.accessPoint) : null,
        description: textOrNull(values.description),
        carrierVehicleId: shown.carrier ? values.carrierVehicleId ?? null : null,
        attachment: shown.carrier ? values.attachment ?? null : null,
        observedAt: values.observedAt ? localDateTimeToInstant(values.observedAt) : null,
    })
}

/** Los documentos de un vehículo, enteros, por su tipo. */
export function listVehicleDocuments(vehicleId, {signal} = {}) {
    return apiFetch(resourcesPath('vehicles', vehicleId, 'documents'), {signal})
}

/** 201; 409 VDO-409 si ya tiene uno de ese tipo. */
export function addVehicleDocument(vehicleId, body) {
    return apiFetch(resourcesPath('vehicles', vehicleId, 'documents'), {method: 'POST', json: body})
}

export function patchVehicleDocument(vehicleId, documentId, patch) {
    return apiFetch(resourcesPath('vehicles', vehicleId, 'documents', documentId), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/** 204: se borra; el historial del servicio lo guarda. */
export function removeVehicleDocument(vehicleId, documentId) {
    return apiFetch(resourcesPath('vehicles', vehicleId, 'documents', documentId), {method: 'DELETE', responseType: 'none'})
}

/** Lo que el formulario guarda de un documento leído, o de uno nuevo. */
export function vehicleDocumentFormValues(document) {
    return {
        kind: document?.kind ?? null,
        reference: document?.reference ?? '',
        issuedOn: document?.issuedOn ?? null,
        expiresOn: document?.expiresOn ?? null,
        notes: document?.notes ?? '',
    }
}

function vehicleDocumentValues(values) {
    return {
        reference: textOrNull(values.reference),
        issuedOn: toLocalDateParam(values.issuedOn) ?? null,
        expiresOn: toLocalDateParam(values.expiresOn) ?? null,
        notes: textOrNull(values.notes),
    }
}

/** El alta: su tipo y lo escrito; lo vacío no viaja. */
export function vehicleDocumentRequest(values) {
    return withoutNulls({kind: values.kind ?? null, ...vehicleDocumentValues(values)})
}

const VEHICLE_DOCUMENT_FIELDS = Object.freeze(['reference', 'issuedOn', 'expiresOn', 'notes'])

/** La modificación (el tipo no cambia): lo cambiado, lo vaciado a null y la versión; null si nada. */
export function vehicleDocumentPatch(original, values) {
    return buildMergePatch(original, vehicleDocumentValues(values), {fields: VEHICLE_DOCUMENT_FIELDS, version: original.version})
}

/** Los tipos que se ofrecen en el alta: los que el vehículo no tiene ya (409 VDO-409 si no). */
export function offeredDocumentKinds(kinds, documents) {
    const taken = new Set((documents ?? []).map((document) => document.kind))
    return (kinds ?? []).filter((option) => !taken.has(option.value))
}
