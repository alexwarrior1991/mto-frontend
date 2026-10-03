import {isTerminal} from '../../api/configuration/jobs.js'

/**
 * Los trabajos lanzados desde esta pestaña, del más reciente al más antiguo: el port de JobLog del
 * backoffice. Vive en el módulo, no en la pantalla: navegar a otra y volver no lo pierde, y un
 * trabajo sigue corriendo en el servicio aunque nadie lo mire. Recargar la página lo pierde, como el
 * token: nada se guarda en el navegador.
 *
 * No es el historial, que lo da el servicio (GET /jobs) y es el que enseña la lista. Esto guarda lo
 * que solo esta pestaña sabe de sus trabajos: la etiqueta con la que se lanzaron («Exportación de
 * VIA 1 (EP4)») y su último estado conocido, que es lo que permite avisar en cuanto uno termina.
 *
 * Se lee con useSyncExternalStore (subscribe y snapshot): cada cambio sustituye la lista entera.
 */

let entries = Object.freeze([])
const listeners = new Set()

function replace(next) {
    entries = Object.freeze(next)
    for (const listener of listeners) {
        listener()
    }
}

export const sessionJobs = Object.freeze({
    subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
    },

    /** La lista actual: [{job, label}], la misma mientras no cambie nada. */
    snapshot() {
        return entries
    },

    /** Apunta un trabajo recién lanzado (o rechazado) con su etiqueta, el primero. */
    track(job, label) {
        replace([Object.freeze({job, label}), ...entries.filter((entry) => entry.job.id !== job.id)])
    },

    /**
     * Sustituye el estado de un trabajo apuntado; uno que no esté apuntado se ignora. Devuelve true si
     * acaba de terminar, para avisarlo una sola vez.
     */
    update(job) {
        const index = entries.findIndex((entry) => entry.job.id === job.id)
        if (index < 0 || entries[index].job === job) {
            return false
        }
        const finishedNow = !isTerminal(entries[index].job) && isTerminal(job)
        replace(entries.with(index, Object.freeze({...entries[index], job})))
        return finishedNow
    },

    /** Los que todavía pueden cambiar de estado: los únicos que merece la pena consultar. */
    active() {
        return entries.filter((entry) => !isTerminal(entry.job))
    },

    /** La etiqueta con la que se lanzó desde aquí, si fue desde aquí. */
    labelOf(id) {
        return entries.find((entry) => entry.job.id === id)?.label ?? null
    },

    /** Para los tests: una pestaña recién abierta. */
    reset() {
        replace([])
    },
})
