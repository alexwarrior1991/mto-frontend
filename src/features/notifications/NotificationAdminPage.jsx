import {Stack, Title} from '@mantine/core'
import LazyTabs from '../../ui/LazyTabs.jsx'
import AdminBroadcastsPanel from './AdminBroadcastsPanel.jsx'
import AdminDeadLettersPanel from './AdminDeadLettersPanel.jsx'
import AdminDeliveriesPanel from './AdminDeliveriesPanel.jsx'
import AdminRulesPanel from './AdminRulesPanel.jsx'
import AdminSourcesPanel from './AdminSourcesPanel.jsx'

const TABS = [
    {value: 'sources', label: 'Fuentes', render: () => <AdminSourcesPanel/>},
    {value: 'dead-letters', label: 'Mensajes muertos (DLQ)', render: () => <AdminDeadLettersPanel/>},
    {value: 'deliveries', label: 'Entregas', render: () => <AdminDeliveriesPanel/>},
    {value: 'rules', label: 'Reglas', render: () => <AdminRulesPanel/>},
    {value: 'broadcasts', label: 'Avisos manuales', render: () => <AdminBroadcastsPanel/>},
]

/**
 * notificaciones/administracion: la administración de mto-notification (el port de
 * NotificationAdminView), toda con notification-admin: cómo están sus fuentes, qué guardan sus colas de
 * mensajes muertos (y reprocesarlas), las entregas de correo (y reintentar las que no salieron), las
 * reglas cargadas y los avisos manuales.
 *
 * Cada pestaña pide sus datos la primera vez que se abre y con su «Actualizar»: al entrar solo se piden
 * las fuentes, y nada se sondea. Aquí no se decide nada: lo que una cola o una entrega admite lo dice el
 * servicio, y lo único que se copia de él es lo justo para no ofrecer lo que va a fallar.
 */
export default function NotificationAdminPage({title}) {
    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <LazyTabs tabs={TABS}/>
        </Stack>
    )
}
