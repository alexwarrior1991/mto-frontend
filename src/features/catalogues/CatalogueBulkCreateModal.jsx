import {Button, Group, Modal, Select, Stack, Text, Textarea} from '@mantine/core'
import {useState} from 'react'
import {bulkCreateLovs, newLovEntry} from '../../api/configuration/lovs.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {parseBulkLines} from './bulkLines.js'
import {entriesText, parentOptions} from './catalogueRows.js'
import {useCatalogue, useCatalogueMutation} from './useCatalogue.js'

/**
 * Alta en lote (POST /{recurso}/bulk, el port de LovBulkCreateDialog): una entrada por linea y todas
 * nacen activas. En los tres catalogos con tipo, el tipo se elige una vez para todas. El servicio
 * escribe el lote entero o nada; si lo rechaza, el aviso lo dice y el texto sigue aqui para corregirlo.
 */
export default function CatalogueBulkCreateModal({resource, catalogueTitle, onClose}) {
    const parent = resource.parent ?? null
    const [text, setText] = useState('')
    const [textError, setTextError] = useState(null)
    const [parentId, setParentId] = useState(null)
    const [parentError, setParentError] = useState(null)
    const parents = useCatalogue(parent?.path, {enabled: Boolean(parent)})
    const creating = useCatalogueMutation(resource.path, (entries) => bulkCreateLovs(resource.path, entries))

    const create = (event) => {
        event.preventDefault()
        const {entries, error} = parseBulkLines(text)
        const missingParent = Boolean(parent) && !parentId
        setTextError(error)
        setParentError(missingParent ? 'El tipo es obligatorio' : null)
        if (error || missingParent) {
            return
        }
        const body = entries.map((entry) => newLovEntry(resource, {...entry, enabled: true, parentId}))
        creating.mutate(body, {
            onSuccess: (created) => {
                notifySuccess(entriesText(Array.isArray(created) ? created.length : body.length, 'creada'))
                onClose()
            },
        })
    }

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="lg" title={`Alta múltiple en ${catalogueTitle}`}>
            <form onSubmit={create} noValidate>
                <Stack>
                    <Text size="sm">
                        Una entrada por línea: código, separador («;», tabulador o « - ») y descripción. Todas nacen activas.
                    </Text>
                    {parent && (
                        <Select label={parent.label} description="El mismo para todas" withAsterisk searchable
                                nothingFoundMessage="No hay ninguno" data={parentOptions(parents.data)}
                                value={parentId} onChange={setParentId} error={parentError}/>
                    )}
                    <Textarea label="Entradas" rows={10} resize="vertical" data-autofocus
                              placeholder={'PT1;Poste tipo 1\nPT2;Poste tipo 2'}
                              value={text} onChange={(event) => setText(event.currentTarget.value)} error={textError}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={creating.isPending}>Crear</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
