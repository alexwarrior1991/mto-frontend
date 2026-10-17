import {Checkbox, Select, SimpleGrid, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {masterBody} from '../../api/configuration/masters.js'
import {kindOptions, sideOptions} from './accessPointKinds.js'
import {optionalDecimal, required, requiredText, toId, toNumber, toOption, toText} from './formValues.js'
import {MASTERS} from './masterResources.js'
import MasterEditorModal from './MasterEditorModal.jsx'
import {withCurrent} from './references.js'

const NAME_MAX_LENGTH = 200
// Las columnas del servicio (README_API.md §4 quinquies): el KP es numeric(12,3), los pesos
// numeric(8,3) y las coordenadas numeric(9,6), con su rango.
const KP = optionalDecimal({integers: 9, decimals: 3})
const WEIGHT = optionalDecimal({integers: 5, decimals: 3})
const LATITUDE = optionalDecimal({integers: 3, decimals: 6, signed: true, limit: 90})
const LONGITUDE = optionalDecimal({integers: 3, decimals: 6, signed: true, limit: 180})

/**
 * Alta o modificación de un punto de acceso a la vía (mto-configuration V28): por donde un vehículo
 * bivial sale de la carretera y se encarrila. La vía es obligatoria y la estación no (muchos están en
 * plena vía). Las cifras viajan como números JSON, como el KP de un aislador, y se comprueban antes de
 * llamar con su columna: el KP y los pesos no son negativos y llevan tres decimales como mucho, y las
 * coordenadas van juntas, con seis. Un nombre repetido en la vía es el 409 BUS-002 del servicio. Como
 * el resto de los maestros, viaja la fila leída entera con lo cambiado encima; no tiene hijos.
 */
export default function TrackAccessPointEditor({row, references, onClose}) {
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            name: row?.name ?? '',
            trackId: toOption(row?.trackId),
            stationId: toOption(row?.stationId),
            kp: toText(row?.kp),
            kind: row?.kind ?? null,
            side: row?.side ?? null,
            roadRailAccess: row ? row.roadRailAccess !== false : true,
            maxAxleLoadT: toText(row?.maxAxleLoadT),
            maxGrossWeightT: toText(row?.maxGrossWeightT),
            latitude: toText(row?.latitude),
            longitude: toText(row?.longitude),
            enabled: row ? row.enabled !== false : true,
        },
        validate: {
            name: requiredText('El nombre es obligatorio', NAME_MAX_LENGTH),
            trackId: required('La vía es obligatoria'),
            kp: KP,
            kind: required('Hay que decir qué tipo de acceso es'),
            side: required('Hay que decir por qué lado se entra'),
            maxAxleLoadT: WEIGHT,
            maxGrossWeightT: WEIGHT,
            // Si llega una sin la otra, el servicio responde 400 sobre la que falta: aquí, igual.
            latitude: (value, values) => LATITUDE(value) ?? missingPair(value, values.longitude, 'Con la longitud va también la latitud'),
            longitude: (value, values) => LONGITUDE(value) ?? missingPair(value, values.latitude, 'Con la latitud va también la longitud'),
        },
    })

    const buildBody = (values) => masterBody(MASTERS.trackAccessPoints.path, row ?? {}, {
        name: values.name.trim(),
        trackId: toId(values.trackId),
        stationId: toId(values.stationId),
        kp: toNumber(values.kp),
        kind: values.kind,
        side: values.side,
        roadRailAccess: values.roadRailAccess,
        maxAxleLoadT: toNumber(values.maxAxleLoadT),
        maxGrossWeightT: toNumber(values.maxGrossWeightT),
        latitude: toNumber(values.latitude),
        longitude: toNumber(values.longitude),
        enabled: values.enabled,
    })

    return (
        <MasterEditorModal master={MASTERS.trackAccessPoints} creating={row === null} form={form} buildBody={buildBody}
                           onClose={onClose} size="lg">
            <TextInput label="Nombre" withAsterisk maxLength={NAME_MAX_LENGTH} data-autofocus
                       description="No se repite en su vía" {...form.getInputProps('name')}/>
            <SimpleGrid cols={{base: 1, sm: 2}}>
                <Select label="Vía" withAsterisk searchable nothingFoundMessage="No hay ninguna"
                        data={withCurrent(references.trackOptions, row?.trackId)} {...form.getInputProps('trackId')}/>
                <Select label="Estación" clearable searchable nothingFoundMessage="No hay ninguna"
                        description="Vacía si está en plena vía"
                        data={withCurrent(references.stationOptions, row?.stationId)} {...form.getInputProps('stationId')}/>
                <TextInput label="KP (m)" {...form.getInputProps('kp')}/>
                <Select label="Tipo" withAsterisk data={kindOptions(row?.kind)} {...form.getInputProps('kind')}/>
                <Select label="Lado" withAsterisk description="En el sentido creciente del KP" data={sideOptions(row?.side)}
                        {...form.getInputProps('side')}/>
                <TextInput label="Carga máxima por eje (t)" {...form.getInputProps('maxAxleLoadT')}/>
                <TextInput label="Peso bruto máximo (t)" {...form.getInputProps('maxGrossWeightT')}/>
                <TextInput label="Latitud" description="Grados decimales (WGS 84)" {...form.getInputProps('latitude')}/>
                <TextInput label="Longitud" description="Grados decimales (WGS 84)" {...form.getInputProps('longitude')}/>
            </SimpleGrid>
            <Checkbox label="Admite biviales" description="Sirve para encarrilar vehículos biviales"
                      {...form.getInputProps('roadRailAccess', {type: 'checkbox'})}/>
            <Checkbox label="Activo" {...form.getInputProps('enabled', {type: 'checkbox'})}/>
        </MasterEditorModal>
    )
}

/** Una coordenada vacía cuando la otra no lo está: las dos o ninguna. */
function missingPair(own, other, message) {
    return !String(own ?? '').trim() && String(other ?? '').trim() ? message : null
}
