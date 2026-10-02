import react from '@vitejs/plugin-react'
import {defineConfig, loadEnv} from 'vite'

// 4200 no es un puerto cualquiera: es el redirect URI y el web origin del cliente mto-frontend en el
// realm. strictPort hace que Vite falle en vez de saltar al 4201, donde Keycloak no dejaria entrar.
const PORT = 4200

/**
 * El navegador solo habla con su origen: /api llega al gateway a traves de este proxy, sin CORS.
 *
 * Se quita Origin porque el gateway lo reenvia y cada servicio tiene su propio CORS (solo admite el
 * 4200): sin Origin, ni el gateway ni el servicio ven una peticion CORS. La API se autentica con
 * Bearer y no con cookies, asi que quitarlo no abre nada. nginx hace lo mismo en el contenedor.
 */
export function apiProxy(target) {
    return {
        target,
        changeOrigin: true,
        configure: (proxy) => {
            proxy.on('proxyReq', (proxyRequest) => proxyRequest.removeHeader('origin'))
            // Se registra antes que el de Vite, que solo escribe si nadie lo ha hecho ya.
            proxy.on('error', (_error, _request, response) => gatewayUnavailable(response))
        },
    }
}

// Lo mismo que responde nginx cuando el gateway no contesta: un 503 que la SPA ya sabe leer.
export function gatewayUnavailable(response) {
    if (!response || typeof response.writeHead !== 'function' || response.headersSent) {
        return
    }
    response.writeHead(503, {'Content-Type': 'application/problem+json', 'Retry-After': '5'})
    response.end(JSON.stringify({
        title: 'Service Unavailable',
        status: 503,
        detail: 'El gateway no responde.',
        service: 'mto-gateway',
    }))
}

export default defineConfig(({mode}) => {
    // MTO_DEV_GATEWAY_URL y no MTO_GATEWAY_URL: esa la lee compose para el contenedor, y dentro del
    // contenedor localhost es el propio nginx.
    const env = loadEnv(mode, process.cwd(), 'MTO_')
    const proxy = {'/api': apiProxy(env.MTO_DEV_GATEWAY_URL || 'http://localhost:8090')}

    return {
        plugins: [react()],
        server: {host: 'localhost', port: PORT, strictPort: true, proxy},
        preview: {host: 'localhost', port: PORT, strictPort: true, proxy},
        build: {
            rolldownOptions: {
                output: {
                    // Las librerias van en sus propios ficheros: cambian mucho menos que la aplicacion y
                    // el navegador las conserva en cache de un despliegue a otro.
                    codeSplitting: {
                        groups: [
                            {name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/, priority: 30},
                            {name: 'mantine', test: /node_modules[\\/](@mantine|@floating-ui|@tabler)[\\/]/, priority: 20},
                            {name: 'vendor', test: /node_modules[\\/]/, priority: 10},
                        ],
                    },
                },
            },
        },
        test: {
            environment: 'jsdom',
            environmentOptions: {jsdom: {url: `http://localhost:${PORT}/`}},
            setupFiles: ['./src/test/setup.js'],
            include: ['src/**/*.test.{js,jsx}'],
            css: false,
            restoreMocks: true,
            unstubGlobals: true,
            testTimeout: 15000,
        },
    }
})
