import {IconArrowRight} from '@tabler/icons-react'
import {useNavigate} from 'react-router'
import {UNIT_KIND} from '../../api/resources/enums.js'
import {unitLabel} from '../../api/resources/values.js'
import DataTable from '../../ui/DataTable.jsx'
import RowActionButton from '../../ui/RowActionButton.jsx'
import {unitPath} from './resourcesRoutes.js'
import {headText, linemenText, unitState} from './resourcesTexts.js'
import {useUnitChildren} from './useResources.js'

/**
 * Las unidades que cuelgan directamente de una, activas o no (el port de ChildUnitsPanel): una
 * petición, porque el organigrama es pequeño. Cada fila se abre con su botón.
 */
export default function ChildUnitsPanel({unit, names}) {
    const navigate = useNavigate()
    const children = useUnitChildren(unit.id)
    const columns = [
        {key: 'unit', label: 'Unidad', render: unitLabel},
        {key: 'kind', label: 'Nivel', render: (child) => UNIT_KIND.label(child.kind)},
        {key: 'head', label: 'Jefe', render: (child) => headText(child.head)},
        {key: 'linemen', label: 'Linemen', render: linemenText},
        {key: 'packages', label: 'EP', render: (child) => [...(child.executionPackageIds ?? [])].sort((a, b) => a - b).map(names.packageName).join(', ')},
        {key: 'active', label: 'Estado', render: unitState},
    ]
    return (
        <DataTable ariaLabel={`Unidades de ${unit.code}`} columns={columns} rows={children.data?.content ?? []} loading={children.isPending}
                   emptyText={children.isError ? 'No se ha podido leer la lista.' : 'No cuelga ninguna unidad.'}
                   rowActions={(child) => (
                       <RowActionButton label={`Abrir ${child.code}`} tooltip="Abrir" icon={IconArrowRight} onClick={() => navigate(unitPath(child.id))}/>
                   )}/>
    )
}
