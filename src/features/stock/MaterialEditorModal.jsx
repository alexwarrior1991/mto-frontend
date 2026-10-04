import {Checkbox, SimpleGrid, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {materialBody} from '../../api/stock/catalogues.js'
import CatalogueEditorFrame from './CatalogueEditorFrame.jsx'
import {CODE_MAX_LENGTH, minimumStock, NAME_MAX_LENGTH, requiredText, toQuantityText, UNIT_MAX_LENGTH} from './stockForms.js'

/**
 * El alta o la modificación de un material (el port de MaterialEditorDialog): código, nombre, la
 * unidad (texto libre en el servicio) y el stock mínimo con el que el servicio dice «bajo mínimo»; al
 * modificar, también el estado. Un material retirado no admite movimientos ni reservas nuevos (el
 * servicio responde 400 VAL-001).
 *
 * @param {object|null} row el material que se modifica, o null para un alta
 */
export default function MaterialEditorModal({row, onClose}) {
    const creating = row === null
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            code: row?.code ?? '',
            name: row?.name ?? '',
            unitOfMeasure: row?.unitOfMeasure ?? '',
            minimumStockLevel: row ? toQuantityText(row.minimumStockLevel) : '0',
            active: row ? row.active === true : true,
        },
        validate: {
            code: requiredText('El código es obligatorio', CODE_MAX_LENGTH),
            name: requiredText('El nombre es obligatorio', NAME_MAX_LENGTH),
            unitOfMeasure: requiredText('La unidad es obligatoria', UNIT_MAX_LENGTH),
            minimumStockLevel: minimumStock,
        },
    })

    return (
        <CatalogueEditorFrame catalogue="materials" row={row} form={form} onClose={onClose}
                              title={creating ? 'Alta de material' : `Modificar material ${row.code}`}
                              buildBody={(values) => materialBody(values, {creating})}>
            <SimpleGrid cols={{base: 1, sm: 2}}>
                <TextInput label="Código" withAsterisk maxLength={CODE_MAX_LENGTH} data-autofocus {...form.getInputProps('code')}/>
                <TextInput label="Unidad de medida" withAsterisk description="m, kg, ud…" maxLength={UNIT_MAX_LENGTH}
                           {...form.getInputProps('unitOfMeasure')}/>
            </SimpleGrid>
            <TextInput label="Nombre" withAsterisk maxLength={NAME_MAX_LENGTH} {...form.getInputProps('name')}/>
            <TextInput label="Stock mínimo" withAsterisk inputMode="decimal"
                       description="Con el disponible por debajo, el material sale como bajo mínimo" {...form.getInputProps('minimumStockLevel')}/>
            {!creating && (
                <Checkbox label="Activo" description="Desmarcarlo lo retira: sin movimientos ni reservas nuevos"
                          {...form.getInputProps('active', {type: 'checkbox'})}/>
            )}
        </CatalogueEditorFrame>
    )
}
