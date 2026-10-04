import {MultiSelect, Select} from '@mantine/core'
import {assetSummaryOf, searchAssets} from '../../api/maintenance/assets.js'
import {isActiveTeam} from '../../api/maintenance/catalogs.js'
import {assetLabel, taskTypeLabel, teamLabel} from '../../api/maintenance/values.js'
import ServerSearchSelect from '../../ui/ServerSearchSelect.jsx'
import {withCurrent} from '../infrastructure/references.js'
import {maintenanceKey} from './useMaintenance.js'

/**
 * Los desplegables de mantenimiento (el port de MaintenancePickers):
 * - los activos son miles y se buscan en el servidor mientras se escribe, por su nombre de campo y
 *   solo los activos (el servicio rechaza trabajo sobre uno desactivado, 409 AST-001);
 * - equipos y tipos de tarea son pocos y vienen enteros de su catálogo;
 * - vías, estaciones y paquetes, de los nombres de mto-configuration.
 * Lo que ya tiene el campo se ve aunque ya no se ofrezca: el equipo retirado de una orden, un tipo de
 * tarea dado de baja o la vía que no se sabe nombrar (#id).
 */

const RESULTS = 50

/**
 * Un activo buscado en el servidor. El valor es su resumen ({id, code, name, type, trackId…}).
 *
 * @param {string|null} [type] solo los de ese tipo; null, cualquiera
 */
export function AssetPicker({type = null, value, onChange, placeholder = 'Escribe su nombre: 12-2.27, HSA-NS5…', ...props}) {
    const search = async (text, {signal}) => {
        const page = await searchAssets({type, enabled: true, name: text, size: RESULTS, sort: null}, {signal})
        return page.content.map(toAssetOption)
    }
    return (
        <ServerSearchSelect {...props} queryKey={maintenanceKey('picker', 'assets', type)} search={search}
                            current={value ? toAssetOption(value) : null} value={value?.id ?? null}
                            onChange={(_id, option) => onChange(option?.entry ?? null)} searchWhenEmpty clearable
                            placeholder={placeholder}/>
    )
}

function toAssetOption(asset) {
    return {value: asset.id, label: assetLabel(asset), entry: assetSummaryOf(asset)}
}

/**
 * Un equipo: se ofrecen los activos, y el que ya tenía el campo aunque esté retirado.
 *
 * @param {Array} teams todos los equipos del catálogo
 * @param {object|null} [current] el equipo que ya tenía el campo ({id, code, name}), para nombrarlo
 */
export function TeamSelect({teams, current = null, value, onChange, ...props}) {
    const options = (teams ?? []).filter(isActiveTeam).map((team) => ({value: team.id, label: teamLabel(team)}))
    const data = current && !options.some((option) => option.value === current.id)
        ? [{value: current.id, label: `${teamLabel(current)} (retirado)`}, ...options]
        : options
    return <Select {...props} data={data} value={value ?? null} onChange={onChange} clearable searchable nothingFoundMessage="Ningún equipo"/>
}

/**
 * Varios tipos de tarea, por su código. Los que ya tenía el campo y ya no están en el catálogo se ven,
 * con su código.
 */
export function TaskTypesSelect({types, value, onChange, ...props}) {
    const options = (types ?? []).map((type) => ({value: type.code, label: taskTypeLabel(type)}))
    const missing = (value ?? []).filter((code) => !options.some((option) => option.value === code)).map((code) => ({value: code, label: code}))
    return <MultiSelect {...props} data={[...missing, ...options]} value={value ?? []} onChange={onChange} searchable clearable
                        nothingFoundMessage="Ningún tipo de tarea"/>
}

/**
 * Una vía, una estación o un paquete de mto-configuration. El valor es el id como texto; el que ya
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
