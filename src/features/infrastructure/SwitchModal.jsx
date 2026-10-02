import {Button, Checkbox, Group, Modal, Select, SimpleGrid, Stack, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {optionalNumber, toId, toNumber, toOption, toText} from './formValues.js'

const CODE_PATTERN = /^W\d{1,4}$/
const KP = optionalNumber()
const WHOLE = optionalNumber({integer: true})

/**
 * Una aguja del aislador de sección (el port de SwitchDialog, README_API.md §4 quater): W y hasta
 * cuatro cifras, su KP en metros, el denominador de la tangente (9 para 1:9) y la vía. Que el código no
 * se repita dentro del aislador lo comprueba el servicio.
 *
 * @param {object|null} child la aguja que se modifica, o null para una nueva
 */
export default function SwitchModal({child, trackOptions, onAccept, onClose}) {
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            code: child?.code ?? '',
            kp: toText(child?.kp),
            turnoutDenominator: toText(child?.turnoutDenominator),
            trackId: toOption(child?.trackId),
            enabled: child ? child.enabled !== false : true,
        },
        validate: {
            code: (value) => {
                const text = String(value ?? '').trim()
                if (!text) {
                    return 'El código es obligatorio'
                }
                return CODE_PATTERN.test(text) ? null : 'W y hasta cuatro cifras, como W31'
            },
            kp: KP,
            turnoutDenominator: (value) => WHOLE(value) ?? (String(value ?? '').trim() && Number(value) < 1 ? 'Como poco 1' : null),
        },
    })

    const submit = form.onSubmit((values) => onAccept({
        ...(child ?? {}),
        code: values.code.trim(),
        kp: toNumber(values.kp),
        turnoutDenominator: toNumber(values.turnoutDenominator),
        trackId: toId(values.trackId),
        enabled: values.enabled,
    }))

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} title={child ? 'Modificar aguja' : 'Nueva aguja'}>
            {/* El submit se queda aquí: por el árbol de React subiría hasta el formulario del aislador. */}
            <form noValidate onSubmit={(event) => {
                event.stopPropagation()
                submit(event)
            }}>
                <Stack>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <TextInput label="Código" withAsterisk maxLength={5} description="Como en el plano: W31" data-autofocus
                                   {...form.getInputProps('code')}/>
                        <TextInput label="KP (m)" {...form.getInputProps('kp')}/>
                        <TextInput label="Denominador de la tangente (1:n)" description="9 para un desvío 1:9"
                                   {...form.getInputProps('turnoutDenominator')}/>
                        <Select label="Vía" searchable clearable nothingFoundMessage="No hay ninguna" data={trackOptions}
                                {...form.getInputProps('trackId')}/>
                    </SimpleGrid>
                    <Checkbox label="Activa" {...form.getInputProps('enabled', {type: 'checkbox'})}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit">Aceptar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
