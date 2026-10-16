import {Button, Group, Modal, Select, SimpleGrid, Stack, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {PERSON_CATEGORY, PERSON_EMPLOYER} from '../../api/resources/enums.js'
import {newPersonRequest, personPatch} from '../../api/resources/people.js'
import {personLabel} from '../../api/resources/values.js'
import {saveErrors} from '../../ui/errors/saveErrors.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {companyOfSubcontractor, maxLength, PERSON_LENGTHS, required, requiredText} from './resourcesForms.js'
import {useSavePerson} from './useResources.js'

/**
 * El alta y la modificación de una persona (el port de PersonEditorDialog).
 *
 * - Solo se exige lo evidente: nombre, apellidos y categoría, la empresa de una subcontrata y la
 *   longitud de cada columna. Que un usuario o un número de empleado no se repitan (409 PER-409), o que
 *   la categoría nueva siga valiendo para lo que dirige (409 UNI-001), lo dice el servicio con el diálogo
 *   abierto.
 * - La modificación es un merge-patch con lo que cambió y la versión leída; vaciar lo opcional viaja a
 *   null. Sin cambios, se cierra sin llamar.
 *
 * @param {object|null} person la persona que se modifica, o null para el alta
 */
export default function PersonEditorModal({person, onClose}) {
    const creating = person === null
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            firstName: person?.firstName ?? '',
            lastName: person?.lastName ?? '',
            category: PERSON_CATEGORY.isKnown(person?.category) ? person.category : null,
            employer: PERSON_EMPLOYER.isKnown(person?.employer) ? person.employer : 'OWN',
            company: person?.company ?? '',
            employeeNumber: person?.employeeNumber ?? '',
            username: person?.username ?? '',
            phone: person?.phone ?? '',
        },
        validate: {
            firstName: requiredText('El nombre es obligatorio', PERSON_LENGTHS.firstName),
            lastName: requiredText('Los apellidos son obligatorios', PERSON_LENGTHS.lastName),
            category: required('La categoría es obligatoria'),
            employer: required('El empleo es obligatorio'),
            company: companyOfSubcontractor,
            employeeNumber: maxLength(PERSON_LENGTHS.employeeNumber),
            username: maxLength(PERSON_LENGTHS.username),
            phone: maxLength(PERSON_LENGTHS.phone),
        },
    })
    const saving = useSavePerson()

    const save = form.onSubmit((values) => {
        const body = creating ? newPersonRequest(values) : personPatch(person, values)
        if (body === null) {
            onClose()
            return
        }
        saving.mutate({id: creating ? null : person.id, body}, {
            onSuccess: (saved) => {
                notifySuccess(`Guardado ${personLabel(saved ?? person)}`)
                onClose()
            },
            onError: saveErrors(form),
        })
    })

    const subcontractor = form.values.employer === 'SUBCONTRACTOR'
    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="lg" title={creating ? 'Nueva persona' : `Modificar ${personLabel(person)}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <TextInput label="Nombre" withAsterisk maxLength={PERSON_LENGTHS.firstName} {...form.getInputProps('firstName')}/>
                        <TextInput label="Apellidos" withAsterisk maxLength={PERSON_LENGTHS.lastName} {...form.getInputProps('lastName')}/>
                        <Select label="Categoría" withAsterisk data={PERSON_CATEGORY.selectable()} allowDeselect={false}
                                {...form.getInputProps('category')}/>
                        <Select label="Empleo" withAsterisk data={PERSON_EMPLOYER.selectable()} allowDeselect={false}
                                {...form.getInputProps('employer')}/>
                        {subcontractor && (
                            <TextInput label="Empresa" withAsterisk maxLength={PERSON_LENGTHS.company} {...form.getInputProps('company')}/>
                        )}
                        <TextInput label="Número de empleado" maxLength={PERSON_LENGTHS.employeeNumber} {...form.getInputProps('employeeNumber')}/>
                        <TextInput label="Usuario" description="Su usuario de Keycloak, si entra en las aplicaciones"
                                   maxLength={PERSON_LENGTHS.username} {...form.getInputProps('username')}/>
                        <TextInput label="Teléfono" maxLength={PERSON_LENGTHS.phone} {...form.getInputProps('phone')}/>
                    </SimpleGrid>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={saving.isPending}>Guardar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
