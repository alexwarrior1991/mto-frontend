import {Button, Group, Modal, NumberInput, Select, SimpleGrid, Stack, Text, Textarea, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {assetPatch, isSynchronizedAsset, trackSectionRequest} from '../../api/maintenance/assets.js'
import {ASSET_TYPE, TRACK_KIND} from '../../api/maintenance/enums.js'
import {assetLabel} from '../../api/maintenance/values.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {kpAfter, kpValue, optionalPositiveInteger, required, requiredText, toText} from './maintenanceForms.js'
import {saveErrors} from './maintenanceErrors.js'
import {ReferenceSelect} from './MaintenancePickers.jsx'
import {useSaveAsset} from './useMaintenance.js'

const CODE_LENGTH = 64
const NAME_LENGTH = 255

/**
 * El alta de un tramo de vía o la modificación de un activo (el port de AssetEditorDialog).
 *
 * - Un tramo propio se modifica entero salvo el código. Uno que llega de mto-configuration, solo en su
 *   descripción y su intervalo preventivo: su identidad y su localización son de allí, y el servicio
 *   respondería 409 AST-001.
 * - Solo se exige lo evidente: lo obligatorio y un kp final mayor que el inicial.
 * - La modificación es un merge-patch con lo que cambió y la versión leída. Si no cambió nada, se
 *   cierra sin llamar; si otra persona guardó antes, 409 CON-001 y el diálogo sigue abierto.
 *
 * @param {object|null} asset el activo que se modifica, o null para el alta de un tramo
 * @param {object} names los nombres de mto-configuration (useConfigurationNames)
 */
export default function AssetEditorModal({asset, names, onClose}) {
    const creating = asset === null
    const synchronized = !creating && isSynchronizedAsset(asset)
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            code: asset?.code ?? '',
            name: asset?.name ?? '',
            description: asset?.description ?? '',
            executionPackageId: idText(asset?.executionPackageId),
            trackId: idText(asset?.trackId),
            stationId: idText(asset?.stationId),
            startKp: toText(asset?.startKp),
            endKp: toText(asset?.endKp),
            trackKind: asset?.trackKind ?? 'MAIN',
            preventiveIntervalDays: asset?.preventiveIntervalDays ?? '',
        },
        validate: synchronized
            ? {preventiveIntervalDays: optionalPositiveInteger}
            : {
                code: creating ? requiredText('El código es obligatorio', CODE_LENGTH) : null,
                name: requiredText('El nombre es obligatorio', NAME_LENGTH),
                trackId: required('La vía es obligatoria'),
                trackKind: required('El tipo de vía es obligatorio'),
                startKp: kpValue('El kp inicial es obligatorio'),
                endKp: (value, values) => kpValue('El kp final es obligatorio')(value) ?? kpAfter('startKp')(value, values),
                preventiveIntervalDays: optionalPositiveInteger,
            },
    })
    const saving = useSaveAsset()

    const save = form.onSubmit((values) => {
        const body = creating ? trackSectionRequest(values) : assetPatch(asset, values)
        if (body === null) {
            onClose()
            return
        }
        saving.mutate({id: creating ? null : asset.id, body}, {
            onSuccess: (saved) => {
                notifySuccess(`Guardado ${assetLabel(saved ?? asset ?? values)}`)
                onClose()
            },
            onError: saveErrors(form),
        })
    })

    const interval = (
        <NumberInput label="Intervalo preventivo (días)" description="Cada cuánto toca un preventivo; vacío, sin plan" min={1}
                     clampBehavior="none" allowDecimal={false} allowNegative={false} {...form.getInputProps('preventiveIntervalDays')}/>
    )
    const description = <Textarea label="Descripción" rows={3} {...form.getInputProps('description')}/>

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="xl"
               title={creating ? 'Nuevo tramo de vía' : `Modificar ${assetLabel(asset)}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    {synchronized
                        ? (
                            <>
                                <Text size="sm">
                                    {`Llega de mto-configuration (${ASSET_TYPE.label(asset.type).toLowerCase()} ${assetLabel(asset)}): aquí solo se `
                                        + 'cambian la descripción y el intervalo preventivo. El resto se cambia allí.'}
                                </Text>
                                {interval}
                                {description}
                            </>
                        )
                        : (
                            <>
                                <SimpleGrid cols={{base: 1, sm: 2}}>
                                    {creating && <TextInput label="Código" withAsterisk maxLength={CODE_LENGTH} {...form.getInputProps('code')}/>}
                                    <TextInput label="Nombre" withAsterisk maxLength={NAME_LENGTH} {...form.getInputProps('name')}/>
                                    <ReferenceSelect label="Vía" withAsterisk options={names.trackOptions} {...form.getInputProps('trackId')}/>
                                    <Select label="Tipo de vía" withAsterisk data={TRACK_KIND.selectable()} allowDeselect={false}
                                            description="Una vía desviada solo admite turnos con posesión total" {...form.getInputProps('trackKind')}/>
                                    <TextInput label="Kp inicial" withAsterisk inputMode="decimal" {...form.getInputProps('startKp')}/>
                                    <TextInput label="Kp final" withAsterisk inputMode="decimal" {...form.getInputProps('endKp')}/>
                                    <ReferenceSelect label="Paquete de ejecución" options={names.packageOptions} {...form.getInputProps('executionPackageId')}/>
                                    <ReferenceSelect label="Estación" options={names.stationOptions} {...form.getInputProps('stationId')}/>
                                    {interval}
                                </SimpleGrid>
                                {description}
                            </>
                        )}
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={saving.isPending}>Guardar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}

function idText(id) {
    return id === null || id === undefined ? null : String(id)
}
