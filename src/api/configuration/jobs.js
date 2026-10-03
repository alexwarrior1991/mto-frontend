import {downloadFile} from '../download.js'
import {defineEnum} from '../enums.js'
import {TooManyRequestsError} from '../errors.js'
import {apiFetch} from '../http.js'
import {toPage, toPageParams} from '../paging.js'
import {prefixOf} from '../services.js'

/**
 * Los trabajos en segundo plano de mto-configuration (README_ASYNC_JOBS.md): el port de JobsClient,
 * JobDto, JobFamily, JobType y JobStatus del backoffice.
 *
 * - Lanzar responde 202 con el trabajo. Sin cupo responde 429, también con el trabajo (el servicio lo
 *   guarda ya REJECTED) y un Retry-After: ese cuerpo lo saca rejectedJobOf.
 * - Después se sigue: la lista de todas las familias (GET /jobs, del más reciente al más antiguo, la
 *   ordena el servicio) o el detalle de uno por su familia. Las filas de la lista no traen los errores
 *   por elemento: solo están en el detalle.
 * - El fichero de una exportación y el informe de una importación se piden por familia e id, con el
 *   token. El downloadUrl del servicio y el Location del 202 son rutas internas y no se usan.
 *
 * Permisos que aplica el servicio: exportar y consultar, config-read; importar y republicar,
 * config-import; importar el catálogo de LOV, además lov-manage.
 *
 * Un tipo o un estado que el servicio estrene se lee como «Desconocido» y no abre nada: un estado
 * desconocido cuenta como terminado, para no consultarlo sin fin, y un tipo desconocido no tiene
 * familia, así que ni se consulta por separado ni se descarga. Las decisiones se toman con parse; el
 * trabajo leído no se reescribe.
 */

export const JOB_TYPE = defineEnum({
    PROFILE_EXPORT: 'Exportación de perfiles',
    PROFILE_BULK_CREATE: 'Alta masiva de perfiles',
    PROFILE_BULK_UPDATE: 'Modificación masiva de perfiles',
    PROFILE_IMPORT: 'Importación del maestro de perfiles',
    LOV_IMPORT: 'Importación del catálogo de LOV',
    MASTER_DATA_REPUBLISH: 'Republicado de datos maestros',
})

export const JOB_STATUS = defineEnum({
    PENDING: 'En cola',
    RUNNING: 'En curso',
    COMPLETED: 'Terminado',
    COMPLETED_WITH_ERRORS: 'Terminado con errores',
    FAILED: 'Fallido',
    REJECTED: 'Rechazado',
})

/** Cada familia vive bajo su prefijo, con su detalle y, si produce fichero, su descarga. */
export const JOB_FAMILIES = Object.freeze({
    profiles: Object.freeze({path: 'profiles/jobs', producesFile: true}),
    lovs: Object.freeze({path: 'lovs/jobs', producesFile: true}),
    republish: Object.freeze({path: 'master-data/republish', producesFile: false}),
})

const FAMILY_OF_TYPE = Object.freeze({
    PROFILE_EXPORT: JOB_FAMILIES.profiles,
    PROFILE_BULK_CREATE: JOB_FAMILIES.profiles,
    PROFILE_BULK_UPDATE: JOB_FAMILIES.profiles,
    PROFILE_IMPORT: JOB_FAMILIES.profiles,
    LOV_IMPORT: JOB_FAMILIES.lovs,
    MASTER_DATA_REPUBLISH: JOB_FAMILIES.republish,
})

/** Las filas de cada página de la lista: las del backoffice, que son también las del servicio por defecto. */
export const JOBS_PAGE_SIZE = 20

/** Los formatos de la exportación (mapperType del servicio); basic es el de por defecto. */
export const MAPPER_TYPES = Object.freeze(['basic', 'default', 'technical'])

/**
 * Qué se puede republicar y qué filtro admite cada cosa: la vía solo acota los perfiles; la estación,
 * los seccionadores y los aisladores; «Todo» no admite ninguno.
 */
export const REPUBLISH_TARGETS = Object.freeze([
    Object.freeze({value: 'profile', label: 'Perfiles', scope: 'track'}),
    Object.freeze({value: 'disconnector', label: 'Seccionadores', scope: 'station'}),
    Object.freeze({value: 'section-insulator', label: 'Aisladores de sección', scope: 'station'}),
    Object.freeze({value: 'all', label: 'Todo', scope: null}),
])

/** El tope de una subida: el multipart de mto-configuration y el client_max_body_size de nginx. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function base() {
    return prefixOf('mto-configuration')
}

/**
 * Un trabajo tal como llega del servicio, la unión de sus tres respuestas: lo que no aplica llega
 * omitido. Solo se completa lo que la pantalla cuenta (los errores por elemento y las cifras); el tipo
 * y el estado se quedan como vinieron.
 */
export function toJob(raw) {
    return {
        ...raw,
        processedItems: countOf(raw?.processedItems),
        successfulItems: countOf(raw?.successfulItems),
        failedItems: countOf(raw?.failedItems),
        itemErrors: Array.isArray(raw?.itemErrors) ? raw.itemErrors : [],
    }
}

/** La familia a la que se pregunta por un trabajo; null si su tipo es desconocido. */
export function familyOf(job) {
    return FAMILY_OF_TYPE[JOB_TYPE.parse(job?.type)] ?? null
}

/** Si el trabajo ya no va a cambiar. Un estado desconocido, o ninguno, cuenta como terminado. */
export function isTerminal(job) {
    const status = JOB_STATUS.parse(job?.status)
    return status !== 'PENDING' && status !== 'RUNNING'
}

/**
 * Una exportación solo se descarga completa; una importación también cuando terminó con errores por
 * fila, porque su fichero es el informe de esos errores. El republicado no produce fichero, ni un
 * trabajo de tipo desconocido, que no tiene familia a la que pedirlo.
 */
export function isDownloadable(job) {
    const status = JOB_STATUS.parse(job?.status)
    switch (JOB_TYPE.parse(job?.type)) {
        case 'PROFILE_EXPORT':
            return status === 'COMPLETED'
        case 'PROFILE_IMPORT':
        case 'LOV_IMPORT':
            return status === 'COMPLETED' || status === 'COMPLETED_WITH_ERRORS'
        default:
            return false
    }
}

/**
 * Si el fichero del trabajo es el informe de lo que pasó, fila a fila: el de una importación. El de una
 * exportación son los perfiles, no sus errores.
 */
export function hasErrorReport(job) {
    const type = JOB_TYPE.parse(job?.type)
    return (type === 'PROFILE_IMPORT' || type === 'LOV_IMPORT') && isDownloadable(job)
}

/** El nombre del fichero si el servicio no manda el suyo en Content-Disposition. */
export function fallbackFileName(job) {
    switch (JOB_TYPE.parse(job?.type)) {
        case 'PROFILE_EXPORT':
            return `perfiles-via-${job.trackId}.csv`
        case 'PROFILE_IMPORT':
            return `informe-maestro-perfiles-${job.id}.json`
        case 'LOV_IMPORT':
            return `informe-catalogo-lov-${job.id}.json`
        default:
            return `trabajo-${job?.id}`
    }
}

/** Importa profile-master.xlsx: paquetes, estaciones, vías, perfiles y ménsulas. */
export function importProfiles(file, {dryRun = false} = {}) {
    return importFile(JOB_FAMILIES.profiles, file, dryRun)
}

/** Importa lov-master.xlsx: las 17 listas de valores por código. */
export function importLovs(file, {dryRun = false} = {}) {
    return importFile(JOB_FAMILIES.lovs, file, dryRun)
}

/**
 * La subida es multipart con una parte file, que lleva el nombre del fichero: el navegador pone el
 * Content-Type con su boundary. dryRun viaja siempre, también a false.
 */
async function importFile(family, file, dryRun) {
    const body = new FormData()
    body.append('file', file, file.name)
    const job = await apiFetch(`${base()}/${family.path}/import`, {method: 'POST', query: {dryRun: Boolean(dryRun)}, body})
    return toJob(job)
}

/** Exporta en CSV los perfiles de una vía, en el formato elegido. */
export async function exportProfiles({trackId, mapperType = MAPPER_TYPES[0]}) {
    const job = await apiFetch(`${base()}/profiles/jobs/export`, {method: 'POST', query: {trackId, mapperType}})
    return toJob(job)
}

/**
 * Vuelve a emitir los eventos de los datos maestros que ya existían. Sin barra final: con ella la ruta
 * no casa con ninguna regla de seguridad del servicio, y responde 403.
 */
export async function republish({entity, trackId = null, stationId = null}) {
    const job = await apiFetch(`${base()}/master-data/republish`, {method: 'POST', query: {entity, trackId, stationId}})
    return toJob(job)
}

/**
 * Una página de los trabajos de todas las familias, del más reciente al más antiguo. La página empieza
 * en 1, como en la tabla. sort no viaja: ordena el servicio. Un filtro ausente no filtra.
 */
export async function listJobs({page = 1, size = JOBS_PAGE_SIZE, type = null, status = null} = {}, {signal} = {}) {
    const body = await apiFetch(`${base()}/jobs`, {query: {...toPageParams({page, size}), type, status}, signal})
    const result = toPage(body)
    return {...result, content: result.content.map(toJob)}
}

/**
 * El detalle de un trabajo, por la familia de su tipo y con sus errores por elemento. Un trabajo de
 * tipo desconocido no tiene a quién preguntar: vuelve como estaba, sin llamar.
 */
export async function getJob(job, {signal} = {}) {
    const family = familyOf(job)
    if (!family) {
        return job
    }
    return toJob(await apiFetch(`${base()}/${family.path}/${job.id}`, {signal}))
}

/**
 * Descarga el fichero de un trabajo descargable con el token, por su familia y su id. Devuelve el
 * nombre con el que se guardó.
 */
export async function downloadJobFile(job, {signal} = {}) {
    const family = familyOf(job)
    if (!family?.producesFile || !isDownloadable(job)) {
        throw new Error(`El trabajo ${job?.id} no tiene fichero que descargar`)
    }
    return downloadFile(`${base()}/${family.path}/${job.id}/file`, {fallbackName: fallbackFileName(job), signal})
}

/** El trabajo rechazado que trae un 429 del servicio; null si el cuerpo no es un trabajo. */
export function rejectedJobOf(error) {
    if (!(error instanceof TooManyRequestsError)) {
        return null
    }
    const body = error.body
    if (!body || typeof body !== 'object' || !body.id) {
        return null
    }
    return toJob(body)
}

function countOf(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
