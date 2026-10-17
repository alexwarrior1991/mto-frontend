import {
    LOCATION_KIND,
    LOCATION_SOURCE,
    PERSON_CATEGORY,
    PERSON_EMPLOYER,
    UNIT_KIND,
    VEHICLE_ATTACHMENT,
    VEHICLE_OWNER,
    VEHICLE_STATUS,
    WORK_DISCIPLINE,
} from '../../api/resources/enums.js'
import {formatDateTime} from '../../ui/format.js'
import {personLabel} from '../../api/resources/values.js'

/**
 * Los textos del módulo de recursos: cómo se cuentan las filas, cómo se dicen el empleo y el estado de
 * una persona y cómo se describe cada recurso en su historial (el port de ResourcesFormats y
 * ResourcesHistory).
 */

export function countText(total, singular, plural) {
    return `${total} ${total === 1 ? singular : plural}`
}

/** Propio, o la empresa de una subcontrata. */
export function employerText(person) {
    if (person?.employer === 'SUBCONTRACTOR') {
        return person.company?.trim() ? person.company : PERSON_EMPLOYER.label('SUBCONTRACTOR')
    }
    return PERSON_EMPLOYER.label(person?.employer)
}

export function personState(person) {
    return person?.active === true ? 'Activa' : 'Inactiva'
}

export function describePerson(person) {
    return join(person.fullName, PERSON_CATEGORY.label(person.category), employerText(person), person.username,
        personState(person).toLowerCase())
}

/** Las partes que hay, separadas por «·»; lo vacío no deja separadores sueltos. */
export function join(...parts) {
    return parts.filter((part) => typeof part === 'string' ? part.trim() !== '' : part !== null && part !== undefined).join(' · ')
}

/** El jefe de una unidad, o «Vacante»: solo un equipo lo tiene siempre. */
export function headText(head) {
    return head ? personLabel(head) : 'Vacante'
}

/** Los linemen de un equipo frente a la regla: «4 de 2 a 6». Nada en las demás unidades. */
export function linemenText(unit) {
    return unit?.kind === 'TEAM' ? `${unit.linemen ?? 0} de 2 a 6` : ''
}

export function unitState(unit) {
    return unit?.active === true ? 'Activa' : 'Inactiva'
}

/** Cómo quedó una unidad en una revisión; sus linemen tienen su propio historial en la pestaña del equipo. */
export function describeUnit(unit) {
    const packages = [...(unit.executionPackageIds ?? [])].sort((a, b) => a - b)
    return join(unit.name, UNIT_KIND.label(unit.kind), unit.discipline ? WORK_DISCIPLINE.label(unit.discipline) : null,
        unit.parent ? `en ${unit.parent.code}` : null, `jefe ${headText(unit.head).toLowerCase()}`,
        packages.length > 0 ? `EP ${packages.join(', ')}` : null, unitState(unit).toLowerCase())
}

/** Por dónde se llega a un sitio: «Vía y carretera», «Vía», «Carretera». */
export function accessText(site) {
    const rail = site?.railAccess === true
    const road = site?.roadAccess === true
    if (rail && road) {
        return 'Vía y carretera'
    }
    return rail ? 'Vía' : road ? 'Carretera' : ''
}

/** Propio, o la empresa de uno alquilado o de subcontrata. */
export function ownerText(vehicle) {
    if (vehicle?.owner && vehicle.owner !== 'OWN' && vehicle.ownerCompany?.trim()) {
        return `${VEHICLE_OWNER.label(vehicle.owner)} · ${vehicle.ownerCompany}`
    }
    return VEHICLE_OWNER.label(vehicle?.owner)
}

/** Cómo está un vehículo, con el motivo si no está operativo. */
export function operationalText(status, reason) {
    if (!status) {
        return ''
    }
    return status !== 'OPERATIONAL' && reason?.trim() ? `${VEHICLE_STATUS.label(status)} · ${reason}` : VEHICLE_STATUS.label(status)
}

export function vehicleState(vehicle) {
    return vehicle?.active === true ? 'Activo' : 'Retirado'
}

/**
 * Dónde está (o estuvo) un vehículo, en una línea: «Aparcado · APT-RSH · VIA 1 · kp 12.3», «Remolcado por
 * DR-02». Sin ubicación, «Sin ubicación».
 */
export function placeText(location, names) {
    if (!location) {
        return 'Sin ubicación'
    }
    if (location.kind === 'ATTACHED' && location.carrier) {
        const how = location.attachment ? VEHICLE_ATTACHMENT.label(location.attachment) : LOCATION_KIND.label(location.kind)
        return `${how} por ${location.carrier.code}`
    }
    return join(LOCATION_KIND.label(location.kind), location.parkingSite?.code, location.trackId == null ? null : names.trackName(location.trackId),
        location.kp == null ? null : `kp ${location.kp}`, location.description)
}

/** De dónde salió una ubicación y cuándo. */
export function originText(location) {
    return location ? join(location.source ? LOCATION_SOURCE.label(location.source) : null,
        location.observedAt ? formatDateTime(location.observedAt) : null, location.recordedBy) : ''
}

export function describeVehicle(vehicle) {
    return join(vehicle.name, vehicle.type?.code, vehicle.registrationPlate, vehicle.railVehicleNumber,
        operationalText(vehicle.operationalStatus, vehicle.statusReason), ownerText(vehicle), vehicleState(vehicle).toLowerCase())
}

/** Lo que dice la confirmación de retirar un vehículo, en la lista y en su ficha. */
export const RETIRE_VEHICLE_TEXT = 'No se borra: sus ubicaciones y los turnos lo siguen nombrando, y deja de ofrecerse en los turnos nuevos. Si '
    + 'es el vehículo por defecto de un equipo, el servicio no lo deja: cámbialo antes en el organigrama. Se puede reactivar.'
