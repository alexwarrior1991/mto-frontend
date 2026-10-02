import {apiFetch} from './http.js'
import {SERVICES} from './services.js'

/**
 * Una lectura barata por servicio, a traves del gateway y con el token de la persona. Cierra el
 * circuito entero (realm, token, audiencia, gateway, servicio) desde la pantalla de Inicio.
 */
export const SERVICE_PROBES = Object.freeze(SERVICES.map((service) => ({
    service: service.name,
    clientId: service.clientId,
    ...service.probe,
})))

export async function runProbe(probe, {signal} = {}) {
    await apiFetch(probe.path, {query: probe.query, signal})
    return true
}
