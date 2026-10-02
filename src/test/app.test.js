import {readdirSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import process from 'node:process'
import {matchRoutes} from 'react-router'
import {describe, expect, it, vi} from 'vitest'
import {apiProxy, gatewayUnavailable} from '../../vite.config.js'
import {LOV_RESOURCES} from '../api/configuration/lovResources.js'
import {appRoutes} from '../app/routes.js'
import {ROUTES} from '../app/routeTable.js'
import {loadRuntimeConfig, validateRuntimeConfig} from '../app/runtimeConfig.js'
import backoffice from './fixtures/backoffice-routes.json'
import notificationLinks from './fixtures/notification-links.json'

/**
 * La aplicacion entera: solo licencias libres, las mismas rutas que el backoffice, los enlaces de
 * mto-notification resolviendo a una pantalla, la configuracion del entorno y lo que hacen nginx y
 * el proxy de Vite con /api. Lo que hacia MtoBackofficeApplicationTests en el backoffice.
 */

// Vitest corre desde la raiz del proyecto; en jsdom, import.meta.url no es una URL file:.
const fromRoot = (path) => resolve(process.cwd(), path)
const read = (path) => readFileSync(fromRoot(path), 'utf8')

describe('solo licencias libres', () => {
    const ALLOWED = new Set(['MIT', 'MIT-0', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'BlueOak-1.0.0',
        'MPL-2.0', 'CC-BY-4.0', 'CC0-1.0', 'Unlicense'])
    // Componentes con version de pago: si aparecen, alguien ha metido lo que la aplicacion no admite.
    const PAID = [/^ag-grid-enterprise$/, /^@ag-grid-enterprise\//, /^@mui\/x-.*-(pro|premium)$/, /^highcharts/, /^@progress\/kendo/,
        /^@syncfusion\//, /^devextreme/, /^@devexpress\//, /^handsontable$/, /^@fullcalendar\/premium/, /^@bryntum\//,
        /^@tiptap-pro\//, /^@ckeditor\/ckeditor5-premium/, /^mapbox-gl$/, /^@mescius\//]

    const packages = Object.entries(JSON.parse(read('package-lock.json')).packages)
        .filter(([path]) => path.startsWith('node_modules/'))
        .map(([path, meta]) => ({name: path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length), license: meta.license}))

    it('cada paquete del lock lleva una licencia de la lista blanca', () => {
        const rejected = packages.filter(({license}) => !allowed(license))
        expect(rejected).toEqual([])
    })

    it('no hay ningun componente de pago', () => {
        expect(packages.filter(({name}) => PAID.some((pattern) => pattern.test(name)))).toEqual([])
    })

    // Una expresion SPDX con OR vale si alguna de sus opciones vale.
    function allowed(license) {
        if (typeof license !== 'string') {
            return false
        }
        return license.replace(/[()]/g, '').split(/\s+OR\s+/).some((option) => ALLOWED.has(option.trim()))
    }
})

describe('las rutas son las del backoffice', () => {
    const normalize = (path) => path.replace(/:[A-Za-z]+/g, ':param')

    it('estan todas, y no hay ninguna de mas', () => {
        expect(ROUTES.map((route) => normalize(route.path)).sort()).toEqual(backoffice.routes.map(normalize).sort())
    })

    it('los diecisiete catalogos', () => {
        expect(LOV_RESOURCES.map((resource) => resource.path)).toEqual(['anchorages', 'anchorage-foundations',
            'anchorage-foundation-types', 'assembly-configurations', 'cantilever-types', 'comercial-entity-types',
            'disconnector-functions', 'foundations', 'foundation-types', 'pole-types', 'portals', 'portal-types',
            'profile-statuses', 'return-supports', 'sectionings', 'steady-arm-types', 'support-types'])
    })

    it('cada enlace de las reglas de mto-notification abre una pantalla de esta aplicacion', () => {
        const routes = appRoutes()
        for (const template of notificationLinks.links) {
            const link = template.replace(/#\{[^}]*}/g, 'x1')
            const pathname = new URL(link, 'http://localhost').pathname
            const leaf = matchRoutes(routes, pathname)?.at(-1)?.route
            expect(leaf?.handle?.route, `${template} no abre ninguna pantalla`).toBeDefined()
        }
    })

    it('cada ruta pide sus permisos, salvo Inicio', () => {
        for (const route of ROUTES.filter((entry) => entry.path !== '')) {
            expect(route.requires?.length, route.path).toBeGreaterThan(0)
            expect(route.phase, route.path).toBeGreaterThanOrEqual(1)
        }
    })
})

describe('la configuracion de cada entorno', () => {
    it('se valida al arrancar: el realm es una URL http(s) y hace falta el cliente', () => {
        expect(validateRuntimeConfig({
            oidc: {authority: 'http://auth.mto.local:8082/realms/mto/', clientId: ' mto-frontend '},
            environment: 'local',
            backofficeUrl: 'http://localhost:8085/',
        })).toEqual({
            oidc: {authority: 'http://auth.mto.local:8082/realms/mto', clientId: 'mto-frontend'},
            environment: 'local',
            backofficeUrl: 'http://localhost:8085',
        })
        expect(validateRuntimeConfig({oidc: {authority: 'https://sso.example/realms/mto', clientId: 'mto-frontend'}, backofficeUrl: ''}))
            .toMatchObject({environment: '', backofficeUrl: null})
        expect(() => validateRuntimeConfig({oidc: {clientId: 'mto-frontend'}})).toThrow(/authority/)
        expect(() => validateRuntimeConfig({oidc: {authority: 'javascript:alert(1)', clientId: 'x'}})).toThrow(/authority/)
        expect(() => validateRuntimeConfig({oidc: {authority: 'http://auth/realms/mto', clientId: ''}})).toThrow(/clientId/)
    })

    it('se lee de /config.json, y la de desarrollo es valida', async () => {
        const fakeFetch = vi.fn(async () => ({ok: true, json: async () => JSON.parse(read('public/config.json'))}))
        await expect(loadRuntimeConfig(fakeFetch)).resolves.toMatchObject({oidc: {clientId: 'mto-frontend'}})
        expect(fakeFetch).toHaveBeenCalledWith('/config.json', {cache: 'no-store'})
        await expect(loadRuntimeConfig(async () => ({ok: false, status: 404}))).rejects.toThrow(/404/)
    })
})

describe('/api por el mismo origen y sin Origin', () => {
    it('nginx quita Origin y las cookies, deja subir 20 MB y sirve la SPA con su CSP', () => {
        const server = read('docker/nginx/default.conf.template')
        const headers = read('docker/nginx/security-headers.inc.template')

        expect(server).toContain('proxy_set_header Origin "";')
        expect(server).toContain('proxy_set_header Cookie "";')
        expect(server).toContain('client_max_body_size 20m;')
        expect(server).toContain('try_files $uri /index.html;')
        expect(server).toMatch(/location \/assets\/[\s\S]*immutable/)
        expect(server).toMatch(/location = \/config\.json[\s\S]*no-store/)
        expect(server).toContain('error_page 502 504 = @gateway_unavailable;')
        expect(headers).toContain("script-src 'self';")
        expect(headers).toContain("connect-src 'self' ${MTO_OIDC_AUTHORITY}/;")
        expect(headers).toContain("frame-ancestors 'none'")
    })

    it('el proxy de Vite quita Origin y, si el gateway no contesta, responde un 503 que la SPA sabe leer', () => {
        const handlers = {}
        apiProxy('http://localhost:8090').configure({on: (event, handler) => {
            handlers[event] = handler
        }})

        const proxyRequest = {removeHeader: vi.fn()}
        handlers.proxyReq(proxyRequest)
        expect(proxyRequest.removeHeader).toHaveBeenCalledWith('origin')

        const response = {headersSent: false, writeHead: vi.fn(), end: vi.fn()}
        handlers.error(new Error('ECONNREFUSED'), {}, response)
        expect(response.writeHead).toHaveBeenCalledWith(503, {'Content-Type': 'application/problem+json', 'Retry-After': '5'})
        expect(JSON.parse(response.end.mock.calls[0][0])).toMatchObject({status: 503, service: 'mto-gateway'})

        const sent = {headersSent: true, writeHead: vi.fn(), end: vi.fn()}
        gatewayUnavailable(sent)
        expect(sent.writeHead).not.toHaveBeenCalled()
    })
})

describe('WebStorm y Windows: lo local es npm', () => {
    const scripts = JSON.parse(read('package.json')).scripts

    it('cada configuracion compartida de .run llama a un script que existe', () => {
        const files = readdirSync(fromRoot('.run')).filter((file) => file.endsWith('.run.xml'))
        expect(files.length).toBeGreaterThan(0)
        for (const file of files) {
            const xml = read(`.run/${file}`)
            for (const [, script] of xml.matchAll(/<script value="([^"]+)"/g)) {
                expect(scripts[script], `${file} llama a «${script}»`).toBeDefined()
            }
        }
    })

    it('ningun script depende de bash: ni variables en linea ni rm -rf', () => {
        for (const [name, command] of Object.entries(scripts)) {
            expect(command, name).not.toMatch(/(^|&&\s*)[A-Z_]+=\S+\s/)
            expect(command, name).not.toMatch(/\brm\s+-rf\b|\bexport\s/)
        }
    })
})
