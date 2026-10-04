import {Checkbox, SimpleGrid, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {assemblyBody} from '../../api/stock/catalogues.js'
import BomEditor from './BomEditor.jsx'
import CatalogueEditorFrame from './CatalogueEditorFrame.jsx'
import {CODE_MAX_LENGTH, NAME_MAX_LENGTH, requiredText, toQuantityText} from './stockForms.js'

const EMPTY_BOM = 'La lista de materiales no puede ir vacía: un conjunto es lo que lo compone'

/**
 * El alta o la modificación de un conjunto (el port de AssemblyEditorDialog): código, nombre, al
 * modificar el estado, y su lista de materiales, que va entera y no puede ir vacía, porque un conjunto
 * es lo que lo compone y no tiene stock propio. Una lista vacía se rechaza aquí, antes de llamar.
 *
 * Las líneas van en el campo components del formulario, como en la petición: un error del servicio
 * sobre la lista (un material repetido, por ejemplo) cae bajo ella, y uno sobre una línea, en su fila.
 *
 * @param {object|null} row el conjunto que se modifica, o null para un alta
 */
export default function AssemblyEditorModal({row, onClose}) {
    const creating = row === null
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            code: row?.code ?? '',
            name: row?.name ?? '',
            active: row ? row.active === true : true,
            components: (row?.components ?? []).map(toLine),
        },
        validate: {
            code: requiredText('El código es obligatorio', CODE_MAX_LENGTH),
            name: requiredText('El nombre es obligatorio', NAME_MAX_LENGTH),
            components: (lines) => (lines.length === 0 ? EMPTY_BOM : null),
        },
    })
    const lineError = (index) => form.errors[`components.${index}.quantity`] ?? form.errors[`components.${index}.materialId`] ?? null

    return (
        <CatalogueEditorFrame catalogue="assemblies" row={row} form={form} onClose={onClose} size="xl"
                              title={creating ? 'Alta de conjunto' : `Modificar conjunto ${row.code}`}
                              buildBody={(values) => assemblyBody(values, values.components, {creating})}>
            <SimpleGrid cols={{base: 1, sm: 2}}>
                <TextInput label="Código" withAsterisk maxLength={CODE_MAX_LENGTH} data-autofocus {...form.getInputProps('code')}/>
                <TextInput label="Nombre" withAsterisk maxLength={NAME_MAX_LENGTH} {...form.getInputProps('name')}/>
            </SimpleGrid>
            {!creating && <Checkbox label="Activo" description="Desmarcarlo lo retira" {...form.getInputProps('active', {type: 'checkbox'})}/>}
            <BomEditor {...form.getInputProps('components')} lineError={lineError}/>
        </CatalogueEditorFrame>
    )
}

function toLine(component) {
    return {materialId: component.material?.id, material: component.material, quantity: toQuantityText(component.quantity)}
}
