import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {listLovs} from '../../api/configuration/lovs.js'

/** La clave de un catalogo en la cache: la comparten su pantalla y los desplegables que lo usan. */
export function catalogueKey(path) {
    return ['configuration', 'lovs', path]
}

/** El catalogo entero. Un fallo se avisa en el sitio de siempre (queryClient.js). */
export function useCatalogue(path, {enabled = true} = {}) {
    return useQuery({
        queryKey: catalogueKey(path),
        queryFn: ({signal}) => listLovs(path, {signal}),
        enabled: enabled && Boolean(path),
    })
}

/**
 * Una escritura en un catalogo. Al acabar bien, el catalogo se vuelve a leer: la siguiente
 * modificacion lleva la version nueva, como en el backoffice. Quien trata el error el mismo (el
 * editor, que lleva los errores a sus campos) pasa handlesErrors.
 */
export function useCatalogueMutation(path, mutationFn, {handlesErrors = false} = {}) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn,
        meta: handlesErrors ? {notifyError: false} : undefined,
        onSuccess: () => queryClient.invalidateQueries({queryKey: catalogueKey(path)}),
    })
}
