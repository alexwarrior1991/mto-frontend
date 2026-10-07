import {Checkbox, Select, SimpleGrid, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {masterBody} from '../../api/configuration/masters.js'
import {driveTypeOptions, NORMAL_STATES, normallyOpenOf, normalStateValue} from './disconnectorStates.js'
import {
    KP_MESSAGE, KP_PATTERN, lovChange, lovOptions, lovValue, required, requiredText, toId, toOption, toText,
} from './formValues.js'
import {MASTERS} from './masterResources.js'
import MasterEditorModal from './MasterEditorModal.jsx'
import ProfilePicker from './ProfilePicker.jsx'
import {disconnectorProfileLabel, withCurrent} from './references.js'
import {useCatalogues} from './useCatalogues.js'

const NAME_MAX_LENGTH = 200
// El KP propio es texto, como el del perfil: 9 enteros, el punto y 3 decimales.
const KP_MAX_LENGTH = 13
const FUNCTIONS = 'disconnector-functions'

/**
 * Alta o modificación de un seccionador (el port de DisconnectorEditor): nombre, estación, el perfil
 * del que cuelga, su función, si está en carga, su estado normal y su accionamiento. La estación es
 * opcional: uno en plena vía, en una zona neutra o en una subestación no es de ninguna. Tiene que estar
 * en algún sitio (con su estación, en un poste o con su vía propia), pero eso lo dice el servicio, con
 * un 400 sobre la estación que se enseña en su campo con el diálogo abierto. Es aquí, y no en
 * el perfil, donde se cambia de qué perfil cuelga: el vínculo es del seccionador. El perfil es
 * opcional, porque los de los pórticos de subestación y los de puesta a tierra no están en un poste,
 * y vaciarlo lo desvincula. Un perfil que ya tiene seccionador no admite otro (409 BUS-002). Uno sin
 * poste lleva su propio KP y su vía (V26 de mto-configuration); con poste son los del perfil, así
 * que elegirlo los vacía y no se ofrecen. Uno que pone dos vías en paralelo lleva además la otra
 * (V27), con poste o sin él; que no sea la suya lo dice el servicio, en su campo.
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
            kp: toText(row?.kp),
            trackId: toOption(row?.trackId),
            connectedTrackId: toOption(row?.connectedTrackId),
        },
        validate: {
            name: requiredText('El nombre es obligatorio', NAME_MAX_LENGTH),
            disconnectorFunction: required('La función es obligatoria'),
            kp: (value, values) => ownKpError(value, values.profileId),
        },
    })
    const onAPole = Boolean(form.values.profileId)
    const profileInput = form.getInputProps('profileId')
    const chooseProfile = (value) => {
        profileInput.onChange(value)
        if (value) {
            form.setFieldValue('kp', '')
            form.setFieldValue('trackId', null)
        }
    }

    const buildBody = (values) => masterBody(MASTERS.disconnectors.path, row ?? {}, {
        name: values.name.trim(),
        stationId: toId(values.stationId),
        profileId: toId(values.profileId),
        disconnectorFunction: lovChange(row?.disconnectorFunction, values.disconnectorFunction, catalogues[FUNCTIONS]),
        onLoad: values.onLoad,
        normallyOpen: normallyOpenOf(values.normallyOpen),
        driveType: values.driveType,
        // Recortado, como el del perfil; vacío, o con poste, viaja como null.
        kp: !values.profileId && values.kp.trim() ? values.kp.trim() : null,
        trackId: values.profileId ? null : toId(values.trackId),
        connectedTrackId: toId(values.connectedTrackId),
    })

    const currentProfile = row?.profileId === null || row?.profileId === undefined
        ? null
        : {value: String(row.profileId), label: disconnectorProfileLabel(row)}

    return (
        <MasterEditorModal master={MASTERS.disconnectors} creating={row === null} form={form} buildBody={buildBody}
                           onClose={onClose} size="lg">
            <TextInput label="Nombre" withAsterisk maxLength={NAME_MAX_LENGTH} data-autofocus {...form.getInputProps('name')}/>
            <SimpleGrid cols={{base: 1, sm: 2}}>
                <Select label="Estación" clearable searchable nothingFoundMessage="No hay ninguna"
                        description="Vacía si no es de ninguna estación: entonces en un poste o con su vía propia"
                        data={withCurrent(references.stationOptions, row?.stationId)} {...form.getInputProps('stationId')}/>
                <ProfilePicker label="Perfil" clearable description="Vacío si el seccionador no está en un poste"
                               current={currentProfile} {...profileInput} onChange={chooseProfile}/>
                <TextInput label="KP propio (m)" description="Solo sin poste: con poste, el del perfil"
                           disabled={onAPole} {...form.getInputProps('kp')}/>
                <Select label="Vía propia" clearable searchable nothingFoundMessage="No hay ninguna"
                        description="Solo sin poste: con poste, la del perfil" disabled={onAPole}
                        data={withCurrent(references.trackOptions, row?.trackId)} {...form.getInputProps('trackId')}/>
                <Select label="Vía conectada" clearable searchable nothingFoundMessage="No hay ninguna"
                        description="La otra vía, si pone dos en paralelo"
                        data={withCurrent(references.trackOptions, row?.connectedTrackId)}
                        {...form.getInputProps('connectedTrackId')}/>
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

/** El KP propio, solo sin poste: con poste se vacía, así que no se comprueba. */
function ownKpError(value, profileId) {
    const text = String(value ?? '').trim()
    if (!text || profileId) {
        return null
    }
    if (text.length > KP_MAX_LENGTH) {
        return `Como mucho ${KP_MAX_LENGTH} caracteres`
    }
    return KP_PATTERN.test(text) ? null : KP_MESSAGE
}
