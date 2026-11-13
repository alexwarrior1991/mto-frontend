import {Button, Group, Modal, MultiSelect, Select, Stack, Textarea, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {useState} from 'react'
import {
    AUDIENCE_KINDS, audiencesProblem, BODY_MAX, BROADCAST_CHANNELS, broadcastRequest, LINK_RULE, linkProblem, TITLE_MAX,
} from '../../api/notification/admin.js'
import {ACTIVITY_SEVERITY} from '../../api/notification/enums.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import {saveErrors} from '../../ui/errors/saveErrors.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {broadcastConfirmation} from './adminTexts.js'
import {countText} from './notificationTexts.js'
import {useSendBroadcast} from './useNotifications.js'

const AUDIENCES_HELP = `Una por línea, CLASE:clave: ${AUDIENCE_KINDS.map((kind) => kind.example).join(', ')}`

/** Un elemento de una lista del servicio (audiences[0]) cae en su campo, que aquí es un texto: una por línea. */
const LIST_ELEMENT = /^(audiences|channels)\[\d+]$/

/**
 * Un aviso general (POST /admin/broadcasts, el port de BroadcastDialog): un título, y si se quiere un
 * cuerpo y un enlace, para las audiencias que se escriban (CLASE:clave, una por línea) y por los canales
 * que se elijan.
 *
 * - Solo se ofrece lo que el servicio acepta (sus cuatro clases de audiencia, sus dos canales, sus tres
 *   gravedades) y se comprueba lo evidente antes de llamar. Qué perfiles o roles existen no se comprueba:
 *   el servicio tampoco, y una audiencia que nadie tiene no le llega a nadie.
 * - Llega a personas de verdad y no se puede retirar: antes de enviarlo se confirma, diciendo a quién va
 *   y por dónde. Sin lo evidente no se llega ni a confirmar, y hasta confirmar no se llama.
 * - Lo vacío no viaja. Los errores del servicio van a su campo, con el diálogo abierto; un 422 NTF-422
 *   (una audiencia o un canal que el servicio no conoce) se avisa con su detalle.
 *
 * @param {Function} onSent la notificación creada, para decir lo último que se mandó
 */
export default function BroadcastModal({onSent, onClose}) {
    // Las propiedades se llaman como los campos de BroadcastRequest, para que sus errores caigan en su campo.
    const form = useForm({
        mode: 'controlled',
        initialValues: {title: '', body: '', link: '', severity: 'INFO', audiences: '', channels: ['inbox']},
        validate: {
            title: (value) => {
                if (value.trim() === '') {
                    return 'El título es obligatorio'
                }
                return value.trim().length > TITLE_MAX ? `Como mucho ${TITLE_MAX} caracteres` : null
            },
            body: (value) => (value.length > BODY_MAX ? `Como mucho ${BODY_MAX} caracteres` : null),
            link: linkProblem,
            severity: (value) => (value ? null : 'La gravedad es obligatoria'),
            audiences: audiencesProblem,
            channels: (value) => (value.length === 0 ? 'Al menos un canal' : null),
        },
    })
    // null: escribiendo; la petición: confirmando.
    const [confirming, setConfirming] = useState(null)
    const sending = useSendBroadcast()

    const confirm = form.onSubmit((values) => setConfirming(broadcastRequest(values)))

    const send = () => {
        const request = confirming
        sending.mutate(request, {
            onSuccess: (sent) => {
                const audiences = Array.isArray(sent?.audiences) && sent.audiences.length > 0 ? sent.audiences.length : request.audiences.length
                notifySuccess(`Aviso enviado a ${countText(audiences, 'audiencia', 'audiencias')}`)
                onSent(sent)
                onClose()
            },
            onError: (error) => {
                setConfirming(null)
                const aliases = Object.fromEntries((error?.fieldErrors ?? [])
                    .map((item) => [item.field, LIST_ELEMENT.exec(item.field ?? '')?.[1]])
                    .filter(([, field]) => field))
                saveErrors(form, {aliases})(error)
            },
        })
    }

    return (
        <Modal opened onClose={onClose} title="Aviso general" closeOnClickOutside={false} size="lg">
            <form onSubmit={confirm} noValidate>
                <Stack>
                    <TextInput label="Título" withAsterisk data-autofocus {...form.getInputProps('title')}/>
                    <Textarea label="Cuerpo" rows={4} {...form.getInputProps('body')}/>
                    <TextInput label="Enlace" description={LINK_RULE} {...form.getInputProps('link')}/>
                    <Select label="Gravedad" withAsterisk allowDeselect={false} data={ACTIVITY_SEVERITY.selectable()}
                            {...form.getInputProps('severity')}/>
                    <Textarea label="Audiencias" withAsterisk rows={4} description={AUDIENCES_HELP} {...form.getInputProps('audiences')}/>
                    <MultiSelect label="Canales" withAsterisk data={BROADCAST_CHANNELS}
                                 description="El correo va a la dirección de cada persona de la audiencia"
                                 {...form.getInputProps('channels')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit">Enviar</Button>
                    </Group>
                </Stack>
            </form>
            {confirming && (
                <ConfirmModal title="Enviar el aviso general" confirmLabel="Enviar" cancelLabel="Volver" confirmColor="blue"
                              loading={sending.isPending} onConfirm={send} onClose={() => setConfirming(null)}>
                    {broadcastConfirmation(confirming)}
                </ConfirmModal>
            )}
        </Modal>
    )
}
