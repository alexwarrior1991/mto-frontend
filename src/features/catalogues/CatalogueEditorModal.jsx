import {Button, Checkbox, Group, Modal, Select, Stack, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {ApiError} from '../../api/errors.js'
import {changedLovEntry, createLov, newLovEntry, updateLov} from '../../api/configuration/lovs.js'
import {notifyApiError, notifyMessages} from '../../ui/errors/notifyError.js'
import {applyServerErrors} from '../../ui/errors/serverValidation.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {parentOptions} from './catalogueRows.js'
import {CODE_MAX_LENGTH, DESCRIPTION_MAX_LENGTH} from './limits.js'
import {useCatalogue, useCatalogueMutation} from './useCatalogue.js'

/**
 * Alta o modificacion de una entrada (el port de LovEditorDialog). Solo se exige lo evidente: codigo
 * y descripcion obligatorios y la longitud de su columna, y el tipo en los tres catalogos que lo
 * llevan. El resto lo dice el servicio, campo a campo, con el dialogo abierto y lo escrito intacto;
 * lo que no tiene campo (una version vieja, un codigo repetido) es un aviso con su «Referencia».
 *
 * Las propiedades del formulario se llaman como los campos del servicio, para que sus errores
 * (errors[].field) caigan en su sitio.
 *
 * @param {object|null} entry la fila leida que se modifica, o null para un alta
 */
export default function CatalogueEditorModal({resource, catalogueTitle, entry, onClose}) {
    const creating = entry === null
    const parent = resource.parent ?? null
    const form = useForm({
        mode: 'controlled',
        initialValues: initialValues(parent, entry),
        validate: {
            code: (value) => requiredText(value, CODE_MAX_LENGTH, 'El código es obligatorio'),
            description: (value) => requiredText(value, DESCRIPTION_MAX_LENGTH, 'La descripción es obligatoria'),
            ...(parent ? {[parent.field]: (value) => (value ? null : 'El tipo es obligatorio')} : {}),
        },
    })
    const parents = useCatalogue(parent?.path, {enabled: Boolean(parent)})
    const saving = useCatalogueMutation(
        resource.path,
        (body) => (creating ? createLov(resource.path, body) : updateLov(resource.path, body)),
        {handlesErrors: true},
    )

    const save = form.onSubmit((values) => {
        const changes = {
            code: values.code.trim(),
            description: values.description.trim(),
            enabled: values.enabled,
            parentId: parent ? values[parent.field] : null,
        }
        const body = creating ? newLovEntry(resource, changes) : changedLovEntry(resource, entry, changes)
        saving.mutate(body, {
            onSuccess: () => {
                notifySuccess('Guardado')
                onClose()
            },
            onError: (error) => {
                if (error instanceof ApiError && error.hasFieldErrors) {
                    notifyMessages(applyServerErrors(form, error))
                } else {
                    notifyApiError(error)
                }
            },
        })
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false}
               title={`${creating ? 'Nueva entrada de' : 'Modificar entrada de'} ${catalogueTitle}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <TextInput label="Código" withAsterisk maxLength={CODE_MAX_LENGTH} data-autofocus
                               {...form.getInputProps('code')}/>
                    <TextInput label="Descripción" withAsterisk maxLength={DESCRIPTION_MAX_LENGTH}
                               {...form.getInputProps('description')}/>
                    {parent && (
                        <Select label={parent.label} withAsterisk searchable nothingFoundMessage="No hay ninguno"
                                placeholder={parents.isPending ? 'Cargando…' : undefined}
                                data={parentOptions(parents.data, entry?.[parent.field])}
                                {...form.getInputProps(parent.field)}/>
                    )}
                    <Checkbox label="Activo" {...form.getInputProps('enabled', {type: 'checkbox'})}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={saving.isPending}>Guardar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}

function initialValues(parent, entry) {
    const values = {
        code: entry?.code ?? '',
        description: entry?.description ?? '',
        enabled: entry ? entry.enabled === true : true,
    }
    if (parent) {
        const id = entry?.[parent.field]?.id
        values[parent.field] = id === null || id === undefined ? null : String(id)
    }
    return values
}

function requiredText(value, maxLength, requiredMessage) {
    const text = (value ?? '').trim()
    if (!text) {
        return requiredMessage
    }
    return text.length > maxLength ? `Como mucho ${maxLength} caracteres` : null
}
