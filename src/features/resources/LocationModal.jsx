import {Button, Group, Modal, Select, SimpleGrid, Stack, Textarea, TextInput} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {LOCATION_KIND, recordableKinds, VEHICLE_ATTACHMENT} from '../../api/resources/enums.js'
import {locationFields, locationRequest, searchVehicles} from '../../api/resources/vehicles.js'
import {unitLabel} from '../../api/resources/values.js'
import {errorMessage} from '../../ui/errors/messages.js'
import {saveErrors} from '../../ui/errors/saveErrors.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import ServerSearchSelect from '../../ui/ServerSearchSelect.jsx'
import {DATE_TIME_FORMAT, parseTypedDateTime} from '../../ui/typedDates.js'
import {ReferenceSelect} from '../maintenance/MaintenancePickers.jsx'
import {optionalCoordinate, optionalFleetKp} from './resourcesForms.js'
import {accessPointLabel} from './resourcesTexts.js'
import {resourcesKey, useReachableSites, useRecordLocation, useTrackAccessPoints} from './useResources.js'

/** El 404 de mto-resources de un punto de acceso que no conoce. */
const UNKNOWN_ACCESS_POINT = 'TAP-404'

/**
 * Registrar dónde está un vehículo, a mano (el port de VehicleLocationDialog, resources-location-write).
 * Solo se ofrecen los tipos que admite su movilidad y los campos de cada tipo; en uno de solo vía, los
 * sitios con acceso por vía, y en uno de solo carretera, los que tienen acceso por carretera. Con una
 * vía elegida se ofrece, opcional, el punto de acceso por el que entró, entre los activos de esa vía que
 * conoce mto-resources (el maestro de mto-configuration); cambiar de vía lo vacía. Lo evidente se
 * comprueba antes de llamar; lo demás lo dice el servicio con el diálogo abierto: 409 VEH-001 (también
 * un acceso que no admite biviales, que no es de esa vía, que no es preparado para un modelo que lo
 * exige o que no aguanta su peso) y 404 TAP-404 (el punto ya no está o aún no ha llegado a Recursos), que
 * vacía el punto, lo dice en su campo y relee los de la vía, como el backoffice.
 *
 * @param {object} names los nombres de mto-configuration, con las vías
 */
export default function LocationModal({vehicle, names, onClose}) {
    const mobility = vehicle.type?.mobility ?? null
    const reads = names.readsConfiguration
    const sites = useReachableSites(mobility)
    const recording = useRecordLocation(vehicle.id)
    // Lo que se ve con el tipo elegido: lo que no se ve ni se comprueba ni viaja (locationRequest).
    const shownFor = (values) => locationFields(values.kind, mobility, {readsConfiguration: reads})
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            // El primero que admite su movilidad: aparcado, o «Desconocido» con una movilidad que no se conoce.
            kind: recordableKinds(mobility)[0], parkingSiteId: null, executionPackageId: null, trackId: null, kp: '', accessPointId: null, accessPoint: '', latitude: '',
            longitude: '', description: '', carrierVehicleId: null, attachment: null, observedAt: null,
        },
        validate: {
            parkingSiteId: (value, values) => {
                if (values.kind !== 'PARKED') {
                    return null
                }
                const shown = shownFor(values)
                const track = shown.trackId && values.trackId
                if (!value && !track && !values.description.trim() && !(shown.coordinates && values.latitude.trim())) {
                    return 'Aparcado dice dónde: un sitio, una vía y un kp, una descripción o unas coordenadas'
                }
                return mobility === 'RAIL_ONLY' && !value && !track
                    ? 'Uno de solo vía se aparca sobre una vía: un sitio con acceso por vía, o una vía y un kp' : null
            },
            trackId: (value, values) => (values.kind === 'ON_TRACK' && !value ? 'En vía dice su vía' : null),
            kp: (value, values) => (shownFor(values).kp ? optionalFleetKp(value) : null),
            latitude: (value, values) => (shownFor(values).coordinates
                ? optionalCoordinate(90)(value)
                    ?? ((String(value ?? '').trim() === '') !== (String(values.longitude ?? '').trim() === '')
                        ? 'Las coordenadas van juntas: latitud y longitud' : null)
                : null),
            longitude: (value, values) => (shownFor(values).coordinates ? optionalCoordinate(180)(value) : null),
            carrierVehicleId: (value, values) => (values.kind === 'ATTACHED' && !value ? 'Dice con qué vehículo va' : null),
            attachment: (value, values) => (values.kind === 'ATTACHED' && !value ? 'Dice cómo: remolcado o transportado' : null),
            observedAt: (value) => (value && new Date(value.replace(' ', 'T')) > new Date() ? 'Una ubicación se registra cuando ya ha pasado' : null),
        },
    })
    const shown = shownFor(form.values)
    const packageId = form.values.executionPackageId === null ? null : Number(form.values.executionPackageId)
    const trackId = shown.trackId && form.values.trackId !== null ? Number(form.values.trackId) : null
    const accessPoints = useTrackAccessPoints(trackId)
    const accessPointOptions = (accessPoints.data ?? []).map((point) => ({value: String(point.id), label: accessPointLabel(point)}))
    // El punto de acceso es uno de los de la vía: otra vía lo vacía.
    const trackInput = form.getInputProps('trackId')
    const chooseTrack = (value) => {
        trackInput.onChange(value)
        if (value !== form.values.trackId) {
            form.setFieldValue('accessPointId', null)
        }
    }
    const siteOptions = (sites.data?.content ?? []).map((site) => ({value: site.id, label: unitLabel(site)}))
    const searchCarriers = async (text, {signal}) => {
        const page = await searchVehicles({search: text, active: true, size: 20}, {signal})
        return page.content.filter((other) => other.id !== vehicle.id).map((other) => ({value: other.id, label: unitLabel(other)}))
    }

    const otherwise = saveErrors(form)
    const save = form.onSubmit((values) => recording.mutate(locationRequest(values, mobility, {readsConfiguration: reads}), {
        onSuccess: () => {
            notifySuccess(`Registrado dónde está ${vehicle.code}`)
            onClose()
        },
        onError: (error) => {
            // El punto de acceso ya no está o aún no ha llegado a Recursos: se vacía, para no volver a
            // mandarlo, se dice en su campo (la lista de la vía se relee, useRecordLocation) y se elige otro.
            if (error?.code === UNKNOWN_ACCESS_POINT) {
                form.setFieldValue('accessPointId', null)
                form.setFieldError('accessPointId', errorMessage(error))
            }
            otherwise(error)
        },
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
                                             {...trackInput} onChange={chooseTrack}/>
                        )}
                        {shown.kp && <TextInput label="KP" {...form.getInputProps('kp')}/>}
                        {shown.accessPointId && trackId !== null && (
                            <Select label="Punto de acceso" clearable searchable data={accessPointOptions}
                                    nothingFoundMessage="Nada coincide"
                                    placeholder={accessPoints.isSuccess && accessPointOptions.length === 0 ? 'La vía no tiene ninguno' : undefined}
                                    description={accessPoints.isError ? 'No se han podido leer los puntos de acceso de la vía'
                                        : 'Opcional: por dónde entró, entre los de la vía'}
                                    {...form.getInputProps('accessPointId')}/>
                        )}
                        {shown.accessPoint && (
                            <TextInput label="Acceso (texto)" maxLength={150}
                                       description="Dónde encarriló o desencarriló, si no es un punto de acceso de la lista"
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
