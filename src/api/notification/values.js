import {prefixOf} from '../services.js'
import {ACTOR_KIND} from './enums.js'

/**
 * Lo que comparten los módulos de mto-notification: su prefijo y cómo se nombra quién hizo algo y
 * sobre qué, que es el port de ActorDto.describe y SubjectDto.describe del backoffice.
 */

export function notificationPath(...segments) {
    return [prefixOf('mto-notification'), ...segments.map((segment) => encodeURIComponent(segment))].join('/')
}

/**
 * Quién hizo algo: su nombre de usuario o, sin él, su clase (un planificador, una ráfaga cerrada); con
 * withKind, además la clase entre paréntesis si no es lo que ya se dijo: «mantenimiento.tecnico (Persona)».
 */
export function actorText(actor, {withKind = false} = {}) {
    if (!actor) {
        return ''
    }
    const kind = ACTOR_KIND.label(actor.kind)
    const username = typeof actor.username === 'string' ? actor.username.trim() : ''
    if (!username) {
        return kind
    }
    return withKind && kind ? `${username} (${kind})` : username
}

/** Sobre qué fue: el tipo de entidad y su etiqueta o, sin ella, su id: «order MO-000012». */
export function subjectText(subject) {
    if (!subject) {
        return ''
    }
    const label = typeof subject.label === 'string' && subject.label.trim() !== '' ? subject.label : subject.id ?? ''
    const type = typeof subject.type === 'string' ? subject.type.trim() : ''
    if (!type) {
        return String(label)
    }
    return label === '' ? type : `${type} ${label}`
}
