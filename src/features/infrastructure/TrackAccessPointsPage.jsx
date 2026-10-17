import {Select} from '@mantine/core'
import {formatQuantity, yesNo} from '../../ui/format.js'
import TriStateFilter from '../../ui/TriStateFilter.jsx'
import {ACCESS_POINT_KINDS, kindLabel, sideLabel} from './accessPointKinds.js'
import {toId, toOption} from './formValues.js'
import {MASTERS} from './masterResources.js'
import MasterPage from './MasterPage.jsx'
import TrackAccessPointEditor from './TrackAccessPointEditor.jsx'
import {useReferenceCatalog} from './useMasters.js'

/**
 * infraestructura/accesos: los puntos de acceso a la vía (mto-configuration V28), por donde un vehículo
 * bivial sale de la carretera y se encarrila: su vía, su estación, su KP, el tipo, el lado y si admite
 * biviales. Se filtran en el servicio por texto, por vía, por tipo y por estado. Cada cambio se publica
 * y mto-resources lo ofrece al registrar dónde está un vehículo.
 */
export default function TrackAccessPointsPage() {
    const references = useReferenceCatalog({stations: true, tracks: true})
    const columns = [
        {key: 'name', label: 'Nombre', sortField: 'name', render: (row) => row.name},
        {key: 'track', label: 'Vía', sortField: 'track.name', render: (row) => references.trackName(row.trackId)},
        {key: 'station', label: 'Estación', sortField: 'station.name', render: (row) => references.stationName(row.stationId)},
        {key: 'kp', label: 'KP', sortField: 'kp', render: (row) => formatQuantity(row.kp)},
        {key: 'kind', label: 'Tipo', sortField: 'kind', render: (row) => kindLabel(row.kind)},
        {key: 'side', label: 'Lado', sortField: 'side', render: (row) => sideLabel(row.side)},
        {key: 'roadRailAccess', label: 'Biviales', sortField: 'roadRailAccess', render: (row) => yesNo(row.roadRailAccess)},
        {key: 'enabled', label: 'Activo', sortField: 'enabled', render: (row) => yesNo(row.enabled)},
    ]
    const filters = [
        {
            key: 'trackId',
            render: (value, onChange) => (
                <Select label="Vía" w={220} searchable clearable nothingFoundMessage="No hay ninguna"
                        data={references.trackOptions} value={toOption(value)} onChange={(option) => onChange(toId(option))}/>
            ),
        },
        {
            key: 'kind',
            render: (value, onChange) => (
                <Select label="Tipo" w={180} clearable data={ACCESS_POINT_KINDS} value={value} onChange={onChange}/>
            ),
        },
        {
            key: 'enabled',
            render: (value, onChange) => (
                <TriStateFilter label="Estado" labels={['Todos', 'Activos', 'Inactivos']} value={value} onChange={onChange}/>
            ),
        },
    ]
    return (
        <MasterPage master={MASTERS.trackAccessPoints} columns={columns} filters={filters}
                    renderEditor={({row, onClose}) => <TrackAccessPointEditor row={row} references={references} onClose={onClose}/>}/>
    )
}
