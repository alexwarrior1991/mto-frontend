/**
 * Los nombres de los maestros a los que apuntan los ids de una fila (executionPackageId, stationId,
 * trackId, companyId). Es el port de ReferenceCatalog del backoffice: el servicio devuelve ids, y una
 * persona quiere leer nombres y elegir de un desplegable.
 *
 * Una estación o una vía se nombran con su paquete, porque «TRACK 1» existe en varios. Lo que no está
 * en lo cargado (borrado, o fuera de las primeras mil filas) se enseña como #id.
 */

export function buildReferenceCatalog({packages = [], stations = [], tracks = [], companies = []} = {}) {
    const packageNames = new Map(packages.map((row) => [row.id, row.name ?? `#${row.id}`]))
    const withPackage = (row) => {
        const packageName = packageNames.get(row.executionPackageId) ?? ''
        return packageName ? `${row.name} (${packageName})` : String(row.name ?? `#${row.id}`)
    }
    const stationLabels = new Map(stations.map((row) => [row.id, withPackage(row)]))
    const trackLabels = new Map(tracks.map((row) => [row.id, withPackage(row)]))
    const companyLabels = new Map(companies.map((row) => [row.id, companyLabel(row)]))

    return {
        packageName: (id) => labelOf(packageNames, id),
        stationName: (id) => labelOf(stationLabels, id),
        trackName: (id) => labelOf(trackLabels, id),
        companyName: (id) => labelOf(companyLabels, id),
        packageOptions: options(packageNames),
        stationOptions: options(stationLabels),
        trackOptions: options(trackLabels),
        companyOptions: options(companyLabels),
    }
}

/** Un perfil se nombra con su KP, porque el mismo identificador puede estar dos veces en una vía. */
export function profileLabel(profile) {
    return profile?.profileId ? `${profile.profileId} (kp ${profile.kp})` : `#${profile?.id}`
}

/**
 * El perfil del que cuelga un seccionador, con lo que trae la propia fila (profileCode y profileKp,
 * solo de salida): la lista no va perfil por perfil. Sin código, el id es mejor que nada.
 */
export function disconnectorProfileLabel(row) {
    if (row?.profileCode) {
        return row.profileKp ? `${row.profileCode} (kp ${row.profileKp})` : row.profileCode
    }
    return row?.profileId === null || row?.profileId === undefined ? '' : `#${row.profileId}`
}

/** Una empresa en un desplegable: su nombre y su NIF. */
export function companyLabel(row) {
    const name = row?.name ?? `#${row?.id}`
    return row?.identificationNumber ? `${name} (${row.identificationNumber})` : name
}

/**
 * Las opciones de un desplegable, con la que tiene la fila aunque ya no esté en la lista: un id que
 * no se sabe nombrar sale como #id, para que no se lea como vacío.
 *
 * @param {Array<{value: string, label: string}>} options
 * @param {number|string|null} current
 */
export function withCurrent(options, current, label = null) {
    if (current === null || current === undefined || current === '') {
        return options
    }
    const value = String(current)
    if (options.some((option) => option.value === value)) {
        return options
    }
    return [{value, label: label ?? `#${value}`}, ...options]
}

function labelOf(labels, id) {
    if (id === null || id === undefined) {
        return ''
    }
    return labels.get(id) ?? `#${id}`
}

function options(labels) {
    return [...labels.entries()].map(([id, label]) => ({value: String(id), label}))
}
