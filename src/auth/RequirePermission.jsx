import ForbiddenNotice from '../ui/ForbiddenNotice.jsx'
import {useSession} from './sessionContext.js'

/**
 * Ensena el contenido solo si la persona tiene TODOS los permisos pedidos. Es experiencia de usuario,
 * no seguridad: la guarda real es el 403 de cada servicio, que igualmente se notifica.
 */
export default function RequirePermission({all = [], title, children}) {
    const session = useSession()
    const missing = all.filter((permission) => !session.has(permission))
    if (missing.length > 0) {
        return <ForbiddenNotice title={title} missing={missing}/>
    }
    return children
}
