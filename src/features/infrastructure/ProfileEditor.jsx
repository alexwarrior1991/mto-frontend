import {MultiSelect, Select, SimpleGrid, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {useState} from 'react'
import {masterBody} from '../../api/configuration/masters.js'
import {formatQuantity} from '../../ui/format.js'
import CantileverModal from './CantileverModal.jsx'
import ChildrenTable from './ChildrenTable.jsx'
import {
    codeOf, KP_MESSAGE, KP_PATTERN, lovChange, lovListChange, lovListOptions, lovOptions, lovValue, lovValues,
    optionalNumber, required, requiredText, toId, toNumber, toOption, toText,
} from './formValues.js'
import {MASTERS} from './masterResources.js'
import MasterEditorModal from './MasterEditorModal.jsx'
import {withCurrent} from './references.js'
import {useCatalogues} from './useCatalogues.js'

const PROFILE_ID_MAX_LENGTH = 50
/** El tope del servicio (PROFILE_MAX_CANTILEVERS): «Añadir» se apaga al llegar. */
const MAX_CANTILEVERS = 3

/** Las referencias a catálogo de una sola entrada; todas opcionales salvo el estado. */
const SINGLE_LOVS = Object.freeze([
    {field: 'profileStatus', path: 'profile-statuses', label: 'Estado', required: true},
    {field: 'poleType', path: 'pole-types', label: 'Tipo de poste'},
    {field: 'foundation', path: 'foundations', label: 'Cimentación'},
    {field: 'anchorageFoundation', path: 'anchorage-foundations', label: 'Cimentación de anclaje'},
    {field: 'portal', path: 'portals', label: 'Pórtico'},
    {field: 'returnSupport', path: 'return-supports', label: 'Soporte de retorno'},
    {field: 'supportType', path: 'support-types', label: 'Tipo de soporte'},
    {field: 'assemblyConfiguration', path: 'assembly-configurations', label: 'Configuración de montaje'},
])

/** Las tres de varias entradas (README_API.md §4 ter): viajan siempre enteras. */
const MULTI_LOVS = Object.freeze([
    {field: 'sectionings', path: 'sectionings', label: 'Seccionamientos'},
    {field: 'anchorages', path: 'anchorages', label: 'Anclajes'},
    {field: 'sectioningFeedings', path: 'disconnector-functions', label: 'Aparatos de seccionamiento y alimentación'},
])

/** Las medidas del perfil, con las unidades de README_API.md §4 bis; todas opcionales. */
const MEASURES = Object.freeze([
    {field: 'span', label: 'Vano hasta el siguiente (m)', validate: optionalNumber()},
    {field: 'heightCantileverSupport', label: 'Altura del soporte de ménsula (mm)', validate: optionalNumber({integer: true})},
    {field: 'poleGaugeLocation', label: 'Separación del poste al gálibo (mm)', validate: optionalNumber({integer: true})},
    {
        field: 'railPoleDistance', label: 'Distancia carril-poste (mm, con signo)',
        validate: optionalNumber({integer: true, signed: true}),
    },
])

const CATALOGUES = Object.freeze([
    ...SINGLE_LOVS.map((lov) => lov.path), ...MULTI_LOVS.map((lov) => lov.path), 'cantilever-types', 'steady-arm-types',
])

/**
 * Alta o modificación de un perfil (el port de ProfileEditor): identificador, KP, vía, las referencias
 * a catálogo, las medidas y sus ménsulas, hasta tres, cada una con su brazo de atirantado.
 *
 * - Una referencia opcional que se vacía viaja como {}: para el servicio null es «no la toques».
 * - Las ménsulas siguen la regla de las colecciones de hijos: sin tocar van a null y se quedan como
 *   están; tocadas, va la lista entera.
 * - El seccionador que cuelga del perfil se enseña pero no se cambia aquí, y viaja como se leyó. El
 *   vínculo es del seccionador: desde el perfil, null no lo desvincula y otro se copiaría encima del
 *   actual (README_API.md §4).
 * - El orden en la vía lo fija la importación del maestro y vuelve como se leyó.
 */
export default function ProfileEditor({row, references, onClose}) {
    const catalogues = useCatalogues(CATALOGUES)
    const [cantilevers, setCantilevers] = useState({items: row?.cantilevers ?? [], touched: false})

    const form = useForm({
        mode: 'controlled',
        initialValues: {
            profileId: row?.profileId ?? '',
            kp: toText(row?.kp),
            trackId: toOption(row?.trackId),
            ...Object.fromEntries(SINGLE_LOVS.map((lov) => [lov.field, lovValue(row?.[lov.field])])),
            ...Object.fromEntries(MULTI_LOVS.map((lov) => [lov.field, lovValues(row?.[lov.field])])),
            ...Object.fromEntries(MEASURES.map((measure) => [measure.field, toText(row?.[measure.field])])),
        },
        validate: {
            profileId: requiredText('El identificador es obligatorio', PROFILE_ID_MAX_LENGTH),
            kp: (value) => {
                const text = String(value ?? '').trim()
                if (!text) {
                    return 'El KP es obligatorio'
                }
                return KP_PATTERN.test(text) ? null : KP_MESSAGE
            },
            trackId: required('La vía es obligatoria'),
            profileStatus: required('El estado es obligatorio'),
            ...Object.fromEntries(MEASURES.map((measure) => [measure.field, measure.validate])),
        },
    })

    const buildBody = (values) => {
        const changes = {
            profileId: values.profileId.trim(),
            kp: values.kp.trim(),
            trackId: toId(values.trackId),
            ...Object.fromEntries(SINGLE_LOVS.map((lov) => [lov.field, lovChange(row?.[lov.field], values[lov.field], catalogues[lov.path])])),
            ...Object.fromEntries(MULTI_LOVS.map((lov) => [lov.field, lovListChange(row?.[lov.field], values[lov.field], catalogues[lov.path])])),
            ...Object.fromEntries(MEASURES.map((measure) => [measure.field, toNumber(values[measure.field])])),
        }
        return masterBody(MASTERS.profiles.path, row ?? {}, changes, cantilevers.touched ? {cantilevers: cantilevers.items} : {})
    }

    return (
        <MasterEditorModal master={MASTERS.profiles} creating={row === null} form={form} buildBody={buildBody} onClose={onClose}>
            <SimpleGrid cols={{base: 1, sm: 2}}>
                <TextInput label="Identificador" withAsterisk maxLength={PROFILE_ID_MAX_LENGTH} data-autofocus
                           {...form.getInputProps('profileId')}/>
                <TextInput label="KP" withAsterisk description="Metros, con punto decimal: 10.500" {...form.getInputProps('kp')}/>
                <Select label="Vía" withAsterisk searchable nothingFoundMessage="No hay ninguna"
                        data={withCurrent(references.trackOptions, row?.trackId)} {...form.getInputProps('trackId')}/>
                <TextInput label="Orden en la vía" readOnly value={toText(row?.orderInTrack)}
                           description="Lo fija la importación del maestro"/>
                {SINGLE_LOVS.map((lov) => (
                    <Select key={lov.field} label={lov.label} withAsterisk={lov.required} searchable clearable={!lov.required}
                            nothingFoundMessage="No hay ninguna" data={lovOptions(catalogues[lov.path], row?.[lov.field])}
                            {...form.getInputProps(lov.field)}/>
                ))}
            </SimpleGrid>
            {MULTI_LOVS.map((lov) => (
                <MultiSelect key={lov.field} label={lov.label} searchable clearable nothingFoundMessage="No hay ninguna"
                             data={lovListOptions(catalogues[lov.path], row?.[lov.field])} {...form.getInputProps(lov.field)}/>
            ))}
            <SimpleGrid cols={{base: 1, sm: 2}}>
                {MEASURES.map((measure) => (
                    <TextInput key={measure.field} label={measure.label} {...form.getInputProps(measure.field)}/>
                ))}
            </SimpleGrid>
            <TextInput label="Seccionador" readOnly value={disconnectorText(row?.disconnector)}
                       description="El que cuelga de este perfil. Se vincula desde Seccionadores, en el editor del seccionador."/>
            <ChildrenTable title="Ménsulas" items={cantilevers.items} max={MAX_CANTILEVERS} emptyText="Sin ménsulas."
                           onChange={(items) => setCantilevers({items, touched: true})}
                           itemLabel={(child, index) => cantileverLabel(child, index)}
                           columns={CANTILEVER_COLUMNS}
                           renderDialog={({child, onAccept, onClose: close}) => (
                               <CantileverModal child={child} cantileverTypes={catalogues['cantilever-types']}
                                                steadyArmTypes={catalogues['steady-arm-types']} onAccept={onAccept} onClose={close}/>
                           )}/>
        </MasterEditorModal>
    )
}

const CANTILEVER_COLUMNS = Object.freeze([
    {key: 'type', label: 'Tipo', render: (child) => codeOf(child.cantileverType)},
    {key: 'cwHeight', label: 'Altura del hilo (m)', render: (child) => formatQuantity(child.cwHeight)},
    {key: 'stagger', label: 'Descentramiento (mm)', render: (child) => formatQuantity(child.stagger)},
    {key: 'catenaryHeight', label: 'Altura del sustentador (m)', render: (child) => formatQuantity(child.catenaryHeight)},
    {key: 'steadyArm', label: 'Brazo de atirantado', render: (child) => armOf(child)},
])

function cantileverLabel(child, index) {
    const type = codeOf(child.cantileverType)
    return `ménsula ${index + 1}${type ? ` (${type})` : ''}`
}

function armOf(child) {
    const arm = child.steadyArm
    if (!arm) {
        return 'Sin brazo'
    }
    const length = arm.length === null || arm.length === undefined ? '' : ` ${arm.length} mm`
    return `${codeOf(arm.steadyArmType)}${length}`.trim()
}

function disconnectorText(disconnector) {
    if (!disconnector) {
        return 'Ninguno'
    }
    const name = disconnector.name ?? `#${disconnector.id}`
    const functionCode = codeOf(disconnector.disconnectorFunction)
    return functionCode ? `${name} (${functionCode})` : name
}
