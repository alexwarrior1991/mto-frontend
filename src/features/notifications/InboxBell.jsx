import {ActionIcon, Indicator, Tooltip} from '@mantine/core'
import {IconBell} from '@tabler/icons-react'
import {Link} from 'react-router'
import {unreadCountText} from '../../api/notification/inbox.js'
import {INBOX_PATH} from './notificationRoutes.js'
import {bellLabel} from './notificationTexts.js'
import {useUnreadCount} from './useNotifications.js'

/**
 * La campana de la barra (el port de InboxBell): cuántas notificaciones tiene la persona sin leer, y el
 * camino a su bandeja. La pinta la barra solo con notification-inbox. El contador se pide al entrar y
 * cada 30 s con la pestaña visible; está acotado («100+»), y un fallo deja el número como estaba, sin
 * avisar. Su nombre dice también el número, que es lo que lee un lector de pantalla.
 */
export default function InboxBell() {
    const count = useUnreadCount()
    const label = bellLabel(count.data)
    const unread = count.data?.count ?? 0
    return (
        <Tooltip label={label} withArrow>
            <Indicator label={unreadCountText(count.data)} disabled={unread === 0} color="red" size={16} offset={6} inline>
                <ActionIcon component={Link} to={INBOX_PATH} variant="subtle" size="lg" aria-label={label}>
                    <IconBell size={20}/>
                </ActionIcon>
            </Indicator>
        </Tooltip>
    )
}
