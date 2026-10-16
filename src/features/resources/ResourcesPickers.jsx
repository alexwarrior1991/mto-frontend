import {searchPeople} from '../../api/resources/people.js'
import {personLabel} from '../../api/resources/values.js'
import ServerSearchMultiSelect from '../../ui/ServerSearchMultiSelect.jsx'
import ServerSearchSelect from '../../ui/ServerSearchSelect.jsx'
import {resourcesKey} from './useResources.js'

/**
 * Los desplegables de personas (el port de ResourcesPickers), buscadas en el servidor mientras se
 * escribe: solo las activas y solo de las categorías que admite lo que se elige (el jefe de una unidad
 * según su nivel, los linemen operarios o jefes de equipo), para no ofrecer lo que el servicio va a
 * rechazar. Quien decide sigue siendo el servicio (409 UNI-001).
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
