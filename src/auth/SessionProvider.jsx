import {useQueryClient} from '@tanstack/react-query'
import {useMemo} from 'react'
import {useAuth} from 'react-oidc-context'
import {currentReturnTo} from './returnTo.js'
import {buildSession} from './session.js'
import {AuthActionsContext, SessionContext} from './sessionContext.js'

/**
 * Traduce el usuario de OIDC a lo que usan las pantallas: la sesion (quien es, que puede ver) y las
 * acciones de entrar y salir. Cada renovacion trae un access token nuevo y la sesion se recalcula.
 */
export default function SessionProvider({children}) {
    const auth = useAuth()
    const queryClient = useQueryClient()
    const accessToken = auth.user?.access_token ?? null
    const session = useMemo(() => buildSession(accessToken), [accessToken])

    const {signinRedirect, signoutRedirect} = auth
    const actions = useMemo(() => ({
        signIn: (returnTo = currentReturnTo()) => signinRedirect({state: {returnTo}}),
        signOut: async () => {
            // Nada de lo leido sobrevive a la salida, aunque la pagina tarde en irse.
            queryClient.clear()
            await signoutRedirect()
        },
    }), [signinRedirect, signoutRedirect, queryClient])

    return (
        <SessionContext value={session}>
            <AuthActionsContext value={actions}>
                {children}
            </AuthActionsContext>
        </SessionContext>
    )
}
