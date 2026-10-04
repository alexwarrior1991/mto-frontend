import {Select} from '@mantine/core'
import {useDebouncedValue} from '@mantine/hooks'
import {useQuery} from '@tanstack/react-query'
import {useState} from 'react'

const SEARCH_DELAY_MS = 300

/**
 * Un desplegable que busca en el servidor mientras se escribe: el port de los ComboBox perezosos del
 * backoffice, para lo que no cabe entero en un desplegable (perfiles, materiales, proyectos). La
 * búsqueda sale 300 ms después de la última tecla, y lo elegido sigue en la lista aunque la búsqueda
 * cambie: si no, el desplegable lo perdería.
 *
 * @param {Array} queryKey la clave de la búsqueda, sin el texto
 * @param {Function} search (texto, {signal}) → una promesa de las opciones, [{value, label, ...}]
 * @param {{value: string, label: string}|null} [current] lo que ya tiene el campo, ya nombrado
 * @param {boolean} [searchWhenEmpty] también sin texto, en cuanto se abre (la primera página); si no,
 *        solo cuando se escribe
 * @param {Function} onChange (valor, opción) con la opción entera, o (null, null)
 */
export default function ServerSearchSelect({
    queryKey, search, current = null, value, onChange, searchWhenEmpty = false,
    nothingFoundMessage = 'Nada coincide', typeToSearchMessage = 'Escribe para buscar', ...props
}) {
    const [chosen, setChosen] = useState(current)
    const [text, setText] = useState('')
    const [opened, setOpened] = useState(false)
    const [debounced] = useDebouncedValue(text.trim(), SEARCH_DELAY_MS)
    const selected = [current, chosen].find((option) => option && option.value === value) ?? null
    // Lo que enseña el campo tras elegir es la etiqueta de lo elegido: eso no es una búsqueda nueva.
    const term = selected && debounced === selected.label ? '' : debounced
    const enabled = Boolean(term) || (searchWhenEmpty && opened)
    const results = useQuery({
        queryKey: [...queryKey, term],
        queryFn: ({signal}) => search(term, {signal}),
        enabled,
    })

    const found = enabled ? results.data ?? [] : []
    const data = selected && !found.some((option) => option.value === selected.value) ? [selected, ...found] : found

    const change = (next, option) => {
        // Las opciones propias primero: llevan lo que search puso en ellas además del valor y la etiqueta.
        const picked = next === null ? null : data.find((item) => item.value === next) ?? option ?? {value: next, label: next}
        setChosen(picked)
        onChange(next, picked)
    }

    return (
        <Select {...props} searchable value={value ?? null} onChange={change} data={data} searchValue={text}
                onSearchChange={setText} filter={({options}) => options}
                onDropdownOpen={() => setOpened(true)} onDropdownClose={() => setOpened(false)}
                nothingFoundMessage={enabled && !results.isFetching ? nothingFoundMessage : typeToSearchMessage}/>
    )
}
