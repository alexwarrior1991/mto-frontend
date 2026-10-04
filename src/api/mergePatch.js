/**
 * Una modificacion de mto-maintenance es un PATCH application/merge-patch+json (RFC 7396) con la
 * version leida (el port de MergePatch y Changes del backoffice):
 *
 * - lo que cambio viaja con su valor;
 * - lo que se vacio viaja a null (que el servicio lo admita es cosa suya: 400 VAL-001 si no);
 * - lo que no cambio no viaja;
 * - la version leida va siempre: si otra persona guardo antes, el servicio responde 409 CON-001.
 *
 * Los textos se comparan recortados (un blanco no es un cambio) y los numeros como numeros (12.1 y
 * 12.100 son lo mismo). Una lista que el servicio guarda como conjunto (las vias de un turno, sus
 * seccionadores, los tipos de una tarea) se compara sin orden, y vacia es vaciarla: viaja a null. Si
 * nada cambio devuelve null, y la pantalla cierra el dialogo sin llamar.
 */

export const MERGE_PATCH = 'application/merge-patch+json'

/**
 * @param {object} original la fila tal como se leyo del servicio
 * @param {object} values lo que hay en el formulario
 * @param {object} options
 * @param {string[]} options.fields los campos que el formulario puede cambiar
 * @param {string[]} [options.numberFields] los que se comparan como numero
 * @param {string[]} [options.setFields] las listas que se comparan sin orden
 * @param {number} options.version la version leida
 */
export function buildMergePatch(original, values, {fields, numberFields = [], setFields = [], version}) {
    if (!Array.isArray(fields) || fields.length === 0) {
        throw new Error('Un merge-patch declara los campos que puede cambiar')
    }
    const patch = {}
    for (const field of fields) {
        const asSet = setFields.includes(field)
        const before = normalize(original?.[field], asSet)
        const after = normalize(values?.[field], asSet)
        if (asSet ? sameSet(before, after) : same(before, after, numberFields.includes(field))) {
            continue
        }
        patch[field] = after
    }
    if (Object.keys(patch).length === 0) {
        return null
    }
    if (version === null || version === undefined) {
        throw new Error('Un merge-patch lleva siempre la version leida')
    }
    return {...patch, version}
}

function normalize(value, asSet = false) {
    if (value === undefined || value === null) {
        return null
    }
    if (asSet && Array.isArray(value) && value.length === 0) {
        return null
    }
    if (typeof value === 'string') {
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    }
    return value
}

function same(before, after, asNumber) {
    if (before === null || after === null) {
        return before === after
    }
    if (asNumber) {
        return Number(before) === Number(after)
    }
    if (typeof before === 'object' || typeof after === 'object') {
        return JSON.stringify(before) === JSON.stringify(after)
    }
    return before === after
}

/** Dos conjuntos son el mismo con los mismos elementos en cualquier orden; los ids se comparan como texto. */
function sameSet(before, after) {
    if (before === null || after === null) {
        return before === after
    }
    const left = new Set(before.map(String))
    const right = new Set(after.map(String))
    return left.size === right.size && [...left].every((item) => right.has(item))
}
