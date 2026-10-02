import {Select} from '@mantine/core'
import {useDebouncedValue} from '@mantine/hooks'
import {useQuery} from '@tanstack/react-query'
import {useState} from 'react'
import {filterMasters} from '../../api/configuration/masters.js'
import {profileLabel} from './references.js'

const SEARCH_DELAY_MS = 300
const RESULTS = 50
const BY_CODE = Object.freeze({field: 'profileId', direction: 'asc'})

/**
 * Un perfil buscado en el servidor mientras se escribe (el port de Pickers.lazyProfile): son miles y
 * no caben en un desplegable. Busca en /profiles/filter por searchText, ordenado por identificador, y
 * enseña cada perfil con su KP.
 *
 * @param {{value: string, label: string}|null} current el perfil que ya tiene la fila, ya nombrado
 */
export default function ProfilePicker({current, value, onChange, ...props}) {
    // El elegido sigue en la lista aunque la búsqueda cambie: si no, el desplegable lo perdería.
    const [chosen, setChosen] = useState(current)
    const [search, setSearch] = useState('')
    const [debounced] = useDebouncedValue(search.trim(), SEARCH_DELAY_MS)
    const chosenLabel = chosen && chosen.value === value ? chosen.label : null
    const searching = Boolean(debounced) && debounced !== chosenLabel
    const results = useQuery({
        queryKey: ['configuration', 'profile-search', debounced],
        queryFn: ({signal}) => filterMasters('profiles', {page: 1, size: RESULTS, sort: BY_CODE, filter: {searchText: debounced}},
            {signal}),
        enabled: searching,
    })

    const found = searching
        ? (results.data?.content ?? []).map((profile) => ({value: String(profile.id), label: profileLabel(profile)}))
        : []
    const data = chosenLabel && !found.some((option) => option.value === chosen.value) ? [chosen, ...found] : found

    const change = (next, option) => {
        setChosen(next === null ? null : {value: next, label: option?.label ?? `#${next}`})
        onChange(next)
    }

    return (
        <Select {...props} searchable value={value} onChange={change} data={data} searchValue={search}
                onSearchChange={setSearch} filter={({options}) => options}
                placeholder="Escribe el identificador del perfil"
                nothingFoundMessage={searching && !results.isFetching ? 'Ningún perfil coincide' : 'Escribe para buscar'}/>
    )
}
