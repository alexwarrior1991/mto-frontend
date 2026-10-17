import {Button, Checkbox, Group, Modal, Select, SimpleGrid, Stack, Textarea, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {PARKING_SITE_KIND} from '../../api/resources/enums.js'
import {newParkingSiteRequest, parkingSitePatch} from '../../api/resources/fleet.js'
import {unitLabel} from '../../api/resources/values.js'
import {saveErrors} from '../../ui/errors/saveErrors.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {ReferenceSelect} from '../maintenance/MaintenancePickers.jsx'
import {join} from './resourcesTexts.js'
import {maxLength, optionalCoordinate, optionalFleetKp, PARKING_SITE_LENGTHS, requiredText} from './resourcesForms.js'
import {useSaveParkingSite} from './useResources.js'

const asText = (id) => (id === null || id === undefined ? null : String(id))

/**
 * El alta y la modificación de un sitio de aparcamiento (el port de ParkingSiteEditorDialog). Lo
 * evidente se comprueba antes de llamar: se llega por vía, por carretera o por las dos; con acceso por
 * vía dice su vía; las coordenadas van juntas y en su rango, y el kp con su columna. EP, estación y vía
 * son de mto-configuration (las del EP elegido): sin config-read se ven como #id y no viajan.
 *
 * @param {object|null} site el sitio que se modifica, o null para el alta
 * @param {object} names los nombres de mto-configuration, con vías y estaciones
 */
export default function ParkingSiteEditorModal({site, names, onClose}) {
    const creating = site === null
    const reads = names.readsConfiguration
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            code: site?.code ?? '',
            name: site?.name ?? '',
            kind: site?.kind ?? null,
            executionPackageId: asText(site?.executionPackageId),
            stationId: asText(site?.stationId),
            trackId: asText(site?.trackId),
            kp: site?.kp == null ? '' : String(site.kp),
            railAccess: site?.railAccess === true,
            roadAccess: site ? site.roadAccess === true : true,
            address: site?.address ?? '',
            latitude: site?.latitude == null ? '' : String(site.latitude),
            longitude: site?.longitude == null ? '' : String(site.longitude),
            notes: site?.notes ?? '',
        },
        validate: {
            code: creating ? requiredText('El código es obligatorio', PARKING_SITE_LENGTHS.code) : null,
            name: requiredText('El nombre es obligatorio', PARKING_SITE_LENGTHS.name),
            kind: (value) => (value ? null : 'El tipo es obligatorio'),
            railAccess: (value, values) => {
                if (!value && !values.roadAccess) {
                    return 'Un sitio se alcanza por vía, por carretera o por las dos'
                }
                // Sin config-read la vía no se elige aquí: el acceso por vía vale si el sitio ya tenía vía.
                return !reads && value && !values.trackId ? 'Con acceso por vía dice su vía' : null
            },
            trackId: (value, values) => (reads && values.railAccess && !value ? 'Con acceso por vía dice su vía' : null),
            kp: optionalFleetKp,
            address: maxLength(PARKING_SITE_LENGTHS.address),
            latitude: (value, values) => optionalCoordinate(90)(value)
                ?? ((String(value ?? '').trim() === '') !== (String(values.longitude ?? '').trim() === '')
                    ? 'Las coordenadas van juntas: latitud y longitud' : null),
            longitude: optionalCoordinate(180),
        },
    })
    const saving = useSaveParkingSite()
    const packageId = form.values.executionPackageId === null ? null : Number(form.values.executionPackageId)
    const trackOptions = packageId === null ? names.trackOptions : names.trackOptionsIn(packageId)
    const stationOptions = packageId === null ? names.stationOptions : names.stationOptionsIn(packageId)

    const save = form.onSubmit((values) => {
        const body = creating ? newParkingSiteRequest(values, {readsConfiguration: reads})
            : parkingSitePatch(site, values, {readsConfiguration: reads})
        if (body === null) {
            onClose()
            return
        }
        saving.mutate({id: creating ? null : site.id, body}, {
            onSuccess: (saved) => {
                notifySuccess(`Guardado ${unitLabel(saved ?? site)}`)
                onClose()
            },
            onError: saveErrors(form),
        })
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="lg" title={creating ? 'Nuevo sitio de aparcamiento' : `Modificar ${unitLabel(site)}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <TextInput label="Código" withAsterisk={creating} readOnly={!creating} maxLength={PARKING_SITE_LENGTHS.code}
                                   {...form.getInputProps('code')}/>
                        <TextInput label="Nombre" withAsterisk maxLength={PARKING_SITE_LENGTHS.name} {...form.getInputProps('name')}/>
                        <Select label="Tipo" withAsterisk allowDeselect={false} data={PARKING_SITE_KIND.selectable()} {...form.getInputProps('kind')}/>
                        {reads
                            ? (
                                <>
                                    <ReferenceSelect label="EP" options={names.packageOptions} {...form.getInputProps('executionPackageId')}/>
                                    <ReferenceSelect label="Estación" options={stationOptions} {...form.getInputProps('stationId')}/>
                                    <ReferenceSelect label="Vía" options={trackOptions} {...form.getInputProps('trackId')}/>
                                </>
                            )
                            : (
                                <TextInput label="EP, estación y vía" readOnly description="Sin permiso para leer infraestructura: se quedan como están"
                                           value={site ? join(names.packageName(site.executionPackageId), names.stationName(site.stationId),
                                               names.trackName(site.trackId)) : ''}/>
                            )}
                        <TextInput label="KP" {...form.getInputProps('kp')}/>
                        <Checkbox label="Acceso por vía" mt="lg" {...form.getInputProps('railAccess', {type: 'checkbox'})}/>
                        <Checkbox label="Acceso por carretera" mt="lg" {...form.getInputProps('roadAccess', {type: 'checkbox'})}/>
                        <TextInput label="Dirección" maxLength={PARKING_SITE_LENGTHS.address} {...form.getInputProps('address')}/>
                        <TextInput label="Latitud" {...form.getInputProps('latitude')}/>
                        <TextInput label="Longitud" {...form.getInputProps('longitude')}/>
                    </SimpleGrid>
                    <Textarea label="Notas" rows={2} {...form.getInputProps('notes')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={saving.isPending}>Guardar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
