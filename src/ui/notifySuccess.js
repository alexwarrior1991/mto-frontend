import {notifications} from '@mantine/notifications'

const DURATION_MS = 3000

/** El aviso de que algo ha salido bien: verde y tres segundos, como el backoffice («Guardado»). */
export function notifySuccess(message) {
    notifications.show({color: 'teal', autoClose: DURATION_MS, message})
}
