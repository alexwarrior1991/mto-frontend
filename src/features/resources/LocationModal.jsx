import {Button, Group, Modal, Select, SimpleGrid, Stack, Textarea, TextInput} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {LOCATION_KIND, recordableKinds, VEHICLE_ATTACHMENT} from '../../api/resources/enums.js'
import {locationFields, locationRequest, searchVehicles} from '../../api/resources/vehicles.js'
import {unitLabel} from '../../api/resources/values.js'
import {saveErrors} from '../../ui/errors/saveErrors.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import ServerSearchSelect from '../../ui/ServerSearchSelect.jsx'
import {DATE_TIME_FORMAT, parseTypedDateTime} from '../../ui/typedDates.js'
import {ReferenceSelect} from '../maintenance/MaintenancePickers.jsx'
import {optionalCoordinate, optionalFleetKp} from './resourcesForms.js'
import {resourcesKey, useReachableSites, useRecordLocation} from './useResources.js'

/**
 * Registrar dónde está un vehículo, a mano (el port de VehicleLocationDialog, resources-location-write).
 * Solo se ofrecen los tipos que admite su movilidad y los campos de cada tipo; en uno de solo vía, los
 * sitios con acceso por vía, y en uno de solo carretera, los que tienen acceso por carretera. Lo
 * evidente se comprueba antes de llamar; lo demás lo dice el servicio (409 VEH-001) con el diálogo
 * abierto.
 *
 * @param {object} names los nombres de mto-configuration, con las vías
 */
export default function LocationModal({vehicle, names, onClose}) {
    const mobility = vehicle.type?.mobility ?? null
    const reads = names.readsConfiguration
    const sites = useReachableSites(mobility)
    const recording = useRecordLocation(vehicle.id)
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            kind: 'PARKED', parkingSiteId: null, executionPackageId: null, trackId: null, kp: '', accessPoint: '', latitude: '', longitude: '',
            description: '', carrierVehicleId: null, attachment: null, observedAt: null,
        },
        validate: {
            parkingSiteId: (value, values) => {
                if (values.kind !== 'PARKED') {
                    return null
                }
                const shown = locationFields('PARKED', mobility, {readsConfiguration: reads})
                const track = shown.trackId && values.trackId
                if (!value && !track && !values.description.trim() && !(shown.coordinates && values.latitude.trim())) {
                    return 'Aparcado dice dónde: un sitio, una vía y un kp, una descripción o unas coordenadas'
                }
                return mobility === 'RAIL_ONLY' && !value && !track
                    ? 'Uno de solo vía se aparca sobre una vía: un sitio con acceso por vía, o una vía y un kp' : null
            },
            trackId: (value, values) => (values.kind === 'ON_TRACK' && !value ? 'En vía dice su vía' : null),
            kp: optionalFleetKp,
            latitude: (value, values) => optionalCoordinate(90)(value)
                ?? ((String(value ?? '').trim() === '') !== (String(values.longitude ?? '').trim() === '')
                    ? 'Las coordenadas van juntas: latitud y longitud' : null),
            longitude: optionalCoordinate(180),
            carrierVehicleId: (value, values) => (values.kind === 'ATTACHED' && !value ? 'Dice con qué vehículo va' : null),
            attachment: (value, values) => (values.kind === 'ATTACHED' && !value ? 'Dice cómo: remolcado o transportado' : null),
            observedAt: (value) => (value && new Date(value.replace(' ', 'T')) > new Date() ? 'Una ubicación se registra cuando ya ha pasado' : null),
        },
    })
    const shown = locationFields(form.values.kind, mobility, {readsConfiguration: reads})
    const packageId = form.values.executionPackageId === null ? null : Number(form.values.executionPackageId)
    const siteOptions = (sites.data?.content ?? []).map((site) => ({value: site.id, label: unitLabel(site)}))
    const searchCarriers = async (text, {signal}) => {
        const page = await searchVehicles({search: text, active: true, size: 20}, {signal})
        return page.content.filter((other) => other.id !== vehicle.id).map((other) => ({value: other.id, label: unitLabel(other)}))
    }

    const save = form.onSubmit((values) => recording.mutate(locationRequest(values, mobility, {readsConfiguration: reads}), {
        onSuccess: () => {
            notifySuccess(`Registrado dónde está ${vehicle.code}`)
            onClose()
        },
        onError: saveErrors(form),
    }))

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="lg" title={`Registrar dónde está ${unitLabel(vehicle)}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <Select label="Dónde está" withAsterisk allowDeselect={false}
                                data={recordableKinds(mobility).map((kind) => ({value: kind, label: LOCATION_KIND.label(kind)}))}
                                {...form.getInputProps('kind')}/>
                        <DateInput label="Cuándo" description="Vacío: ahora" withTime clearable valueFormat={DATE_TIME_FORMAT}
                                   dateParser={parseTypedDateTime} placeholder="DD/MM/AAAA HH:mm" {...form.getInputProps('observedAt')}/>
                        {shown.site && (
                            <Select label="Sitio" clearable searchable data={siteOptions}
                                    description={mobility === 'RAIL_ONLY' ? 'Solo los que tienen acceso por vía'
                                        : mobility === 'ROAD_ONLY' ? 'Solo los que tienen acceso por carretera' : undefined}
                                    {...form.getInputProps('parkingSiteId')}/>
                        )}
                        {shown.executionPackageId && (
                            <ReferenceSelect label="EP" options={names.packageOptions} {...form.getInputProps('executionPackageId')}/>
                        )}
                        {shown.trackId && (
                            <ReferenceSelect label="Vía" withAsterisk={form.values.kind === 'ON_TRACK'}
                                             options={packageId === null ? names.trackOptions : names.trackOptionsIn(packageId)}
                                             {...form.getInputProps('trackId')}/>
                        )}
                        {shown.kp && <TextInput label="KP" {...form.getInputProps('kp')}/>}
                        {shown.accessPoint && (
                            <TextInput label="Punto de acceso" maxLength={150} description="Dónde encarriló o desencarriló"
                                       {...form.getInputProps('accessPoint')}/>
                        )}
                        {shown.coordinates && <TextInput label="Latitud" {...form.getInputProps('latitude')}/>}
                        {shown.coordinates && <TextInput label="Longitud" {...form.getInputProps('longitude')}/>}
                        {shown.carrier && (
                            <ServerSearchSelect label="Con" withAsterisk queryKey={resourcesKey('carrier-picker', vehicle.id)} search={searchCarriers}
                                                searchWhenEmpty placeholder="Escribe su código" {...form.getInputProps('carrierVehicleId')}/>
                        )}
                        {shown.carrier && (
                            <Select label="Cómo" withAsterisk data={VEHICLE_ATTACHMENT.selectable()} {...form.getInputProps('attachment')}/>
                        )}
                    </SimpleGrid>
                    <Textarea label="Descripción" rows={2} maxLength={500} {...form.getInputProps('description')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={recording.isPending}>Registrar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
