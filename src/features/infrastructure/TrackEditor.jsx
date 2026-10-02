import {Checkbox, MultiSelect, Select, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {masterBody} from '../../api/configuration/masters.js'
import {required, requiredText, toId, toOption} from './formValues.js'
import {MASTERS} from './masterResources.js'
import MasterEditorModal from './MasterEditorModal.jsx'
import {withCurrent} from './references.js'

const NAME_MAX_LENGTH = 200

/**
 * Alta o modificación de una vía: nombre, paquete, las estaciones que atraviesa y si está activa. Las
 * estaciones viajan siempre como lista de ids. Sus perfiles no se tocan aquí: viajan a null.
 */
export default function TrackEditor({row, references, onClose}) {
    const stationIds = (row?.stationIds ?? []).map(String)
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            name: row?.name ?? '',
            executionPackageId: toOption(row?.executionPackageId),
            stationIds,
            enabled: row ? row.enabled !== false : true,
        },
        validate: {
            name: requiredText('El nombre es obligatorio', NAME_MAX_LENGTH),
            executionPackageId: required('El paquete de ejecución es obligatorio'),
        },
    })

    const buildBody = (values) => masterBody(MASTERS.tracks.path, row ?? {}, {
        name: values.name.trim(),
        executionPackageId: toId(values.executionPackageId),
        stationIds: values.stationIds.map(Number),
        enabled: values.enabled,
    })

    const stationOptions = stationIds.reduce((options, id) => withCurrent(options, id), references.stationOptions)

    return (
        <MasterEditorModal master={MASTERS.tracks} creating={row === null} form={form} buildBody={buildBody}
                           onClose={onClose} size="lg">
            <TextInput label="Nombre" withAsterisk maxLength={NAME_MAX_LENGTH} data-autofocus {...form.getInputProps('name')}/>
            <Select label="Paquete de ejecución" withAsterisk searchable nothingFoundMessage="No hay ninguno"
                    data={withCurrent(references.packageOptions, row?.executionPackageId)}
                    {...form.getInputProps('executionPackageId')}/>
            <MultiSelect label="Estaciones que atraviesa" searchable clearable nothingFoundMessage="No hay ninguna"
                         data={stationOptions} {...form.getInputProps('stationIds')}/>
            <Checkbox label="Activa" {...form.getInputProps('enabled', {type: 'checkbox'})}/>
        </MasterEditorModal>
    )
}
