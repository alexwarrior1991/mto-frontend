import {
    ApiError,
    ConflictError,
    ForbiddenError,
    NetworkError,
    NotFoundError,
    SessionExpiredError,
    TokenRejectedError,
    TooManyRequestsError,
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
        // mto-maintenance: el permiso está, pero lo que se escribe es de un EP fuera del ámbito de la
        // persona (sus equipos de mto-resources). El texto del servicio dice cuál es y cuáles son los suyos.
        if (error.code === 'SCP-403') {
            return 'Queda fuera de tu ámbito.' + detail(error)
        }
        return 'No tienes permiso para esta operación.'
    }
    if (error instanceof NotFoundError) {
        return notFoundMessage(error)
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
    // Las operaciones de fondo de mto-maintenance y mto-resources: el tope de todo el despliegue esta
    // lleno. No es un fallo de la peticion; vale reintentarla pasado el Retry-After.
    if (error instanceof TooManyRequestsError && error.code === 'OPS-429') {
        return 'Hay demasiadas operaciones en marcha.' + retryIn(error)
    }
    // Una operacion de fondo de mto-maintenance cuya instancia dejo de latir (se paro a medias): no va a
    // terminar, hay que volver a lanzarla. Llega como el error de la operacion, con estado 500.
    if (error.code === 'OPS-410') {
        return 'La operación se interrumpió en el servicio (se paró la instancia que la llevaba): vuelve a lanzarla.'
    }
    // El unico 410 del dominio es el fichero de un trabajo de mto-configuration que ya no esta
    // (purgado, o generado en otra replica): un 404 sugeriria reintentar, y esto pide relanzarlo.
    if (error.status === 410) {
        return 'El fichero ya no está en el servicio: vuelve a lanzar el trabajo.'
    }
    return `Error inesperado (${error.status}).` + detail(error)
}

function notFoundMessage(error) {
    switch (error.code) {
        // mto-users: cerrar una sesion que ya no esta, o que es de otra persona (el servicio lo comprueba).
        case 'SES-404':
            return 'Esa sesión ya no existe o no es de este usuario.'
        case 'CRED-404':
            return 'Esa credencial ya no existe o no es de este usuario.'
        // mto-maintenance: una persona o un vehiculo de mto-resources que todavia no ha llegado por evento
        // (se acaba de dar de alta alli). Llega en unos segundos: reintentar vale.
        case 'CRW-404':
            return 'Esa persona aún no ha llegado a mantenimiento desde mto-resources: inténtalo en un momento.'
        case 'FLT-404':
            return 'Ese vehículo aún no ha llegado a mantenimiento desde mto-resources: inténtalo en un momento.'
        case 'MSI-404':
            return 'Ese instrumento aún no ha llegado a mantenimiento desde mto-resources: inténtalo en un momento.'
        // mto-resources: una cualificación o un documento que otra persona acaba de quitar, o un tipo o un
        // instrumento que no existe. Recargar lo enseña como está.
        case 'QUA-404':
            return 'Esa cualificación ya no existe: puede que otra persona la haya quitado.'
        case 'VDO-404':
            return 'Ese documento ya no existe: puede que otra persona lo haya quitado.'
        case 'QTY-404':
            return 'Ese tipo de cualificación no existe.'
        case 'INT-404':
            return 'Ese instrumento no existe.'
        // mto-resources: una ausencia o una reparación que ya no está (otra persona la quitó, o nunca fue
        // de esa persona o de ese vehículo).
        case 'ABS-404':
            return 'Esa ausencia ya no existe: puede que otra persona la haya quitado.'
        case 'REP-404':
            return 'Esa reparación no existe.'
        // mto-resources: el punto de acceso a la vía elegido al registrar dónde está un vehículo. Es el
        // maestro de mto-configuration, que llega por evento: puede que lo hayan borrado o que aún no
        // haya llegado. Se relee la lista del desplegable.
        case 'TAP-404':
            return 'Ese punto de acceso ya no existe o aún no ha llegado a Recursos: elige otro o inténtalo en un momento.'
        // mto-notification: el id no dice si existe; ya no va dirigida a mí, o nunca fue.
        case 'NTF-404':
            return 'Esa notificación ya no existe o no va dirigida a ti.'
        // mto-notification: una línea purgada, o un acceso, que nunca sale por /activity.
        case 'ACT-404':
            return 'Esa línea del registro ya no existe.'
        default:
            return 'No se ha encontrado lo que se pedía.' + detail(error)
    }
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
    // mto-users: Keycloak no admite lo pedido (la politica de contrasenas del realm, un atributo que
    // el perfil de usuario exige...). Su detalle, que es el texto de Keycloak, es lo que lo explica.
    if (error.code === 'KC-400' && !error.hasFieldErrors) {
        return 'Keycloak ha rechazado la petición.' + detail(error)
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
        case 'TEA-001':
            return 'El equipo es de mto-resources: se cambia en Recursos > Organigrama.'
        case 'AST-001':
            return 'El activo está desactivado, o ese dato lo manda mto-configuration.' + detail(error)
        // Un codigo repetido en mto-maintenance (activos y equipos) y en los catalogos de mto-stock:
        // recargar no lo arregla, asi que no se pide.
        case 'AST-409':
        case 'TEA-409':
        case 'MAT-409':
        case 'WH-409':
        case 'SUP-409':
        case 'PRJ-409':
        case 'ASM-409':
            return 'Ya existe otro con ese código.'
        // mto-resources: ademas del codigo, un usuario o un numero de empleado (personas), una matricula
        // o un numero ferroviario (vehiculos). El detalle dice cual; recargar no lo arregla.
        case 'PER-409':
        case 'UNI-409':
        case 'VEH-409':
        case 'VTY-409':
        case 'PRK-409':
            return 'Ya existe otro con ese valor (código, usuario, número de empleado, matrícula o número ferroviario).' + detail(error)
        // mto-resources: el código de un tipo de cualificación o de un instrumento. Recargar no lo arregla.
        case 'QTY-409':
        case 'INT-409':
            return 'Ya existe otro con ese código.'
        // mto-resources: una persona tiene cada tipo de cualificación una vez, y un vehículo cada tipo de
        // documento: renovarlo es cambiar su caducidad. Recargar no lo arregla.
        case 'QUA-001':
            return 'La persona ya tiene esa cualificación (renovarla es cambiar su caducidad), o el tipo está retirado.' + detail(error)
        case 'VDO-409':
            return 'El vehículo ya tiene un documento de ese tipo: renovarlo es cambiar su caducidad.' + detail(error)
        // mto-resources: las reglas del organigrama (de 2 a 6 linemen, el nivel del padre, la categoria
        // del jefe, una persona en otro equipo) y las de la flota (donde puede estar un vehiculo segun su
        // movilidad, el remolque, un vehiculo retirado). El detalle dice cual.
        // mto-resources: dos ausencias de la misma persona no se solapan, y una reparación solo admite lo que
        // su estado deja. Recargar no lo arregla.
        case 'ABS-001':
            return 'La persona ya está ausente en esas fechas: cambia esa ausencia en vez de añadir otra.' + detail(error)
        case 'REP-001':
            return 'La reparación no admite ese cambio en su estado.' + detail(error)
        case 'UNI-001':
            return 'El organigrama no admite ese cambio.' + detail(error)
        case 'VEH-001':
            return 'La flota no admite ese cambio.' + detail(error)
        // mto-users: un nombre de usuario o un email repetido. Recargar no lo arregla, asi que no se pide.
        case 'USR-409':
            return 'Ya existe un usuario con ese nombre de usuario o ese email.' + detail(error)
        default:
            return 'Conflicto con otro cambio: recarga y vuelve a intentarlo.' + detail(error)
    }
}

function unavailableMessage(error) {
    // mto-maintenance no ha podido hablar con mto-stock: la linea se queda como estaba.
    if (error.code === 'STK-503') {
        return 'El almacén no responde: la línea de material se queda como estaba. Inténtalo más tarde.' + detail(error)
    }
    // mto-resources no puede leer Keycloak para su informe de puestos: pasará, vale reintentarlo.
    if (error.code === 'KCK-503') {
        return 'No se puede leer Keycloak ahora mismo.' + detail(error) + retryIn(error)
    }
    // Un 502 no es transitorio (mto-users sin SMTP, por ejemplo): su detalle es lo unico que lo explica.
    if (error.status === 502) {
        return 'El servicio no ha podido completar la operación.' + detail(error)
    }
    return 'El servicio no está disponible ahora mismo.' + retryIn(error)
}

function retryIn(error) {
    return error.retryAfterSeconds === null || error.retryAfterSeconds === undefined
        ? ' Inténtalo más tarde.'
        : ` Inténtalo en ${error.retryAfterSeconds} s.`
}

function fieldError({field, code, message}) {
    const where = field ? `${field} ` : ''
    return where + (message ?? code ?? 'valor no válido')
}

function detail(error) {
    const text = error.problem?.detail
    return text && text.trim() ? ` ${text.trim()}` : ''
}
