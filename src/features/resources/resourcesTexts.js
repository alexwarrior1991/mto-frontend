import {PERSON_CATEGORY, PERSON_EMPLOYER} from '../../api/resources/enums.js'

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
