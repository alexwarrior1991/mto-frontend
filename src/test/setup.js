import '@testing-library/jest-dom/vitest'
import {notifications} from '@mantine/notifications'
import {cleanup} from '@testing-library/react'
import {afterAll, afterEach, beforeAll} from 'vitest'
import {configureHttp} from '../api/http.js'
import {sessionExpired} from '../auth/sessionExpired.js'
import {server} from './server.js'

// Lo que jsdom no trae y Mantine necesita. Funciones normales y no vi.fn: restoreMocks las vaciaria.
window.matchMedia = window.matchMedia ?? ((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {
    },
    removeListener: () => {
    },
    addEventListener: () => {
    },
    removeEventListener: () => {
    },
    dispatchEvent: () => false,
}))

window.ResizeObserver = window.ResizeObserver ?? class {
    observe() {
    }

    unobserve() {
    }

    disconnect() {
    }
}

window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView ?? (() => {
})

// Una llamada que ningun test esperaba hace fallar el test que la hizo, con su metodo y su URL.
const unhandled = []

beforeAll(() => {
    server.listen({
        onUnhandledFrame({frame, defaults}) {
            const request = frame.data?.request
            unhandled.push(request ? `${request.method} ${request.url}` : String(frame.protocol))
            defaults.error()
        },
    })
})

afterEach(() => {
    cleanup()
    server.resetHandlers()
    notifications.clean()
    sessionExpired.close()
    configureHttp({
        getAccessToken: async () => null,
        renewAccessToken: async () => null,
        onSessionExpired: () => {
        },
    })
    window.localStorage.clear()
    window.sessionStorage.clear()
    const calls = unhandled.splice(0)
    if (calls.length > 0) {
        throw new Error(`Llamadas sin manejador en MSW: ${calls.join(', ')}`)
    }
})

afterAll(() => server.close())
