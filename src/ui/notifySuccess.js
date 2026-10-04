import {notifications} from '@mantine/notifications'

const DURATION_MS = 3000
const WARNING_DURATION_MS = 10000

/** El aviso de que algo ha salido bien: verde y tres segundos, como el backoffice («Guardado»). */
export function notifySuccess(message) {
    notifications.show({color: 'teal', autoClose: DURATION_MS, message})
}

/**
 * El aviso de que algo ha salido solo en parte (unas tareas asignadas y otras rechazadas, con su
 * motivo): amarillo y diez segundos, para dar tiempo a leerlo.
 */
export function notifyWarning(message) {
    notifications.show({color: 'yellow', autoClose: WARNING_DURATION_MS, message})
}
