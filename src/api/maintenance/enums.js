import {defineEnum} from '../enums.js'

/**
 * Los enumerados de mto-maintenance, tolerantes a lo desconocido (UNKNOWN, «Desconocido», que no se
 * ofrece en los desplegables), y lo que la pantalla ofrece en cada estado.
 *
 * Los predicados están copiados de las máquinas de estado del servicio (OrderStateMachine,
 * ShiftStateMachine, DefectStateMachine) solo para no ofrecer lo que va a fallar. Quien decide sigue
 * siendo el servicio: si el estado cambió entre medias llega su 409 TRN-001, que se avisa. Un estado
 * desconocido no ofrece nada.
 */

/** DRAFT → PLANNED → ASSIGNED → IN_PROGRESS → COMPLETED, o CANCELLED desde cualquiera abierto. */
export const ORDER_STATUS = defineEnum({
    DRAFT: 'Borrador',
    PLANNED: 'Planificada',
    ASSIGNED: 'Asignada',
    IN_PROGRESS: 'En curso',
    COMPLETED: 'Completada',
    CANCELLED: 'Cancelada',
})

/** URGENT es el único que salta de borrador a en curso, y nace crítica. */
export const ORDER_TYPE = defineEnum({
    PREVENTIVE: 'Preventiva',
    CORRECTIVE: 'Correctiva',
    INSPECTION: 'Inspección',
    URGENT: 'Urgente',
})

export const PRIORITY = defineEnum({
    LOW: 'Baja',
    MEDIUM: 'Media',
    HIGH: 'Alta',
    CRITICAL: 'Crítica',
})

/** Un tramo de vía se crea aquí; perfiles, seccionadores y aisladores llegan de mto-configuration. */
export const ASSET_TYPE = defineEnum({
    TRACK_SECTION: 'Tramo de vía',
    PROFILE: 'Perfil',
    DISCONNECTOR: 'Seccionador',
    SECTION_INSULATOR: 'Aislador de sección',
})

/** Una vía desviada solo admite turnos con posesión total. */
export const TRACK_KIND = defineEnum({
    MAIN: 'Principal',
    DIVERTED: 'Desviada',
})

export const INSTALLATION_TYPE = defineEnum({
    TRACK_CONNECTION: 'Conexión entre vías',
    IN_TRACK: 'En la vía',
})

export const TASK_STATUS = defineEnum({
    PENDING: 'Pendiente',
    IN_PROGRESS: 'En curso',
    COMPLETED: 'Completada',
    CANCELLED: 'Cancelada',
})

/** PLANNED → IN_PROGRESS → CLOSED, o CANCELLED mientras no esté cerrado. */
export const SHIFT_STATUS = defineEnum({
    PLANNED: 'Planificado',
    IN_PROGRESS: 'En curso',
    CLOSED: 'Cerrado',
    CANCELLED: 'Cancelado',
})

/** Parcial (entre semana, entre dos seccionadores) o total (fin de semana o festivo). */
export const POSSESSION = defineEnum({
    PARTIAL: 'Parcial',
    FULL: 'Total',
})

/** OPEN → IN_PROGRESS (vinculado a una orden) → RESOLVED → CLOSED, o DISCARDED mientras está abierto. */
export const DEFECT_STATUS = defineEnum({
    OPEN: 'Abierto',
    IN_PROGRESS: 'En curso',
    RESOLVED: 'Resuelto',
    CLOSED: 'Cerrado',
    DISCARDED: 'Descartado',
})

export const DEFECT_SEVERITY = defineEnum({
    LOW: 'Leve',
    MEDIUM: 'Media',
    HIGH: 'Alta',
    CRITICAL: 'Crítica',
})

/** Uno correcto no genera nada; uno leve, un defecto solo si se fuerza; uno inseguro, una orden urgente. */
export const INSPECTION_RESULT = defineEnum({
    OK: 'Correcta',
    MINOR_DEFECT: 'Defecto leve',
    MAJOR_DEFECT: 'Defecto grave',
    UNSAFE: 'Insegura',
})

export const INSPECTION_KIND = defineEnum({
    VISUAL: 'Visual',
    TECHNICAL: 'Técnica',
})

export const CHECK_ITEM_RESULT = defineEnum({
    OK: 'Correcto',
    DEFECT: 'Defecto',
    NOT_APPLICABLE: 'No aplica',
})

/**
 * Cómo va una línea de material con mto-stock. FAILED es que el almacén no respondió y REJECTED que
 * dijo que no (el motivo, en stockSyncError); las dos se reintentan con sincronizar.
 */
export const STOCK_SYNC_STATUS = defineEnum({
    NOT_REQUESTED: 'Sin pedir',
    RESERVED: 'Reservada',
    CONSUMED: 'Consumida',
    RELEASED: 'Liberada',
    FAILED: 'Fallida',
    REJECTED: 'Rechazada',
})

/**
 * La petición que una línea mandó al almacén y se quedó sin respuesta (stockRequestInDoubt). Un valor
 * que no se conoce cuenta como en duda, y no abre nada.
 */
export const STOCK_REQUEST = defineEnum({
    RESERVATION: 'Reserva sin respuesta',
    OUTPUT: 'Salida sin respuesta',
})

/** La unidad en que se miden los minutos estándar de un tipo de tarea. */
export const TASK_UNIT = defineEnum({
    UNIT: 'Unidad',
    SPAN: 'Vano',
    KM: 'Kilómetro',
    DEFECT: 'Defecto',
    PROFILE: 'Perfil',
})

export const FUNCTIONAL_GROUP = defineEnum({
    STRUCTURAL_SUPPORTS: 'Soportes estructurales',
    OVERHEAD_CONDUCTORS: 'Conductores aéreos',
    DEVICES_AND_SWITCHES: 'Aparatos y seccionadores',
    ANCHORAGE_COMPONENTS: 'Anclajes',
    TURNOUTS_AND_SWITCHES: 'Desvíos y agujas',
    DIAGNOSTICS: 'Diagnóstico',
    NONE: 'Sin grupo',
})

/** Los ficheros en que se exporta un informe. Solo viaja en peticiones: no es tolerante. */
export const REPORT_FORMATS = Object.freeze([
    Object.freeze({value: 'xlsx', label: 'Excel'}),
    Object.freeze({value: 'pdf', label: 'PDF'}),
])

const OPEN_ORDER = new Set(['DRAFT', 'PLANNED', 'ASSIGNED', 'IN_PROGRESS'])

export function isOpenOrder(status) {
    return OPEN_ORDER.has(status)
}

export function canPlanOrder(status) {
    return status === 'DRAFT'
}

/** ASSIGNED reasigna; IN_PROGRESS reasigna sin cambiar de estado. */
export function canAssignOrder(status) {
    return status === 'PLANNED' || status === 'ASSIGNED' || status === 'IN_PROGRESS'
}

/** Una urgente arranca sin planificar. */
export function canStartOrder(status, type) {
    return status === 'PLANNED' || status === 'ASSIGNED' || (status === 'DRAFT' && type === 'URGENT')
}

export function canCompleteOrder(status) {
    return status === 'IN_PROGRESS'
}

/** En borrador y planificada se modifica todo; después, solo la descripción, la prioridad y las notas de cierre. */
export function allowsFullOrderUpdate(status) {
    return status === 'DRAFT' || status === 'PLANNED'
}

/** Pendiente o en curso: solo una tarea abierta se modifica o se cancela. */
export function isOpenTask(status) {
    return status === 'PENDING' || status === 'IN_PROGRESS'
}

/** Planificado o en curso: se modifica, admite tareas y se cancela. */
export function isOpenShift(status) {
    return status === 'PLANNED' || status === 'IN_PROGRESS'
}

export function canStartShift(status) {
    return status === 'PLANNED'
}

export function canCloseShift(status) {
    return status === 'IN_PROGRESS'
}

/** Abierto o en curso: se vincula a una orden y se resuelve. */
export function isPendingDefect(status) {
    return status === 'OPEN' || status === 'IN_PROGRESS'
}

/** Ni cerrado ni descartado: se modifica. */
export function isEditableDefect(status) {
    return status === 'OPEN' || status === 'IN_PROGRESS' || status === 'RESOLVED'
}

/** Lo que el almacén no llegó a hacer: bloquea completar la orden salvo con force. */
export function isSyncFailed(status) {
    return status === 'FAILED' || status === 'REJECTED'
}

/** Hay algo que corregir: se ofrecen crear el defecto y la orden correctiva. */
export function inspectionFoundSomething(result) {
    return result === 'MINOR_DEFECT' || result === 'MAJOR_DEFECT' || result === 'UNSAFE'
}
