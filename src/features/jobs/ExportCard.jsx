import {Button, Select} from '@mantine/core'
import {IconDownload} from '@tabler/icons-react'
import {useState} from 'react'
import {exportProfiles, MAPPER_TYPES} from '../../api/configuration/jobs.js'
import {exportLabel} from './jobTexts.js'
import LauncherCard from './LauncherCard.jsx'
import {useLaunchJob} from './useJobs.js'

/**
 * Exportar en CSV los perfiles de una vía (config-read, como leer). La vía se nombra con su paquete,
 * porque «VIA 1» existe en varios.
 */
export default function ExportCard({references, onLaunched}) {
    const [trackId, setTrackId] = useState(null)
    const [mapperType, setMapperType] = useState(MAPPER_TYPES[0])
    const [missingTrack, setMissingTrack] = useState(false)
    const {launch, launching} = useLaunchJob(onLaunched)

    const submit = () => {
        if (!trackId) {
            setMissingTrack(true)
            return
        }
        const id = Number(trackId)
        launch(exportLabel(references.trackName(id)), () => exportProfiles({trackId: id, mapperType}))
    }

    return (
        <LauncherCard title="Exportar los perfiles de una vía" hint="Un CSV con todos los perfiles de la vía, en el formato elegido">
            <Select label="Vía" placeholder="Elige una vía" searchable nothingFoundMessage="Ninguna vía coincide"
                    data={references.trackOptions} value={trackId} error={missingTrack ? 'Elige una vía' : null}
                    onChange={(value) => {
                        setTrackId(value)
                        setMissingTrack(false)
                    }}/>
            <Select label="Formato" data={MAPPER_TYPES} value={mapperType} allowDeselect={false}
                    onChange={(value) => setMapperType(value ?? MAPPER_TYPES[0])}/>
            <Button leftSection={<IconDownload size={16}/>} loading={launching} onClick={submit}>Exportar</Button>
        </LauncherCard>
    )
}
