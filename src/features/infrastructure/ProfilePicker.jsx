import {filterMasters} from '../../api/configuration/masters.js'
import ServerSearchSelect from '../../ui/ServerSearchSelect.jsx'
import {profileLabel} from './references.js'

const RESULTS = 50
const BY_CODE = Object.freeze({field: 'profileId', direction: 'asc'})
const QUERY_KEY = Object.freeze(['configuration', 'profile-search'])

/**
 * Un perfil buscado en el servidor mientras se escribe (el port de Pickers.lazyProfile): son miles y
 * no caben en un desplegable. Busca en /profiles/filter por searchText, ordenado por identificador, y
 * enseña cada perfil con su KP. Sin texto no busca nada.
 *
 * @param {{value: string, label: string}|null} current el perfil que ya tiene la fila, ya nombrado
 */
export default function ProfilePicker({current, value, onChange, ...props}) {
    return (
        <ServerSearchSelect {...props} queryKey={QUERY_KEY} search={searchProfiles} current={current} value={value}
                            onChange={(next) => onChange(next)} placeholder="Escribe el identificador del perfil"
                            nothingFoundMessage="Ningún perfil coincide"/>
    )
}

async function searchProfiles(text, {signal}) {
    const page = await filterMasters('profiles', {page: 1, size: RESULTS, sort: BY_CODE, filter: {searchText: text}}, {signal})
    return page.content.map((profile) => ({value: String(profile.id), label: profileLabel(profile)}))
}
