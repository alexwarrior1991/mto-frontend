import {ActionIcon, Tooltip} from '@mantine/core'

/**
 * Una acción de una fila de tabla: un icono con su nombre completo («Modificar VIA 1»), que es lo que
 * lee un lector de pantalla y lo que buscan los tests, y la acción sola en el tooltip.
 */
export default function RowActionButton({label, tooltip, icon: Icon, color, onClick}) {
    return (
        <Tooltip label={tooltip} withArrow>
            <ActionIcon variant="subtle" color={color} aria-label={label} onClick={onClick}>
                <Icon size={16}/>
            </ActionIcon>
        </Tooltip>
    )
}
