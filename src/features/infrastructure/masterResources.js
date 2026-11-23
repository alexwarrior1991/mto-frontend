/**
 * Los siete maestros de infraestructura de mto-configuration. Para cada uno: su ruta en el servicio y
 * cómo se nombra en pantalla. Es el port de MasterResource del backoffice, con tildes y con género,
 * para que «1 vía» y «Borrada» concuerden. Lo que pasa al borrar cada uno (README_API.md §1 de
 * mto-configuration) lo dice su confirmación: goesWith es lo que no existe sin él y se borra con él, y
 * blockedBy, lo que cuelga de él y, mientras siga vivo, hace que el servicio no lo borre (409 BUS-002).
 */
export const MASTERS = Object.freeze({
    executionPackages: Object.freeze({
        path: 'execution-packages', title: 'Paquetes de ejecución', singular: 'paquete de ejecución',
        plural: 'paquetes de ejecución', feminine: false, goesWith: null, blockedBy: 'vías o estaciones',
    }),
    stations: Object.freeze({
        path: 'stations', title: 'Estaciones', singular: 'estación', plural: 'estaciones', feminine: true,
        goesWith: null, blockedBy: 'vías enlazadas, seccionadores, aisladores o accesos a vía',
    }),
    tracks: Object.freeze({
        path: 'tracks', title: 'Vías', singular: 'vía', plural: 'vías', feminine: true,
        goesWith: null, blockedBy: 'perfiles, seccionadores, aisladores o accesos a vía',
        // Solo la vía se puede borrar con todo lo suyo, y su confirmación dice dónde.
        blockedHint: 'para borrarla con todo lo suyo está «Borrar la vía entera»',
    }),
    profiles: Object.freeze({
        path: 'profiles', title: 'Perfiles', singular: 'perfil', plural: 'perfiles', feminine: false,
        goesWith: 'sus ménsulas y los brazos de ellas', blockedBy: 'seccionadores en su poste',
    }),
    disconnectors: Object.freeze({
        path: 'disconnectors', title: 'Seccionadores', singular: 'seccionador', plural: 'seccionadores', feminine: false,
        goesWith: null, blockedBy: null,
    }),
    sectionInsulators: Object.freeze({
        path: 'section-insulators', title: 'Aisladores de sección', singular: 'aislador de sección',
        plural: 'aisladores de sección', feminine: false, goesWith: 'sus agujas', blockedBy: null,
    }),
    trackAccessPoints: Object.freeze({
        path: 'track-access-points', title: 'Accesos a vía', singular: 'acceso a vía', plural: 'accesos a vía', feminine: false,
        goesWith: null, blockedBy: null,
    }),
})

/** «3 vías», «1 vía». */
export function countText(master, total) {
    return `${total} ${total === 1 ? master.singular : master.plural}`
}

/** «Borrada VIA 1», «Borrado P-007 (kp 12.345)». */
export function deletedText(master, label) {
    return `${master.feminine ? 'Borrada' : 'Borrado'} ${label}`
}

/**
 * Lo que dice la confirmación de borrar, que es lo que pasa en el servicio. La fila desaparece de las
 * listas, pero queda en la base marcada como borrada. Lo que no existe sin ella se borra con ella, y
 * si de ella cuelga algo vivo el servicio no la borra: lo dice su 409, con qué cuelga y cuánto.
 */
export function deleteWarning(master) {
    const it = master.feminine ? 'la' : 'lo'
    const deleted = master.feminine ? 'borrada' : 'borrado'
    const goesWith = master.goesWith ? ` Se borran con ${master.feminine ? 'ella' : 'él'} ${master.goesWith}.` : ''
    const blocked = master.blockedBy
        ? ` Si tiene ${master.blockedBy}, el servicio no ${it} borra${master.blockedHint ? `: ${master.blockedHint}` : ''}.`
        : ''
    return `Desaparece de las listas: el servicio ${it} marca como ${deleted} y desde aquí no se puede recuperar.${goesWith}${blocked}`
}

/** «Borrada la vía entera VIA 1». */
export function wholeTrackDeletedText(label) {
    return `Borrada la vía entera ${label}`
}

/** Cómo se nombra una fila en los mensajes: por su nombre, o por su id si no tiene. */
export function nameOf(row) {
    return row?.name ? row.name : `#${row?.id}`
}
