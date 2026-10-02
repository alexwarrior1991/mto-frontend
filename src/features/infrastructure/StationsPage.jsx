import {MASTERS} from './masterResources.js'
import MasterPage from './MasterPage.jsx'
import StationEditor from './StationEditor.jsx'
import {useReferenceCatalog} from './useMasters.js'

/** infraestructura/estaciones: cada estación con el nombre de su paquete de ejecución. */
export default function StationsPage() {
    const references = useReferenceCatalog()
    const columns = [
        {key: 'name', label: 'Nombre', sortField: 'name', render: (row) => row.name},
        {
            key: 'executionPackage', label: 'Paquete de ejecución', sortField: 'executionPackage.name',
            render: (row) => references.packageName(row.executionPackageId),
        },
    ]
    return (
        <MasterPage master={MASTERS.stations} columns={columns}
                    renderEditor={({row, onClose}) => <StationEditor row={row} references={references} onClose={onClose}/>}/>
    )
}
