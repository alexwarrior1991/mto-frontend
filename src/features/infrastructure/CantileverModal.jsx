import {Button, Checkbox, Group, Modal, Select, SimpleGrid, Stack, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {lovChange, lovOptions, lovValue, optionalNumber, required, toNumber, toText} from './formValues.js'

const DECIMAL = optionalNumber()
const SIGNED_DECIMAL = optionalNumber({signed: true})
const WHOLE = optionalNumber({integer: true})
const SIGNED_WHOLE = optionalNumber({integer: true, signed: true})

/**
 * Una ménsula del perfil (el port de CantileverDialog): su tipo, sus medidas y, si lo lleva, su brazo
 * de atirantado, que es 1:1 y se quita mandándolo a null. Las alturas van en metros y el
 * descentramiento en milímetros (README_API.md §4 bis). Escribe en el editor del perfil solo al
 * aceptar: cancelar no cambia nada.
 *
 * @param {object|null} child la ménsula que se modifica, o null para una nueva
 */
export default function CantileverModal({child, cantileverTypes, steadyArmTypes, onAccept, onClose}) {
    const arm = child?.steadyArm ?? null
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            cantileverType: lovValue(child?.cantileverType),
            cwHeight: toText(child?.cwHeight),
            stagger: toText(child?.stagger),
            catenaryHeight: toText(child?.catenaryHeight),
            cwElevation: toText(child?.cwElevation),
            windDeflection: toText(child?.windDeflection),
            armAngle: toText(child?.armAngle),
            withArm: arm !== null,
            armLength: toText(arm?.length),
            steadyArmType: lovValue(arm?.steadyArmType),
        },
        validate: {
            cantileverType: required('El tipo de ménsula es obligatorio'),
            cwHeight: DECIMAL,
            stagger: SIGNED_WHOLE,
            catenaryHeight: DECIMAL,
            cwElevation: SIGNED_DECIMAL,
            windDeflection: DECIMAL,
            armAngle: SIGNED_DECIMAL,
            armLength: (value, values) => (values.withArm ? WHOLE(value) : null),
            steadyArmType: (value, values) => (values.withArm && !value ? 'El tipo de brazo es obligatorio' : null),
        },
    })

    const submit = form.onSubmit((values) => onAccept({
        ...(child ?? {}),
        cantileverType: lovChange(child?.cantileverType, values.cantileverType, cantileverTypes),
        cwHeight: toNumber(values.cwHeight),
        stagger: toNumber(values.stagger),
        catenaryHeight: toNumber(values.catenaryHeight),
        cwElevation: toNumber(values.cwElevation),
        windDeflection: toNumber(values.windDeflection),
        armAngle: toNumber(values.armAngle),
        steadyArm: values.withArm
            ? {
                ...(arm ?? {}),
                length: toNumber(values.armLength),
                steadyArmType: lovChange(arm?.steadyArmType, values.steadyArmType, steadyArmTypes),
            }
            : null,
    }))
    const withArm = form.getValues().withArm

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="lg" title={child ? 'Modificar ménsula' : 'Nueva ménsula'}>
            {/* El diálogo se pinta en un portal, pero sus eventos suben por el árbol de React hasta el
                formulario del perfil: el submit se queda aquí. */}
            <form noValidate onSubmit={(event) => {
                event.stopPropagation()
                submit(event)
            }}>
                <Stack>
                    <Select label="Tipo de ménsula" withAsterisk searchable nothingFoundMessage="No hay ninguno"
                            data={lovOptions(cantileverTypes, child?.cantileverType)} {...form.getInputProps('cantileverType')}/>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <TextInput label="Altura del hilo de contacto (m)" {...form.getInputProps('cwHeight')}/>
                        <TextInput label="Descentramiento (mm)" {...form.getInputProps('stagger')}/>
                        <TextInput label="Altura del sustentador (m)" {...form.getInputProps('catenaryHeight')}/>
                        <TextInput label="Elevación del hilo (m)" {...form.getInputProps('cwElevation')}/>
                        <TextInput label="Desplazamiento por viento (m)" {...form.getInputProps('windDeflection')}/>
                        <TextInput label="Ángulo del brazo (°)" {...form.getInputProps('armAngle')}/>
                    </SimpleGrid>
                    <Checkbox label="Lleva brazo de atirantado" {...form.getInputProps('withArm', {type: 'checkbox'})}/>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <TextInput label="Longitud del brazo (mm)" disabled={!withArm} {...form.getInputProps('armLength')}/>
                        <Select label="Tipo de brazo" withAsterisk={withArm} disabled={!withArm} searchable
                                nothingFoundMessage="No hay ninguno" data={lovOptions(steadyArmTypes, arm?.steadyArmType)}
                                {...form.getInputProps('steadyArmType')}/>
                    </SimpleGrid>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit">Aceptar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
