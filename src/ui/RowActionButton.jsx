import {ActionIcon, Tooltip} from '@mantine/core'

/**
 * Una acción de una fila de tabla: un icono con su nombre completo («Modificar VIA 1»), que es lo que
 * lee un lector de pantalla y lo que buscan los tests, y la acción sola en el tooltip. Deshabilitada,
 * el tooltip dice por qué (un equipo con 2 linemen no deja salir a ninguno).
 */
export default function RowActionButton({label, tooltip, icon: Icon, color, onClick, disabled = false}) {
    return (
        <Tooltip label={tooltip} withArrow>
            <ActionIcon variant="subtle" color={color} aria-label={label} onClick={onClick} disabled={disabled}>
                <Icon size={16}/>
            </ActionIcon>
        </Tooltip>
    )
}
