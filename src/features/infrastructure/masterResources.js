/**
 * Los seis maestros de infraestructura de mto-configuration. Para cada uno: su ruta en el servicio y
 * cómo se nombra en pantalla. Es el port de MasterResource del backoffice, con tildes y con género,
 * para que «1 vía» y «Borrada» concuerden. children dice qué cuelga de cada uno: borrar es lógico y
 * eso se queda.
 */
export const MASTERS = Object.freeze({
    executionPackages: Object.freeze({
        path: 'execution-packages', title: 'Paquetes de ejecución', singular: 'paquete de ejecución',
        plural: 'paquetes de ejecución', feminine: false, children: 'sus vías y sus estaciones',
    }),
    stations: Object.freeze({
        path: 'stations', title: 'Estaciones', singular: 'estación', plural: 'estaciones', feminine: true,
        children: 'sus vías, sus seccionadores y sus aisladores',
    }),
    tracks: Object.freeze({
        path: 'tracks', title: 'Vías', singular: 'vía', plural: 'vías', feminine: true, children: 'sus perfiles',
    }),
    profiles: Object.freeze({
        path: 'profiles', title: 'Perfiles', singular: 'perfil', plural: 'perfiles', feminine: false,
        children: 'sus ménsulas y su seccionador',
    }),
    disconnectors: Object.freeze({
        path: 'disconnectors', title: 'Seccionadores', singular: 'seccionador', plural: 'seccionadores', feminine: false,
        children: null,
    }),
    sectionInsulators: Object.freeze({
        path: 'section-insulators', title: 'Aisladores de sección', singular: 'aislador de sección',
        plural: 'aisladores de sección', feminine: false, children: 'sus agujas',
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
 * listas, pero queda en la base marcada como borrada, y lo que cuelga de ella no se toca.
 */
export function deleteWarning(master) {
    const it = master.feminine ? 'la' : 'lo'
    const deleted = master.feminine ? 'borrada' : 'borrado'
    const children = master.children
        ? ` Lo que cuelga de ${master.feminine ? 'ella' : 'él'} no se borra: ${master.children}.`
        : ''
    return `Desaparece de las listas: el servicio ${it} marca como ${deleted} y desde aquí no se puede recuperar.${children}`
}

/** Las casillas en una lista: «Sí» o «No». */
export function yesNo(value) {
    return value === true ? 'Sí' : 'No'
}

/** Cómo se nombra una fila en los mensajes: por su nombre, o por su id si no tiene. */
export function nameOf(row) {
    return row?.name ? row.name : `#${row?.id}`
}
