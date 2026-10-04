import {prefixOf} from '../services.js'

/**
 * Lo que comparten los módulos de mto-maintenance: su prefijo y cómo se nombra lo que llega dentro de
 * otra cosa (el activo de una orden, el equipo de un turno, un tipo de tarea, el material de una
 * línea), que es el port de los label() de sus DTO en el backoffice.
 */

export function maintenancePath(...segments) {
    return [prefixOf('mto-maintenance'), ...segments.map((segment) => encodeURIComponent(segment))].join('/')
}

/** El código y, si lo hay y no es el mismo, el nombre: «SEC-01 - Tramo norte». */
export function codeAndName(code, name) {
    const hasCode = typeof code === 'string' && code.trim() !== ''
    const hasName = typeof name === 'string' && name.trim() !== '' && name !== code
    if (!hasName) {
        return hasCode ? code : ''
    }
    return hasCode ? `${code} - ${name}` : name
}

/** Un activo, entero o el resumen que trae una orden, un defecto o una inspección. */
export function assetLabel(asset) {
    return asset ? codeAndName(asset.code, asset.name) : ''
}

/** Un equipo, entero o el resumen que trae una orden o un turno. */
export function teamLabel(team) {
    return team ? codeAndName(team.code, team.name) : ''
}

/** Un tipo de tarea del plan: «RG-01 - Revisión general del poste». */
export function taskTypeLabel(type) {
    return type ? codeAndName(type.code, type.description) : ''
}

/** El material de una línea, con la descripción que se copió al registrarla, si la hay. */
export function materialLabel(line) {
    return line ? codeAndName(line.materialCode, line.materialDescriptionSnapshot) : ''
}
