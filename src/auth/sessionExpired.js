/**
 * El aviso de sesion caducada, como almacen minimo: lo abre http.js, que no conoce React, y lo pinta
 * SessionExpiredModal con useSyncExternalStore.
 */

let opened = false
const listeners = new Set()

function notify() {
    listeners.forEach((listener) => listener())
}

export const sessionExpired = Object.freeze({
    open() {
        if (!opened) {
            opened = true
            notify()
        }
    },
    close() {
        if (opened) {
            opened = false
            notify()
        }
    },
    isOpen() {
        return opened
    },
    subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
    },
})
