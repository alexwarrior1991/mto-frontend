import {createContext, useContext} from 'react'

/** La sesion de la persona (ver session.js). La pone SessionProvider y, en los tests, el render de prueba. */
export const SessionContext = createContext(null)

/** Entrar y salir. Las pantallas no conocen OIDC: piden esto, y los tests lo sustituyen por dobles. */
export const AuthActionsContext = createContext(null)

export function useSession() {
    const session = useContext(SessionContext)
    if (!session) {
        throw new Error('useSession se usa dentro de SessionProvider')
    }
    return session
}

export function useAuthActions() {
    const actions = useContext(AuthActionsContext)
    if (!actions) {
        throw new Error('useAuthActions se usa dentro de SessionProvider')
    }
    return actions
}
