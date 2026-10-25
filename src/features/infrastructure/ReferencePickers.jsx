import {MultiSelect, Select} from '@mantine/core'
import {withCurrent} from './references.js'

/**
 * Una vía, una estación o un paquete de mto-configuration, con las opciones de useConfigurationNames:
 * lo usan mantenimiento y recursos, que solo guardan sus ids. El valor es el id como texto; el que ya
 * tenía el campo se ve aunque no esté en la lista (sin config-read la lista está vacía), como #id.
 */
export function ReferenceSelect({options, value, onChange, ...props}) {
    return <Select {...props} data={withCurrent(options ?? [], value)} value={value ?? null} onChange={onChange} clearable searchable
                   nothingFoundMessage="Nada coincide"/>
}

/** Varias vías (las de un turno) o paquetes (los de un equipo), con lo que ya tenía el campo aunque no se sepa nombrar. */
export function ReferencesMultiSelect({options, value, onChange, ...props}) {
    const values = value ?? []
    const known = new Set((options ?? []).map((option) => option.value))
    const missing = values.filter((id) => !known.has(id)).map((id) => ({value: id, label: `#${id}`}))
    return <MultiSelect {...props} data={[...missing, ...(options ?? [])]} value={values} onChange={onChange} searchable clearable
                        nothingFoundMessage="Nada coincide"/>
}
