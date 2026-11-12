/**
 * Los decimales del dominio, cifra a cifra. Una cantidad de mto-stock o de mto-maintenance es
 * numeric(19,6): 13 enteros y 6 decimales, 19 cifras, y un número de JavaScript (coma flotante de 64
 * bits) solo guarda 15 con seguridad. 1234567890123.123456 pasado por Number es 1234567890123.1235, y
 * JSON.stringify no sabe escribir más de lo que el Number guarda.
 *
 * Por eso un decimal se trata aquí como texto, y solo es un Number cuando cabe exacto:
 *
 * - al leer (parseJsonExact, la respuesta de apiFetch), un número cuyo literal no sobrevive a la coma
 *   flotante llega como su texto, tal como lo escribió el servicio; los demás, como el número de siempre;
 * - al mandar (exactDecimal), lo escrito viaja como número JSON si cabe exacto y, si no, como texto, que
 *   Jackson convierte en BigDecimal cifra a cifra (su coerción de escalares, activa por defecto en los
 *   servicios);
 * - al comparar (sameDecimal, en un merge-patch), cifra a cifra y no como Number.
 */

// Un decimal sin exponente: signo opcional, enteros, punto y decimales. También 5. y .5, y +5.
const PLAIN_DECIMAL = /^([+-]?)(\d*)(?:\.(\d*))?$/

/**
 * La forma canónica de un decimal escrito: sin +, sin ceros a la izquierda ni a la derecha del punto,
 * sin punto si no hay decimales y sin -0. null si no es un decimal sin exponente.
 *
 * @param {string|number} value
 * @returns {string|null}
 */
export function canonicalDecimal(value) {
    const match = PLAIN_DECIMAL.exec(String(value).trim())
    if (!match || (match[2] === '' && (match[3] ?? '') === '')) {
        return null
    }
    const integer = match[2].replace(/^0+(?=\d)/, '') || '0'
    const fraction = (match[3] ?? '').replace(/0+$/, '')
    const digits = fraction ? `${integer}.${fraction}` : integer
    return match[1] === '-' && digits !== '0' ? `-${digits}` : digits
}

/** El mismo decimal, cifra a cifra (12.5 y 012.50 lo son); null si alguno no es un decimal sin exponente. */
export function sameDecimal(left, right) {
    const a = canonicalDecimal(left)
    const b = canonicalDecimal(right)
    return a === null || b === null ? null : a === b
}

/** Un decimal canónico cabe exacto en un Number si al escribir ese Number vuelve a salir él. */
function fitsInNumber(canonical) {
    return canonicalDecimal(String(Number(canonical))) === canonical
}

/**
 * Un decimal escrito, como viaja: el número si cabe exacto en coma flotante (lo de siempre) y, si no,
 * su texto canónico. Lo que no es un decimal no viaja: es un error de quien llama, que lo comprueba
 * antes (Number('5,4') sería NaN, que JSON convierte en null y borraría lo guardado).
 *
 * @param {string|number} value no vacío
 * @returns {number|string}
 */
export function exactDecimal(value) {
    const canonical = canonicalDecimal(value)
    if (canonical === null) {
        throw new Error(`No es un decimal: ${value}`)
    }
    return fitsInNumber(canonical) ? Number(canonical) : canonical
}

/**
 * JSON.parse, pero un número cuyo literal no cabe exacto en coma flotante llega como su texto
 * canónico en vez de como un Number recortado. Lee el literal con el tercer argumento del reviver
 * (context.source); en un navegador que no lo tiene, los números llegan como siempre.
 */
export function parseJsonExact(text) {
    return JSON.parse(text, (_key, value, context) => {
        if (typeof value !== 'number' || typeof context?.source !== 'string') {
            return value
        }
        const written = canonicalDecimal(context.source)
        // Con exponente (1.0E-7, o un Number que se escribe 1e+21) no se toca: no es una cifra del dominio.
        if (written === null) {
            return value
        }
        const kept = canonicalDecimal(String(value))
        return kept === null || kept === written ? value : written
    })
}
