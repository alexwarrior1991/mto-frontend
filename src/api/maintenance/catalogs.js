import {numberOrNull, textOrNull, withoutNulls} from '../bodies.js'
import {apiFetch} from '../http.js'
import {buildMergePatch, MERGE_PATCH} from '../mergePatch.js'
import {ASSET_TYPE, TASK_EQUIPMENT} from './enums.js'
import {maintenancePath} from './values.js'

/**
 * Los catálogos de mto-maintenance, sin paginar porque son pocos: el port de MaintenanceCatalogClient.
 *
 * - Los equipos se dan de alta y se modifican aquí. Su PUT es completo, no un merge-patch como los
 *   demás, y no tienen versión: base y vehículo a null se borran, así que el null viaja. No hay
 *   borrado: un equipo se retira con active=false. Un código repetido es un 409 TEA-409.
 * - Los tipos de tarea del plan (RG-xx, RP-xx) los mantiene el servicio. De un tipo solo se cambia el equipo que exige (requiredEquipment: plataforma aislada,
 *   puesta a tierra), con maintenance-supervise y un merge-patch con la versión leída: una tarea de ese
 *   tipo solo se trabaja en un turno que lo lleva (409 SHF-001).
 * - Una plantilla de inspección está versionada por tipo de activo, con una activa por tipo como mucho.
 *   Una versión no cambia nunca sus puntos: cambiar un checklist es crear la versión siguiente (POST
 *   con la lista entera, en su orden), que nace activa y deja como anterior a la activa. De una versión
 *   que existe solo cambian el nombre y si es la activa (PATCH merge-patch). Nada se borra. Escribir
 *   pide maintenance-supervise y maintenance-write juntos.
 * - OJO: en una plantilla, version es el número de la versión dentro de su tipo, no el bloqueo
 *   optimista. El bloqueo es lockVersion, que viaja dentro del parche; version no se manda nunca (el
 *   PATCH lo rechaza con 400 VAL-001). Por eso sus parches no salen de buildMergePatch.
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

/** Los topes de una plantilla y de sus puntos en el servicio. */
export const TEMPLATE_MAX_ITEMS = 100
export const TEMPLATE_LENGTHS = Object.freeze({name: 120, code: 32, label: 255, unit: 32})

/** El código de un punto: mayúsculas sin tildes, cifras, _ . y -, sin espacios y empezando por letra o cifra. */
export const TEMPLATE_ITEM_CODE = /^[A-Z0-9][A-Z0-9_.-]*$/

/** 201 con la versión nueva, ya activa. Su Location es la ruta interna del servicio y no se sigue. */
export function createInspectionTemplate(body) {
    return apiFetch(maintenancePath('inspection-templates'), {method: 'POST', json: body})
}

/** Renombrar, activar o desactivar una versión: merge-patch con su lockVersion; 409 CON-001, 404 TPL-404. */
export function patchInspectionTemplate(id, patch) {
    return apiFetch(maintenancePath('inspection-templates', id), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/** Si una versión leída trae su bloqueo: un servicio anterior no lo manda, y tampoco tiene POST ni PATCH. */
export function hasTemplateLock(template) {
    return typeof template?.lockVersion === 'number'
}

/**
 * Si el servicio deja escribir plantillas: solo si todas las versiones leídas traen lockVersion. Una
 * sola sin él y no se ofrece nada, porque sin la clave no hay ni rutas ni bloqueo. Una lista vacía
 * cuenta como escribible: no hay con qué saberlo.
 */
export function templatesAreWritable(templates) {
    return (templates ?? []).every(hasTemplateLock)
}

/** Lo que admite una versión: con su bloqueo y de un tipo de activo conocido. Una de otro tipo solo se lee. */
export function isWritableTemplate(template) {
    return hasTemplateLock(template) && ASSET_TYPE.isKnown(template.assetType)
}

/** La versión activa de un tipo de activo en lo leído, o null si no tiene. */
export function activeTemplateOf(templates, assetType) {
    return (templates ?? []).find((template) => template.assetType === assetType && template.active === true) ?? null
}

/** De qué parte la versión nueva de un tipo: de su activa; sin ella, de su versión más alta; sin ninguna, de nada. */
export function baseTemplateOf(templates, assetType) {
    return activeTemplateOf(templates, assetType)
        ?? templatesInOrder((templates ?? []).filter((template) => template.assetType === assetType))[0] ?? null
}

/**
 * El cuerpo de una versión nueva: el nombre y los textos recortados, la lista entera en el orden de la
 * pantalla y lo vacío fuera (la unidad en blanco, un mínimo o un máximo sin valor, y replacesVersion si
 * el tipo no tiene activa). requiresMeasure viaja siempre. No viajan orderIndex, id ni version.
 *
 * @param {number|null} replacesVersion el número de la activa del tipo tal como se leyó
 */
export function templateRequest({assetType, name, items, replacesVersion = null}) {
    return withoutNulls({
        assetType,
        name: String(name ?? '').trim(),
        replacesVersion,
        items: (items ?? []).map((item) => withoutNulls({
            code: String(item.code ?? '').trim(),
            label: String(item.label ?? '').trim(),
            unit: textOrNull(item.unit),
            minValue: numberOrNull(item.minValue),
            maxValue: numberOrNull(item.maxValue),
            requiresMeasure: item.requiresMeasure === true,
        })),
    })
}

/** El parche de renombrar: el nombre recortado y el lockVersion leído, o null si no cambió. Nunca version. */
export function templateRenamePatch(template, name) {
    const next = String(name ?? '').trim()
    return next === String(template.name ?? '').trim() ? null : {name: next, lockVersion: template.lockVersion}
}

/** El parche de activar o desactivar: active y el lockVersion leído de esa versión. Nunca name ni version. */
export function templateActivePatch(template, active) {
    return {active, lockVersion: template.lockVersion}
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
