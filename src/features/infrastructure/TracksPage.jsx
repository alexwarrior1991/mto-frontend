import {IconTimeline} from '@tabler/icons-react'
import {useQueryClient} from '@tanstack/react-query'
import {useState} from 'react'
import {trackSchematic} from '../../api/configuration/masters.js'
import {yesNo} from '../../ui/format.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import TriStateFilter from '../../ui/TriStateFilter.jsx'
import {MASTERS, nameOf} from './masterResources.js'
import MasterPage from './MasterPage.jsx'
import TrackEditor from './TrackEditor.jsx'
import TrackSchematicModal from './TrackSchematicModal.jsx'
import {useReferenceCatalog} from './useMasters.js'

/**
 * infraestructura/vias: cada vía con su paquete, las estaciones que atraviesa y si está activa. Cada
 * fila ofrece su esquema, también a quien solo lee: es una consulta.
 */
export default function TracksPage() {
    const references = useReferenceCatalog({stations: true})
    const queryClient = useQueryClient()
    const [schematic, setSchematic] = useState(null)

    // Una llamada, y lo que se ve es lo que llegó en ella: la proyección ya viene ordenada y cacheada
    // en el servicio. Si falla, el aviso lo da queryClient.js y no se abre ninguna ventana.
    const openSchematic = async (row) => {
        try {
            setSchematic(await queryClient.fetchQuery({
                queryKey: ['configuration', 'tracks', row.id, 'schematic'],
                queryFn: ({signal}) => trackSchematic(row.id, {signal}),
                staleTime: 0,
            }))
        } catch {
            setSchematic(null)
        }
    }

    const columns = [
        {key: 'name', label: 'Nombre', sortField: 'name', render: (row) => row.name},
        {
            key: 'executionPackage', label: 'Paquete de ejecución', sortField: 'executionPackage.name',
            render: (row) => references.packageName(row.executionPackageId),
        },
        {
            key: 'stations', label: 'Estaciones',
            render: (row) => (row.stationIds ?? []).map((id) => references.stationName(id)).join(', '),
        },
        {key: 'enabled', label: 'Activa', sortField: 'enabled', render: (row) => yesNo(row.enabled)},
    ]
    const filters = [{
        key: 'enabled',
        render: (value, onChange) => (
            <TriStateFilter label="Estado" labels={['Todas', 'Activas', 'Inactivas']} value={value} onChange={onChange}/>
        ),
    }]

    return (
        <>
            <MasterPage master={MASTERS.tracks} columns={columns} filters={filters}
                        rowActions={(row) => (
                            <RowActionButton label={`Esquema ${nameOf(row)}`} tooltip="Esquema" icon={IconTimeline}
                                             onClick={() => void openSchematic(row)}/>
                        )}
                        renderEditor={({row, onClose}) => <TrackEditor row={row} references={references} onClose={onClose}/>}/>
            {schematic && <TrackSchematicModal schematic={schematic} onClose={() => setSchematic(null)}/>}
        </>
    )
}
