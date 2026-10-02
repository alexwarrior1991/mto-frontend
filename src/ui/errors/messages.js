import {
    ApiError,
    ConflictError,
    ForbiddenError,
    NetworkError,
    NotFoundError,
    SessionExpiredError,
    TokenRejectedError,
    UnavailableError,
    ValidationError,
} from '../../api/errors.js'

/**
 * Lo que se le dice a la persona cuando una llamada falla. Es la tabla de UiErrors del backoffice,
 * con el mismo orden (gana la primera que casa) y ahora con tildes.
 *
 * Los codigos que se distinguen son de los servicios: CON-001 es una version vieja (recargar lo
 * arregla) y BUS-002 un valor repetido o una entrada en uso (recargar no lo arregla); los 409 de
 * estado de mto-maintenance no piden recargar; un 422 sin errores por campo es una regla de negocio.
 */
export function errorMessage(error) {
    if (!(error instanceof ApiError)) {
        return 'Error inesperado.'
    }
    if (error instanceof NetworkError) {
        return 'No se ha podido contactar con el servidor. Comprueba la conexión y vuelve a intentarlo.'
    }
    if (error instanceof SessionExpiredError) {
        return 'La sesión ha caducado. Hay que volver a entrar.'
    }
    if (error instanceof TokenRejectedError) {
        return 'El servicio no acepta tu token: puede que le falte su audiencia. Mira el diagnóstico de Inicio.'
    }
    if (error instanceof ForbiddenError) {
        return 'No tienes permiso para esta operación.'
    }
    if (error instanceof NotFoundError) {
        return 'No se ha encontrado lo que se pedía.' + detail(error)
    }
    if (error instanceof ValidationError) {
        return validationMessage(error)
    }
    if (error instanceof ConflictError) {
        return conflictMessage(error)
    }
    if (error instanceof UnavailableError) {
        return unavailableMessage(error)
    }
    return `Error inesperado (${error.status}).` + detail(error)
}

function validationMessage(error) {
    // mto-maintenance: la inspeccion no casa con su checklist.
    if (error.code === 'INS-001') {
        return 'La inspección o su checklist no admiten esta operación.' + detail(error)
    }
    // mto-maintenance: mto-stock ha dicho que no al sincronizar una linea de material.
    if (error.code === 'STK-422') {
        return 'El almacén ha rechazado la operación.' + detail(error)
    }
    // Un 422 sin errores por campo es una regla de negocio: la peticion esta bien, la operacion no cabe.
    if (error.status === 422 && !error.hasFieldErrors) {
        return 'La operación no es posible.' + detail(error)
    }
    if (error.hasFieldErrors) {
        return 'Datos no válidos: ' + error.fieldErrors.map(fieldError).join('; ')
    }
    return 'La petición no es válida.' + detail(error)
}

function conflictMessage(error) {
    switch (error.code) {
        case 'STK-001':
            return 'No hay stock disponible suficiente.' + detail(error)
        // La version que se mando ya no es la guardada: el detalle del servicio no anade nada.
        case 'CON-001':
            return 'Conflicto con otro cambio: recarga y vuelve a intentarlo.'
        // Un valor unico repetido o una entrada en uso: recargar no lo arregla, asi que no se pide.
        case 'BUS-002':
            return 'Ya existe otro registro con ese valor (un código que no se puede repetir), o la entrada está en uso.'
        case 'TRN-001':
            return 'El estado actual no permite esta operación.' + detail(error)
        case 'SHF-001':
            return 'El turno no admite ese trabajo.' + detail(error)
        case 'MAT-001':
            return 'La línea de material no admite esta operación.' + detail(error)
        case 'AST-001':
            return 'El activo está desactivado, o ese dato lo manda mto-configuration.' + detail(error)
        case 'AST-409':
        case 'TEA-409':
            return 'Ya existe otro con ese código.'
        default:
            return 'Conflicto con otro cambio: recarga y vuelve a intentarlo.' + detail(error)
    }
}

function unavailableMessage(error) {
    // mto-maintenance no ha podido hablar con mto-stock: la linea se queda como estaba.
    if (error.code === 'STK-503') {
        return 'El almacén no responde: la línea de material se queda como estaba. Inténtalo más tarde.' + detail(error)
    }
    // Un 502 no es transitorio (mto-users sin SMTP, por ejemplo): su detalle es lo unico que lo explica.
    if (error.status === 502) {
        return 'El servicio no ha podido completar la operación.' + detail(error)
    }
    const retry = error.retryAfterSeconds === null || error.retryAfterSeconds === undefined
        ? ' Inténtalo más tarde.'
        : ` Inténtalo en ${error.retryAfterSeconds} s.`
    return 'El servicio no está disponible ahora mismo.' + retry
}

function fieldError({field, code, message}) {
    const where = field ? `${field} ` : ''
    return where + (message ?? code ?? 'valor no válido')
}

function detail(error) {
    const text = error.problem?.detail
    return text && text.trim() ? ` ${text.trim()}` : ''
}
