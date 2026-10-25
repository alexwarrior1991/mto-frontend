import {useMemo} from 'react'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import {useReferenceCatalog} from './useMasters.js'

/**
 * Los nombres de mto-configuration que otros módulos solo guardan como id (mantenimiento y recursos):
 * vías, estaciones y paquetes, cargados una vez por pantalla con los catálogos de infraestructura y con
 * el token de la persona. Sin config-read no se pide nada, porque respondería 403: se pinta el id (#12)
 * y sus desplegables salen vacíos. Un id que no se sabe nombrar nunca se lee como vacío: un formulario
 * que lo leyera vacío lo mandaría a vaciar.
 */
export function useConfigurationNames({stations = false, tracks = false} = {}) {
    const session = useSession()
    const readsConfiguration = session.has(P.CONFIG_READ)
    const references = useReferenceCatalog({stations, tracks, enabled: readsConfiguration})
    return useMemo(() => ({readsConfiguration, ...references}), [readsConfiguration, references])
}
