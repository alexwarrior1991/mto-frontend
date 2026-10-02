import {defineConfig, devices} from '@playwright/test'
import process from 'node:process'

/**
 * Pruebas de punta a punta en un navegador de verdad (npm run e2e), contra la plataforma levantada
 * (mto-platform) y la SPA en el 4200 (npm run dev o el contenedor). No corren en el CI: necesitan
 * Keycloak, el gateway y los servicios.
 *
 * La primera vez, `npx playwright install chromium` baja el navegador. PW_CHROMIUM_EXECUTABLE solo
 * hace falta en el entorno de la nube de Claude, que trae su propio Chromium.
 */
export default defineConfig({
    testDir: 'e2e',
    timeout: 60_000,
    workers: 1,
    reporter: [['list'], ['html', {open: 'never'}]],
    use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4200',
        locale: 'es-ES',
        timezoneId: 'Europe/Madrid',
        trace: 'retain-on-failure',
        launchOptions: {
            executablePath: process.env.PW_CHROMIUM_EXECUTABLE || undefined,
            // El navegador llega a Keycloak sin depender del fichero hosts.
            args: ['--host-resolver-rules=MAP auth.mto.local 127.0.0.1'],
        },
    },
})
