import {CODE_MAX_LENGTH, DESCRIPTION_MAX_LENGTH} from './limits.js'

const SEPARATOR = /;|\t| - /

/**
 * El alta multiple: una entrada por linea, CODIGO;Descripcion. Tambien vale el tabulador o « - »
 * como separador, que es lo que sale al pegar desde una hoja de calculo o desde un documento. Las
 * lineas en blanco no cuentan. Es el port de LovBulkCreateDialog.parse del backoffice: tratamiento
 * de lo que se escribe, no una regla de negocio. Lo que el servicio acepte o rechace lo decide el.
 *
 * @returns {{entries: {code: string, description: string}[], error: string|null}} las entradas, o el
 * error de la primera linea que no se entiende (numerada desde 1, como la ve la persona)
 */
export function parseBulkLines(text) {
    const entries = []
    const rows = String(text ?? '').split(/\r\n|\r|\n/)
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index].trim()
        if (!row) {
            continue
        }
        const line = index + 1
        const match = SEPARATOR.exec(row)
        const code = match ? row.slice(0, match.index).trim() : ''
        const description = match ? row.slice(match.index + match[0].length).trim() : ''
        if (!code || !description) {
            return failed(`La línea ${line} no tiene código y descripción separados por «;»`)
        }
        if (code.length > CODE_MAX_LENGTH) {
            return failed(`La línea ${line} tiene un código de más de ${CODE_MAX_LENGTH} caracteres`)
        }
        if (description.length > DESCRIPTION_MAX_LENGTH) {
            return failed(`La línea ${line} tiene una descripción de más de ${DESCRIPTION_MAX_LENGTH} caracteres`)
        }
        entries.push({code, description})
    }
    return entries.length === 0 ? failed('No hay ninguna entrada') : {entries, error: null}
}

function failed(error) {
    return {entries: [], error}
}
