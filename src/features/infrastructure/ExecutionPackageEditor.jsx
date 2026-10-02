import {Checkbox, Select, SimpleGrid, TextInput} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {masterBody} from '../../api/configuration/masters.js'
import {DATE_FORMAT, parseTypedDate} from './dates.js'
import {optionalNumber, required, requiredText, toId, toNumber, toOption, toText} from './formValues.js'
import {MASTERS} from './masterResources.js'
import MasterEditorModal from './MasterEditorModal.jsx'
import {withCurrent} from './references.js'

const NAME_MAX_LENGTH = 200
const WHOLE_NUMBER = optionalNumber({integer: true})

/**
 * Alta o modificación de un paquete de ejecución (el port de ExecutionPackageEditor): nombre,
 * empresa, longitud, fechas, si es el paquete inicial y si está activo. Sus vías y sus estaciones no
 * se tocan aquí: viajan a null.
 */
export default function ExecutionPackageEditor({row, references, onClose}) {
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            name: row?.name ?? '',
            companyId: toOption(row?.companyId),
            length: toText(row?.length),
            startDate: row?.startDate ?? null,
            endDate: row?.endDate ?? null,
            initialPackage: row?.initialPackage === true,
            enabled: row ? row.enabled !== false : true,
        },
        validate: {
            name: requiredText('El nombre es obligatorio', NAME_MAX_LENGTH),
            companyId: required('La empresa es obligatoria'),
            length: (value) => (String(value ?? '').trim() ? WHOLE_NUMBER(value) : 'La longitud es obligatoria'),
            startDate: required('La fecha de inicio es obligatoria'),
            endDate: required('La fecha de fin es obligatoria'),
        },
    })

    const buildBody = (values) => masterBody(MASTERS.executionPackages.path, row ?? {}, {
        name: values.name.trim(),
        companyId: toId(values.companyId),
        length: toNumber(values.length),
        startDate: values.startDate,
        endDate: values.endDate,
        initialPackage: values.initialPackage,
        enabled: values.enabled,
    })

    return (
        <MasterEditorModal master={MASTERS.executionPackages} creating={row === null} form={form} buildBody={buildBody}
                           onClose={onClose} size="lg">
            <TextInput label="Nombre" withAsterisk maxLength={NAME_MAX_LENGTH} data-autofocus {...form.getInputProps('name')}/>
            <SimpleGrid cols={{base: 1, sm: 2}}>
                <Select label="Empresa" withAsterisk searchable nothingFoundMessage="No hay ninguna"
                        data={withCurrent(references.companyOptions, row?.companyId)} {...form.getInputProps('companyId')}/>
                <TextInput label="Longitud" withAsterisk {...form.getInputProps('length')}/>
                <DateInput label="Inicio" withAsterisk valueFormat={DATE_FORMAT} dateParser={parseTypedDate}
                           placeholder="DD/MM/AAAA" {...form.getInputProps('startDate')}/>
                <DateInput label="Fin" withAsterisk valueFormat={DATE_FORMAT} dateParser={parseTypedDate}
                           placeholder="DD/MM/AAAA" {...form.getInputProps('endDate')}/>
            </SimpleGrid>
            <Checkbox label="Paquete inicial" {...form.getInputProps('initialPackage', {type: 'checkbox'})}/>
            <Checkbox label="Activo" {...form.getInputProps('enabled', {type: 'checkbox'})}/>
        </MasterEditorModal>
    )
}
