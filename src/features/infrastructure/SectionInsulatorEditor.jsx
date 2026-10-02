import {Checkbox, Select, SimpleGrid, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {useState} from 'react'
import {masterBody} from '../../api/configuration/masters.js'
import {formatQuantity} from '../../ui/format.js'
import ChildrenTable from './ChildrenTable.jsx'
import {optionalNumber, required, requiredText, toId, toNumber, toOption, toText} from './formValues.js'
import {installationOptions} from './installationTypes.js'
import {MASTERS} from './masterResources.js'
import MasterEditorModal from './MasterEditorModal.jsx'
import {withCurrent} from './references.js'
import SwitchModal from './SwitchModal.jsx'

const NAME_MAX_LENGTH = 200
const CONNECTION = 'TRACK_CONNECTION'

/**
 * Alta o modificación de un aislador de sección y de sus agujas (el port de SectionInsulatorEditor).
 * La vía conectada solo tiene sentido en una conexión de vías: en un aislador en medio de una vía se
 * deshabilita y se vacía. Las agujas son una colección de hijos (README_API.md §4 quater): sin tocar
 * van a null y se quedan como están; tocadas, va la lista entera y la que no va se borra.
 */
export default function SectionInsulatorEditor({row, references, onClose}) {
    const [switches, setSwitches] = useState({items: row?.switches ?? [], touched: false})
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            name: row?.name ?? '',
            stationId: toOption(row?.stationId),
            kp: toText(row?.kp),
            installationType: row?.installationType ?? null,
            trackId: toOption(row?.trackId),
            connectedTrackId: toOption(row?.connectedTrackId),
            enabled: row ? row.enabled !== false : true,
        },
        validate: {
            name: requiredText('El nombre es obligatorio', NAME_MAX_LENGTH),
            stationId: required('La estación es obligatoria'),
            kp: optionalNumber(),
            installationType: required('Hay que decir cómo está instalado'),
            trackId: required('La vía es obligatoria'),
            connectedTrackId: (value, values) => (values.installationType === CONNECTION && !value
                ? 'En una conexión de vías hay que decir la vía conectada'
                : null),
        },
    })

    const buildBody = (values) => masterBody(MASTERS.sectionInsulators.path, row ?? {}, {
        name: values.name.trim(),
        stationId: toId(values.stationId),
        kp: toNumber(values.kp),
        installationType: values.installationType,
        trackId: toId(values.trackId),
        connectedTrackId: toId(values.connectedTrackId),
        enabled: values.enabled,
    }, switches.touched ? {switches: switches.items} : {})

    const installation = form.getInputProps('installationType')
    const changeInstallation = (value) => {
        installation.onChange(value)
        if (value !== CONNECTION) {
            form.setFieldValue('connectedTrackId', null)
        }
    }
    const connection = form.getValues().installationType === CONNECTION
    const trackOptions = (current) => withCurrent(references.trackOptions, current)

    return (
        <MasterEditorModal master={MASTERS.sectionInsulators} creating={row === null} form={form} buildBody={buildBody}
                           onClose={onClose}>
            <TextInput label="Nombre" withAsterisk maxLength={NAME_MAX_LENGTH} data-autofocus {...form.getInputProps('name')}/>
            <SimpleGrid cols={{base: 1, sm: 2}}>
                <Select label="Estación" withAsterisk searchable nothingFoundMessage="No hay ninguna"
                        data={withCurrent(references.stationOptions, row?.stationId)} {...form.getInputProps('stationId')}/>
                <TextInput label="KP (m)" {...form.getInputProps('kp')}/>
                <Select label="Instalación" withAsterisk data={installationOptions(row?.installationType)}
                        {...installation} onChange={changeInstallation}/>
                <Select label="Vía" withAsterisk searchable nothingFoundMessage="No hay ninguna"
                        data={trackOptions(row?.trackId)} {...form.getInputProps('trackId')}/>
                <Select label="Vía conectada" withAsterisk={connection} disabled={!connection} searchable clearable
                        nothingFoundMessage="No hay ninguna" data={trackOptions(row?.connectedTrackId)}
                        {...form.getInputProps('connectedTrackId')}/>
            </SimpleGrid>
            <Checkbox label="Activo" {...form.getInputProps('enabled', {type: 'checkbox'})}/>
            <ChildrenTable title="Agujas" items={switches.items} emptyText="Sin agujas."
                           onChange={(items) => setSwitches({items, touched: true})}
                           itemLabel={(child, index) => `aguja ${child.code || index + 1}`}
                           columns={[
                               {key: 'code', label: 'Código', render: (child) => child.code},
                               {key: 'kp', label: 'KP (m)', render: (child) => formatQuantity(child.kp)},
                               {key: 'turnout', label: 'Tangente', render: (child) => turnoutLabel(child)},
                               {key: 'track', label: 'Vía', render: (child) => references.trackName(child.trackId)},
                               {key: 'enabled', label: 'Activa', render: (child) => (child.enabled === false ? 'No' : 'Sí')},
                           ]}
                           renderDialog={({child, onAccept, onClose: close}) => (
                               <SwitchModal child={child} trackOptions={trackOptions(child?.trackId)} onAccept={onAccept} onClose={close}/>
                           )}/>
        </MasterEditorModal>
    )
}

/** La tangente de una aguja como en el plano: 1:9. */
function turnoutLabel(child) {
    if (child.turnoutDenominator !== null && child.turnoutDenominator !== undefined) {
        return `1:${child.turnoutDenominator}`
    }
    return child.turnoutRate ?? ''
}
