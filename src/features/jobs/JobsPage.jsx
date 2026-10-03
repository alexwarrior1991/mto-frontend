import {SimpleGrid, Stack, Title} from '@mantine/core'
import {useQueryClient} from '@tanstack/react-query'
import {useState} from 'react'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import {useReferenceCatalog} from '../infrastructure/useMasters.js'
import ExportCard from './ExportCard.jsx'
import ImportCard from './ImportCard.jsx'
import JobHistory from './JobHistory.jsx'
import RepublishCard from './RepublishCard.jsx'
import {jobsKey, useJobList} from './useJobs.js'

const FIRST_PAGE = Object.freeze({page: 1, type: null, status: null})

/**
 * trabajos: los trabajos en segundo plano de mto-configuration, lanzarlos y seguirlos (el port de
 * JobsView). Lanzar es una llamada que responde 202 con el trabajo, o 429 con el trabajo ya
 * rechazado; a partir de ahí el servicio trabaja solo, y la lista lo sigue mientras haya algo en curso.
 *
 * Los lanzadores siguen los permisos del servicio: exportar pide config-read, como leer; importar y
 * republicar, config-import; el catálogo de LOV, además lov-manage. Las vías y las estaciones de los
 * desplegables son las mismas consultas que las de infraestructura.
 */
export default function JobsPage() {
    const session = useSession()
    const canImport = session.has(P.CONFIG_IMPORT)
    const canImportLovs = session.hasAll(P.CONFIG_IMPORT, P.LOV_MANAGE)
    const references = useReferenceCatalog({tracks: true, stations: canImport})

    const queryClient = useQueryClient()
    const [query, setQuery] = useState(FIRST_PAGE)
    const list = useJobList(query)

    // Tras lanzar, a la primera página con los mismos filtros, releída: el trabajo nuevo es el más
    // reciente. Se llama al acabar la llamada, así que no lee la página de cuando se pulsó.
    const firstPage = () => {
        setQuery((current) => (current.page === 1 ? current : {...current, page: 1}))
        void queryClient.invalidateQueries({queryKey: jobsKey('list')})
    }

    return (
        <Stack>
            <Title order={2}>Trabajos</Title>
            <SimpleGrid cols={{base: 1, sm: 2, xl: 4}} spacing="md">
                <ExportCard references={references} onLaunched={firstPage}/>
                {canImport && <ImportCard kind="profiles" onLaunched={firstPage}/>}
                {canImportLovs && <ImportCard kind="lovs" onLaunched={firstPage}/>}
                {canImport && <RepublishCard references={references} onLaunched={firstPage}/>}
            </SimpleGrid>
            <JobHistory list={list} query={query} onQueryChange={setQuery} references={references}/>
        </Stack>
    )
}
