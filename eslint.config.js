import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import {defineConfig, globalIgnores} from 'eslint/config'

// Lo que se prohibe aqui son reglas de la aplicacion (ver CLAUDE.md), no gustos de estilo: el estilo
// lo fija .editorconfig, que es lo que usa WebStorm al formatear.

const NO_HTML = 'Ningun dato se convierte en HTML: se pinta como texto o con JSX.'

const NO_HTML_SYNTAX = [
    {selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]', message: NO_HTML},
    {selector: 'CallExpression[callee.property.name="insertAdjacentHTML"]', message: NO_HTML},
    {selector: 'CallExpression[callee.object.name="document"][callee.property.name=/^write(ln)?$/]', message: NO_HTML},
]

const RESTRICTED_PROPERTIES = [
    {property: 'innerHTML', message: NO_HTML},
    {property: 'outerHTML', message: NO_HTML},
    {
        property: 'signinResourceOwnerCredentials',
        message: 'La SPA entra con Authorization Code + PKCE. El password grant solo existe en local, para los scripts.',
    },
]

const STORAGE_GLOBALS = [
    {name: 'localStorage', message: 'El token vive solo en memoria: nada de localStorage.'},
    {name: 'sessionStorage', message: 'Solo src/auth/userManager.js guarda en sessionStorage el state de PKCE.'},
]

const FETCH_GLOBAL = [{name: 'fetch', message: 'Las llamadas a la API pasan por src/api/http.js.'}]

const BASE_IMPORTS = [
    {name: 'react-router-dom', message: 'En React Router 8 todo sale de react-router (RouterProvider, de react-router/dom).'},
    {name: 'axios', message: 'Las llamadas a la API pasan por src/api/http.js.'},
]

// Las capas: api/ es JavaScript puro, ui/ no conoce los modulos y nadie importa la composicion de app/.
function restrictImports(patterns = []) {
    return ['error', {paths: BASE_IMPORTS, patterns}]
}

const LAYERS = {
    api: [{
        group: ['react', 'react-dom', 'react-dom/*', 'react-router', 'react-router/*', '@mantine/*', '@tanstack/*',
            'oidc-client-ts', 'react-oidc-context', '**/auth/**', '**/app/**', '**/ui/**', '**/features/**'],
        message: 'src/api es JavaScript puro: ni React, ni Mantine, ni las capas de arriba. El token le llega con configureHttp.',
    }],
    ui: [{group: ['**/features/**', '**/app/**'], message: 'src/ui no conoce los modulos ni la composicion de la aplicacion.'}],
    auth: [{group: ['**/features/**', '**/app/**'], message: 'src/auth no conoce los modulos ni la composicion de la aplicacion.'}],
    features: [{group: ['**/app/**'], message: 'Un modulo no importa la composicion de la aplicacion.'}],
}

export default defineConfig([
    globalIgnores(['dist', 'coverage', 'reports', 'playwright-report', 'test-results']),
    {
        files: ['**/*.{js,jsx,mjs}'],
        extends: [
            js.configs.recommended,
            reactHooks.configs.flat.recommended,
            reactRefresh.configs.vite,
        ],
        languageOptions: {
            ecmaVersion: 'latest',
            globals: globals.browser,
            parserOptions: {ecmaFeatures: {jsx: true}},
        },
        rules: {
            'no-restricted-syntax': ['error', ...NO_HTML_SYNTAX],
            'no-restricted-properties': ['error', ...RESTRICTED_PROPERTIES],
            'no-restricted-globals': ['error', ...STORAGE_GLOBALS, ...FETCH_GLOBAL],
            'no-restricted-imports': restrictImports(),
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',
            'no-unused-vars': ['error', {varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_', caughtErrors: 'none'}],
        },
    },
    {files: ['src/api/**/*.js'], rules: {'no-restricted-imports': restrictImports(LAYERS.api)}},
    {files: ['src/ui/**/*.{js,jsx}'], rules: {'no-restricted-imports': restrictImports(LAYERS.ui)}},
    {files: ['src/auth/**/*.{js,jsx}'], rules: {'no-restricted-imports': restrictImports(LAYERS.auth)}},
    {files: ['src/features/**/*.{js,jsx}'], rules: {'no-restricted-imports': restrictImports(LAYERS.features)}},
    // Los dos sitios que pueden llamar a fetch, y el unico que guarda algo en el navegador.
    {
        files: ['src/api/http.js', 'src/app/runtimeConfig.js'],
        rules: {'no-restricted-globals': ['error', ...STORAGE_GLOBALS]},
    },
    {
        files: ['src/auth/userManager.js'],
        rules: {'no-restricted-globals': ['error', STORAGE_GLOBALS[0], ...FETCH_GLOBAL]},
    },
    // Tests: comprueban precisamente que el almacenamiento queda vacio.
    {
        files: ['src/test/**/*.{js,jsx}', 'src/**/*.test.{js,jsx}'],
        languageOptions: {globals: {...globals.browser, ...globals.node}},
        rules: {'no-restricted-globals': 'off', 'react-refresh/only-export-components': 'off'},
    },
    // Lo que corre en Node: configuracion, scripts y Playwright.
    {
        files: ['*.config.js', 'scripts/**/*.{js,mjs}', 'e2e/**/*.js'],
        languageOptions: {globals: globals.node},
        rules: {'no-restricted-globals': 'off'},
    },
])
