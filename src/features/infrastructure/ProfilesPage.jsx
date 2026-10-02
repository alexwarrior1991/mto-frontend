import {Select} from '@mantine/core'
import {formatQuantity} from '../../ui/format.js'
import {useCatalogue} from '../catalogues/useCatalogue.js'
import {describeEntry, sortRows} from '../catalogues/catalogueRows.js'
import {codeOf, toId, toOption} from './formValues.js'
import {MASTERS} from './masterResources.js'
import MasterPage from './MasterPage.jsx'
import ProfileEditor from './ProfileEditor.jsx'
import {profileLabel} from './references.js'
import {useReferenceCatalog} from './useMasters.js'

/**
 * infraestructura/perfiles: los perfiles (miles), filtrados en el servidor por texto, por vía y por
 * estado, con su vía, su estado, su tipo de poste y el vano hasta el siguiente.
 */
export default function ProfilesPage() {
    const references = useReferenceCatalog({tracks: true})
    const statuses = useCatalogue('profile-statuses')
    const statusOptions = sortRows(Array.isArray(statuses.data) ? statuses.data : [])
        .map((entry) => ({value: entry.code, label: describeEntry(entry)}))

    const columns = [
        {key: 'profileId', label: 'Identificador', sortField: 'profileId', render: (row) => row.profileId},
        {key: 'kp', label: 'KP', sortField: 'kp', render: (row) => row.kp},
        {key: 'track', label: 'Vía', sortField: 'track.name', render: (row) => references.trackName(row.trackId)},
        {key: 'profileStatus', label: 'Estado', sortField: 'profileStatus.code', render: (row) => codeOf(row.profileStatus)},
        {key: 'poleType', label: 'Tipo de poste', sortField: 'poleType.code', render: (row) => codeOf(row.poleType)},
        {key: 'span', label: 'Vano (m)', render: (row) => formatQuantity(row.span)},
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
            key: 'profileStatusCode',
            render: (value, onChange) => (
                <Select label="Estado" w={180} clearable data={statusOptions} value={value} onChange={onChange}/>
            ),
        },
    ]

    return (
        <MasterPage master={MASTERS.profiles} columns={columns} filters={filters} labelOf={profileLabel}
                    renderEditor={({row, onClose}) => <ProfileEditor row={row} references={references} onClose={onClose}/>}/>
    )
}
