import {ActionIcon, Button, Checkbox, Fieldset, Group, Modal, Select, Stack, Text, TextInput, Tooltip} from '@mantine/core'
import {IconPlus, IconTrash} from '@tabler/icons-react'
import {useState} from 'react'
import {activeTaskTypes} from '../../api/maintenance/catalogs.js'
import {ASSET_TYPE, GENERATION_OUTCOME} from '../../api/maintenance/enums.js'
import {GENERATED_ASSET_TYPES, GENERATION_SCOPE, generateRequest, generationRow, skippedOf} from '../../api/maintenance/tasks.js'
import {assetLabel} from '../../api/maintenance/values.js'
import DataTable from '../../ui/DataTable.jsx'
import {formatQuantity} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {optionalKp} from './maintenanceForms.js'
import {countText, kp, kpRange} from './maintenanceTexts.js'
import {AssetPicker, AssetsMultiPicker, ReferenceSelect, TaskTypesSelect} from './MaintenancePickers.jsx'
import {useGenerateTasks, usePreviewGeneration, useTaskTypes} from './useMaintenance.js'
import {useConfigurationNames} from './useMaintenanceNames.js'

const ASSET_TYPES = [
    {value: 'PROFILE', label: 'Perfiles'},
    {value: 'SECTION_INSULATOR', label: 'Aisladores de sección'},
    {value: 'DISCONNECTOR', label: 'Seccionadores'},
]

/**
 * Generar las tareas de un preventivo (el port de GenerateTasksDialog): una por activo de lo que dice
 * cada fila, un tipo de activo en un sitio. Sin tocar nada, los perfiles del tramo de la orden, como
 * siempre. Con EP, además, perfiles, aisladores y seccionadores de otro tramo, de una vía (lo suyo y lo
 * que conecta con ella), de una estación, de todo el EP o elegidos, en cualquier vía del EP: una orden es
 * de un solo EP, y lo de otro va en otra orden, así que los desplegables solo ofrecen lo suyo.
 *
 * Sin tipos, cada activo lleva los del plan (grupos 1, 2 y 4 en un perfil, RG-03 y RP-02 en un aislador,
 * y RP-03 si tiene agujas, RP-06 en un seccionador con motor; uno manual no tiene y hay que elegirlos). Lo que ya tiene tarea en la
 * orden, lo que tiene una abierta en otra orden y lo de otro EP se salta: repetirlo no duplica.
 * «Previsualizar» pregunta al servicio qué pasaría con cada activo sin crear nada; cualquier cambio en el
 * diálogo la borra. Lo que resulta lo cuenta el servicio y se enseña tal cual.
 */
export default function GenerateTasksModal({order, onClose}) {
    const types = useTaskTypes()
    const onSection = order.asset?.type === 'TRACK_SECTION'
    const packageId = order.executionPackageId ?? null
    const names = useConfigurationNames({stations: true, tracks: true})
    const [rows, setRows] = useState(() => [generationRow('PROFILE', onSection ? GENERATION_SCOPE.ORDER_SECTION : GENERATION_SCOPE.PACKAGE)])
    const [codes, setCodes] = useState([])
    const [withChecklist, setWithChecklist] = useState(false)
    const [errors, setErrors] = useState({})
    const [preview, setPreview] = useState(null)
    const generating = useGenerateTasks(order.id)
    const previewing = usePreviewGeneration(order.id)

    const scopes = scopeOptions(onSection, packageId, names.readsConfiguration)
    const touch = (next) => {
        setRows(next)
        setErrors({})
        setPreview(null)
    }
    const changeRow = (index, changes) => touch(rows.map((row, at) => (at === index ? {...row, ...changes} : row)))
    const request = (dryRun) => generateRequest({rows, taskTypeCodes: codes, withChecklist, dryRun, orderSectionId: order.asset?.id ?? null})
    const send = (dryRun) => {
        const found = rowErrors(rows)
        setErrors(found)
        if (Object.keys(found).length > 0) {
            return
        }
        if (dryRun) {
            previewing.mutate(request(true), {onSuccess: setPreview})
            return
        }
        generating.mutate(request(false), {
            onSuccess: (result) => {
                notifySuccess(generatedText(result))
                onClose()
            },
        })
    }
    const busy = generating.isPending || previewing.isPending
    // Sin EP solo cabe el tramo de la orden y viaja la petición de siempre, que no lleva tipos por fila.
    const ownTypes = packageId !== null

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="xl" title={`Generar tareas de ${order.code}`}>
            <Stack>
                <Text size="sm">{introText(order, onSection, packageId)}</Text>
                {rows.map((row, index) => (
                    <Fieldset key={index} legend={`Qué generar ${index + 1}`} aria-label={`Qué generar ${index + 1}`}>
                        <Group align="flex-start" grow>
                            <Select label="Activos" data={ASSET_TYPES} value={row.assetType} allowDeselect={false}
                                    onChange={(value) => changeRow(index, {assetType: value, assetIds: []})}/>
                            <Select label="Dónde" data={scopes} value={row.scope} allowDeselect={false}
                                    onChange={(value) => changeRow(index, {...generationRow(row.assetType, value), taskTypeCodes: row.taskTypeCodes})}/>
                        </Group>
                        <ScopeFields row={row} index={index} packageId={packageId} names={names} errors={errors}
                                     onChange={(changes) => changeRow(index, changes)}/>
                        {ownTypes && (
                            <TaskTypesSelect label="Sus tipos de tarea" types={activeTaskTypes(types.data)} value={row.taskTypeCodes}
                                             description="Opcional: solo para lo de esta fila"
                                             onChange={(value) => changeRow(index, {taskTypeCodes: value})}/>
                        )}
                        {rows.length > 1 && (
                            <Group justify="flex-end" mt="xs">
                                <Tooltip label="Quitar">
                                    <ActionIcon variant="subtle" color="red" aria-label={`Quitar lo que generar ${index + 1}`}
                                                onClick={() => touch(rows.filter((_, at) => at !== index))}>
                                        <IconTrash size={16}/>
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                        )}
                    </Fieldset>
                ))}
                <Group>
                    <Button variant="light" leftSection={<IconPlus size={16}/>}
                            onClick={() => touch([...rows, generationRow('SECTION_INSULATOR', rows[rows.length - 1]?.scope ?? scopes[0].value)])}>
                        Añadir qué generar
                    </Button>
                </Group>
                {packageId === null && (
                    <Text size="sm" c="dimmed">La orden no tiene EP: solo genera su tramo. Otros tramos y vías van en una orden con EP.</Text>
                )}
                <TaskTypesSelect label="Tipos de tarea" types={activeTaskTypes(types.data)} value={codes}
                                 description="Para todo lo generado. Vacío: grupos 1, 2 y 4 en cada perfil, RG-03 y RP-02 en cada aislador (y RP-03 si tiene agujas) y RP-06 en cada seccionador con motor"
                                 onChange={(value) => {
                                     setCodes(value)
                                     setPreview(null)
                                 }}/>
                <Checkbox label="Con la checklist de la plantilla de cada activo" checked={withChecklist}
                          onChange={(event) => {
                              setWithChecklist(event.currentTarget.checked)
                              setPreview(null)
                          }}/>
                {preview && <PreviewTable preview={preview} names={names}/>}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose} disabled={busy}>Volver</Button>
                    <Button variant="light" loading={previewing.isPending} disabled={generating.isPending} onClick={() => send(true)}>
                        Previsualizar
                    </Button>
                    <Button loading={generating.isPending} disabled={previewing.isPending} onClick={() => send(false)}>Generar</Button>
                </Group>
            </Stack>
        </Modal>
    )
}

/** Los campos del sitio de una fila: el tramo, la vía y sus KP, la estación o los activos. */
function ScopeFields({row, index, packageId, names, errors, onChange}) {
    const error = (field) => errors[`${index}.${field}`] ?? null
    switch (row.scope) {
        case GENERATION_SCOPE.SECTION:
            return (
                <AssetPicker label="Tramo" type="TRACK_SECTION" filters={{executionPackageId: packageId}} value={row.section}
                             error={error('section')} onChange={(section) => onChange({section})} mt="xs"/>
            )
        case GENERATION_SCOPE.TRACK:
            return (
                <Group align="flex-start" grow mt="xs">
                    <ReferenceSelect label="Vía" options={names.trackOptionsIn(packageId)} value={row.trackId} error={error('trackId')}
                                     description="Lo de esa vía y lo que conecta con ella" onChange={(trackId) => onChange({trackId})}/>
                    <TextInput label="Desde KP" value={row.fromKp} error={error('fromKp')} onChange={(event) => onChange({fromKp: event.currentTarget.value})}/>
                    <TextInput label="Hasta KP" value={row.toKp} error={error('toKp')} onChange={(event) => onChange({toKp: event.currentTarget.value})}/>
                </Group>
            )
        case GENERATION_SCOPE.STATION:
            return (
                <ReferenceSelect label="Estación" options={names.stationOptionsIn(packageId)} value={row.stationId} error={error('stationId')}
                                 onChange={(stationId) => onChange({stationId})} mt="xs"/>
            )
        case GENERATION_SCOPE.ASSETS:
            return (
                <AssetsMultiPicker label={ASSET_TYPE.label(row.assetType)} type={row.assetType} filters={{executionPackageId: packageId}}
                                   value={row.assetIds} error={error('assetIds')} onChange={(assetIds) => onChange({assetIds})} mt="xs"/>
            )
        default:
            return null
    }
}

/** Lo que el servicio haría con cada activo, en el orden en que lo generaría. */
function PreviewTable({preview, names}) {
    const columns = [
        {key: 'asset', label: 'Activo', render: (line) => assetLabel(line)},
        {key: 'type', label: 'Tipo', render: (line) => ASSET_TYPE.label(line.type)},
        {key: 'track', label: 'Vía', render: (line) => (line.trackId === null || line.trackId === undefined ? '' : names.trackName(line.trackId))},
        {key: 'kp', label: 'KP', render: (line) => kp(line.kp)},
        {key: 'types', label: 'Tipos', render: (line) => (line.taskTypeCodes ?? []).join(', ')},
        {key: 'outcome', label: 'Resultado', render: outcomeText},
    ]
    return (
        <Stack gap="xs">
            <Text size="sm">{generatedText(preview, true)}</Text>
            <DataTable ariaLabel="Lo que se generaría" columns={columns} rows={preview.assets ?? []} rowKey={(line) => line.assetId}
                       emptyText="Nada encaja en lo pedido."/>
        </Stack>
    )
}

function outcomeText(line) {
    if (line.outcome === 'IN_OTHER_ORDER' && line.otherOrderCode) {
        return `En ${line.otherOrderCode}`
    }
    return GENERATION_OUTCOME.label(line.outcome)
}

function scopeOptions(onSection, packageId, readsConfiguration) {
    const options = []
    if (onSection) {
        options.push({value: GENERATION_SCOPE.ORDER_SECTION, label: 'El tramo de la orden'})
    }
    if (packageId !== null) {
        options.push({value: GENERATION_SCOPE.SECTION, label: 'Otro tramo del EP'})
        if (readsConfiguration) {
            options.push({value: GENERATION_SCOPE.TRACK, label: 'Una vía del EP'})
            options.push({value: GENERATION_SCOPE.STATION, label: 'Una estación del EP'})
        }
        options.push({value: GENERATION_SCOPE.PACKAGE, label: 'Todo el EP'})
        options.push({value: GENERATION_SCOPE.ASSETS, label: 'Activos elegidos'})
    }
    return options
}

/** Lo que falta en una fila antes de llamar: el servicio diría lo mismo con un 400. */
function rowErrors(rows) {
    const errors = {}
    rows.forEach((row, index) => {
        if (row.scope === GENERATION_SCOPE.SECTION && !row.section) {
            errors[`${index}.section`] = 'Elige un tramo'
        }
        if (row.scope === GENERATION_SCOPE.TRACK) {
            if (!row.trackId) {
                errors[`${index}.trackId`] = 'Elige una vía'
            }
            const from = optionalKp(row.fromKp)
            const to = optionalKp(row.toKp)
            if (from) {
                errors[`${index}.fromKp`] = from
            }
            if (to) {
                errors[`${index}.toKp`] = to
            }
            if (!from && !to && String(row.fromKp).trim() && String(row.toKp).trim() && Number(row.fromKp) > Number(row.toKp)) {
                errors[`${index}.toKp`] = 'El KP final no puede ser menor que el inicial'
            }
        }
        if (row.scope === GENERATION_SCOPE.STATION && !row.stationId) {
            errors[`${index}.stationId`] = 'Elige una estación'
        }
        if (row.scope === GENERATION_SCOPE.ASSETS && (row.assetIds ?? []).length === 0) {
            errors[`${index}.assetIds`] = 'Elige al menos uno'
        }
    })
    return errors
}

function introText(order, onSection, packageId) {
    const section = onSection
        ? `Una tarea por cada perfil habilitado entre los KP ${kpRange(order.startKp, order.endKp)} del tramo, si no eliges otra cosa. `
        : ''
    const more = packageId !== null ? 'Añade aisladores, seccionadores u otros sitios de su EP; una orden es de un solo EP. ' : ''
    return `${section}${more}Lo que ya tiene tarea, aquí o en otra orden abierta, se salta.`
}

/**
 * Lo que dice el servicio: lo creado por tipo de activo y lo saltado. Con preview, lo que se crearía.
 * Un servicio anterior no manda createdByAssetType ni los saltados nuevos: entonces cuenta lo de antes.
 */
function generatedText(result, preview = false) {
    // En el orden de siempre (perfiles, aisladores, seccionadores), no en el de las claves que llegan.
    const created = result.createdByAssetType
        ? GENERATED_ASSET_TYPES.filter((type) => type in result.createdByAssetType)
            .map((type) => `${ASSET_TYPE.label(type).toLowerCase()}: ${result.createdByAssetType[type]}`).join(', ')
        : null
    const parts = [`${preview ? 'Se crearían' : 'Tareas nuevas'}: ${result.createdTasks}${created ? ` (${created})` : ''}`]
    parts.push(`ya en la orden: ${skippedOf(result)}`)
    if (result.skippedInOtherOrders) {
        parts.push(`en otras órdenes: ${result.skippedInOtherOrders} (${(result.otherOrderCodes ?? []).join(', ')})`)
    }
    if (result.skippedOtherPackage) {
        parts.push(`de otro EP: ${result.skippedOtherPackage}`)
    }
    if (result.skippedWithoutTaskTypes) {
        parts.push(`sin tipo de tarea: ${result.skippedWithoutTaskTypes}`)
    }
    return `${parts.join('; ')}. Total: ${result.totalTasks}, unos ${formatQuantity(result.estimatedMinutes)} min en `
        + `${countText(result.estimatedShifts, 'turno', 'turnos')}.`
}

