import {formatDate} from '../../ui/format.js'
import ExecutionPackageEditor from './ExecutionPackageEditor.jsx'
import {MASTERS, yesNo} from './masterResources.js'
import MasterPage from './MasterPage.jsx'
import TriStateFilter from './TriStateFilter.jsx'
import {useReferenceCatalog} from './useMasters.js'

/** infraestructura/paquetes: los paquetes de ejecución con su empresa, sus fechas y su longitud. */
export default function ExecutionPackagesPage() {
    const references = useReferenceCatalog({companies: true})
    const columns = [
        {key: 'name', label: 'Nombre', sortField: 'name', render: (row) => row.name},
        {key: 'company', label: 'Empresa', render: (row) => references.companyName(row.companyId)},
        {key: 'startDate', label: 'Inicio', sortField: 'startDate', render: (row) => formatDate(row.startDate)},
        {key: 'endDate', label: 'Fin', sortField: 'endDate', render: (row) => formatDate(row.endDate)},
        {key: 'length', label: 'Longitud', sortField: 'length', render: (row) => row.length ?? ''},
        {key: 'initialPackage', label: 'Inicial', render: (row) => yesNo(row.initialPackage)},
        {key: 'enabled', label: 'Activo', sortField: 'enabled', render: (row) => yesNo(row.enabled)},
    ]
    const filters = [{
        key: 'enabled',
        render: (value, onChange) => (
            <TriStateFilter label="Estado" labels={['Todos', 'Activos', 'Inactivos']} value={value} onChange={onChange}/>
        ),
    }]
    return (
        <MasterPage master={MASTERS.executionPackages} columns={columns} filters={filters}
                    renderEditor={({row, onClose}) => <ExecutionPackageEditor row={row} references={references} onClose={onClose}/>}/>
    )
}
