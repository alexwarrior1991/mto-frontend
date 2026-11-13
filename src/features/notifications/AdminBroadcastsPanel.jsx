import {Button, Group, Stack, Text} from '@mantine/core'
import {IconMailForward, IconSpeakerphone} from '@tabler/icons-react'
import {useState} from 'react'
import {lastSentText} from './adminTexts.js'
import BroadcastModal from './BroadcastModal.jsx'
import TestEmailModal from './TestEmailModal.jsx'

/**
 * Los avisos que manda una persona y no una regla (el port de AdminBroadcastsPanel): el correo de prueba
 * (POST /admin/test-email), para comprobar que el canal funciona, y el aviso general
 * (POST /admin/broadcasts), que llega a personas de verdad. Esta pestaña no pide nada al abrirse; dice
 * lo último que se mandó desde ella. Los dos dejan entregas, que se releen si su pestaña ya se abrió.
 */
export default function AdminBroadcastsPanel() {
    // null: cerrado; 'test-email' o 'broadcast': su diálogo.
    const [dialog, setDialog] = useState(null)
    const [last, setLast] = useState(null)
    const close = () => setDialog(null)

    return (
        <Stack>
            <Text size="sm">
                El correo de prueba manda un mensaje a la dirección que digas y te deja la notificación en tu bandeja: sirve para
                comprobar el canal de correo. El aviso general lo reciben las audiencias que elijas, por la bandeja, por correo o por
                los dos.
            </Text>
            <Group gap="sm">
                <Button variant="default" leftSection={<IconMailForward size={16}/>} onClick={() => setDialog('test-email')}>
                    Correo de prueba
                </Button>
                <Button variant="default" leftSection={<IconSpeakerphone size={16}/>} onClick={() => setDialog('broadcast')}>
                    Aviso general
                </Button>
            </Group>
            {last && <Text size="sm" aria-live="polite">{lastSentText(last)}</Text>}
            {dialog === 'test-email' && <TestEmailModal onSent={setLast} onClose={close}/>}
            {dialog === 'broadcast' && <BroadcastModal onSent={setLast} onClose={close}/>}
        </Stack>
    )
}
