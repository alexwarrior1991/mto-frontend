import {textOrNull} from '../bodies.js'
import {apiFetch} from '../http.js'
import {buildMergePatch, MERGE_PATCH} from '../mergePatch.js'
import {TASK_EQUIPMENT} from './enums.js'
import {maintenancePath} from './values.js'

/**
 * Los catálogos de mto-maintenance, sin paginar porque son pocos: el port de MaintenanceCatalogClient.
 *
 * - Los equipos se dan de alta y se modifican aquí. Su PUT es completo, no un merge-patch como los
 *   demás, y no tienen versión: base y vehículo a null se borran, así que el null viaja. No hay
 *   borrado: un equipo se retira con active=false. Un código repetido es un 409 TEA-409.
 * - Los tipos de tarea del plan (RG-xx, RP-xx) y las plantillas de inspección los mantiene el
 *   servicio. De un tipo solo se cambia el equipo que exige (requiredEquipment: plataforma aislada,
 *   puesta a tierra), con maintenance-supervise y un merge-patch con la versión leída: una tarea de ese
 *   tipo solo se trabaja en un turno que lo lleva (409 SHF-001).
 */

export function listTeams({signal} = {}) {
    return apiFetch(maintenancePath('teams'), {signal})
}

/** 201 con el equipo. */
export function createTeam(body) {
    return apiFetch(maintenancePath('teams'), {method: 'POST', json: body})
}

export function updateTeam(id, body) {
    return apiFetch(maintenancePath('teams', id), {method: 'PUT', json: body})
}

/** Los tipos de tarea; los filtros solo viajan si vienen. */
export function listTaskTypes({functionalGroup = null, requiresFullPossession = null, diagnostic = null} = {}, {signal} = {}) {
    return apiFetch(maintenancePath('task-types'), {query: {functionalGroup, requiresFullPossession, diagnostic}, signal})
}

/** El equipo exigido de un tipo de tarea (por su código): merge-patch; 409 CON-001 con una versión vieja. */
export function patchTaskType(code, patch) {
    return apiFetch(maintenancePath('task-types', code), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/**
 * El equipo exigido, comparado como conjunto: lo que cambió y la versión, o null si nada. Quitarlo todo
 * viaja a null (el servicio lo deja vaciar). Lo que esta aplicación no conoce se conserva.
 */
export function taskTypeEquipmentPatch(type, chosen) {
    const unknown = (type.requiredEquipment ?? []).filter((equipment) => !TASK_EQUIPMENT.isKnown(equipment))
    const next = [...unknown, ...chosen.filter((equipment) => TASK_EQUIPMENT.isKnown(equipment))]
    return buildMergePatch(type, {requiredEquipment: next.length === 0 ? null : next},
        {fields: ['requiredEquipment'], setFields: ['requiredEquipment'], version: type.version})
}

/** Todas las versiones de cada plantilla, también las que ya no son la activa. */
export function listInspectionTemplates({signal} = {}) {
    return apiFetch(maintenancePath('inspection-templates'), {signal})
}

/**
 * El cuerpo de un equipo, entero: el PUT es completo, así que base y vehículo vacíos viajan a null y se
 * borran. Los paquetes van ordenados, como un conjunto. Un alta nace activa; al modificar, desmarcar
 * «Activo» retira el equipo.
 */
export function teamRequest(values, {creating}) {
    return {
        code: String(values.code ?? '').trim(),
        name: String(values.name ?? '').trim(),
        baseName: textOrNull(values.baseName),
        vehicle: textOrNull(values.vehicle),
        active: creating ? true : values.active === true,
        executionPackageIds: [...new Set((values.executionPackageIds ?? []).map(Number))].sort((left, right) => left - right),
    }
}

export function isActiveTeam(team) {
    return team?.active === true
}

/**
 * Un equipo de mto-resources: su jefe, su supervisor, sus linemen y su vehículo son de allí, y aquí solo
 * se lee (su PUT es 409 TEA-001). Uno de antes, sin la clave, es local.
 */
export function isSynchronizedTeam(team) {
    return team?.synchronizedFromResources === true
}

/** En el orden del plan: por orderIndex, y por código lo que no lo tiene o empata. */
export function inPlanOrder(entries) {
    return [...(entries ?? [])].sort((left, right) => (left.orderIndex ?? Number.MAX_SAFE_INTEGER) - (right.orderIndex ?? Number.MAX_SAFE_INTEGER)
        || String(left.code ?? '').localeCompare(String(right.code ?? '')))
}

/** Los tipos de tarea que se ofrecen en un desplegable: los activos, en el orden del plan. */
export function activeTaskTypes(types) {
    return inPlanOrder((types ?? []).filter((type) => type.active !== false))
}

/** Los equipos por código, como los lista el backoffice: el servicio no los ordena. */
export function teamsByCode(teams) {
    return [...(teams ?? [])].sort((left, right) => String(left.code ?? '').localeCompare(String(right.code ?? '')))
}

/** Las plantillas por tipo de activo y, dentro de cada uno, la versión más nueva primero. */
export function templatesInOrder(templates) {
    return [...(templates ?? [])].sort((left, right) => String(left.assetType ?? '').localeCompare(String(right.assetType ?? ''))
        || (right.version ?? 0) - (left.version ?? 0))
}
