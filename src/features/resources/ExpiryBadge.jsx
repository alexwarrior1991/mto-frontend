import {Badge} from '@mantine/core'
import {expiryColor, expiryText} from './resourcesTexts.js'

/**
 * El estado de una caducidad en una celda o una cabecera (expiryText con su color): una cualificación,
 * un documento de un vehículo o la calibración de un instrumento.
 */
export default function ExpiryBadge({expiresOn, expired = null, none, expiredLabel}) {
    return (
        <Badge variant="light" color={expiryColor(expiresOn, {expired})}>
            {expiryText(expiresOn, {expired, none, expiredLabel})}
        </Badge>
    )
}
