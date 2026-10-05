import {http, HttpResponse} from 'msw'
import {setupServer} from 'msw/node'

/** El contador de la campana, que pide toda pantalla de quien tiene notification-inbox. */
export const UNREAD_COUNT_PATH = '/api/notifications/inbox/unread-count'

/**
 * El gateway simulado: el equivalente de MockRestServiceServer en el backoffice. Cada test declara con
 * server.use(...) las llamadas que espera, y una llamada sin manejador hace fallar el test (ver
 * setup.js).
 *
 * El único manejador por defecto es el contador de la campana, que está en la barra de toda pantalla de
 * quien puede leer su bandeja (todos los perfiles del dominio): nada sin leer. Un test que necesita otro
 * número lo cambia con server.use, que gana al de por defecto.
 */
export const server = setupServer(http.get(UNREAD_COUNT_PATH, () => HttpResponse.json({count: 0, capped: false})))
