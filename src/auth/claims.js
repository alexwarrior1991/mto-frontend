/**
 * El payload de un JWT, sin verificar la firma: eso lo hacen el gateway y cada servicio. Aqui solo se
 * lee para saber que ensenar (el menu, los botones, el diagnostico de Inicio).
 */
export function decodeJwtPayload(token) {
    if (typeof token !== 'string') {
        return null
    }
    const parts = token.split('.')
    if (parts.length < 2 || !parts[1]) {
        return null
    }
    try {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
        const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
        const payload = JSON.parse(new TextDecoder().decode(bytes))
        return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null
    } catch {
        return null
    }
}
