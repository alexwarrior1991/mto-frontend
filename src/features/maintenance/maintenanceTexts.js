import {isAssetEnabled, isDisabledAtSource, isDisabledLocally} from '../../api/maintenance/assets.js'
import {
    DEFECT_SEVERITY,
    DEFECT_STATUS,
    INSPECTION_KIND,
    INSPECTION_RESULT,
    ORDER_STATUS,
    POSSESSION,
    PRIORITY,
    SHIFT_STATUS,
} from '../../api/maintenance/enums.js'
import {formatDate, formatQuantity} from '../../ui/format.js'

/**
 * Los textos del módulo de mantenimiento: cómo se cuentan las filas, cómo se pintan un kp, un tramo y
 * un avance, qué se dice del estado de un activo y cómo se describe cada recurso en su historial (el
 * port de MaintenanceFormats y MaintenanceHistory).
 */

/** Lo que se dice de una línea con una petición al almacén sin respuesta. */
export const IN_DOUBT_HINT = 'El almacén no contestó: se reintenta sola cada 5 minutos, y hasta que conteste no cambian lo '
    + 'previsto, lo consumido ni el proyecto de almacén de la orden.'

export function countText(total, singular, plural) {
    return `${total} ${total === 1 ? singular : plural}`
}

/** Un kp sin ceros de relleno: el servicio lo guarda con tres decimales. */
export function kp(value) {
    return formatQuantity(value)
}

/** «12.1 - 13.45», o un solo kp si el tramo es un punto (un perfil, un seccionador). */
export function kpRange(start, end) {
    const hasStart = start !== null && start !== undefined
    const hasEnd = end !== null && end !== undefined
    if (!hasStart || !hasEnd || Number(start) === Number(end)) {
        return kp(hasStart ? start : end)
    }
    return `${kp(start)} - ${kp(end)}`
}

/** Tareas completadas sobre el total: «3/10»; sin tareas, nada. */
export function progress(completed, total) {
    return total ? `${completed ?? 0}/${total}` : ''
}

/** Si un activo admite trabajo y, si no, quién lo desactivó: mantenimiento, mto-configuration o los dos. */
export function assetState(asset) {
    if (isAssetEnabled(asset)) {
        return 'Activo'
    }
    if (isDisabledLocally(asset) && isDisabledAtSource(asset)) {
        return 'Desactivado aquí y en configuración'
    }
    if (isDisabledLocally(asset)) {
        return 'Desactivado aquí'
    }
    return isDisabledAtSource(asset) ? 'Desactivado en configuración' : 'Desactivado'
}

/** Cómo quedó una orden en una revisión de su historial. */
export function describeOrder(order) {
    return join(order.title, labelOf(order.status, ORDER_STATUS.label), labelOf(order.priority, (value) => `prioridad ${PRIORITY.label(value)}`),
        labelOf(order.plannedDate, (date) => `plan ${formatDate(date)}`), order.team?.code, order.assignedUser)
}

export function describeShift(shift) {
    return join(labelOf(shift.status, SHIFT_STATUS.label), formatDate(shift.shiftDate), shift.team?.code,
        labelOf(shift.possessionType, (value) => `ocupación ${POSSESSION.label(value)}`),
        labelOf(shift.netWorkMinutes, (minutes) => `${minutes} min netos`), shift.observations)
}

export function describeInspection(inspection) {
    return join(labelOf(inspection.inspectionKind, INSPECTION_KIND.label), formatDate(inspection.inspectionDate), inspection.inspector,
        labelOf(inspection.result, INSPECTION_RESULT.label))
}

export function describeDefect(defect) {
    return join(labelOf(defect.severity, DEFECT_SEVERITY.label), labelOf(defect.status, DEFECT_STATUS.label),
        labelOf(defect.repairPlannedDate, (date) => `reparar el ${formatDate(date)}`), defect.resolutionNotes, defect.discardReason)
}

export function describeAsset(asset) {
    const range = kpRange(asset.startKp, asset.endKp)
    return join(asset.name, range ? `KP ${range}` : null, assetState(asset).toLowerCase(),
        labelOf(asset.preventiveIntervalDays, (days) => `preventivo cada ${days} ${days === 1 ? 'día' : 'días'}`), asset.description)
}

function labelOf(value, label) {
    return value === null || value === undefined || value === '' ? null : label(value)
}

/** Las partes que hay, separadas por «·»; lo vacío no deja separadores sueltos. */
function join(...parts) {
    return parts.filter((part) => typeof part === 'string' ? part.trim() !== '' : part !== null && part !== undefined).join(' · ')
}
