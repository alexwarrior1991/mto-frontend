import {ApiError} from '../../api/errors.js'
import {errorMessage} from './messages.js'

/**
 * Vuelca los errores por campo del servicio sobre un formulario de @mantine/form (el port de
 * ServerValidation del backoffice). Cada error va a su campo si el formulario lo tiene, y lo que no se
 * puede atribuir se devuelve para avisarlo aparte. El dialogo sigue abierto en los dos casos.
 *
 * Funciona porque las propiedades de cada formulario se llaman como los campos del servicio. Cuando un
 * campo del servicio no es el del formulario (el sourceWarehouseId de una transferencia es el almacen
 * de origen del dialogo, y el differentWarehouses de su comprobacion, el de destino), aliases dice
 * adonde va.
 *
 * @param {Object<string, string>} [aliases] campo del servicio → campo del formulario
 * @returns {string[]} los mensajes que no tienen campo
 */
export function applyServerErrors(form, error, {aliases = {}} = {}) {
    if (!(error instanceof ApiError) || !error.hasFieldErrors) {
        return [errorMessage(error)]
    }
    const values = form.getValues()
    const byField = {}
    const unattributed = []
    for (const item of error.fieldErrors) {
        const message = item.message ?? item.code ?? 'Valor no válido'
        const path = toFormPath(aliases[item.field] ?? item.field)
        if (path && hasPath(values, path)) {
            byField[path] = message
        } else {
            unattributed.push(item.field ? `${item.field}: ${message}` : message)
        }
    }
    form.setErrors(byField)
    return unattributed
}

/** items[0].quantity, como lo nombra Spring, es items.0.quantity en @mantine/form. */
export function toFormPath(field) {
    if (!field) {
        return null
    }
    return field.replace(/\[(\d+)]/g, '.$1')
}

function hasPath(values, path) {
    let current = values
    for (const key of path.split('.')) {
        if (current === null || typeof current !== 'object' || !(key in current)) {
            return false
        }
        current = current[key]
    }
    return true
}
