import {defineEnum} from '../enums.js'
import {apiFetch} from '../http.js'
import {toUsersPage, USERS_MAX_PAGE} from '../paging.js'
import {prefixOf} from '../services.js'

/**
 * Los usuarios de mto-users: el port de UsersClient, de sus DTO y de TakeOut del backoffice. Son la
 * búsqueda, el alta y la modificación, activar, borrar, la contraseña temporal, el correo de acciones,
 * las sesiones normales y offline y las credenciales. Detrás está el realm de Keycloak, que es la
 * única fuente de verdad.
 *
 * Permisos que aplica el servicio, sin que ninguno implique otro:
 * - leer pide users-read;
 * - dar de alta, modificar, activar y el correo de acciones, users-write;
 * - borrar, users-delete;
 * - la contraseña temporal, users-password-reset;
 * - cerrar sesiones, users-sessions-write;
 * - quitar credenciales, users-credentials-write.
 *
 * Cómo viaja un usuario (README de mto-users):
 * - La lista se pide al estilo de Keycloak, con first y max (200 como mucho), y trae su total. No se
 *   ordena, porque la API no ordena.
 * - search y attribute no viajan juntos: el servicio los rechaza con 400 SEARCH-400.
 * - Una modificación es un PUT parcial: null no toca, '' vacía, y attributes sustituye el mapa
 *   entero. El nombre de usuario no cambia nunca, y enabled tiene su PATCH.
 *
 * Sobre quién no se actúa (TargetUserPolicy de mto-users), aunque se tenga el permiso:
 * - Una cuenta de servicio (serviceAccount: true) solo se lee: toda escritura sobre ella es un 403
 *   USR-SVC-403, y también un alta cuyo nombre empiece por service-account-.
 * - Sobre uno mismo (el id es el sub del token) no se desactiva, no se borra y no se cambian roles ni
 *   perfiles: 403 USR-SELF-403. Lo demás sí.
 * Los predicados de abajo (isServiceAccount, isSelf, isReservedUsername) son para no ofrecerlo.
 */

/** El prefijo con el que Keycloak nombra la cuenta de servicio de un cliente; reservado en el alta. */
export const SERVICE_ACCOUNT_PREFIX = 'service-account-'

/**
 * Si el usuario es la cuenta de servicio de un cliente: lo dice el servicio con serviceAccount. Una
 * respuesta de un servicio anterior, sin la clave, no lo es: aquí no se adivina por el nombre.
 */
export function isServiceAccount(user) {
    return user?.serviceAccount === true
}

/** Si el usuario es quien ha entrado: su id es el sub del token (session.userId). */
export function isSelf(user, session) {
    const subject = session?.userId
    return typeof subject === 'string' && subject !== '' && user?.id === subject
}

/** Un nombre de usuario que el servicio no admite en un alta: el prefijo de las cuentas de servicio, sin distinguir mayúsculas. */
export function isReservedUsername(username) {
    return typeof username === 'string' && username.trim().toLowerCase().startsWith(SERVICE_ACCOUNT_PREFIX)
}

/**
 * Lo que no se ofrece sobre un usuario, sea cual sea el permiso de la sesión:
 * - readOnly: una cuenta de servicio, sobre la que no se ofrece ninguna escritura;
 * - self: uno mismo, que no se desactiva, no se borra, no se saca y no cambia sus roles ni perfiles.
 */
export function targetLimits(user, session) {
    const readOnly = isServiceAccount(user)
    const self = isSelf(user, session)
    return Object.freeze({
        readOnly,
        self,
        canModify: !readOnly,
        // Activarse a uno mismo sí se puede; desactivarse, no.
        canSetEnabled: (enabled) => !readOnly && !(self && enabled === false),
        canDelete: !readOnly && !self,
        canTakeOut: !readOnly && !self,
        canChangePermissions: !readOnly && !self,
    })
}

/** Lo que se le puede pedir a una persona al entrar o por correo (el enumerado RequiredAction). */
export const REQUIRED_ACTION = defineEnum({
    UPDATE_PASSWORD: 'Cambiar la contraseña',
    VERIFY_EMAIL: 'Verificar el email',
    UPDATE_PROFILE: 'Completar el perfil',
    CONFIGURE_TOTP: 'Configurar el segundo factor (OTP)',
    TERMS_AND_CONDITIONS: 'Aceptar los términos y condiciones',
})

/**
 * Las acciones que ponen o cambian una credencial (RequiredAction.touchesCredentials de mto-users): la
 * contraseña y el segundo factor. Un enlace por correo con una de ellas es restablecer esa credencial
 * por otro camino, así que el correo de acciones pide entonces users-password-reset además de
 * users-write (403 AUTH-403 sin él). Al dar de alta no cambia nada: ahí no se manda ningún correo.
 */
const CREDENTIAL_ACTIONS = Object.freeze(['UPDATE_PASSWORD', 'CONFIGURE_TOTP'])

export function touchesCredentials(action) {
    return CREDENTIAL_ACTIONS.includes(action)
}

/**
 * Lo que ofrece el correo de acciones: todo a quien puede además restablecer contraseñas, y a quien
 * no, solo lo que no toca una credencial, que es lo que el servicio le aceptaría.
 */
export function actionsEmailOptions(canSetCredentials) {
    return REQUIRED_ACTION.selectable().filter((option) => canSetCredentials || !touchesCredentials(option.value))
}

/** Los tipos de credencial de Keycloak que se saben nombrar. */
export const CREDENTIAL_TYPE = defineEnum({
    password: 'Contraseña',
    otp: 'Segundo factor (OTP)',
    webauthn: 'Llave de seguridad',
    'webauthn-passwordless': 'Llave sin contraseña',
})

/** Un atributo exacto para filtrar la lista: clave:valor, sin espacios (el patrón del servicio). */
export const ATTRIBUTE_FILTER = /^[^:\s]{1,255}:[^\s]{0,255}$/

/** Los tres pasos de «sacar a la persona», en su orden. */
export const TAKE_OUT_STEPS = Object.freeze(['disable', 'sessions', 'offline'])

function base() {
    return prefixOf('mto-users')
}

/** La ruta de un usuario y lo que cuelga de él. Los ids pueden traer «:» (federados): todo va codificado. */
function userPath(userId, ...segments) {
    return [base(), ...[userId, ...segments].map((segment) => encodeURIComponent(segment))].join('/')
}

/** Un usuario tal como llega, con lo que la pantalla recorre siempre presente. */
export function toUser(raw) {
    return {
        ...raw,
        attributes: raw?.attributes && typeof raw.attributes === 'object' && !Array.isArray(raw.attributes) ? raw.attributes : {},
        requiredActions: Array.isArray(raw?.requiredActions) ? raw.requiredActions : [],
    }
}

/** Nombre y apellidos, o el nombre de usuario si no tiene (UserDto.fullName del backoffice). */
export function fullNameOf(user) {
    const name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()
    return name || (user?.username ?? '')
}

/** La etiqueta de una acción requerida. Una que el servicio estrene se enseña tal cual llega. */
export function requiredActionLabel(code) {
    return REQUIRED_ACTION.isKnown(code) ? REQUIRED_ACTION.label(code) : String(code ?? '')
}

/** El tipo de una credencial, por su nombre si se sabe; si no, tal cual llega. */
export function credentialTypeLabel(type) {
    if (type === null || type === undefined) {
        return ''
    }
    return CREDENTIAL_TYPE.isKnown(type) ? CREDENTIAL_TYPE.label(type) : String(type)
}

export function isPasswordCredential(credential) {
    return credential?.type === 'password'
}

export function isAttributeFilter(text) {
    return typeof text === 'string' && ATTRIBUTE_FILTER.test(text)
}

/**
 * Una página de la lista, con su total. Lo que el servicio rechazaría con 400 SEARCH-400 (search junto
 * a attribute, una clave de atributo repetida) y un max de más de 200 se rechazan antes de llamar.
 *
 * @param {object} [options]
 * @param {string|null} [options.search] busca en usuario, email y nombre
 * @param {boolean|null} [options.enabled]
 * @param {string[]} [options.attributes] cada uno clave:valor; se repite la clave attribute
 * @param {number} [options.first]
 * @param {number} [options.max]
 */
export async function searchUsers({
    search = null, username = null, email = null, enabled = null, emailVerified = null, attributes = [],
    first = 0, max = 20,
} = {}, {signal} = {}) {
    const text = typeof search === 'string' ? search.trim() : ''
    if (text && attributes.length > 0) {
        throw new Error('search y attribute no viajan juntos: mto-users los rechaza (SEARCH-400)')
    }
    const keys = attributes.map((attribute) => String(attribute).split(':')[0])
    if (new Set(keys).size !== keys.length) {
        throw new Error(`Una clave de atributo no se repite: mto-users lo rechaza (SEARCH-400): ${attributes.join(', ')}`)
    }
    if (!Number.isInteger(max) || max < 1 || max > USERS_MAX_PAGE) {
        throw new Error(`max va de 1 a ${USERS_MAX_PAGE}: ${max}`)
    }
    const body = await apiFetch(base(), {
        query: {search: text || null, username, email, enabled, emailVerified, attribute: attributes, first, max},
        signal,
    })
    const page = toUsersPage(body)
    return {...page, content: page.content.map(toUser)}
}

export async function getUser(userId, {signal} = {}) {
    return toUser(await apiFetch(userPath(userId), {signal}))
}

/** El alta: 201 con el usuario tal como quedó en Keycloak. */
export async function createUser(body) {
    return toUser(await apiFetch(base(), {method: 'POST', json: body}))
}

/** La modificación parcial: solo lo que cambió (changedUserRequest). */
export async function updateUser(userId, body) {
    return toUser(await apiFetch(userPath(userId), {method: 'PUT', json: body}))
}

/** Activar o desactivar. No cierra sesiones ni revoca tokens offline: eso es takeOut. */
export async function setUserEnabled(userId, enabled) {
    return toUser(await apiFetch(userPath(userId, 'enabled'), {method: 'PATCH', json: {enabled}}))
}

/** Borra en Keycloak, con sus roles, perfiles, sesiones y credenciales. No se puede deshacer. */
export function deleteUser(userId) {
    return apiFetch(userPath(userId), {method: 'DELETE', responseType: 'none'})
}

/** Una contraseña; temporal, la persona tiene que cambiarla al entrar. La política del realm decide. */
export function resetPassword(userId, {password, temporary}) {
    return apiFetch(userPath(userId, 'reset-password'), {
        method: 'POST', json: {password, temporary: Boolean(temporary)}, responseType: 'none',
    })
}

/**
 * Keycloak manda a la persona un enlace con las acciones elegidas. Sin SMTP en el realm, el servicio
 * responde 502. Una validez vacía no viaja: vale la del realm. Con una acción que toca una credencial
 * (touchesCredentials) el servicio pide además users-password-reset, o responde 403.
 */
export function sendActionsEmail(userId, {actions, lifespanSeconds = null}) {
    const json = {actions: [...actions]}
    if (lifespanSeconds !== null && lifespanSeconds !== undefined && lifespanSeconds !== '') {
        json.lifespanSeconds = Number(lifespanSeconds)
    }
    return apiFetch(userPath(userId, 'execute-actions-email'), {method: 'POST', json, responseType: 'none'})
}

export async function listSessions(userId, {signal} = {}) {
    return asList(await apiFetch(userPath(userId, 'sessions'), {signal}))
}

/** Las sesiones offline: sobreviven a cerrar las normales y a desactivar al usuario. */
export async function listOfflineSessions(userId, {signal} = {}) {
    return asList(await apiFetch(userPath(userId, 'offline-sessions'), {signal}))
}

export function revokeSessions(userId) {
    return apiFetch(userPath(userId, 'sessions'), {method: 'DELETE', responseType: 'none'})
}

/** Una sesión; si no es de este usuario, 404 SES-404. */
export function revokeSession(userId, sessionId) {
    return apiFetch(userPath(userId, 'sessions', sessionId), {method: 'DELETE', responseType: 'none'})
}

export function revokeOfflineSessions(userId) {
    return apiFetch(userPath(userId, 'offline-sessions'), {method: 'DELETE', responseType: 'none'})
}

export function revokeOfflineSession(userId, sessionId) {
    return apiFetch(userPath(userId, 'offline-sessions', sessionId), {method: 'DELETE', responseType: 'none'})
}

/** Lo que Keycloak guarda para autenticar a la persona: tipo, etiqueta y fecha, nunca el secreto. */
export async function listCredentials(userId, {signal} = {}) {
    return asList(await apiFetch(userPath(userId, 'credentials'), {signal}))
}

export function deleteCredential(userId, credentialId) {
    return apiFetch(userPath(userId, 'credentials', credentialId), {method: 'DELETE', responseType: 'none'})
}

/**
 * El cuerpo de un alta: recortado y sin lo vacío. Activo y «email verificado» viajan siempre; los
 * atributos y las acciones, solo si hay alguno. La contraseña no se recorta: viaja tal cual se
 * escribió, como en «Contraseña temporal».
 */
export function newUserRequest({
    username, firstName, lastName, email, emailVerified = false, enabled = true, temporaryPassword,
    requiredActions = [], attributes = {},
}) {
    const body = {username: text(username), emailVerified: emailVerified === true, enabled: enabled !== false}
    for (const [field, value] of [['firstName', firstName], ['lastName', lastName], ['email', email]]) {
        if (text(value)) {
            body[field] = text(value)
        }
    }
    if (text(temporaryPassword)) {
        body.temporaryPassword = temporaryPassword
    }
    if (attributes && Object.keys(attributes).length > 0) {
        body.attributes = attributes
    }
    if (Array.isArray(requiredActions) && requiredActions.length > 0) {
        body.requiredActions = [...requiredActions]
    }
    return body
}

/**
 * El cuerpo de una modificación (UserForm.toUpdateRequest del backoffice): solo lo que cambió respecto
 * a lo leído. Un texto viaja recortado, y '' lo vacía. Los atributos viajan enteros o no viajan,
 * porque el servicio sustituye el mapa. Devuelve null si no cambió nada.
 */
export function changedUserRequest(original, {firstName, lastName, email, emailVerified, attributes}) {
    const body = {}
    for (const [field, value] of [['firstName', firstName], ['lastName', lastName], ['email', email]]) {
        const current = text(value)
        if (current !== (original?.[field] ?? '')) {
            body[field] = current
        }
    }
    if ((emailVerified === true) !== (original?.emailVerified === true)) {
        body.emailVerified = emailVerified === true
    }
    const parsed = attributes ?? {}
    if (!sameAttributes(parsed, original?.attributes ?? {})) {
        body.attributes = parsed
    }
    return Object.keys(body).length > 0 ? body : null
}

/** Dos mapas de atributos son el mismo con las mismas claves y, en cada una, los mismos valores en el mismo orden. */
export function sameAttributes(left, right) {
    const leftKeys = Object.keys(left ?? {})
    const rightKeys = Object.keys(right ?? {})
    if (leftKeys.length !== rightKeys.length) {
        return false
    }
    return leftKeys.every((key) => {
        if (!Object.hasOwn(right, key)) {
            return false
        }
        const a = asList(left[key])
        const b = asList(right[key])
        return a.length === b.length && a.every((value, index) => value === b[index])
    })
}

const TAKE_OUT_CALLS = Object.freeze({
    disable: (userId) => setUserEnabled(userId, false),
    sessions: (userId) => revokeSessions(userId),
    offline: (userId) => revokeOfflineSessions(userId),
})

/**
 * «Sacar a la persona» (el TakeOut del backoffice): desactivar, cerrar las sesiones y revocar las
 * offline, en ese orden, que es lo que el README de mto-users deja en manos del cliente.
 * - Desactivar solo bloquea el siguiente login.
 * - Cerrar las sesiones no toca las offline.
 * - Un token offline sobrevive a las dos cosas hasta que se revoca.
 *
 * Para en el primer fallo y nunca rechaza: devuelve lo hecho, el paso que falló y su error.
 *
 * @returns {Promise<{done: string[], failed: string|null, error: *}>}
 */
export async function takeOut(userId) {
    const done = []
    for (const step of TAKE_OUT_STEPS) {
        try {
            await TAKE_OUT_CALLS[step](userId)
        } catch (error) {
            return {done, failed: step, error}
        }
        done.push(step)
    }
    return {done, failed: null, error: null}
}

function text(value) {
    return typeof value === 'string' ? value.trim() : ''
}

function asList(value) {
    return Array.isArray(value) ? value : []
}
