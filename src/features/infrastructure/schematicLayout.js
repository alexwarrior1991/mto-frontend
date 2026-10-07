/**
 * Las cuentas del esquema de una vía (el port de SchematicDrawing del backoffice, sin el SVG en
 * texto): dónde va cada poste, hacia qué lado salen las ménsulas, dónde cae cada aislador y qué dice
 * cada elemento al pasar por encima.
 *
 * Es esquemático a propósito, no el plano: la distancia entre postes es siempre la misma, el KP se
 * escribe debajo de cada uno y los postes van en el orden en que los manda el servicio, que es el
 * orden físico de la vía. Aquí no se ordena, suma ni interpreta nada: si el dibujo necesita otro dato,
 * se añade a la proyección en mto-configuration.
 */

/** Distancia horizontal entre dos postes, en px: la misma para todos, sea cual sea el vano. */
export const STEP = 140
/** Margen a cada lado del primer y del último poste. */
export const MARGIN = 90
/** La altura de la línea de la vía. */
export const LINE_Y = 250
/** La altura del extremo superior de cada poste. */
export const POLE_TOP = 100
export const HEIGHT = 350
export const MIN_WIDTH = 480
export const ARM_LENGTH = 38

export const LEGEND = 'Un poste por perfil, a distancia uniforme y en el orden físico de la vía, con el código encima '
    + 'y el KP debajo; los brazos azules son las ménsulas (con su tipo), el rombo un seccionador y la marca roja '
    + 'sobre la vía un aislador de sección. El detalle de cada elemento sale al pasar por encima.'

const NUMBER = /^-?\d+(\.\d+)?$/

/** La proyección con sus listas siempre presentes: lo que el servicio no manda es una lista vacía. */
export function normalizeSchematic(schematic) {
    return {
        ...schematic,
        stations: schematic?.stations ?? [],
        profiles: (schematic?.profiles ?? []).map((profile) => ({
            ...profile,
            sectionings: profile.sectionings ?? [],
            cantilevers: profile.cantilevers ?? [],
            disconnector: profile.disconnector ?? null,
        })),
        sectionInsulators: (schematic?.sectionInsulators ?? []).map((mark) => ({...mark, switches: mark.switches ?? []})),
    }
}

/** El ancho del dibujo para ese número de postes. */
export function width(profiles) {
    return Math.max(MIN_WIDTH, 2 * MARGIN + STEP * Math.max(0, profiles - 1))
}

/** La abscisa del poste que ocupa esa posición en la vía. */
export function xOf(index) {
    return MARGIN + index * STEP
}

/** -1 si el poste está a la izquierda de la vía (railPoleDistance negativo); 1 si no. */
export function armDirection(profile) {
    const distance = number(profile.railPoleDistance)
    return distance !== null && distance < 0 ? -1 : 1
}

/**
 * Dónde va un aislador de ese KP: entre los dos postes vecinos que lo encierran, a la distancia
 * proporcional; antes del primero o después del último, medio paso fuera; sin KP, al final. Se compara
 * tramo a tramo y vale el primero que lo contiene, así que una vía con dos tramos y la kilometración
 * reiniciada también lo coloca.
 */
export function insulatorX(profiles, kp) {
    const value = number(kp)
    if (profiles.length === 0 || value === null) {
        return xOf(Math.max(0, profiles.length - 1)) + STEP / 2
    }
    for (let i = 0; i + 1 < profiles.length; i++) {
        const from = number(profiles[i].kp)
        const to = number(profiles[i + 1].kp)
        if (from === null || to === null) {
            continue
        }
        if (value >= Math.min(from, to) && value <= Math.max(from, to)) {
            if (from === to) {
                return xOf(i) + STEP / 2
            }
            return xOf(i) + ((value - from) / (to - from)) * STEP
        }
    }
    const first = number(profiles[0].kp)
    if (first !== null && value < first) {
        return Math.max(MARGIN / 3, xOf(0) - STEP / 2)
    }
    return xOf(profiles.length - 1) + STEP / 2
}

/** «Esquema · VIA 1 (EP4)». */
export function schematicTitle(schematic) {
    const name = schematic.trackName ?? `#${schematic.trackId}`
    return `Esquema · ${name}${schematic.executionPackageName ? ` (${schematic.executionPackageName})` : ''}`
}

/** Los recuentos y las estaciones: «2 perfiles · 1 ménsula · 1 seccionador · 1 aislador · Estaciones: …». */
export function schematicSummary(schematic) {
    const profiles = schematic.profiles
    const cantilevers = profiles.reduce((total, profile) => total + profile.cantilevers.length, 0)
    const disconnectors = profiles.filter((profile) => profile.disconnector).length
    const stations = schematic.stations.length === 0 ? 'sin estaciones' : `Estaciones: ${schematic.stations.join(', ')}`
    return [
        count(profiles.length, 'perfil', 'perfiles'),
        count(cantilevers, 'ménsula', 'ménsulas'),
        count(disconnectors, 'seccionador', 'seccionadores'),
        count(schematic.sectionInsulators.length, 'aislador', 'aisladores'),
        stations,
    ].join(' · ') + (schematic.enabled === false ? ' · vía inactiva' : '')
}

export function poleTitle(profile) {
    const parts = [profile.code ? `Perfil ${profile.code}` : 'Perfil', `KP ${profile.kp ?? '?'}`]
    if (profile.orderInTrack !== null && profile.orderInTrack !== undefined) {
        parts.push(`orden ${profile.orderInTrack}`)
    }
    addIf(parts, 'vano ', profile.span)
    addIf(parts, 'poste ', profile.poleType)
    addIf(parts, 'apoyo ', profile.supportType)
    addIf(parts, 'estado ', profile.profileStatus)
    addIf(parts, 'distancia carril-poste ', profile.railPoleDistance)
    if (profile.sectionings.length > 0) {
        parts.push(`seccionamiento ${profile.sectionings.join(', ')}`)
    }
    return parts.join(' · ')
}

export function armTitle(arm) {
    const parts = [arm.type ? `Ménsula ${arm.type}` : 'Ménsula']
    addIf(parts, 'descentramiento ', arm.stagger)
    addIf(parts, 'altura hilo ', arm.cwHeight)
    addIf(parts, 'altura catenaria ', arm.catenaryHeight)
    const hasLength = arm.steadyArmLength !== null && arm.steadyArmLength !== undefined
    if (arm.steadyArmType || hasLength) {
        parts.push(join(' ', 'brazo', arm.steadyArmType, hasLength ? `${arm.steadyArmLength} mm` : null))
    }
    return parts.join(' · ')
}

export function disconnectorTitle(disconnector) {
    const parts = [disconnector.name ? `Seccionador ${disconnector.name}` : 'Seccionador']
    if (disconnector.onLoad !== null && disconnector.onLoad !== undefined) {
        parts.push(disconnector.onLoad === true ? 'en carga' : 'sin carga')
    }
    addIf(parts, 'función ', disconnector.function)
    addIf(parts, 'estación ', disconnector.station)
    addIf(parts, 'en paralelo con ', disconnector.connectedTrack)
    return parts.join(' · ')
}

export function insulatorTitle(mark) {
    const parts = [mark.name ? `Aislador de sección ${mark.name}` : 'Aislador de sección', `KP ${mark.kp ?? '?'}`]
    addIf(parts, '', installation(mark.installationType))
    if (mark.track || mark.connectedTrack) {
        parts.push(join(' ↔ ', mark.track, mark.connectedTrack))
    }
    addIf(parts, 'estación ', mark.station)
    if (mark.enabled === false) {
        parts.push('inactivo')
    }
    if (mark.switches.length > 0) {
        parts.push(`agujas ${mark.switches.map((aguja) => switchLabel(aguja) + (aguja.kp ? ` KP ${aguja.kp}` : '')).join(', ')}`)
    }
    return parts.join(' · ')
}

/** Lo que se escribe bajo un aislador: cómo está instalado, la otra vía y su estación. */
export function insulatorDetail(mark, trackName) {
    const other = otherTrack(mark, trackName)
    return join(' · ', installation(mark.installationType), other ? `↔ ${other}` : null, mark.station)
}

export function installation(installationType) {
    if (!installationType) {
        return null
    }
    if (installationType === 'TRACK_CONNECTION') {
        return 'conexión de vías'
    }
    return installationType === 'IN_TRACK' ? 'en vía' : installationType
}

/** La otra vía del aislador: la que no es la dibujada. */
export function otherTrack(mark, trackName) {
    if (mark.connectedTrack && mark.connectedTrack !== trackName) {
        return mark.connectedTrack
    }
    if (mark.track && mark.track !== trackName) {
        return mark.track
    }
    return null
}

/** «W31 1:9». */
export function switchLabel(aguja) {
    const code = aguja.code ?? 'aguja'
    return aguja.turnoutDenominator === null || aguja.turnoutDenominator === undefined
        ? code
        : `${code} 1:${aguja.turnoutDenominator}`
}

export function join(separator, ...values) {
    return values.filter((value) => value !== null && value !== undefined && String(value).trim() !== '').join(separator)
}

/** Las medidas llegan como texto; lo que no es un número no se usa para colocar nada. */
export function number(value) {
    const text = String(value ?? '').trim()
    return NUMBER.test(text) ? Number(text) : null
}

function addIf(parts, prefix, value) {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
        parts.push(`${prefix}${value}`)
    }
}

function count(n, singular, plural) {
    return `${n} ${n === 1 ? singular : plural}`
}
