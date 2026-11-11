import {ApiError} from '../../api/errors.js'
import {errorMessage} from './messages.js'

/**
 * Vuelca los errores por campo del servicio sobre un formulario de @mantine/form (el port de
 * ServerValidation del backoffice). El dialogo sigue abierto, y ningun error se pierde: cada uno acaba
 * en uno de estos cuatro sitios, el primero que case.
 *
 * 1. Su campo, si el formulario lo tiene: las propiedades de cada formulario se llaman como los campos
 *    del servicio (poleType), tambien las anidadas (parkings[0].kp es parkings.0.kp). Cuando un campo
 *    del servicio no es el del formulario (el sourceWarehouseId de una transferencia es el almacen de
 *    origen del dialogo), aliases dice adonde va.
 * 2. El campo de la lista, si es un elemento de una lista de valores (sectionings[1], el segundo
 *    seccionamiento elegido en un desplegable multiple): el elemento no tiene campo propio.
 * 3. La coleccion de hijos que el editor lleva fuera del formulario, en su tabla (las mensulas de un
 *    perfil, las agujas de un aislador): children dice, por el nombre de la coleccion en el cuerpo,
 *    quien recibe sus errores, cada uno con la posicion del hijo y el campo tal como lo nombra el
 *    servicio (cantilevers[1].cantileverType → {index: 1, field: 'cantileverType'}). Se llama siempre,
 *    tambien con una lista vacia, para que lo de un intento anterior no se quede pintado.
 * 4. Lo que no cae en ninguno se devuelve, con su ruta delante, para avisarlo aparte
 *    (disconnectors[0].connectedTrackId, o [1].poleType de un lote).
 *
 * La ruta no se traduce: el campo de un hijo se dice como lo dice el servicio.
 *
 * @param {Object<string, string>} [aliases] campo del servicio → campo del formulario
 * @param {Object<string, Function>} [children] coleccion de hijos → (errores) => nada, con
 *        errores = [{index, field, message}]
 * @returns {string[]} los mensajes que no tienen campo
 */
export function applyServerErrors(form, error, {aliases = {}, children = {}} = {}) {
    const byChild = Object.fromEntries(Object.keys(children).map((name) => [name, []]))
    const report = () => Object.entries(children).forEach(([name, show]) => show(byChild[name]))
    if (!(error instanceof ApiError) || !error.hasFieldErrors) {
        report()
        return [errorMessage(error)]
    }
    const values = form.getValues()
    const byField = {}
    const unattributed = []
    for (const item of error.fieldErrors) {
        const message = item.message ?? item.code ?? 'Valor no válido'
        const field = aliases[item.field] ?? item.field
        const target = formTarget(values, toFormPath(field))
        const child = target ? null : childError(field, children)
        if (target) {
            // Dos elementos de la misma lista caen en el mismo campo: se dicen los dos.
            byField[target] = byField[target] ? `${byField[target]}. ${message}` : message
        } else if (child) {
            byChild[child.collection].push({index: child.index, field: child.field, message})
        } else {
            unattributed.push(item.field ? `${item.field}: ${message}` : message)
        }
    }
    form.setErrors(byField)
    report()
    return unattributed
}

/**
 * Como se dice el error de un hijo debajo de su tabla: «Fila 2 · cantileverType: …», con la fila que
 * ocupa en la tabla (la lista viaja en ese orden) y el campo tal como lo nombra el servicio.
 */
export function childErrorText({index, field, message}) {
    const row = index === null ? '' : `Fila ${index + 1}`
    const where = [row, field].filter(Boolean).join(' · ')
    return where ? `${where}: ${message}` : message
}

/** items[0].quantity, como lo nombra Spring, es items.0.quantity en @mantine/form. */
export function toFormPath(field) {
    if (!field) {
        return null
    }
    return field.replace(/\[(\d+)]/g, '.$1')
}

/**
 * El campo del formulario al que va una ruta, o null si no tiene ninguno. El elemento de una lista de
 * valores (sectionings.1) no tiene campo: va al de la lista. La fila de una lista de objetos
 * (parkings.0) si es una ruta del formulario, y se queda como esta.
 */
function formTarget(values, path) {
    if (!path) {
        return null
    }
    const element = /^(.+)\.\d+$/.exec(path)
    if (element && Array.isArray(valueAt(values, element[1]))) {
        const value = valueAt(values, path)
        if (value === MISSING || value === null || typeof value !== 'object') {
            return element[1]
        }
    }
    return valueAt(values, path) === MISSING ? null : path
}

/** cantilevers[1].steadyArm.steadyArmType → {collection: 'cantilevers', index: 1, field: 'steadyArm.steadyArmType'}. */
function childError(field, children) {
    const match = /^([^.[\]]+)(?:\[(\d+)])?(?:\.(.+))?$/.exec(field ?? '')
    if (!match || !Object.hasOwn(children, match[1])) {
        return null
    }
    return {collection: match[1], index: match[2] === undefined ? null : Number(match[2]), field: match[3] ?? ''}
}

const MISSING = Symbol('missing')

/** El valor de una ruta del formulario; MISSING si el formulario no la tiene. */
function valueAt(values, path) {
    let current = values
    for (const key of path.split('.')) {
        if (current === null || typeof current !== 'object' || !(key in current)) {
            return MISSING
        }
        current = current[key]
    }
    return current
}
