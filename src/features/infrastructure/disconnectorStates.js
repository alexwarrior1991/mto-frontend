/**
 * El estado normal y el accionamiento de un seccionador (mto-configuration V25). Los dos son
 * opcionales: vacío es «sin dato».
 */
export const NORMAL_STATES = Object.freeze([
    {value: 'true', label: 'Normalmente abierto'},
    {value: 'false', label: 'Normalmente cerrado'},
])

/** De lo que trae la fila (true, false o nada) al valor del desplegable. */
export function normalStateValue(normallyOpen) {
    return typeof normallyOpen === 'boolean' ? String(normallyOpen) : null
}

/** Del desplegable a lo que viaja: true, false o null. */
export function normallyOpenOf(value) {
    return value === null || value === undefined ? null : value === 'true'
}

/**
 * Cómo se acciona. Es un enumerado del maestro, que vuelve entero en cada modificación, como el tipo
 * de instalación de un aislador: un valor que el servicio añada mañana se enseña tal cual y, si nadie
 * lo cambia, vuelve tal cual.
 */
export const DRIVE_TYPES = Object.freeze([
    {value: 'MOTOR', label: 'Motor'},
    {value: 'MANUAL', label: 'Manual'},
])

/** Las opciones del editor, con la que tiene la fila aunque esta pantalla no la conozca. */
export function driveTypeOptions(current) {
    if (!current || DRIVE_TYPES.some((type) => type.value === current)) {
        return DRIVE_TYPES
    }
    return [{value: current, label: current}, ...DRIVE_TYPES]
}
