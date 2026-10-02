import {
    ARM_LENGTH, armDirection, armTitle, disconnectorTitle, HEIGHT, insulatorDetail, insulatorTitle, insulatorX, join,
    LINE_Y, MARGIN, POLE_TOP, poleTitle, switchLabel, width, xOf,
} from './schematicLayout.js'

const SANS = 'sans-serif'

/** Los estilos del dibujo, los del backoffice, como atributos del SVG: no dependen de ninguna hoja. */
const STYLE = Object.freeze({
    track: {stroke: '#263238', strokeWidth: 4},
    pole: {stroke: '#455a64', strokeWidth: 3},
    base: {fill: '#455a64'},
    arm: {stroke: '#1565c0', strokeWidth: 2.5, fill: 'none'},
    wire: {fill: '#1565c0'},
    code: {fontFamily: SANS, fontSize: 12, fontWeight: 600, fill: '#263238', textAnchor: 'middle'},
    small: {fontFamily: SANS, fontSize: 10, fill: '#546e7a', textAnchor: 'middle'},
    name: {fontFamily: SANS, fontSize: 11, fontWeight: 600, fill: '#263238'},
    kp: {fontFamily: 'monospace', fontSize: 11, fill: '#37474f', textAnchor: 'middle'},
    sectioning: {fontFamily: SANS, fontSize: 10, fontWeight: 600, fill: '#2e7d32', textAnchor: 'middle'},
    armLabel: {fontFamily: SANS, fontSize: 10, fill: '#1565c0'},
    disconnector: {fill: '#f9a825', stroke: '#6d4c41', strokeWidth: 1.5},
    disconnectorLabel: {fontFamily: SANS, fontSize: 10, fontWeight: 600, fill: '#6d4c41'},
    insulator: {fill: '#c62828'},
    insulatorLabel: {fontFamily: SANS, fontSize: 10, fontWeight: 600, fill: '#c62828', textAnchor: 'middle'},
})

/**
 * El dibujo de una vía: una línea recta (la vía) y, sobre ella, un poste por perfil a distancia
 * uniforme, con su código, su tipo y estado, su KP, sus seccionamientos, sus ménsulas como brazos
 * cortos (con el tipo, hacia el lado que da el signo de railPoleDistance) y su seccionador como un
 * rombo. Los aisladores van sobre la línea, entre sus vecinos por KP, con sus agujas. Cada elemento
 * lleva su detalle en un <title>, que el navegador enseña al pasar por encima.
 *
 * Todo texto del servicio se pinta como texto de React, que lo escapa: nada se convierte en HTML.
 *
 * @param {object} schematic la proyección normalizada (normalizeSchematic)
 */
export default function SchematicSvg({schematic}) {
    const {profiles, sectionInsulators: insulators, trackName} = schematic
    const drawingWidth = width(profiles.length)
    const lineStart = MARGIN / 3
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={drawingWidth} height={HEIGHT} viewBox={`0 0 ${drawingWidth} ${HEIGHT}`}
             role="img" aria-label={`Esquema de la vía ${trackName ?? ''}`.trim()}>
            <line {...STYLE.track} x1={lineStart} y1={LINE_Y} x2={drawingWidth - lineStart} y2={LINE_Y}/>
            <text {...STYLE.name} x={lineStart} y={LINE_Y - 8}>{trackName}</text>
            {profiles.map((profile, index) => <Pole key={`pole-${profile.id ?? index}`} profile={profile} x={xOf(index)}/>)}
            {insulators.map((mark, index) => (
                <Insulator key={`insulator-${mark.id ?? index}`} mark={mark} x={insulatorX(profiles, mark.kp)} trackName={trackName}/>
            ))}
        </svg>
    )
}

function Pole({profile, x}) {
    const direction = armDirection(profile)
    const under = join(' · ', profile.poleType, profile.profileStatus)
    return (
        <g data-kind="pole" data-id={profile.id}>
            <title>{poleTitle(profile)}</title>
            <line {...STYLE.pole} x1={x} y1={POLE_TOP} x2={x} y2={LINE_Y}/>
            <circle {...STYLE.base} cx={x} cy={LINE_Y} r={4}/>
            {profile.cantilevers.map((arm, index) => {
                const y = POLE_TOP + 8 + index * 16
                const tip = x + direction * ARM_LENGTH
                return (
                    <g key={`arm-${arm.id ?? index}`} data-kind="arm" data-id={arm.id}>
                        <title>{armTitle(arm)}</title>
                        <path {...STYLE.arm} d={`M${x} ${y} L${tip} ${y + 10}`}/>
                        <circle {...STYLE.wire} cx={tip} cy={y + 10} r={2.5}/>
                        {arm.type && (
                            <text {...STYLE.armLabel} x={tip + direction * 4} y={y + 13} textAnchor={direction < 0 ? 'end' : 'start'}>
                                {arm.type}
                            </text>
                        )}
                    </g>
                )
            })}
            <text {...STYLE.code} x={x} y={POLE_TOP - 26}>{profile.code}</text>
            {under && <text {...STYLE.small} x={x} y={POLE_TOP - 12}>{under}</text>}
            <text {...STYLE.kp} x={x} y={LINE_Y + 22}>{`KP ${profile.kp ?? '?'}`}</text>
            {profile.sectionings.length > 0 && (
                <text {...STYLE.sectioning} x={x} y={LINE_Y + 38}>{profile.sectionings.join(', ')}</text>
            )}
            {profile.disconnector && <Disconnector disconnector={profile.disconnector} x={x - direction * 16} direction={direction}/>}
        </g>
    )
}

function Disconnector({disconnector, x, direction}) {
    const y = LINE_Y - 60
    const anchor = direction < 0 ? 'start' : 'end'
    return (
        <g data-kind="disconnector" data-id={disconnector.id}>
            <title>{disconnectorTitle(disconnector)}</title>
            <path {...STYLE.disconnector} d={`M${x} ${y - 8} L${x + 8} ${y} L${x} ${y + 8} L${x - 8} ${y} Z`}/>
            <text {...STYLE.disconnectorLabel} x={x - direction * 12} y={y + 4} textAnchor={anchor}>{disconnector.name}</text>
            {disconnector.station && (
                <text {...STYLE.small} x={x - direction * 12} y={y + 16} textAnchor={anchor}>{disconnector.station}</text>
            )}
        </g>
    )
}

function Insulator({mark, x, trackName}) {
    const detail = insulatorDetail(mark, trackName)
    return (
        <g data-kind="insulator" data-id={mark.id}>
            <title>{insulatorTitle(mark)}</title>
            <rect {...STYLE.insulator} x={x - 5} y={LINE_Y - 9} width={10} height={18} rx={2}/>
            <text {...STYLE.insulatorLabel} x={x} y={LINE_Y + 58}>{mark.name}</text>
            {detail && <text {...STYLE.small} x={x} y={LINE_Y + 72}>{detail}</text>}
            {mark.switches.length > 0 && (
                <text {...STYLE.small} x={x} y={LINE_Y + 86}>{mark.switches.map(switchLabel).join(', ')}</text>
            )}
        </g>
    )
}
