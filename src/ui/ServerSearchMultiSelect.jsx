import {MultiSelect} from '@mantine/core'
import {useDebouncedValue} from '@mantine/hooks'
import {useQuery} from '@tanstack/react-query'
import {useState} from 'react'

const SEARCH_DELAY_MS = 300

/**
 * Varios elementos buscados en el servidor mientras se escribe (el port de los MultiSelectComboBox
 * perezosos del backoffice): lo que no cabe entero en un desplegable, como los seccionadores que se
 * abren en un turno. La búsqueda sale 300 ms después de la última tecla, y lo elegido sigue en la lista
 * con su nombre aunque la búsqueda cambie.
 *
 * @param {Array} queryKey la clave de la búsqueda, sin el texto
 * @param {Function} search (texto, {signal}) → una promesa de las opciones, [{value, label, ...}]
 * @param {Array<{value: string, label: string}>} [current] lo que ya tiene el campo, ya nombrado
 * @param {string[]} value los valores elegidos
 * @param {Function} onChange (valores, opciones)
 */
export default function ServerSearchMultiSelect({
    queryKey, search, current = [], value, onChange, searchWhenEmpty = false,
    nothingFoundMessage = 'Nada coincide', typeToSearchMessage = 'Escribe para buscar', ...props
}) {
    const [chosen, setChosen] = useState([])
    const [text, setText] = useState('')
    const [opened, setOpened] = useState(false)
    const [debounced] = useDebouncedValue(text.trim(), SEARCH_DELAY_MS)
    const enabled = Boolean(debounced) || (searchWhenEmpty && opened)
    const results = useQuery({
        queryKey: [...queryKey, debounced],
        queryFn: ({signal}) => search(debounced, {signal}),
        enabled,
    })

    const found = enabled ? results.data ?? [] : []
    const known = [...chosen, ...current, ...found]
    const selected = (value ?? []).map((item) => known.find((option) => option.value === item) ?? {value: item, label: item})
    const data = [...selected, ...found.filter((option) => !selected.some((item) => item.value === option.value))]

    const change = (next) => {
        // Las opciones propias primero: llevan lo que search puso en ellas además del valor y la etiqueta.
        const picked = next.map((item) => data.find((option) => option.value === item) ?? {value: item, label: item})
        setChosen(picked)
        onChange(next, picked)
    }

    return (
        <MultiSelect {...props} searchable value={value ?? []} onChange={change} data={data} searchValue={text}
                     onSearchChange={setText} filter={({options}) => options}
                     onDropdownOpen={() => setOpened(true)} onDropdownClose={() => setOpened(false)}
                     nothingFoundMessage={enabled && !results.isFetching ? nothingFoundMessage : typeToSearchMessage}/>
    )
}
