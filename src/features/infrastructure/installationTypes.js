/**
 * Cómo está instalado un aislador de sección. Es un enumerado del maestro, que vuelve entero en cada
 * modificación: un valor que el servicio añada mañana se enseña tal cual y, si nadie lo cambia,
 * vuelve tal cual. No se convierte en «desconocido», porque eso lo cambiaría al guardar.
 */
export const INSTALLATION_TYPES = Object.freeze([
    {value: 'TRACK_CONNECTION', label: 'Conexión de vías'},
    {value: 'IN_TRACK', label: 'En una vía'},
])

export function installationLabel(value) {
    if (!value) {
        return ''
    }
    return INSTALLATION_TYPES.find((type) => type.value === value)?.label ?? value
}

/** Las opciones del editor, con la que tiene la fila aunque esta pantalla no la conozca. */
export function installationOptions(current) {
    if (!current || INSTALLATION_TYPES.some((type) => type.value === current)) {
        return INSTALLATION_TYPES
    }
    return [{value: current, label: current}, ...INSTALLATION_TYPES]
}
