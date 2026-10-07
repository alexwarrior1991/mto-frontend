import {Checkbox, Select, SimpleGrid, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {masterBody} from '../../api/configuration/masters.js'
import {driveTypeOptions, NORMAL_STATES, normallyOpenOf, normalStateValue} from './disconnectorStates.js'
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
 * del que cuelga, su función, si está en carga, su estado normal y su accionamiento. Es aquí, y no en
 * el perfil, donde se cambia de qué perfil cuelga: el vínculo es del seccionador. El perfil es
 * opcional, porque los de los pórticos de subestación y los de puesta a tierra no están en un poste,
 * y vaciarlo lo desvincula. Un perfil que ya tiene seccionador no admite otro (409 BUS-002).
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
            normallyOpen: normalStateValue(row?.normallyOpen),
            driveType: row?.driveType ?? null,
        },
        validate: {
            name: requiredText('El nombre es obligatorio', NAME_MAX_LENGTH),
            stationId: required('La estación es obligatoria'),
            disconnectorFunction: required('La función es obligatoria'),
        },
    })

    const buildBody = (values) => masterBody(MASTERS.disconnectors.path, row ?? {}, {
        name: values.name.trim(),
        stationId: toId(values.stationId),
        profileId: toId(values.profileId),
        disconnectorFunction: lovChange(row?.disconnectorFunction, values.disconnectorFunction, catalogues[FUNCTIONS]),
        onLoad: values.onLoad,
        normallyOpen: normallyOpenOf(values.normallyOpen),
        driveType: values.driveType,
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
                <ProfilePicker label="Perfil" clearable description="Vacío si el seccionador no está en un poste"
                               current={currentProfile} {...form.getInputProps('profileId')}/>
                <Select label="Función" withAsterisk searchable nothingFoundMessage="No hay ninguna"
                        data={lovOptions(catalogues[FUNCTIONS], row?.disconnectorFunction)}
                        {...form.getInputProps('disconnectorFunction')}/>
                <Select label="Estado normal" clearable data={NORMAL_STATES} {...form.getInputProps('normallyOpen')}/>
                <Select label="Accionamiento" clearable data={driveTypeOptions(row?.driveType)}
                        {...form.getInputProps('driveType')}/>
            </SimpleGrid>
            <Checkbox label="En carga" {...form.getInputProps('onLoad', {type: 'checkbox'})}/>
        </MasterEditorModal>
    )
}
