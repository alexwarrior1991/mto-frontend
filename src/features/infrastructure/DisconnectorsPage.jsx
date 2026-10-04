import {yesNo} from '../../ui/format.js'
import TriStateFilter from '../../ui/TriStateFilter.jsx'
import DisconnectorEditor from './DisconnectorEditor.jsx'
import {codeOf} from './formValues.js'
import {MASTERS} from './masterResources.js'
import MasterPage from './MasterPage.jsx'
import {disconnectorProfileLabel} from './references.js'
import {useReferenceCatalog} from './useMasters.js'

/**
 * infraestructura/seccionadores: cada seccionador con su estación, su función y el perfil del que
 * cuelga. El perfil sale de la propia fila (profileCode y profileKp), porque la lista no va perfil por
 * perfil.
 */
export default function DisconnectorsPage() {
    const references = useReferenceCatalog({stations: true})
    const columns = [
        {key: 'name', label: 'Nombre', sortField: 'name', render: (row) => row.name},
        {key: 'station', label: 'Estación', sortField: 'station.name', render: (row) => references.stationName(row.stationId)},
        {
            key: 'function', label: 'Función', sortField: 'disconnectorFunction.code',
            render: (row) => codeOf(row.disconnectorFunction),
        },
        {key: 'profile', label: 'Perfil', sortField: 'profile.profileId', render: (row) => disconnectorProfileLabel(row)},
        {key: 'onLoad', label: 'En carga', sortField: 'onLoad', render: (row) => yesNo(row.onLoad)},
    ]
    const filters = [{
        key: 'onLoad',
        render: (value, onChange) => (
            <TriStateFilter label="Carga" labels={['Todos', 'En carga', 'Sin carga']} value={value} onChange={onChange}/>
        ),
    }]
    return (
        <MasterPage master={MASTERS.disconnectors} columns={columns} filters={filters}
                    renderEditor={({row, onClose}) => <DisconnectorEditor row={row} references={references} onClose={onClose}/>}/>
    )
}
