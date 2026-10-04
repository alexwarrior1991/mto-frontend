import {REQUIRED_ACTION} from '../../api/users/users.js'
import {formatAttributes, readAttributes} from './userAttributes.js'

/**
 * Lo que los formularios de usuarios exigen antes de llamar, que es solo lo evidente (las mismas reglas
 * que los diálogos del backoffice). El resto lo decide el servicio, o Keycloak con la política del
 * realm, y llega campo a campo o como aviso.
 */

/** La longitud de las columnas de Keycloak. */
export const MAX_LENGTH = 255

/** Lo que admite un nombre de usuario. */
export const USERNAME_HINT = 'Letras, cifras y . _ @ -'

/** El mínimo de una contraseña aquí; la política del realm puede pedir más. */
export const MIN_PASSWORD_LENGTH = 8

/** La validez mínima del enlace del correo de acciones. */
export const MIN_LIFESPAN_SECONDS = 60

const USERNAME = /^[a-zA-Z0-9._@-]+$/

// La forma de un email del EmailValidator de Vaadin, el que usaba el backoffice.
const EMAIL = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-.]+\.[a-zA-Z0-9-]{2,}$/

export function usernameError(value) {
    const text = (value ?? '').trim()
    if (!text) {
        return 'El usuario es obligatorio'
    }
    return USERNAME.test(text) ? null : USERNAME_HINT
}

/** El email es opcional; si se escribe, con forma de email. */
export function emailError(value) {
    const text = (value ?? '').trim()
    return !text || EMAIL.test(text) ? null : 'No tiene forma de email'
}

/** La contraseña temporal del alta es opcional; si se escribe, de 8 o más. */
export function optionalPasswordError(value) {
    return !value || value.length >= MIN_PASSWORD_LENGTH ? null : `Al menos ${MIN_PASSWORD_LENGTH} caracteres`
}

export function passwordError(value) {
    if (!value) {
        return 'La contraseña es obligatoria'
    }
    return value.length >= MIN_PASSWORD_LENGTH ? null : `Al menos ${MIN_PASSWORD_LENGTH} caracteres`
}

export function attributesError(value) {
    return readAttributes(value).error
}

/** Vacía, vale la del realm; si se escribe, de 60 segundos o más. */
export function lifespanError(value) {
    if (value === '' || value === null || value === undefined) {
        return null
    }
    return Number(value) >= MIN_LIFESPAN_SECONDS ? null : `Al menos ${MIN_LIFESPAN_SECONDS} segundos`
}

export function maxLengthError(value) {
    return (value ?? '').trim().length > MAX_LENGTH ? `Como mucho ${MAX_LENGTH} caracteres` : null
}

/**
 * Lo que el editor enseña: lo leído, o lo de un alta (activo y sin verificar). Las propiedades se
 * llaman como los campos del servicio, para que sus errores caigan en su sitio. Una acción requerida
 * que esta aplicación no conoce no se puede elegir; el servicio la conserva, porque una modificación
 * no lleva acciones.
 */
export function initialUserValues(user) {
    return {
        username: user?.username ?? '',
        firstName: user?.firstName ?? '',
        lastName: user?.lastName ?? '',
        email: user?.email ?? '',
        emailVerified: user?.emailVerified === true,
        enabled: user ? user.enabled === true : true,
        temporaryPassword: '',
        requiredActions: (user?.requiredActions ?? []).filter((action) => REQUIRED_ACTION.isKnown(action)),
        attributes: formatAttributes(user?.attributes),
    }
}
