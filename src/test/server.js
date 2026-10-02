import {setupServer} from 'msw/node'

/**
 * El gateway simulado: el equivalente de MockRestServiceServer en el backoffice. No trae manejadores
 * por defecto: cada test declara con server.use(...) las llamadas que espera, y una llamada sin
 * manejador hace fallar el test (ver setup.js).
 */
export const server = setupServer()
