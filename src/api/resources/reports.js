import {apiFetch} from '../http.js'
import {resourcesPath} from './values.js'

/**
 * El informe de mto-resources que compara el perfil de puesto de Keycloak (mto-position-*, lo que alguien
 * puede hacer) con la categoría de cada persona (el puesto que ocupa). Lo calcula el servicio al pedirlo,
 * leyendo Keycloak con su cuenta de servicio de solo lectura; si no puede, 503 KCK-503. Dice, no arregla:
 * un suplente puede llevar otro perfil a propósito.
 */
export function positionDiscrepancies({signal} = {}) {
    return apiFetch(resourcesPath('reports', 'position-discrepancies'), {signal})
}

/** Las cuatro listas del informe, en el orden en que se enseñan, con su título. */
export const DISCREPANCY_SECTIONS = Object.freeze([
    {key: 'wrongProfile', title: 'Con otro perfil'},
    {key: 'severalProfiles', title: 'Con varios perfiles'},
    {key: 'withoutProfile', title: 'Sin perfil de puesto'},
    {key: 'withoutRecord', title: 'Con perfil y sin ficha'},
])
