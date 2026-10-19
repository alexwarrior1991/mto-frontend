import {Button, Group, Modal, Select, SimpleGrid, Stack, Textarea, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {useState} from 'react'
import {VEHICLE_OWNER, VEHICLE_STATUS} from '../../api/resources/enums.js'
import {searchVehicleTypes} from '../../api/resources/fleet.js'
import {hasPlate, hasRailNumber, newVehicleRequest, vehiclePatch} from '../../api/resources/vehicles.js'
import {unitLabel} from '../../api/resources/values.js'
import {saveErrors} from '../../ui/errors/saveErrors.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import ServerSearchSelect from '../../ui/ServerSearchSelect.jsx'
import {maxLength, optionalFigure, requiredText, TELEMATICS_DEVICE_LENGTH, telematicsDevice} from './resourcesForms.js'
import {resourcesKey, useSaveVehicle} from './useResources.js'

const LENGTHS = Object.freeze({code: 32, name: 150, plate: 20, railNumber: 30, serial: 60, company: 150, reason: 500})

function typeOption(type) {
    return {value: type.id, label: unitLabel(type), type}
}

async function searchTypes(text, {signal}) {
    const page = await searchVehicleTypes({search: text, active: true, size: 20}, {signal})
    return page.content.map(typeOption)
}

/**
 * El alta y la modificación de un vehículo (el port de VehicleEditorDialog). Exige lo que pide su
 * modelo: matrícula si va por carretera (y ninguna en uno de solo vía), número ferroviario si su modelo
 * va por vía abierta (y ninguno en uno de solo carretera), la empresa si no es propio y el motivo si no
 * está operativo. Su dispositivo GPS es opcional (vaciarlo viaja a null).
 * Que la matrícula, el número o el GPS no los tenga otro, o que el modelo no esté retirado, lo dice el
 * servicio (409 VEH-409, VEH-001) con el diálogo abierto; también que vuelva a operativo con una
 * reparación abierta que lo inmoviliza.
 *
 * @param {object|null} vehicle el vehículo que se modifica, o null para el alta
 */
export default function VehicleEditorModal({vehicle, onClose, onSaved = () => {}}) {
    const creating = vehicle === null
    const [type, setType] = useState(vehicle?.type ?? null)
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            code: vehicle?.code ?? '',
            name: vehicle?.name ?? '',
            typeId: vehicle?.type?.id ?? null,
            registrationPlate: vehicle?.registrationPlate ?? '',
            railVehicleNumber: vehicle?.railVehicleNumber ?? '',
            serialNumber: vehicle?.serialNumber ?? '',
            manufactureYear: vehicle?.manufactureYear == null ? '' : String(vehicle.manufactureYear),
            owner: vehicle?.owner ?? 'OWN',
            ownerCompany: vehicle?.ownerCompany ?? '',
            operationalStatus: vehicle?.operationalStatus ?? 'OPERATIONAL',
            statusReason: vehicle?.statusReason ?? '',
            odometerKm: vehicle?.odometerKm == null ? '' : String(vehicle.odometerKm),
            engineHours: vehicle?.engineHours == null ? '' : String(vehicle.engineHours),
            notes: vehicle?.notes ?? '',
            telematicsDeviceId: vehicle?.telematicsDeviceId ?? '',
        },
        validate: {
            code: creating ? requiredText('El código es obligatorio', LENGTHS.code) : null,
            name: maxLength(LENGTHS.name),
            typeId: (value) => (value ? null : 'El modelo es obligatorio'),
            registrationPlate: (value) => (type && hasPlate(type) && !String(value ?? '').trim() ? 'Va por carretera: lleva su matrícula'
                : maxLength(LENGTHS.plate)(value)),
            railVehicleNumber: (value) => (type?.transportModeAuthorised === true && !String(value ?? '').trim()
                ? 'Su modelo va por vía abierta: lleva su número de vehículo ferroviario' : maxLength(LENGTHS.railNumber)(value)),
            serialNumber: maxLength(LENGTHS.serial),
            manufactureYear: (value) => {
                const text = String(value ?? '').trim()
                return text && !(/^\d{4}$/.test(text) && Number(text) >= 1900 && Number(text) <= 2200) ? 'Entre 1900 y 2200' : null
            },
            ownerCompany: (value, values) => (values.owner !== 'OWN' && !String(value ?? '').trim() ? 'Uno que no es propio dice de quién es'
                : maxLength(LENGTHS.company)(value)),
            statusReason: (value, values) => (values.operationalStatus !== 'OPERATIONAL' && !String(value ?? '').trim()
                ? 'Uno que no está operativo dice por qué' : maxLength(LENGTHS.reason)(value)),
            odometerKm: optionalFigure({integers: 0, decimals: 0, min: 0}),
            engineHours: optionalFigure({integers: 9, decimals: 1}),
            telematicsDeviceId: telematicsDevice,
        },
    })
    const saving = useSaveVehicle()

    const save = form.onSubmit((values) => {
        const body = creating ? newVehicleRequest(values, type) : vehiclePatch(vehicle, values, type)
        if (body === null) {
            onClose()
            return
        }
        saving.mutate({id: creating ? null : vehicle.id, body}, {
            onSuccess: (saved) => {
                notifySuccess(`Guardado ${unitLabel(saved ?? vehicle)}`)
                onClose()
                onSaved(saved)
            },
            onError: saveErrors(form),
        })
    })

    const {owner, operationalStatus} = form.values
    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="lg" title={creating ? 'Nuevo vehículo' : `Modificar ${unitLabel(vehicle)}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <TextInput label="Código (número de flota)" withAsterisk={creating} readOnly={!creating} maxLength={LENGTHS.code}
                                   {...form.getInputProps('code')}/>
                        <TextInput label="Nombre" maxLength={LENGTHS.name} {...form.getInputProps('name')}/>
                        <ServerSearchSelect label="Modelo" withAsterisk queryKey={resourcesKey('vehicle-type-picker')} search={searchTypes}
                                            searchWhenEmpty current={vehicle?.type ? typeOption(vehicle.type) : null}
                                            placeholder="Escribe su código o su nombre" {...form.getInputProps('typeId')}
                                            onChange={(next, option) => {
                                                form.setFieldValue('typeId', next)
                                                setType(option?.type ?? null)
                                            }}/>
                        {hasPlate(type) && (
                            <TextInput label="Matrícula" withAsterisk={Boolean(type)} maxLength={LENGTHS.plate} {...form.getInputProps('registrationPlate')}/>
                        )}
                        {hasRailNumber(type) && (
                            <TextInput label="Número de vehículo ferroviario" withAsterisk={type?.transportModeAuthorised === true}
                                       maxLength={LENGTHS.railNumber} {...form.getInputProps('railVehicleNumber')}/>
                        )}
                        <TextInput label="Número de serie" maxLength={LENGTHS.serial} {...form.getInputProps('serialNumber')}/>
                        <TextInput label="Año de fabricación" {...form.getInputProps('manufactureYear')}/>
                        <Select label="Propiedad" withAsterisk allowDeselect={false} data={VEHICLE_OWNER.selectable()} {...form.getInputProps('owner')}/>
                        {owner !== 'OWN' && <TextInput label="Empresa" withAsterisk maxLength={LENGTHS.company} {...form.getInputProps('ownerCompany')}/>}
                        <Select label="Estado operativo" withAsterisk allowDeselect={false} data={VEHICLE_STATUS.selectable()}
                                {...form.getInputProps('operationalStatus')}/>
                        {operationalStatus !== 'OPERATIONAL' && (
                            <TextInput label="Motivo" withAsterisk maxLength={LENGTHS.reason} {...form.getInputProps('statusReason')}/>
                        )}
                        <TextInput label="Km" {...form.getInputProps('odometerKm')}/>
                        <TextInput label="Horas de motor" {...form.getInputProps('engineHours')}/>
                    </SimpleGrid>
                    <TextInput label="Dispositivo GPS" maxLength={TELEMATICS_DEVICE_LENGTH}
                               description="Por él llegan sus posiciones de carretera; vacío, sin GPS" {...form.getInputProps('telematicsDeviceId')}/>
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
