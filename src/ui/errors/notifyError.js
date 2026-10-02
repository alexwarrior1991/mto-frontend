import {notifications} from '@mantine/notifications'
import {createElement} from 'react'
import {ApiError, SessionExpiredError} from '../../api/errors.js'
import {sessionExpired} from '../../auth/sessionExpired.js'
import ErrorNotice from './ErrorNotice.jsx'
import {errorMessage} from './messages.js'

const DURATION_MS = 8000

/**
 * El aviso de un fallo de la API: rojo, abajo a la izquierda, ocho segundos y con su «Referencia».
 * Una sesion caducada no es un aviso: abre el dialogo de volver a entrar.
 */
export function notifyApiError(error) {
    if (error instanceof SessionExpiredError) {
        sessionExpired.open()
        return
    }
    notifications.show({
        color: 'red',
        autoClose: DURATION_MS,
        message: createElement(ErrorNotice, {
            message: errorMessage(error),
            reference: error instanceof ApiError ? error.reference : null,
        }),
    })
}

/** Avisa de unos mensajes sueltos (lo que un formulario no pudo poner en ningun campo). */
export function notifyMessages(messages) {
    const text = messages.filter(Boolean).join('. ')
    if (!text) {
        return
    }
    notifications.show({color: 'red', autoClose: DURATION_MS, message: text})
}
