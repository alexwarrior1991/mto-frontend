import {credentialTypeLabel, fullNameOf, isPasswordCredential, requiredActionLabel} from '../../api/users/users.js'
import {formatDateTime} from '../../ui/format.js'

/**
 * Lo que el módulo de usuarios pinta: los textos, con las frases del backoffice (ahora con tildes y con
 * el singular cuando toca), los enlaces a la ficha y las filas de los roles.
 */

/** La ficha de un usuario. Su id puede traer «:» (los federados), así que va codificado. */
export function userDetailPath(userId) {
    return `/usuarios/${encodeURIComponent(userId)}`
}

/** Lo que pasa de verdad al borrar a alguien, en la lista y en su ficha. */
export const DELETE_USER_WARNING = 'Se borra en Keycloak con sus roles, perfiles, sesiones y credenciales. No se puede deshacer.'

export function usersCountText(total) {
    return total === 1 ? '1 usuario' : `${total} usuarios`
}

/** Lo que se ve de un catálogo con su filtro local: «3 perfiles», «1 de 3 perfiles». */
export function shownCountText(shown, total, [singular, plural]) {
    const noun = total === 1 ? singular : plural
    return shown === total ? `${total} ${noun}` : `${shown} de ${total} ${noun}`
}

export function sessionsCountText(count, {offline = false} = {}) {
    const noun = count === 1 ? 'sesión' : 'sesiones'
    return `${count} ${noun}${offline ? ' offline' : ''}`
}

/** El aviso de activar o desactivar, con lo que devolvió el servicio. */
export function enabledText(user) {
    return `${user.enabled === true ? 'Activado' : 'Desactivado'} ${user.username}`
}

/** La línea de la cabecera: el nombre, el email y cuándo se creó. */
export function userSummary(user) {
    const parts = [fullNameOf(user)]
    if (typeof user.email === 'string' && user.email.trim()) {
        parts.push(user.email)
    }
    if (user.createdAt) {
        parts.push(`creado el ${formatDateTime(user.createdAt)}`)
    }
    return parts.join(' · ')
}

/** Lo que Keycloak le pedirá al entrar, o null si no hay nada. Una acción que no se conoce va tal cual. */
export function pendingActionsText(user) {
    const actions = user.requiredActions ?? []
    return actions.length > 0 ? `Acciones pendientes al entrar: ${actions.map(requiredActionLabel).join(', ')}` : null
}

/** Los atributos en una línea, por clave y con los valores de cada una separados por «|»; o null. */
export function attributesText(user) {
    const keys = Object.keys(user.attributes ?? {}).sort()
    if (keys.length === 0) {
        return null
    }
    return `Atributos: ${keys.map((key) => `${key}=${(user.attributes[key] ?? []).join('|')}`).join(', ')}`
}

/** Un perfil en un desplegable: su nombre y, si la tiene, su descripción. */
export function profileOptionLabel(profile) {
    return profile.description?.trim() ? `${profile.name} (${profile.description})` : profile.name
}

/** Una fila por rol de cada cliente: los de una persona, o lo que concede un perfil. */
export function roleRows(clientRoles) {
    return (clientRoles ?? []).flatMap((assignment) => assignment.roles.map((role) => ({clientId: assignment.clientId, role})))
}

export function assignedRolesText(names) {
    return names.length === 1 ? `Rol ${names[0]} asignado` : `${names.length} roles asignados`
}

/** Los roles de realm de una persona; los perfiles son roles de realm, así que salen entre ellos. */
export function realmRolesText(realmRoles, {includesProfiles = false} = {}) {
    if (!realmRoles?.length) {
        return 'Sin roles de realm.'
    }
    return `Roles de realm${includesProfiles ? ' (los perfiles están entre ellos)' : ''}: ${realmRoles.join(', ')}`
}

/** Una sesión en el nombre de su botón: desde dónde y cuándo empezó. */
export function sessionName(session) {
    const where = session.ipAddress?.trim() ? session.ipAddress : 'IP desconocida'
    const when = formatDateTime(session.startedAt)
    return when ? `${where} (${when})` : where
}

/** Una credencial por su tipo y, si la tiene, su etiqueta: «Segundo factor (OTP) (móvil)». */
export function credentialName(credential) {
    const type = credentialTypeLabel(credential.type)
    return credential.userLabel?.trim() ? `${type} (${credential.userLabel})` : type
}

/** Lo que pasa de verdad al quitar una credencial. */
export function credentialWarning(credential) {
    return isPasswordCredential(credential)
        ? 'Sin contraseña la persona no podrá entrar hasta que alguien le fije una temporal.'
        : `Se quita ${credentialName(credential)}; la persona sigue entrando con lo demás.`
}

/** Cada paso de «sacar a la persona», como se dice en el aviso de un fallo. */
export const TAKE_OUT_STEP_LABELS = Object.freeze({
    disable: 'desactivar',
    sessions: 'cerrar las sesiones',
    offline: 'revocar las sesiones offline',
})

export function takeOutDoneText(username) {
    return `${username} fuera: desactivado, sesiones cerradas y sesiones offline revocadas`
}

/** El paso que falló, lo que sí se hizo y lo que dijo el servicio. */
export function takeOutFailedText(username, {done, failed}, reason) {
    const doneText = done.length === 0 ? 'nada' : done.map((step) => TAKE_OUT_STEP_LABELS[step]).join(' y ')
    return `No se ha podido sacar a ${username}: fallo al ${TAKE_OUT_STEP_LABELS[failed]} (hecho: ${doneText}). ${reason}`
}
