import {searchCatalogue} from '../../api/stock/catalogues.js'
import {codeAndName, summaryOf} from '../../api/stock/values.js'
import ServerSearchSelect from '../../ui/ServerSearchSelect.jsx'
import {stockKey} from './useStock.js'

const RESULTS = 50

const PLACEHOLDERS = Object.freeze({
    materials: 'Escribe el código o el nombre del material',
    warehouses: 'Escribe el código o el nombre del almacén',
    suppliers: 'Escribe el código o el nombre del proveedor',
    projects: 'Escribe el código o el nombre del proyecto',
})

/**
 * Una referencia del almacén buscada en el servidor mientras se escribe (el port de StockPickers):
 * materiales y proyectos son miles y no se cargan enteros. Al abrirse enseña los primeros por código.
 * El valor es el resumen de la entrada ({id, code, name, …}), que es lo que llevan los movimientos y
 * las reservas, y lo que hace falta para nombrarla.
 *
 * En un diálogo solo se ofrece lo activo, porque el servicio rechaza un material o un almacén
 * retirados. En un filtro y en las existencias se ofrece también lo retirado, marcado como tal, para
 * encontrar lo de antes.
 *
 * @param {'materials'|'warehouses'|'suppliers'|'projects'} catalogue
 * @param {object|null} value el resumen elegido
 * @param {Function} onChange resumen elegido, o null
 */
export default function StockPicker({catalogue, value, onChange, includeRetired = false, placeholder, ...props}) {
    const search = async (text, {signal}) => {
        const page = await searchCatalogue(catalogue, {search: text, active: includeRetired ? null : true, size: RESULTS}, {signal})
        return page.content.map(toOption)
    }
    return (
        <ServerSearchSelect {...props} queryKey={stockKey('picker', catalogue, includeRetired)} search={search}
                            current={value ? toOption(value) : null} value={value?.id ?? null}
                            onChange={(_id, option) => onChange(option?.entry ?? null)} searchWhenEmpty clearable
                            placeholder={placeholder ?? PLACEHOLDERS[catalogue]}/>
    )
}

function toOption(entry) {
    const label = codeAndName(entry.code, entry.name)
    return {value: entry.id, label: entry.active === false ? `${label} (retirado)` : label, entry: summaryOf(entry)}
}
