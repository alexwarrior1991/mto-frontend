import {Select, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {masterBody} from '../../api/configuration/masters.js'
import {required, requiredText, toId, toOption} from './formValues.js'
import {MASTERS} from './masterResources.js'
import MasterEditorModal from './MasterEditorModal.jsx'
import {withCurrent} from './references.js'

const NAME_MAX_LENGTH = 200

/**
 * Alta o modificación de una estación: nombre y paquete de ejecución. Sus vías, sus seccionadores y
 * sus aisladores no se tocan aquí: viajan a null.
 */
export default function StationEditor({row, references, onClose}) {
    const form = useForm({
        mode: 'controlled',
        initialValues: {name: row?.name ?? '', executionPackageId: toOption(row?.executionPackageId)},
        validate: {
            name: requiredText('El nombre es obligatorio', NAME_MAX_LENGTH),
            executionPackageId: required('El paquete de ejecución es obligatorio'),
        },
    })

    const buildBody = (values) => masterBody(MASTERS.stations.path, row ?? {}, {
        name: values.name.trim(),
        executionPackageId: toId(values.executionPackageId),
    })

    return (
        <MasterEditorModal master={MASTERS.stations} creating={row === null} form={form} buildBody={buildBody}
                           onClose={onClose} size="md">
            <TextInput label="Nombre" withAsterisk maxLength={NAME_MAX_LENGTH} data-autofocus {...form.getInputProps('name')}/>
            <Select label="Paquete de ejecución" withAsterisk searchable nothingFoundMessage="No hay ninguno"
                    data={withCurrent(references.packageOptions, row?.executionPackageId)}
                    {...form.getInputProps('executionPackageId')}/>
        </MasterEditorModal>
    )
}
