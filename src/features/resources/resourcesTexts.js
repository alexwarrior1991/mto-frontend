import {PERSON_CATEGORY, PERSON_EMPLOYER, UNIT_KIND, WORK_DISCIPLINE} from '../../api/resources/enums.js'
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
