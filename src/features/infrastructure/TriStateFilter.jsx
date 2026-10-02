import {Select} from '@mantine/core'

/**
 * El filtro de tres estados de una lista: todo, lo activo o lo inactivo (el port de EnabledFilter). El
 * servicio filtra por un booleano solo si viene, así que «todo» es null y no viaja.
 *
 * @param {string[]} labels las tres etiquetas: todo, sí y no («Todas», «Activas», «Inactivas»)
 */
export default function TriStateFilter({label, labels, value, onChange}) {
    const [all, yes, no] = labels
    return (
        <Select label={label} w={150} allowDeselect={false} value={toOption(value)}
                data={[{value: 'all', label: all}, {value: 'true', label: yes}, {value: 'false', label: no}]}
                onChange={(option) => onChange(option === 'true' ? true : option === 'false' ? false : null)}/>
    )
}

function toOption(value) {
    if (value === true) {
        return 'true'
    }
    return value === false ? 'false' : 'all'
}
