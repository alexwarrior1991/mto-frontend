import {numberOrNull, textOrNull, withoutNulls} from '../bodies.js'
import {toLocalDateParam} from '../dates.js'
import {apiFetch} from '../http.js'
import {buildMergePatch, MERGE_PATCH} from '../mergePatch.js'
import {resourcesPath} from './values.js'

/**
 * El taller de un vehículo en mto-resources: el port de VehicleRepairClient y su formulario del
 * backoffice. Todo con resources-fleet-write; leer, con resources-read.
 *
 * - Una reparación nace planificada (dice desde cuándo, plannedFrom) o abierta (entra en el taller ahora).
 *   PLANNED → OPEN → CLOSED, o CANCELLED desde las dos primeras; cada transición es su POST sin cuerpo y
 *   lo demás es un 409 REP-001. Nada se borra.
 * - La que inmoviliza manda en el estado del vehículo: abierta, lo pone «En reparación»; al cerrar o
 *   cancelar la última abierta, vuelve a «Operativo» si sigue «En reparación». Devolverlo a mano con
 *   una abierta es el 409 VEH-001. Planificada o abierta, deja el vehículo fuera de los turnos de esas
 *   fechas (mto-maintenance, 409 SHF-001).
 * - La modificación es un merge-patch con la versión leída: las fechas previstas se cambian mientras está
 *   planificada o abierta, y si inmoviliza solo mientras está planificada (si no, 409 REP-001).
 */

export function listRepairs(vehicleId, {signal} = {}) {
    return apiFetch(resourcesPath('vehicles', vehicleId, 'repairs'), {signal})
}

/** 201. */
export function createRepair(vehicleId, body) {
    return apiFetch(resourcesPath('vehicles', vehicleId, 'repairs'), {method: 'POST', json: body})
}

export function patchRepair(vehicleId, repairId, patch) {
    return apiFetch(resourcesPath('vehicles', vehicleId, 'repairs', repairId), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/** Una transición: 'open', 'close' o 'cancel'. */
export function transitionRepair(vehicleId, repairId, transition) {
    return apiFetch(resourcesPath('vehicles', vehicleId, 'repairs', repairId, transition), {method: 'POST'})
}

/** Si sigue viva: planificada o abierta. */
export function isLiveRepair(repair) {
    return repair?.status === 'PLANNED' || repair?.status === 'OPEN'
}

/**
 * Lo que admite una reparación según su estado, copiado de RepairRules solo para no ofrecer lo que va a
 * fallar: 'open', 'close', 'cancel' y 'edit'. Una de un estado que no se conoce no ofrece nada.
 */
export function repairActions(repair) {
    switch (repair?.status) {
        case 'PLANNED':
            return ['open', 'edit', 'cancel']
        case 'OPEN':
            return ['close', 'edit', 'cancel']
        case 'CLOSED':
        case 'CANCELLED':
            return ['edit']
        default:
            return []
    }
}

/** Lo que el formulario guarda de una reparación leída, o de una nueva (planificada e inmovilizando). */
export function repairFormValues(repair) {
    return {
        status: repair?.status ?? 'PLANNED',
        kind: repair?.kind ?? null,
        immobilises: repair ? repair.immobilises !== false : true,
        description: repair?.description ?? '',
        workshop: repair?.workshop ?? '',
        plannedFrom: repair?.plannedFrom ?? null,
        plannedTo: repair?.plannedTo ?? null,
        odometerKm: repair?.odometerKm == null ? '' : String(repair.odometerKm),
        engineHours: repair?.engineHours == null ? '' : String(repair.engineHours),
        cost: repair?.cost == null ? '' : String(repair.cost),
        notes: repair?.notes ?? '',
    }
}

function repairValues(values) {
    return {
        kind: values.kind ?? null,
        immobilises: values.immobilises !== false,
        description: textOrNull(values.description),
        workshop: textOrNull(values.workshop),
        plannedFrom: toLocalDateParam(values.plannedFrom) ?? null,
        plannedTo: toLocalDateParam(values.plannedTo) ?? null,
        odometerKm: numberOrNull(values.odometerKm),
        engineHours: numberOrNull(values.engineHours),
        cost: numberOrNull(values.cost),
        notes: textOrNull(values.notes),
    }
}

/** El alta: planificada u abierta ahora, y lo escrito; lo vacío no viaja. */
export function repairRequest(values) {
    return withoutNulls({status: values.status === 'OPEN' ? 'OPEN' : 'PLANNED', ...repairValues(values)})
}

const REPAIR_FIELDS = Object.freeze(['kind', 'immobilises', 'description', 'workshop', 'plannedFrom', 'plannedTo', 'odometerKm',
    'engineHours', 'cost', 'notes'])

/**
 * La modificación: lo cambiado, lo vaciado a null y la versión; null si nada. Lo que su estado ya no deja
 * cambiar (las fechas fuera de planificada o abierta, si inmoviliza fuera de planificada) viaja como se leyó,
 * es decir, no viaja.
 */
export function repairPatch(original, values) {
    const next = repairValues(values)
    if (!isLiveRepair(original)) {
        next.plannedFrom = original.plannedFrom ?? null
        next.plannedTo = original.plannedTo ?? null
    }
    if (original.status !== 'PLANNED') {
        next.immobilises = original.immobilises
    }
    return buildMergePatch(original, next, {fields: REPAIR_FIELDS, numberFields: ['odometerKm', 'engineHours', 'cost'], version: original.version})
}
