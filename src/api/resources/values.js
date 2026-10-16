import {prefixOf} from '../services.js'

/**
 * Lo que comparten los módulos de mto-resources: su prefijo y cómo se nombra una persona (el port de
 * los label() de sus DTO en el backoffice).
 */

export function resourcesPath(...segments) {
    return [prefixOf('mto-resources'), ...segments.map((segment) => encodeURIComponent(segment))].join('/')
}

/** «PER-000003 · Yossi Cohen», como se nombra una persona en los títulos y las confirmaciones. */
export function personLabel(person) {
    if (!person) {
        return ''
    }
    const name = typeof person.fullName === 'string' ? person.fullName.trim() : ''
    return name ? `${person.code} · ${name}` : (person.code ?? '')
}
