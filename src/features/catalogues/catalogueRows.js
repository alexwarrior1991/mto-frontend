/**
 * Lo que la pantalla hace con las filas que ya tiene: filtrar, ordenar y contar. El catalogo llega
 * entero del servicio, asi que el filtro es local (como en el backoffice) y no vuelve a llamar.
 */

const COLLATOR = new Intl.Collator('es', {numeric: true, sensitivity: 'base'})

/** Para comparar sin distinguir mayusculas ni tildes: «seccion» encuentra «Sección». */
export function normalizeText(value) {
    return String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export function filterRows(rows, {text = '', onlyEnabled = false} = {}) {
    const needle = normalizeText(text).trim()
    return rows.filter((row) => (!onlyEnabled || row.enabled === true)
        && (!needle || normalizeText(row.code).includes(needle) || normalizeText(row.description).includes(needle)))
}

/** Por codigo o por descripcion, en orden natural (PT2 antes que PT10) y sin mirar tildes. */
export function sortRows(rows, {column = 'code', direction = 'asc'} = {}) {
    const sign = direction === 'desc' ? -1 : 1
    return [...rows].sort((a, b) => sign * COLLATOR.compare(String(a[column] ?? ''), String(b[column] ?? '')))
}

export function countText(shown, total) {
    const noun = total === 1 ? 'entrada' : 'entradas'
    return shown === total ? `${total} ${noun}` : `${shown} de ${total} ${noun}`
}

/** «N entradas creadas», «1 entrada borrada»: el participio concuerda con entrada. */
export function entriesText(count, participle) {
    return count === 1 ? `1 entrada ${participle}` : `${count} entradas ${participle}s`
}

/** Una entrada en un desplegable: su codigo y su descripcion. */
export function describeEntry(entry) {
    return entry.description ? `${entry.code} · ${entry.description}` : String(entry.code ?? '')
}

/** Las entradas del catalogo padre, por codigo; la que tiene la fila sale aunque ya no este. */
export function parentOptions(rows, current) {
    const options = sortRows(rows ?? []).map((row) => ({value: String(row.id), label: describeEntry(row)}))
    const id = current?.id
    if (id !== null && id !== undefined && !options.some((option) => option.value === String(id))) {
        options.unshift({value: String(id), label: describeEntry(current)})
    }
    return options
}
