import {isSynchronizedProject} from '../../api/stock/catalogues.js'
import {RESERVATION_STATUS} from '../../api/stock/reservations.js'
import {codeAndName} from '../../api/stock/values.js'
import {formatQuantity} from '../../ui/format.js'

/**
 * Los textos del módulo de almacén: cómo se llaman sus catálogos, cómo se cuentan las filas (en
 * singular la que es una), cómo se describe cada fila en su historial y qué dicen los avisos.
 */

/** Las pantallas de catálogo, por su ruta en mto-stock. */
export const CATALOGUES = Object.freeze({
    materials: Object.freeze({catalogue: 'materials', title: 'Materiales', singular: 'material', plural: 'materiales'}),
    warehouses: Object.freeze({catalogue: 'warehouses', title: 'Almacenes', singular: 'almacén', plural: 'almacenes'}),
    suppliers: Object.freeze({catalogue: 'suppliers', title: 'Proveedores', singular: 'proveedor', plural: 'proveedores'}),
    projects: Object.freeze({catalogue: 'projects', title: 'Proyectos', singular: 'proyecto', plural: 'proyectos'}),
    assemblies: Object.freeze({catalogue: 'assemblies', title: 'Conjuntos', singular: 'conjunto', plural: 'conjuntos'}),
})

export function countText(total, singular, plural) {
    return `${total} ${total === 1 ? singular : plural}`
}

export function stateText(active) {
    return active === true ? 'activo' : 'retirado'
}

/** Cómo se llama una fila: «MAT-001 - Hilo de contacto». */
export function entryLabel(entry) {
    return codeAndName(entry?.code, entry?.name)
}

/** Una cantidad con la unidad de su material, si la tiene: «12.5 m». */
export function quantityWithUnit(quantity, material) {
    const unit = material?.unitOfMeasure
    return unit ? `${formatQuantity(quantity)} ${unit}` : formatQuantity(quantity)
}

/** El origen de un proyecto: lo sincronizado es de mto-configuration y no se modifica aquí. */
export function projectOrigin(project) {
    return isSynchronizedProject(project) ? `sincronizado de ${project.sourceService ?? 'datos maestros'}` : 'manual'
}

/** Una línea con cada fila tal como está, o como quedó en una revisión del historial. */
export function describeMaterial(material) {
    return `${entryLabel(material)} · ${material.unitOfMeasure ?? ''} · mínimo ${formatQuantity(material.minimumStockLevel)} · ${stateText(material.active)}`
}

export function describeEntry(entry) {
    return `${entryLabel(entry)} · ${stateText(entry.active)}`
}

export function describeProject(project) {
    const origin = isSynchronizedProject(project) ? ` · ${projectOrigin(project)}` : ''
    return `${entryLabel(project)}${origin} · ${stateText(project.active)}`
}

export function describeAssembly(assembly) {
    const lines = assembly.components ?? []
    const bom = lines.map((line) => `${line.material?.code ?? '?'} x${formatQuantity(line.quantity)}`).join(', ')
    return `${entryLabel(assembly)} · ${countText(lines.length, 'línea', 'líneas')} (${bom}) · ${stateText(assembly.active)}`
}

export function describeReservation(reservation) {
    return `${quantityWithUnit(reservation.quantity, reservation.material)} de ${codeOf(reservation.material)}`
        + ` en ${codeOf(reservation.warehouse)} para ${codeOf(reservation.project)} · ${RESERVATION_STATUS.label(reservation.status)}`
}

/** Cómo se nombra una reserva en un título: «la reserva de MAT-001 para PRJ-001». */
export function reservationLabel(reservation) {
    return `la reserva de ${codeOf(reservation.material)} para ${codeOf(reservation.project)}`
}

/** El aviso de una reserva que cambió: «Reserva liberada: 5 m de MAT-001». */
export function reservationDoneText(done, reservation) {
    return `${done}: ${quantityWithUnit(reservation.quantity, reservation.material)} de ${codeOf(reservation.material)}`
}

/** Cuántos conjuntos se pueden montar en un almacén: «3 conjuntos montables en WH-000». */
export function producibleText(quantity, warehouseCode) {
    const what = Number(quantity) === 1 ? 'conjunto montable' : 'conjuntos montables'
    return `${formatQuantity(quantity)} ${what} en ${warehouseCode}`
}

function codeOf(reference) {
    return reference?.code ?? '?'
}
