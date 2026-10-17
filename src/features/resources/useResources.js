import {keepPreviousData, useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {
    createParkingSite,
    createVehicleType,
    offerParkingSiteAgain,
    offerVehicleTypeAgain,
    patchParkingSite,
    patchVehicleType,
    retireParkingSite,
    retireVehicleType,
    searchParkingSites,
    searchVehicleTypes,
} from '../../api/resources/fleet.js'
import {
    createInstrument,
    patchInstrument,
    reactivateInstrument,
    retireInstrument,
    searchInstruments,
} from '../../api/resources/instruments.js'
import {createPerson, deactivatePerson, getPerson, patchPerson, reactivatePerson, searchPeople} from '../../api/resources/people.js'
import {
    addPersonQualification,
    ALL_TYPES,
    createQualificationType,
    listPersonQualifications,
    offerQualificationTypeAgain,
    patchPersonQualification,
    patchQualificationType,
    removePersonQualification,
    retireQualificationType,
    searchQualificationTypes,
} from '../../api/resources/qualifications.js'
import {
    addVehicleDocument,
    createVehicle,
    fleetPositions,
    getVehicle,
    listLocations,
    listVehicleDocuments,
    patchVehicle,
    patchVehicleDocument,
    reactivateVehicle,
    recordLocation,
    removeVehicleDocument,
    retireVehicle,
    searchVehicles,
} from '../../api/resources/vehicles.js'
import {
    addMember,
    createUnit,
    deactivateUnit,
    getUnit,
    getUnitTree,
    leaveTeam,
    listMembers,
    patchUnit,
    reactivateTeam,
    reactivateUnit,
    replaceMembers,
    unitChildren,
} from '../../api/resources/units.js'

/**
 * Las consultas y las escrituras del módulo de recursos, con lo que releen (claves ['resources', …]).
 * Nada se da por fresco: tras cada escritura se relee lo que ha podido cambiar con ella.
 */

export const RESOURCES_PAGE_SIZE = 50

const NOT_FRESH = 0

export function resourcesKey(...parts) {
    return ['resources', ...parts]
}

export function usePeopleList(params) {
    return useQuery({
        queryKey: resourcesKey('people', params),
        queryFn: ({signal}) => searchPeople({...params, size: RESOURCES_PAGE_SIZE}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

/**
 * El alta o la modificación de una persona, desde su editor, que trata él mismo sus errores. Una
 * persona sale en el organigrama y en los equipos: se relee todo el módulo.
 */
export function useSavePerson() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({id = null, body}) => (id === null ? createPerson(body) : patchPerson(id, body)),
        meta: {notifyError: false},
        onSuccess: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

/**
 * Desactivar (DELETE) o reactivar (PATCH active=true) una persona. Haya ido bien o no, se relee: si el
 * servicio dice que no (409 UNI-001), la lista enseña cómo está.
 */
export function usePersonAction() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({action, person}) => (action === 'deactivate' ? deactivatePerson(person.id) : reactivatePerson(person)),
        onSettled: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

/** La ficha de una persona; si no existe, se dice una vez. */
export function usePerson(personId) {
    return useQuery({
        queryKey: resourcesKey('people', 'person', personId),
        queryFn: ({signal}) => getPerson(personId, {signal}),
        enabled: Boolean(personId),
        retry: false,
        staleTime: NOT_FRESH,
        meta: {notFoundMessage: `No existe la persona ${personId}`},
    })
}

/** Las cualificaciones de una persona, enteras. */
export function usePersonQualifications(personId) {
    return useQuery({
        queryKey: resourcesKey('people', 'qualifications', personId),
        queryFn: ({signal}) => listPersonQualifications(personId, {signal}),
        staleTime: NOT_FRESH,
    })
}

/**
 * El alta o la modificación de una cualificación, desde su diálogo, que trata él mismo sus errores.
 * Cambia la persona (su versión y lo que publica): se relee todo el módulo.
 */
export function useSavePersonQualification(personId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({id = null, body}) => (id === null ? addPersonQualification(personId, body) : patchPersonQualification(personId, id, body)),
        meta: {notifyError: false},
        onSuccess: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

/** Quitar una cualificación (DELETE); haya ido bien o no, se relee. */
export function useRemovePersonQualification(personId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (qualification) => removePersonQualification(personId, qualification.id),
        onSettled: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

export function useQualificationTypeList(params) {
    return useQuery({
        queryKey: resourcesKey('qualification-types', params),
        queryFn: ({signal}) => searchQualificationTypes({...params, size: RESOURCES_PAGE_SIZE}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

/** Los tipos de cualificación activos, para elegir uno: caben en una petición. */
export function useActiveQualificationTypes({enabled = true} = {}) {
    return useQuery({
        queryKey: resourcesKey('qualification-types', 'active'),
        queryFn: ({signal}) => searchQualificationTypes({active: true, size: ALL_TYPES}, {signal}),
        staleTime: NOT_FRESH,
        enabled,
    })
}

/** El alta o la modificación de un tipo, desde su editor; un tipo sale en las personas y en los modelos: se relee todo el módulo. */
export function useSaveQualificationType() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({id = null, body}) => (id === null ? createQualificationType(body) : patchQualificationType(id, body)),
        meta: {notifyError: false},
        onSuccess: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

/** Retirar (DELETE) o volver a ofrecer (PATCH active=true) un tipo; haya ido bien o no, se relee. */
export function useQualificationTypeAction() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({action, type}) => (action === 'retire' ? retireQualificationType(type.id) : offerQualificationTypeAgain(type)),
        onSettled: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

export function useInstrumentList(params) {
    return useQuery({
        queryKey: resourcesKey('instruments', params),
        queryFn: ({signal}) => searchInstruments({...params, size: RESOURCES_PAGE_SIZE}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

export function useSaveInstrument() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({id = null, body}) => (id === null ? createInstrument(body) : patchInstrument(id, body)),
        meta: {notifyError: false},
        onSuccess: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

/** Retirar (DELETE) o reactivar (PATCH active=true) un instrumento; haya ido bien o no, se relee. */
export function useInstrumentAction() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({action, instrument}) => (action === 'retire' ? retireInstrument(instrument.id) : reactivateInstrument(instrument)),
        onSettled: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

/** El organigrama entero: pocas decenas de unidades. */
export function useUnitTree(includeInactive = false, {enabled = true} = {}) {
    return useQuery({
        queryKey: resourcesKey('units', 'tree', {includeInactive}),
        queryFn: ({signal}) => getUnitTree({includeInactive}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
        enabled,
    })
}

/** La ficha de una unidad; si no existe, se dice una vez. */
export function useUnit(unitId, {enabled = true, notFound = true} = {}) {
    return useQuery({
        queryKey: resourcesKey('units', 'unit', unitId),
        queryFn: ({signal}) => getUnit(unitId, {signal}),
        enabled: enabled && Boolean(unitId),
        retry: false,
        staleTime: NOT_FRESH,
        meta: notFound ? {notFoundMessage: `No existe la unidad ${unitId}`} : {notifyError: false},
    })
}

export function useUnitChildren(unitId) {
    return useQuery({
        queryKey: resourcesKey('units', 'children', unitId),
        queryFn: ({signal}) => unitChildren(unitId, {signal}),
        staleTime: NOT_FRESH,
    })
}

export function useUnitMembers(unitId, includeFormer) {
    return useQuery({
        queryKey: resourcesKey('units', 'members', unitId, {includeFormer}),
        queryFn: ({signal}) => listMembers(unitId, {includeFormer}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

/**
 * El alta o la modificación de una unidad, desde su editor, que trata él mismo sus errores. Una
 * unidad sale en el árbol, en su ficha, en las de sus hijas y en la lista de personal: se relee todo
 * el módulo.
 */
export function useSaveUnit() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({id = null, body}) => (id === null ? createUnit(body) : patchUnit(id, body)),
        meta: {notifyError: false},
        onSuccess: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

/**
 * Lo que cambia los linemen de un equipo o lo devuelve completo: la lista entera, uno que entra, uno
 * que sale o la reactivación con sus linemen. El diálogo trata sus errores; tras guardar se relee todo
 * el módulo.
 */
export function useTeamChange(team) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({change, memberPersonIds, personId, date = null}) => {
            switch (change) {
                case 'replace':
                    return replaceMembers(team.id, memberPersonIds, date)
                case 'add':
                    return addMember(team.id, personId, date)
                case 'leave':
                    return leaveTeam(team.id, personId, date)
                case 'reactivate':
                    return reactivateTeam(team, memberPersonIds, date)
                default:
                    throw new Error(`Cambio desconocido: ${change}`)
            }
        },
        meta: {notifyError: false},
        onSuccess: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

/**
 * Desactivar (DELETE) o reactivar (PATCH active=true) una unidad que no es un equipo vuelto con sus
 * linemen. Haya ido bien o no, se relee: si el servicio dice que no (409 UNI-001), la ficha enseña cómo
 * está.
 */
export function useUnitAction() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({action, unit}) => (action === 'deactivate' ? deactivateUnit(unit.id) : reactivateUnit(unit)),
        onSettled: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

export function useVehicleTypeList(params) {
    return useQuery({
        queryKey: resourcesKey('vehicle-types', params),
        queryFn: ({signal}) => searchVehicleTypes({...params, size: RESOURCES_PAGE_SIZE}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

/** El alta o la modificación de un modelo, desde su editor; un modelo sale en los vehículos: se relee todo el módulo. */
export function useSaveVehicleType() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({id = null, body}) => (id === null ? createVehicleType(body) : patchVehicleType(id, body)),
        meta: {notifyError: false},
        onSuccess: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

/** Retirar (DELETE) o volver a ofrecer (PATCH active=true) un modelo; haya ido bien o no, se relee. */
export function useVehicleTypeAction() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({action, type}) => (action === 'retire' ? retireVehicleType(type.id) : offerVehicleTypeAgain(type)),
        onSettled: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

export function useParkingSiteList(params) {
    return useQuery({
        queryKey: resourcesKey('parking-sites', params),
        queryFn: ({signal}) => searchParkingSites({...params, size: RESOURCES_PAGE_SIZE}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

export function useSaveParkingSite() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({id = null, body}) => (id === null ? createParkingSite(body) : patchParkingSite(id, body)),
        meta: {notifyError: false},
        onSuccess: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

export function useParkingSiteAction() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({action, site}) => (action === 'retire' ? retireParkingSite(site.id) : offerParkingSiteAgain(site)),
        onSettled: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

export function useVehicleList(params) {
    return useQuery({
        queryKey: resourcesKey('vehicles', params),
        queryFn: ({signal}) => searchVehicles({...params, size: RESOURCES_PAGE_SIZE}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

/** La ficha de un vehículo; si no existe, se dice una vez. Con notFound false, sin aviso (el portador de otro). */
export function useVehicle(vehicleId, {enabled = true, notFound = true} = {}) {
    return useQuery({
        queryKey: resourcesKey('vehicles', 'vehicle', vehicleId),
        queryFn: ({signal}) => getVehicle(vehicleId, {signal}),
        enabled: enabled && Boolean(vehicleId),
        retry: false,
        staleTime: NOT_FRESH,
        meta: notFound ? {notFoundMessage: `No existe el vehículo ${vehicleId}`} : {notifyError: false},
    })
}

export function useVehicleLocations(vehicleId, params) {
    return useQuery({
        queryKey: resourcesKey('vehicles', 'locations', vehicleId, params),
        queryFn: ({signal}) => listLocations(vehicleId, params, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}

/** Los documentos de un vehículo, enteros. */
export function useVehicleDocuments(vehicleId) {
    return useQuery({
        queryKey: resourcesKey('vehicles', 'documents', vehicleId),
        queryFn: ({signal}) => listVehicleDocuments(vehicleId, {signal}),
        staleTime: NOT_FRESH,
    })
}

/** El alta o la modificación de un documento, desde su diálogo; cambia el vehículo: se relee todo el módulo. */
export function useSaveVehicleDocument(vehicleId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({id = null, body}) => (id === null ? addVehicleDocument(vehicleId, body) : patchVehicleDocument(vehicleId, id, body)),
        meta: {notifyError: false},
        onSuccess: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

/** Quitar un documento (DELETE); haya ido bien o no, se relee. */
export function useRemoveVehicleDocument(vehicleId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (document) => removeVehicleDocument(vehicleId, document.id),
        onSettled: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

/** Los sitios activos del catálogo a los que puede llegar un vehículo de esta movilidad: caben en una petición. */
export function useReachableSites(mobility) {
    const railAccess = mobility === 'RAIL_ONLY' ? true : null
    const roadAccess = mobility === 'ROAD_ONLY' ? true : null
    return useQuery({
        queryKey: resourcesKey('parking-sites', 'reachable', mobility),
        queryFn: ({signal}) => searchParkingSites({railAccess, roadAccess, active: true, size: 200}, {signal}),
        staleTime: NOT_FRESH,
    })
}

/** Los sitios de aparcamiento activos, para nombrar y elegir dónde quedó un vehículo de un turno; solo con resources-read. */
export function useParkingSites({enabled = true} = {}) {
    return useQuery({
        queryKey: resourcesKey('parking-sites', 'active'),
        queryFn: ({signal}) => searchParkingSites({active: true, size: 200}, {signal}),
        staleTime: NOT_FRESH,
        enabled,
    })
}

/** El alta o la modificación de un vehículo, desde su editor; se relee todo el módulo. */
export function useSaveVehicle() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({id = null, body}) => (id === null ? createVehicle(body) : patchVehicle(id, body)),
        meta: {notifyError: false},
        onSuccess: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

/** Retirar (DELETE) o reactivar (PATCH active=true) un vehículo; haya ido bien o no, se relee. */
export function useVehicleAction() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({action, vehicle}) => (action === 'retire' ? retireVehicle(vehicle.id) : reactivateVehicle(vehicle)),
        onSettled: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

/** Registrar dónde está un vehículo; mueve su posición, su ficha, la lista y el tablero: se relee todo el módulo. */
export function useRecordLocation(vehicleId) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (body) => recordLocation(vehicleId, body),
        meta: {notifyError: false},
        onSuccess: () => queryClient.invalidateQueries({queryKey: resourcesKey()}),
    })
}

/** El tablero de la flota, por vía y kp; se vuelve a pedir con «Actualizar», sin sondeo. */
export function useFleetBoard(params) {
    return useQuery({
        queryKey: resourcesKey('vehicles', 'board', params),
        queryFn: ({signal}) => fleetPositions({...params, size: RESOURCES_PAGE_SIZE}, {signal}),
        placeholderData: keepPreviousData,
        staleTime: NOT_FRESH,
    })
}
