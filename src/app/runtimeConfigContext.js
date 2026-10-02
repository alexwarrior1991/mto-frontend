import {createContext, useContext} from 'react'

const NO_CONFIG = Object.freeze({oidc: null, environment: '', backofficeUrl: null})

/** La configuracion del entorno (ver runtimeConfig.js), para las pantallas que la necesitan. */
export const RuntimeConfigContext = createContext(NO_CONFIG)

export function useRuntimeConfig() {
    return useContext(RuntimeConfigContext)
}
