import {keepPreviousData, useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {createPerson, deactivatePerson, patchPerson, reactivatePerson, searchPeople} from '../../api/resources/people.js'

/**
 * Las consultas y las escrituras del módulo de recursos, con lo que releen (claves ['resources', …]).
 * Nada se da por fresco: tras cada escritura se relee lo que ha podido cambiar con ella.
 */

export const RESOURCES_PAGE_SIZE = 50

const NOT_FRESH = 0

export function resourcesKey(...parts) {
    return ['resources', ...parts]
}

export function usePeopleList(params) {
    return useQuery({
        queryKey: resourcesKey('people', params),
        queryFn: ({signal}) => searchPeople({...params, size: RESOURCES_PAGE_SIZE}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

/**
 * El alta o la modificación de una persona, desde su editor, que trata él mismo sus errores. Una
 * persona sale en el organigrama y en los equipos: se relee todo el módulo.
 */
export function useSavePerson() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({id = null, body}) => (id === null ? createPerson(body) : patchPerson(id, body)),
        meta: {notifyError: false},
        onSuccess: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

/**
 * Desactivar (DELETE) o reactivar (PATCH active=true) una persona. Haya ido bien o no, se relee: si el
 * servicio dice que no (409 UNI-001), la lista enseña cómo está.
 */
export function usePersonAction() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({action, person}) => (action === 'deactivate' ? deactivatePerson(person.id) : reactivatePerson(person)),
        onSettled: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}
