import {textOrNull, withoutNulls} from '../bodies.js'
import {apiFetch} from '../http.js'
import {buildMergePatch, MERGE_PATCH} from '../mergePatch.js'
import {sortWithTieBreak, toPage, toPageParams} from '../paging.js'
import {canHangFrom} from './enums.js'
import {resourcesPath} from './values.js'

/**
 * El organigrama de mto-resources: el port de OrganizationClient, UnitForm y OrganizationTree del
 * backoffice.
 *
 * - Proyecto, departamento, jefatura de supervisores, supervisión y equipo: un árbol pequeño (decenas
 *   de unidades), que se pide entero (/units/tree).
 * - Un equipo nace completo (su jefe y de 2 a 6 linemen) y nunca sale de esa regla: sus linemen entran
 *   de uno en uno (POST /members, 409 UNI-001 con 6), salen de uno en uno (leave, 409 con 2) o se
 *   cambian todos de una vez (PUT /members). Reactivar un equipo pide sus linemen.
 * - No se borra nada: DELETE desactiva (resources-delete; 409 UNI-001 con unidades activas debajo).
 * - Una modificación es un PATCH merge-patch con la versión leída (409 CON-001); el servicio deja vaciar
 *   el jefe (salvo en un equipo, que se sustituye), los EP y el vehículo por defecto.
 */

/** El orden de las hijas de una unidad, y el id para desempatar al final. */
export const BY_CODE = Object.freeze(['code,asc'])

/** Las hijas de una unidad caben en una petición: el organigrama es pequeño. */
export const ALL_CHILDREN = 200

export function getUnitTree({includeInactive = false} = {}, {signal} = {}) {
    return apiFetch(resourcesPath('units', 'tree'), {query: {includeInactive}, signal})
}

export function getUnit(id, {signal} = {}) {
    return apiFetch(resourcesPath('units', id), {signal})
}

/** Las unidades que cuelgan directamente de una, activas o no, por código. */
export async function unitChildren(parentId, {signal} = {}) {
    const body = await apiFetch(resourcesPath('units'), {
        query: {parentId, ...toPageParams({page: 1, size: ALL_CHILDREN}), sort: sortWithTieBreak(null, BY_CODE)},
        signal,
    })
    return toPage(body)
}

/** 201 con la unidad; 409 UNI-409 si el código ya existe, UNI-001 si rompe una regla del organigrama. */
export function createUnit(body) {
    return apiFetch(resourcesPath('units'), {method: 'POST', json: body})
}

export function patchUnit(id, patch) {
    return apiFetch(resourcesPath('units', id), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/** 204. */
export function deactivateUnit(id) {
    return apiFetch(resourcesPath('units', id), {method: 'DELETE', responseType: 'none'})
}

/** Una unidad que no es un equipo vuelve con un PATCH active=true y la versión leída. */
export function reactivateUnit(unit) {
    return patchUnit(unit.id, {active: true, version: unit.version})
}

/** Un equipo vuelve completo: con sus linemen (de 2 a 6) desde esa fecha (vacía, hoy). */
export function reactivateTeam(unit, memberPersonIds, joinedOn = null) {
    return patchUnit(unit.id, withoutNulls({active: true, memberPersonIds, joinedOn, version: unit.version}))
}

/** Los linemen de un equipo; con includeFormer, también los que salieron. */
export function listMembers(teamId, {includeFormer = false} = {}, {signal} = {}) {
    return apiFetch(resourcesPath('units', teamId, 'members'), {query: {includeFormer}, signal})
}

/** La lista entera (de 2 a 6): los que faltan salen y los nuevos entran en effectiveOn (vacía, hoy). */
export function replaceMembers(teamId, memberPersonIds, effectiveOn = null) {
    return apiFetch(resourcesPath('units', teamId, 'members'), {method: 'PUT', json: withoutNulls({memberPersonIds, effectiveOn})})
}

export function addMember(teamId, personId, joinedOn = null) {
    return apiFetch(resourcesPath('units', teamId, 'members'), {method: 'POST', json: withoutNulls({personId, joinedOn})})
}

export function leaveTeam(teamId, personId, leftOn = null) {
    return apiFetch(resourcesPath('units', teamId, 'members', personId, 'leave'), {method: 'POST', json: withoutNulls({leftOn})})
}

/** La ruta del historial de una unidad, para listRevisions. */
export function unitRevisionsPath(id) {
    return resourcesPath('units', id, 'revisions')
}

export function isActiveUnit(unit) {
    return unit?.active === true
}

export function isTeam(unit) {
    return unit?.kind === 'TEAM'
}

/** Los linemen de ahora, sin los que ya salieron. */
export function currentMembers(members) {
    return (members ?? []).filter((member) => !member.leftOn)
}

/** Las unidades de un árbol, cada una antes que sus hijas. */
export function flattenTree(roots) {
    return (roots ?? []).flatMap((node) => [node, ...flattenTree(node.children)])
}

/**
 * De qué unidades del árbol puede colgar una de este nivel: activas, de un nivel estrictamente
 * superior y de su disciplina si la tiene; nunca de sí misma. Sin nivel todavía, de cualquiera de la
 * que algo pueda colgar: el padre se puede elegir antes que el nivel.
 */
export function parentsFor(roots, kind, {discipline = null, selfId = null} = {}) {
    return flattenTree(roots).filter((node) => node.active === true && node.id !== selfId)
        .filter((node) => (kind ? canHangFrom(kind, node.kind) : node.kind !== 'TEAM' && canHangFrom('TEAM', node.kind)))
        .filter((node) => !discipline || !node.discipline || node.discipline === discipline)
}

/** La disciplina que hereda lo que cuelga de parentId; null bajo un proyecto o sin padre. */
export function disciplineUnder(roots, parentId) {
    return flattenTree(roots).find((node) => node.id === parentId)?.discipline ?? null
}

/**
 * El alta, desde lo escrito en su editor; lo vacío no viaja. Un proyecto no tiene disciplina ni
 * padre; solo un equipo lleva sus linemen y su fecha de entrada. Sin config-read no se eligen EP y no
 * viaja ninguno.
 */
export function newUnitRequest(values) {
    const team = values.kind === 'TEAM'
    const project = values.kind === 'PROJECT'
    const packages = [...(values.executionPackageIds ?? [])].map(Number).sort((a, b) => a - b)
    const members = team ? values.memberPersonIds ?? [] : []
    return withoutNulls({
        code: textOrNull(values.code),
        name: textOrNull(values.name),
        kind: values.kind,
        discipline: project ? null : values.discipline ?? null,
        parentId: project ? null : values.parentId ?? null,
        headPersonId: values.headPersonId ?? null,
        executionPackageIds: packages.length > 0 ? packages : null,
        memberPersonIds: members.length > 0 ? members : null,
        joinedOn: team ? values.joinedOn ?? null : null,
    })
}

/**
 * La modificación: lo que cambió frente a lo leído, lo vaciado a null y la versión; los EP como
 * conjunto. Sin config-read los EP no se tocan: los leídos no se mandan a vaciar. null si no cambió nada.
 */
export function unitPatch(original, values, {readsPackages = true} = {}) {
    const before = {
        name: original.name ?? null,
        parentId: original.parent?.id ?? null,
        headPersonId: original.head?.id ?? null,
        executionPackageIds: [...(original.executionPackageIds ?? [])].sort((a, b) => a - b),
    }
    const after = {
        name: textOrNull(values.name),
        parentId: values.parentId ?? null,
        headPersonId: values.headPersonId ?? null,
        executionPackageIds: [...(values.executionPackageIds ?? [])].map(Number).sort((a, b) => a - b),
    }
    const fields = readsPackages ? ['name', 'parentId', 'headPersonId', 'executionPackageIds'] : ['name', 'parentId', 'headPersonId']
    return buildMergePatch(before, after, {fields, setFields: ['executionPackageIds'], version: original.version})
}
