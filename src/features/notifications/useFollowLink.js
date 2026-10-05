import {useNavigate} from 'react-router'
import {notificationTarget} from '../../api/notification/links.js'

/**
 * Seguir el enlace de una notificación: una ruta de esta aplicación se navega con sus parámetros, y un
 * enlace http(s) absoluto se abre en otra pestaña con noopener. Lo demás no abre nada. Devuelve si
 * había adónde ir.
 */
export function useFollowLink() {
    const navigate = useNavigate()
    return (link) => {
        const target = notificationTarget(link)
        if (target?.path) {
            navigate(target.path)
        } else if (target?.url) {
            window.open(target.url, '_blank', 'noopener')
        }
        return target !== null
    }
}
