import {Button, Group} from '@mantine/core'
import {IconAdjustments, IconArrowDown, IconArrowsExchange, IconArrowUp} from '@tabler/icons-react'
import {useState} from 'react'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import MovementModal from './MovementModal.jsx'

/**
 * Los botones que abren un movimiento (el port de StockOperations). Entrada, salida y transferencia
 * piden stock-write; el ajuste, además, stock-adjust. Sin permiso no hay botón, pero quien manda es el
 * 403 del servicio.
 *
 * @param {Function} prefill lo que la pantalla ya sabe ({material, warehouse, project}), leído al abrir
 */
export default function StockOperations({prefill}) {
    const session = useSession()
    const [opening, setOpening] = useState(null)
    if (!session.has(P.STOCK_WRITE)) {
        return null
    }
    const open = (kind) => setOpening({kind, initial: prefill()})

    return (
        <>
            <Group gap="xs">
                <Button size="xs" variant="light" leftSection={<IconArrowDown size={14}/>} onClick={() => open('entry')}>Entrada</Button>
                <Button size="xs" variant="light" leftSection={<IconArrowUp size={14}/>} onClick={() => open('output')}>Salida</Button>
                <Button size="xs" variant="light" leftSection={<IconArrowsExchange size={14}/>} onClick={() => open('transfer')}>
                    Transferencia
                </Button>
                {session.has(P.STOCK_ADJUST) && (
                    <Button size="xs" variant="light" leftSection={<IconAdjustments size={14}/>} onClick={() => open('adjustment')}>
                        Ajuste
                    </Button>
                )}
            </Group>
            {opening && <MovementModal kind={opening.kind} initial={opening.initial} onClose={() => setOpening(null)}/>}
        </>
    )
}
