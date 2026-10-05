import {defineConfig, devices} from '@playwright/test'
import process from 'node:process'

/**
 * Pruebas de punta a punta en un navegador de verdad, contra la plataforma levantada (mto-platform)
 * con los dos frontales: la SPA en el 4200 (npm run dev o el contenedor) y el backoffice en el 8085.
 *
 * - En local, `npm run e2e` contra lo que ya esté levantado. La primera vez,
 *   `npx playwright install chromium` baja el navegador. PW_CHROMIUM_EXECUTABLE solo hace falta en
 *   el entorno de la nube de Claude, que trae su propio Chromium.
 * - En el CI de mto-frontend, mto-backoffice y mto-platform las corre el job «e2e» con
 *   mto-platform/scripts/e2e.sh, que levanta la plataforma entera con las imágenes de cada commit.
 *   Con CI, cada prueba tiene más margen (todo corre en la misma máquina), un test.only olvidado
 *   falla y el informe sale también como anotaciones de GitHub.
 *
 * Sin reintentos en ningún sitio: una prueba que falla se diagnostica (la traza queda en
 * test-results), no se repite hasta que pase.
 */
const CI = Boolean(process.env.CI)

export default defineConfig({
    testDir: 'e2e',
    timeout: CI ? 120_000 : 60_000,
    expect: {timeout: CI ? 15_000 : 5_000},
    forbidOnly: CI,
    retries: 0,
    workers: 1,
    reporter: CI ? [['list'], ['html', {open: 'never'}], ['github']] : [['list'], ['html', {open: 'never'}]],
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
