import {Button, Select} from '@mantine/core'
import {IconRefresh} from '@tabler/icons-react'
import {useState} from 'react'
import {republish, REPUBLISH_TARGETS} from '../../api/configuration/jobs.js'
import {republishLabel} from './jobTexts.js'
import LauncherCard from './LauncherCard.jsx'
import {useLaunchJob} from './useJobs.js'

const TARGET_OPTIONS = REPUBLISH_TARGETS.map(({value, label}) => ({value, label}))

/**
 * Republicar datos maestros (config-import): vuelve a emitir los eventos de lo que ya existía antes de
 * que hubiera consumidores. La vía solo acota los perfiles y la estación, los seccionadores y los
 * aisladores: el filtro que no aplica se deshabilita y se vacía, así que nunca viaja.
 */
export default function RepublishCard({references, onLaunched}) {
    const [entity, setEntity] = useState(REPUBLISH_TARGETS[0].value)
    const [trackId, setTrackId] = useState(null)
    const [stationId, setStationId] = useState(null)
    const {launch, launching} = useLaunchJob(onLaunched)
    const target = REPUBLISH_TARGETS.find((candidate) => candidate.value === entity)

    const changeEntity = (value) => {
        const next = REPUBLISH_TARGETS.find((candidate) => candidate.value === value) ?? REPUBLISH_TARGETS[0]
        setEntity(next.value)
        if (next.scope !== 'track') {
            setTrackId(null)
        }
        if (next.scope !== 'station') {
            setStationId(null)
        }
    }

    const submit = () => launch(republishLabel(target.label), () => republish({
        entity,
        trackId: trackId ? Number(trackId) : null,
        stationId: stationId ? Number(stationId) : null,
    }))

    return (
        <LauncherCard title="Republicar datos maestros"
                      hint="Vuelve a emitir los eventos de lo que ya existía antes de que hubiera consumidores">
            <Select label="Qué republicar" data={TARGET_OPTIONS} value={entity} allowDeselect={false} onChange={changeEntity}/>
            <Select label="Solo la vía" placeholder="Todas" searchable clearable nothingFoundMessage="Ninguna vía coincide"
                    data={references.trackOptions} value={trackId} onChange={setTrackId} disabled={target.scope !== 'track'}/>
            <Select label="Solo la estación" placeholder="Todas" searchable clearable nothingFoundMessage="Ninguna estación coincide"
                    data={references.stationOptions} value={stationId} onChange={setStationId}
                    disabled={target.scope !== 'station'}/>
            <Button variant="light" leftSection={<IconRefresh size={16}/>} loading={launching} onClick={submit}>Republicar</Button>
        </LauncherCard>
    )
}
