import {formatDate} from '../../ui/format.js'
import {kindLabel, sideLabel} from './accessPointKinds.js'
import {DRIVE_TYPES} from './disconnectorStates.js'
import {installationLabel} from './installationTypes.js'
import {disconnectorProfileLabel} from './references.js'

/**
 * El historial de un maestro de mto-configuration (Envers allí), en el mismo diálogo que almacén y
 * mantenimiento: una línea por recurso que dice cómo quedó la fila en cada revisión, con sus campos
 * principales y los nombres de sus referencias (vía, estación, paquete, catálogos) como los nombra su
 * lista. Es el port de MasterHistory del backoffice.
 *
 * - Los nombres son los de hoy, también para el servicio: cada revisión guarda a qué fila apuntaba, no
 *   cómo se llamaba entonces. Lo que ya no está en lo cargado sale como #id.
 * - Lo que no viene no deja separadores sueltos.
 * - La entidad de una revisión no es un cuerpo para un PUT (su versionNumber llega a null): desde el
 *   historial no se edita ni se restaura nada.
 */

/** Una revisión sin fila (entity: null): el servicio no la pudo reconstruir. */
export const NO_ENTITY = 'Sin datos de la fila en esta revisión'

/** Las partes que hay, separadas por « · »; lo nulo o en blanco no deja parte. */
export function joinParts(...parts) {
    return parts.filter((part) => part !== null && part !== undefined && String(part).trim() !== '').join(' · ')
}

function has(value) {
    return value !== null && value !== undefined && value !== ''
}

function label(value, text) {
    return has(value) ? text(value) : null
}

function state(value, yes, no) {
    return typeof value === 'boolean' ? (value ? yes : no) : null
}

function count(list, one, many) {
    return Array.isArray(list) ? `${list.length} ${list.length === 1 ? one : many}` : null
}

function code(prefix, ref) {
    return has(ref?.code) ? `${prefix}${ref.code}` : null
}

/** Una referencia a catálogo con su descripción: «Disc - Seccionador», o lo que haya. */
function lovLabel(ref) {
    if (!has(ref?.description) || String(ref.description).trim() === '') {
        return ref?.code ?? ''
    }
    return has(ref.code) ? `${ref.code} - ${ref.description}` : ref.description
}

function driveLabel(value) {
    return (DRIVE_TYPES.find((type) => type.value === value)?.label ?? String(value)).toLowerCase()
}

function executionPackage(row, references) {
    return joinParts(row.name, references.companyName(row.companyId),
        label(row.startDate, (date) => `inicio ${formatDate(date)}`), label(row.endDate, (date) => `fin ${formatDate(date)}`),
        label(row.length, (length) => `longitud ${length}`), row.initialPackage === true ? 'inicial' : null,
        row.enabled === true ? 'activo' : 'inactivo')
}

function station(row, references) {
    return joinParts(row.name, references.packageName(row.executionPackageId))
}

function track(row, references) {
    const stations = Array.isArray(row.stationIds) ? row.stationIds : []
    return joinParts(row.name, references.packageName(row.executionPackageId),
        stations.length > 0 ? `estaciones: ${stations.map((id) => references.stationName(id)).join(', ')}` : null,
        state(row.enabled, 'activa', 'inactiva'))
}

function profile(row, references) {
    return joinParts(row.profileId, label(row.kp, (kp) => `KP ${kp}`), references.trackName(row.trackId),
        code('estado ', row.profileStatus), code('poste ', row.poleType), label(row.span, (span) => `vano ${span} m`),
        count(row.cantilevers, 'ménsula', 'ménsulas'))
}

function disconnector(row, references) {
    const pole = disconnectorProfileLabel(row)
    return joinParts(row.name, references.stationName(row.stationId), label(row.disconnectorFunction, lovLabel),
        pole ? `perfil ${pole}` : label(row.kp, (kp) => `sin poste, KP ${kp}`),
        state(row.onLoad, 'en carga', 'sin carga'), state(row.normallyOpen, 'normalmente abierto', 'normalmente cerrado'),
        label(row.driveType, (drive) => `accionamiento ${driveLabel(drive)}`),
        label(row.trackId, (id) => `vía propia ${references.trackName(id)}`),
        label(row.connectedTrackId, (id) => `vía conectada ${references.trackName(id)}`))
}

function sectionInsulator(row, references) {
    return joinParts(row.name, references.stationName(row.stationId), label(row.kp, (kp) => `KP ${kp}`),
        installationLabel(row.installationType), references.trackName(row.trackId),
        label(row.connectedTrackId, (id) => `vía conectada ${references.trackName(id)}`),
        count(row.switches, 'aguja', 'agujas'), state(row.enabled, 'activo', 'inactivo'))
}

function trackAccessPoint(row, references) {
    return joinParts(row.name, references.trackName(row.trackId), references.stationName(row.stationId),
        label(row.kp, (kp) => `KP ${kp}`), kindLabel(row.kind), sideLabel(row.side),
        state(row.roadRailAccess, 'biviales', 'sin biviales'), state(row.enabled, 'activo', 'inactivo'))
}

/** Por la ruta del maestro en el servicio: (fila de la revisión, nombres de las referencias) → su línea. */
export const MASTER_HISTORY = Object.freeze({
    'execution-packages': executionPackage,
    stations: station,
    tracks: track,
    profiles: profile,
    disconnectors: disconnector,
    'section-insulators': sectionInsulator,
    'track-access-points': trackAccessPoint,
})
