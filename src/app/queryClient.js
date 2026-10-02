import {MutationCache, QueryCache, QueryClient} from '@tanstack/react-query'
import {NetworkError} from '../api/errors.js'
import {notifyApiError} from '../ui/errors/notifyError.js'

/**
 * El cliente de React Query: la cache de lo leido y el sitio unico donde un fallo se convierte en
 * aviso. Una consulta o una mutacion que trata ella misma su error lo dice con meta.notifyError=false:
 * la campana (un fallo deja el numero como estaba) o un formulario (los errores van a sus campos).
 */
export function createQueryClient({notify = notifyApiError} = {}) {
    const report = (error, meta) => {
        if (meta?.notifyError === false) {
            return
        }
        notify(error)
    }
    return new QueryClient({
        queryCache: new QueryCache({onError: (error, query) => report(error, query.meta)}),
        mutationCache: new MutationCache({
            onError: (error, _variables, _onMutateResult, mutation) => report(error, mutation.meta),
        }),
        defaultOptions: {
            queries: {
                // Solo se reintenta lo que no llego a ningun sitio; un 4xx o un 5xx ya es una respuesta.
                retry: (failureCount, error) => error instanceof NetworkError && failureCount < 1,
                refetchOnWindowFocus: false,
                staleTime: 30_000,
            },
            mutations: {retry: false},
        },
    })
}
