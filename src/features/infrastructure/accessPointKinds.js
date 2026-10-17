/**
 * El tipo de un punto de acceso a la vía y el lado por el que se entra (mto-configuration V28). Son
 * enumerados del maestro, que vuelve entero en cada modificación, como el tipo de instalación de un
 * aislador: un valor que el servicio añada mañana se enseña tal cual y, si nadie lo cambia, vuelve tal
 * cual. No se convierte en «desconocido», porque eso lo cambiaría al guardar.
 */
export const ACCESS_POINT_KINDS = Object.freeze([
    {value: 'PREPARED_ACCESS', label: 'Acceso preparado'},
    {value: 'LEVEL_CROSSING', label: 'Paso a nivel'},
    {value: 'DEPOT', label: 'Base o cochera'},
])

/** El lado de la vía, en el sentido creciente del KP. */
export const ACCESS_POINT_SIDES = Object.freeze([
    {value: 'LEFT', label: 'Izquierda'},
    {value: 'RIGHT', label: 'Derecha'},
    {value: 'BOTH', label: 'Los dos lados'},
])

export function kindLabel(value) {
    return labelIn(ACCESS_POINT_KINDS, value)
}

export function sideLabel(value) {
    return labelIn(ACCESS_POINT_SIDES, value)
}

/** Las opciones del editor, con la que tiene la fila aunque esta pantalla no la conozca. */
export function kindOptions(current) {
    return optionsWith(ACCESS_POINT_KINDS, current)
}

export function sideOptions(current) {
    return optionsWith(ACCESS_POINT_SIDES, current)
}

function labelIn(options, value) {
    if (!value) {
        return ''
    }
    return options.find((option) => option.value === value)?.label ?? value
}

function optionsWith(options, current) {
    if (!current || options.some((option) => option.value === current)) {
        return options
    }
    return [{value: current, label: current}, ...options]
}
