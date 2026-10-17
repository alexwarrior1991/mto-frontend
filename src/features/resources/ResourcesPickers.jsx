import {searchInstruments} from '../../api/resources/instruments.js'
import {searchPeople} from '../../api/resources/people.js'
import {expiryState, personLabel, unitLabel} from '../../api/resources/values.js'
import {searchVehicles} from '../../api/resources/vehicles.js'
import ServerSearchMultiSelect from '../../ui/ServerSearchMultiSelect.jsx'
import ServerSearchSelect from '../../ui/ServerSearchSelect.jsx'
import {resourcesKey} from './useResources.js'

/**
 * Los desplegables de personas, vehículos e instrumentos de mto-resources (el port de ResourcesPickers),
 * buscados en el servidor mientras se escribe: solo las personas activas y de las categorías que admite
 * lo que se elige (el jefe de una unidad según su nivel, los linemen operarios o jefes de equipo, el
 * jefe de un turno cualquiera menos un operario), solo los vehículos activos y disponibles y solo los
 * instrumentos activos, para no ofrecer lo que el servicio va a rechazar. Un instrumento con la
 * calibración caducada se ofrece marcado, porque lo que cuenta es la fecha del turno. Quien decide
 * sigue siendo el servicio (409 UNI-001, o SHF-001 en un turno). Los usan el organigrama y los turnos de
 * mantenimiento.
 */

/** Una persona como opción de un desplegable, con su resumen (para saber si es el jefe, su categoría…). */
function personOption(person) {
    return {value: person.id, label: personLabel(person), person}
}

function searchFor(categories) {
    return async (text, {signal}) => {
        if (categories.length === 0) {
            return []
        }
        const page = await searchPeople({search: text, categories, active: true, size: 20}, {signal})
        return page.content.map(personOption)
    }
}

/**
 * @param {string[]} categories las que se ofrecen; vacías, ninguna
 * @param {object|null} current la persona que ya tiene el campo (un resumen de la API), ya nombrada
 */
export function PersonSelect({categories, current = null, ...props}) {
    return (
        <ServerSearchSelect queryKey={resourcesKey('people-picker', categories)} search={searchFor(categories)} searchWhenEmpty clearable
                            current={current ? personOption(current) : null} placeholder="Escribe su nombre o su código" {...props}/>
    )
}

/** Varias personas, como PersonSelect; current son los resúmenes de las que ya tiene el campo. */
export function PeopleMultiSelect({categories, current = [], ...props}) {
    return (
        <ServerSearchMultiSelect queryKey={resourcesKey('people-picker', categories)} search={searchFor(categories)} searchWhenEmpty clearable
                                 current={current.map(personOption)} placeholder="Escribe su nombre o su código" {...props}/>
    )
}

function vehicleOption(vehicle) {
    return {value: vehicle.vehicleId ?? vehicle.id, label: unitLabel(vehicle)}
}

async function searchAvailableVehicles(text, {signal}) {
    const page = await searchVehicles({search: text, available: true, active: true, size: 20}, {signal})
    return page.content.map(vehicleOption)
}

/** Varios vehículos activos y disponibles; current son los que ya tiene el campo (los de un turno, con vehicleId). */
export function VehiclesMultiSelect({current = [], ...props}) {
    return (
        <ServerSearchMultiSelect queryKey={resourcesKey('vehicle-picker')} search={searchAvailableVehicles} searchWhenEmpty clearable
                                 current={current.map(vehicleOption)} placeholder="Escribe su código" {...props}/>
    )
}

/** Un instrumento como opción: «PT-01 · Pértiga 1», y «· calibración caducada» si lo está hoy. */
function instrumentOption(instrument) {
    const expired = expiryState(instrument.calibrationExpiresOn, {expired: instrument.calibrationExpired ?? null}).state === 'EXPIRED'
    return {value: instrument.id, label: expired ? `${unitLabel(instrument)} · calibración caducada` : unitLabel(instrument)}
}

async function searchActiveInstruments(text, {signal}) {
    const page = await searchInstruments({search: text, active: true, size: 20}, {signal})
    return page.content.map(instrumentOption)
}

/** Varios instrumentos activos; current son los que ya tiene el campo (los de un turno). */
export function InstrumentsMultiSelect({current = [], ...props}) {
    return (
        <ServerSearchMultiSelect queryKey={resourcesKey('instrument-picker')} search={searchActiveInstruments} searchWhenEmpty clearable
                                 current={current.map(instrumentOption)} placeholder="Escribe su código" {...props}/>
    )
}
