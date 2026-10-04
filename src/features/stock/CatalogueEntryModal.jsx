import {Checkbox, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {catalogueEntryBody} from '../../api/stock/catalogues.js'
import CatalogueEditorFrame from './CatalogueEditorFrame.jsx'
import {CODE_MAX_LENGTH, NAME_MAX_LENGTH, requiredText} from './stockForms.js'

/**
 * El alta o la modificación de un almacén, un proveedor o un proyecto (el port de
 * CatalogueEditorDialog): código y nombre y, al modificar, el estado, porque retirar uno es
 * modificarlo con active=false. El alta no lleva estado: el servicio lo crea activo. Aquí solo se
 * exige lo evidente; un código repetido lo dice el servicio (409), que recargar no arregla.
 *
 * @param {{catalogue: string, singular: string}} catalogue la entrada de CATALOGUES
 * @param {object|null} row la fila que se modifica, o null para un alta
 */
export default function CatalogueEntryModal({catalogue, row, onClose}) {
    const creating = row === null
    const form = useForm({
        mode: 'controlled',
        initialValues: {code: row?.code ?? '', name: row?.name ?? '', active: row ? row.active === true : true},
        validate: {
            code: requiredText('El código es obligatorio', CODE_MAX_LENGTH),
            name: requiredText('El nombre es obligatorio', NAME_MAX_LENGTH),
        },
    })

    return (
        <CatalogueEditorFrame catalogue={catalogue.catalogue} row={row} form={form} onClose={onClose}
                              title={creating ? `Alta de ${catalogue.singular}` : `Modificar ${catalogue.singular} ${row.code}`}
                              buildBody={(values) => catalogueEntryBody(values, {creating})}>
            <TextInput label="Código" withAsterisk maxLength={CODE_MAX_LENGTH} data-autofocus {...form.getInputProps('code')}/>
            <TextInput label="Nombre" withAsterisk maxLength={NAME_MAX_LENGTH} {...form.getInputProps('name')}/>
            {!creating && (
                <Checkbox label="Activo" description="Desmarcarlo lo retira: deja de poder usarse en movimientos y reservas nuevos"
                          {...form.getInputProps('active', {type: 'checkbox'})}/>
            )}
        </CatalogueEditorFrame>
    )
}
