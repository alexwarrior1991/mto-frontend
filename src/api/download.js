import {apiFetch} from './http.js'

/**
 * Los ficheros de un servicio (la exportacion de un trabajo, un informe en Excel o PDF) se piden con
 * el token de la persona y se guardan desde un Blob. Un <a href> a /api no llevaria el token, que vive
 * en memoria, y por eso no se usa nunca; tampoco el Location ni el downloadUrl de los servicios, que
 * son rutas internas.
 */
export async function downloadFile(path, {query, fallbackName = 'fichero', signal} = {}) {
    const {blob, headers} = await apiFetch(path, {query, signal, responseType: 'blob'})
    const name = fileNameFromDisposition(headers.get('content-disposition')) ?? fallbackName
    saveBlob(blob, name)
    return name
}

/** El nombre que propone Content-Disposition: filename* (RFC 5987, con su codificacion) gana a filename. */
export function fileNameFromDisposition(header) {
    if (!header) {
        return null
    }
    const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header)
    if (extended) {
        try {
            return clean(decodeURIComponent(extended[2].trim().replace(/^"(.*)"$/, '$1')))
        } catch {
            // Mal codificado: se prueba con filename.
        }
    }
    const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(header)
    if (plain) {
        return clean((plain[1] ?? plain[2]).trim())
    }
    return null
}

// Solo el nombre: nada de rutas que el servicio pudiera colar.
function clean(name) {
    const base = name.split(/[\\/]/).pop()?.trim()
    return base ? base : null
}

export function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.rel = 'noopener'
    anchor.style.display = 'none'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
}
