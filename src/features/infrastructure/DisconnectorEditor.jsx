import {Checkbox, Select, SimpleGrid, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {masterBody} from '../../api/configuration/masters.js'
import {lovChange, lovOptions, lovValue, required, requiredText, toId, toOption} from './formValues.js'
import {MASTERS} from './masterResources.js'
import MasterEditorModal from './MasterEditorModal.jsx'
import ProfilePicker from './ProfilePicker.jsx'
import {disconnectorProfileLabel, withCurrent} from './references.js'
import {useCatalogues} from './useCatalogues.js'

const NAME_MAX_LENGTH = 200
const FUNCTIONS = 'disconnector-functions'

/**
 * Alta o modificación de un seccionador (el port de DisconnectorEditor): nombre, estación, el perfil
 * del que cuelga, su función y si está en carga. Es aquí, y no en el perfil, donde se cambia de qué
 * perfil cuelga: el vínculo es del seccionador, y el perfil es obligatorio. Un perfil que ya tiene
 * seccionador no admite otro (409 BUS-002).
 */
export default function DisconnectorEditor({row, references, onClose}) {
    const catalogues = useCatalogues([FUNCTIONS])
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            name: row?.name ?? '',
            stationId: toOption(row?.stationId),
            profileId: toOption(row?.profileId),
            disconnectorFunction: lovValue(row?.disconnectorFunction),
            onLoad: row?.onLoad === true,
        },
        validate: {
            name: requiredText('El nombre es obligatorio', NAME_MAX_LENGTH),
            stationId: required('La estación es obligatoria'),
            profileId: required('El perfil es obligatorio'),
            disconnectorFunction: required('La función es obligatoria'),
        },
    })

    const buildBody = (values) => masterBody(MASTERS.disconnectors.path, row ?? {}, {
        name: values.name.trim(),
        stationId: toId(values.stationId),
        profileId: toId(values.profileId),
        disconnectorFunction: lovChange(row?.disconnectorFunction, values.disconnectorFunction, catalogues[FUNCTIONS]),
        onLoad: values.onLoad,
    })

    const currentProfile = row?.profileId === null || row?.profileId === undefined
        ? null
        : {value: String(row.profileId), label: disconnectorProfileLabel(row)}

    return (
        <MasterEditorModal master={MASTERS.disconnectors} creating={row === null} form={form} buildBody={buildBody}
                           onClose={onClose} size="lg">
            <TextInput label="Nombre" withAsterisk maxLength={NAME_MAX_LENGTH} data-autofocus {...form.getInputProps('name')}/>
            <SimpleGrid cols={{base: 1, sm: 2}}>
                <Select label="Estación" withAsterisk searchable nothingFoundMessage="No hay ninguna"
                        data={withCurrent(references.stationOptions, row?.stationId)} {...form.getInputProps('stationId')}/>
                <ProfilePicker label="Perfil" withAsterisk current={currentProfile} {...form.getInputProps('profileId')}/>
                <Select label="Función" withAsterisk searchable nothingFoundMessage="No hay ninguna"
                        data={lovOptions(catalogues[FUNCTIONS], row?.disconnectorFunction)}
                        {...form.getInputProps('disconnectorFunction')}/>
            </SimpleGrid>
            <Checkbox label="En carga" {...form.getInputProps('onLoad', {type: 'checkbox'})}/>
        </MasterEditorModal>
    )
}
