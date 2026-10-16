import {idOrNull, numberOrNull, textOrNull, withoutNulls} from '../bodies.js'
import {apiFetch} from '../http.js'
import {buildMergePatch, MERGE_PATCH} from '../mergePatch.js'
import {sortWithTieBreak, toPage, toPageParams} from '../paging.js'
import {runsOnRoad, runsOnTrack} from './enums.js'
import {resourcesPath} from './values.js'

/**
 * Los catálogos de la flota de mto-resources: el port de VehicleTypeClient, ParkingSiteClient y sus
 * formularios del backoffice.
 *
 * - Un modelo de vehículo (resources-fleet-write): mobility decide el resto. Las cifras de vía no van
 *   en uno de solo carretera, las de bivial fuera de una bivial ni las de carretera en uno de solo vía;
 *   las de una capacidad, sin ella. El código y la movilidad no cambian. Un modelo incoherente es un 400
 *   con el motivo.
 * - Un sitio de aparcamiento (resources-write): se llega por vía, por carretera o por las dos; con
 *   acceso por vía dice su vía; las coordenadas van juntas.
 * - Ninguno se borra: DELETE retira (resources-delete) y un PATCH active=true lo vuelve a ofrecer. No
 *   tienen historial: son catálogos.
 */

export const BY_CODE = Object.freeze(['code,asc'])

/** Dónde va una cifra del modelo en el editor. */
export const SECTION = Object.freeze({GENERAL: 'GENERAL', TRACK: 'TRACK', ROAD_RAIL: 'ROAD_RAIL', ROAD: 'ROAD', CAPABILITY: 'CAPABILITY'})

/**
 * Las cifras de un modelo: su campo (el de la petición, que es también el que trae un error del
 * servicio), su etiqueta, la columna del servicio (decimals 0 es un entero, con su mínimo) y la
 * capacidad sin la que no existe. Es la misma tabla que VehicleTypeForm.FIGURES del backoffice.
 */
export const VEHICLE_TYPE_FIGURES = Object.freeze([
    {field: 'lengthM', label: 'Largo (m)', section: SECTION.GENERAL, integers: 4, decimals: 2},
    {field: 'widthM', label: 'Ancho (m)', section: SECTION.GENERAL, integers: 3, decimals: 2},
    {field: 'heightM', label: 'Alto (m)', section: SECTION.GENERAL, integers: 3, decimals: 2},
    {field: 'tareT', label: 'Tara (t)', section: SECTION.GENERAL, integers: 6, decimals: 2},
    {field: 'maxGrossT', label: 'Masa máxima (t)', section: SECTION.GENERAL, integers: 6, decimals: 2},
    {field: 'maxAxleLoadT', label: 'Carga por eje (t)', section: SECTION.GENERAL, integers: 4, decimals: 2},
    {field: 'axles', label: 'Ejes', section: SECTION.GENERAL, integers: 0, decimals: 0, min: 1},
    {field: 'seats', label: 'Plazas', section: SECTION.GENERAL, integers: 0, decimals: 0, min: 0},
    {field: 'payloadT', label: 'Carga útil (t)', section: SECTION.GENERAL, integers: 6, decimals: 2},
    {field: 'trackGaugeMm', label: 'Ancho de vía (mm)', section: SECTION.TRACK, integers: 0, decimals: 0, min: 1},
    {field: 'maxSpeedTrackWorkingKmh', label: 'Velocidad de trabajo (km/h)', section: SECTION.TRACK, integers: 0, decimals: 0, min: 0},
    {field: 'maxSpeedTrackTransportKmh', label: 'Velocidad de transporte (km/h)', section: SECTION.TRACK, integers: 0, decimals: 0, min: 0},
    {field: 'maxGradientPermille', label: 'Pendiente máxima (por mil)', section: SECTION.TRACK, integers: 4, decimals: 1},
    {field: 'minCurveRadiusM', label: 'Radio mínimo (m)', section: SECTION.TRACK, integers: 0, decimals: 0, min: 0},
    {field: 'maxWorkingCantMm', label: 'Peralte máximo de trabajo (mm)', section: SECTION.TRACK, integers: 0, decimals: 0, min: 0},
    {field: 'onTrackingMinutes', label: 'Minutos para encarrilar', section: SECTION.ROAD_RAIL, integers: 0, decimals: 0, min: 0},
    {field: 'maxSpeedRoadKmh', label: 'Velocidad por carretera (km/h)', section: SECTION.ROAD, integers: 0, decimals: 0, min: 0},
    {field: 'craneCapacityT', label: 'Grúa: capacidad (t)', section: SECTION.CAPABILITY, integers: 4, decimals: 2, capability: 'CRANE'},
    {field: 'craneReachM', label: 'Grúa: alcance (m)', section: SECTION.CAPABILITY, integers: 3, decimals: 2, capability: 'CRANE'},
    {field: 'platformHeightM', label: 'Plataforma: altura (m)', section: SECTION.CAPABILITY, integers: 3, decimals: 2,
        capability: 'ELEVATING_PLATFORM'},
    {field: 'platformLoadKg', label: 'Plataforma: carga (kg)', section: SECTION.CAPABILITY, integers: 0, decimals: 0, min: 0,
        capability: 'ELEVATING_PLATFORM'},
    {field: 'platformInsulationKv', label: 'Plataforma: aislamiento (kV)', section: SECTION.CAPABILITY, integers: 4, decimals: 1,
        capability: 'INSULATED_PLATFORM'},
    {field: 'towingCapacityT', label: 'Masa remolcable (t)', section: SECTION.CAPABILITY, integers: 6, decimals: 2, capability: 'TOWING'},
])

/** Si una sección se ofrece con esta movilidad. */
export function sectionOffered(section, mobility) {
    switch (section) {
        case SECTION.TRACK:
            return runsOnTrack(mobility)
        case SECTION.ROAD_RAIL:
            return mobility === 'ROAD_RAIL'
        case SECTION.ROAD:
            return runsOnRoad(mobility)
        default:
            return true
    }
}

/** Si una cifra viaja: su sección se ofrece y, si es de una capacidad, el modelo la tiene. */
export function figureTravels(figure, mobility, capabilities) {
    return sectionOffered(figure.section, mobility) && (!figure.capability || (capabilities ?? []).includes(figure.capability))
}

export async function searchVehicleTypes({search = '', mobility = null, category = null, capability = null, active = null, page = 1, size = 50,
    sort = null} = {}, {signal} = {}) {
    const body = await apiFetch(resourcesPath('vehicle-types'), {
        query: {search: textOrNull(search), mobility, category, capability, active, ...toPageParams({page, size}), sort: sortWithTieBreak(sort, BY_CODE)},
        signal,
    })
    return toPage(body)
}

/** 201; 409 VTY-409 si el código ya existe. */
export function createVehicleType(body) {
    return apiFetch(resourcesPath('vehicle-types'), {method: 'POST', json: body})
}

export function patchVehicleType(id, patch) {
    return apiFetch(resourcesPath('vehicle-types', id), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/** Retira: 204. Ningún vehículo nuevo es de él; los que ya lo son se quedan. */
export function retireVehicleType(id) {
    return apiFetch(resourcesPath('vehicle-types', id), {method: 'DELETE', responseType: 'none'})
}

export function offerVehicleTypeAgain(type) {
    return patchVehicleType(type.id, {active: true, version: type.version})
}

/** Los valores del modelo como viajan, desde lo escrito en su editor: lo que la movilidad no admite, a null. */
function vehicleTypeValues(values) {
    const {mobility} = values
    const capabilities = [...(values.capabilities ?? [])].sort()
    const figures = Object.fromEntries(VEHICLE_TYPE_FIGURES.map((figure) => [figure.field,
        figureTravels(figure, mobility, capabilities) ? numberOrNull(values[figure.field]) : null]))
    const track = sectionOffered(SECTION.TRACK, mobility)
    const roadRail = sectionOffered(SECTION.ROAD_RAIL, mobility)
    const road = sectionOffered(SECTION.ROAD, mobility)
    return {
        name: textOrNull(values.name),
        manufacturer: textOrNull(values.manufacturer),
        model: textOrNull(values.model),
        category: values.category ?? null,
        selfPropelled: values.selfPropelled !== false,
        portable: values.portable === true,
        power: values.power ?? null,
        ...figures,
        transportModeAuthorised: track ? values.transportModeAuthorised === true : null,
        railGearType: roadRail ? values.railGearType ?? null : null,
        needsPreparedAccess: roadRail ? values.needsPreparedAccess === true : null,
        requiredLicence: road ? values.requiredLicence ?? null : null,
        capabilities,
        notes: textOrNull(values.notes),
    }
}

/** El alta, desde lo escrito en su editor; lo vacío no viaja (las capacidades vacías tampoco). */
export function newVehicleTypeRequest(values) {
    const body = {code: textOrNull(values.code), mobility: values.mobility ?? null, ...vehicleTypeValues(values)}
    return withoutNulls({...body, capabilities: body.capabilities.length > 0 ? body.capabilities : null})
}

const VEHICLE_TYPE_TEXTS = Object.freeze(['name', 'manufacturer', 'model', 'notes'])
const VEHICLE_TYPE_ENUMS = Object.freeze(['category', 'power', 'railGearType', 'requiredLicence'])
const VEHICLE_TYPE_FLAGS = Object.freeze({selfPropelled: true, portable: false, transportModeAuthorised: false, needsPreparedAccess: false})

/**
 * La modificación: lo que cambió frente a lo leído, lo vaciado a null y la versión. Las capacidades
 * se comparan como conjunto y las que esta aplicación no conoce vuelven tal cual; una casilla sin
 * marcar no vacía un dato que el modelo no tenía. null si no cambió nada.
 */
export function vehicleTypePatch(original, values) {
    const after = vehicleTypeValues(values)
    const before = {...original, capabilities: [...(original.capabilities ?? [])].sort()}
    // Una casilla igual a lo que el servicio entiende sin dato no es un cambio, y la de una sección que
    // no se ofrece no viaja: nunca vacía.
    for (const [flag, whenMissing] of Object.entries(VEHICLE_TYPE_FLAGS)) {
        if (after[flag] === null || (before[flag] ?? whenMissing) === after[flag]) {
            after[flag] = before[flag] ?? null
        }
    }
    const numberFields = VEHICLE_TYPE_FIGURES.map((figure) => figure.field)
    return buildMergePatch(before, after, {
        fields: [...VEHICLE_TYPE_TEXTS, ...VEHICLE_TYPE_ENUMS, ...Object.keys(VEHICLE_TYPE_FLAGS), ...numberFields, 'capabilities'],
        numberFields, setFields: ['capabilities'], version: original.version,
    })
}

export async function searchParkingSites({search = '', kind = null, executionPackageId = null, active = null, page = 1, size = 50, sort = null} = {},
                                         {signal} = {}) {
    const body = await apiFetch(resourcesPath('parking-sites'), {
        query: {search: textOrNull(search), kind, executionPackageId, active, ...toPageParams({page, size}), sort: sortWithTieBreak(sort, BY_CODE)},
        signal,
    })
    return toPage(body)
}

/** 201; 409 PRK-409 si el código ya existe. */
export function createParkingSite(body) {
    return apiFetch(resourcesPath('parking-sites'), {method: 'POST', json: body})
}

export function patchParkingSite(id, patch) {
    return apiFetch(resourcesPath('parking-sites', id), {method: 'PATCH', json: patch, contentType: MERGE_PATCH})
}

/** Retira: 204; las ubicaciones registradas allí lo siguen nombrando. */
export function retireParkingSite(id) {
    return apiFetch(resourcesPath('parking-sites', id), {method: 'DELETE', responseType: 'none'})
}

export function offerParkingSiteAgain(site) {
    return patchParkingSite(site.id, {active: true, version: site.version})
}

const PLACE_FIELDS = Object.freeze(['executionPackageId', 'stationId', 'trackId'])

function parkingSiteValues(values, readsConfiguration) {
    return {
        name: textOrNull(values.name),
        kind: values.kind ?? null,
        ...Object.fromEntries(PLACE_FIELDS.map((field) => [field, readsConfiguration ? idOrNull(values[field]) : null])),
        kp: numberOrNull(values.kp),
        railAccess: values.railAccess === true,
        roadAccess: values.roadAccess === true,
        address: textOrNull(values.address),
        latitude: numberOrNull(values.latitude),
        longitude: numberOrNull(values.longitude),
        notes: textOrNull(values.notes),
    }
}

/** El alta; lo vacío no viaja. Sin config-read no se eligen EP, estación ni vía. */
export function newParkingSiteRequest(values, {readsConfiguration = true} = {}) {
    return withoutNulls({code: textOrNull(values.code), ...parkingSiteValues(values, readsConfiguration)})
}

/** La modificación; sin config-read el EP, la estación y la vía no se tocan. null si no cambió nada. */
export function parkingSitePatch(original, values, {readsConfiguration = true} = {}) {
    const fields = ['name', 'kind', ...(readsConfiguration ? PLACE_FIELDS : []), 'kp', 'railAccess', 'roadAccess', 'address', 'latitude',
        'longitude', 'notes']
    return buildMergePatch({...original, railAccess: original.railAccess === true, roadAccess: original.roadAccess === true},
        parkingSiteValues(values, readsConfiguration), {fields, numberFields: ['kp', 'latitude', 'longitude'], version: original.version})
}
