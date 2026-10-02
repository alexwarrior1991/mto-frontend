import {Select} from '@mantine/core'
import {formatQuantity} from '../../ui/format.js'
import {INSTALLATION_TYPES, installationLabel} from './installationTypes.js'
import {MASTERS, yesNo} from './masterResources.js'
import MasterPage from './MasterPage.jsx'
import SectionInsulatorEditor from './SectionInsulatorEditor.jsx'
import TriStateFilter from './TriStateFilter.jsx'
import {useReferenceCatalog} from './useMasters.js'

/**
 * infraestructura/aisladores: cada aislador de sección con su estación, su KP, cómo está instalado y
 * qué vías conecta.
 */
export default function SectionInsulatorsPage() {
    const references = useReferenceCatalog({stations: true, tracks: true})
    const columns = [
        {key: 'name', label: 'Nombre', sortField: 'name', render: (row) => row.name},
        {key: 'station', label: 'Estación', sortField: 'station.name', render: (row) => references.stationName(row.stationId)},
        {key: 'kp', label: 'KP', sortField: 'kp', render: (row) => formatQuantity(row.kp)},
        {
            key: 'installationType', label: 'Instalación', sortField: 'installationType',
            render: (row) => installationLabel(row.installationType),
        },
        {key: 'track', label: 'Vía', sortField: 'track.name', render: (row) => references.trackName(row.trackId)},
        {key: 'connectedTrack', label: 'Vía conectada', render: (row) => references.trackName(row.connectedTrackId)},
        {key: 'enabled', label: 'Activo', sortField: 'enabled', render: (row) => yesNo(row.enabled)},
    ]
    const filters = [
        {
            key: 'enabled',
            render: (value, onChange) => (
                <TriStateFilter label="Estado" labels={['Todos', 'Activos', 'Inactivos']} value={value} onChange={onChange}/>
            ),
        },
        {
            key: 'installationType',
            render: (value, onChange) => (
                <Select label="Instalación" w={180} clearable data={INSTALLATION_TYPES} value={value} onChange={onChange}/>
            ),
        },
    ]
    return (
        <MasterPage master={MASTERS.sectionInsulators} columns={columns} filters={filters}
                    renderEditor={({row, onClose}) => <SectionInsulatorEditor row={row} references={references} onClose={onClose}/>}/>
    )
}
