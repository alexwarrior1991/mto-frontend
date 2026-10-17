import {toLocalDateParam} from '../dates.js'
import {prefixOf} from '../services.js'

/**
 * Lo que comparten los módulos de mto-resources: su prefijo, cómo se nombra una persona (el port de
 * los label() de sus DTO en el backoffice) y cómo está una caducidad.
 */

export function resourcesPath(...segments) {
    return [prefixOf('mto-resources'), ...segments.map((segment) => encodeURIComponent(segment))].join('/')
}

/** «PER-000003 · Yossi Cohen», como se nombra una persona en los títulos y las confirmaciones. */
export function personLabel(person) {
    if (!person) {
        return ''
    }
    const name = typeof person.fullName === 'string' ? person.fullName.trim() : ''
    return name ? `${person.code} · ${name}` : (person.code ?? '')
}

/** «A · Equipo A», o solo el código si el nombre no dice más. */
export function unitLabel(unit) {
    if (!unit) {
        return ''
    }
    const name = typeof unit.name === 'string' ? unit.name.trim() : ''
    return name && name !== unit.code ? `${unit.code} · ${name}` : (unit.code ?? '')
}

/** Los días de antelación con los que se avisa una caducidad: los de app.resources.expiry.warning-days del servicio. */
export const EXPIRY_WARNING_DAYS = 30

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 24 * 60 * 60 * 1000

/** Hoy en la zona del navegador, como YYYY-MM-DD. */
export function todayLocalDate(now = new Date()) {
    return toLocalDateParam(now)
}

/** Los días de una fecha a otra (YYYY-MM-DD), negativos si la segunda es anterior; null si falta alguna. */
export function daysBetween(from, to) {
    const left = LOCAL_DATE.exec(from ?? '')
    const right = LOCAL_DATE.exec(to ?? '')
    if (!left || !right) {
        return null
    }
    const utc = (match) => Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    return Math.round((utc(right) - utc(left)) / DAY_MS)
}

/**
 * Cómo está una caducidad (una cualificación, un documento de un vehículo, la calibración de un
 * instrumento) frente a hoy: NONE sin fecha (no caduca, o sin calibración), EXPIRED caducada, EXPIRING
 * si caduca en 30 días o menos y VALID si está vigente, con los días que faltan (negativos si ya
 * caducó). Si la respuesta dice si está caducada (expired, calculado en la zona del servicio), manda
 * ella: aquí solo se cuentan los días para decirlo.
 *
 * @param {string|null} expiresOn YYYY-MM-DD
 * @param {object} [options]
 * @param {boolean|null} [options.expired] lo que dice el servicio, si lo dice
 * @param {string} [options.today] YYYY-MM-DD; hoy en el navegador si no se dice
 * @returns {{state: 'NONE'|'EXPIRED'|'EXPIRING'|'VALID', daysLeft: number|null}}
 */
export function expiryState(expiresOn, {expired = null, today = todayLocalDate(), warningDays = EXPIRY_WARNING_DAYS} = {}) {
    const daysLeft = daysBetween(today, expiresOn)
    if (daysLeft === null) {
        return {state: expired === true ? 'EXPIRED' : 'NONE', daysLeft: null}
    }
    if (expired === true || (expired !== false && daysLeft < 0)) {
        return {state: 'EXPIRED', daysLeft}
    }
    // El servicio dice que no ha caducado: en su zona aún es el día de la caducidad.
    const left = Math.max(daysLeft, 0)
    return {state: left <= warningDays ? 'EXPIRING' : 'VALID', daysLeft: left}
}
