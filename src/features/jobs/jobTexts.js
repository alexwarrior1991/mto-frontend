import {isTerminal, JOB_STATUS, JOB_TYPE} from '../../api/configuration/jobs.js'

/**
 * Lo que la pantalla de trabajos dice de cada uno: las etiquetas con las que se lanzan, cómo se
 * describe uno que llegó de otra sesión, su progreso y los recuentos. Son los textos de JobsView, con
 * sus tildes.
 */

export function exportLabel(trackLabel) {
    return `Exportación de ${trackLabel}`
}

/** «Importación del maestro de perfiles (profile-master.xlsx, simulación)». */
export function importLabel(what, fileName, dryRun) {
    return `${what} (${fileName}${dryRun ? ', simulación' : ''})`
}

export function republishLabel(targetLabel) {
    return `Republicado de ${targetLabel.toLowerCase()}`
}

/**
 * Un trabajo lanzado desde otra sesión, o antes de recargar: su tipo, y una exportación con su vía y
 * su formato.
 */
export function describeJob(job, trackName) {
    if (!job?.type) {
        return 'Trabajo'
    }
    if (JOB_TYPE.parse(job.type) === 'PROFILE_EXPORT' && job.trackId !== null && job.trackId !== undefined) {
        const format = job.mapperType ? ` (${job.mapperType})` : ''
        return `${exportLabel(trackName(job.trackId))}${format}`
    }
    return JOB_TYPE.label(job.type)
}

/**
 * Lo que se pinta en «Progreso»: con total, una barra y «procesados / total»; sin él, «…» mientras
 * corre y lo procesado cuando ha terminado.
 */
export function progressOf(job) {
    const total = job.totalItems
    if (typeof total !== 'number' || total <= 0) {
        return {bar: null, text: isTerminal(job) ? String(job.processedItems) : '…'}
    }
    const done = Math.min(Math.max(job.processedItems, 0), total)
    return {bar: (done / total) * 100, text: `${job.processedItems} / ${total}`}
}

/** Si la fila ofrece «Errores»: elementos fallidos o un error global. */
export function hasErrors(job) {
    return job.failedItems > 0 || Boolean(job.error?.trim())
}

export function countText(totalElements, running) {
    if (!totalElements) {
        return 'Ninguno todavía'
    }
    return `${totalElements} en el servicio, ${running} en curso`
}

/** El final del aviso de un 429: cuándo reintentar, si el servicio lo dice. */
export function retryText(retryAfterSeconds) {
    return typeof retryAfterSeconds === 'number' ? ` Inténtalo en ${retryAfterSeconds} s.` : ' Inténtalo más tarde.'
}

/** El aviso de un trabajo de esta sesión que acaba de terminar. */
export function finishedText(label, job) {
    return `${label}: ${JOB_STATUS.label(job.status)}`
}
