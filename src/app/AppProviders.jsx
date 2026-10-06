import {MantineProvider} from '@mantine/core'
import {DatesProvider} from '@mantine/dates'
import {Notifications} from '@mantine/notifications'
import {QueryClientProvider} from '@tanstack/react-query'
import {useState} from 'react'
import {AuthProvider} from 'react-oidc-context'
import {RouterProvider} from 'react-router/dom'
import AuthGate from '../auth/AuthGate.jsx'
import {CALLBACK_PATH, restoreReturnTo} from '../auth/returnTo.js'
import SessionExpiredModal from '../auth/SessionExpiredModal.jsx'
import SessionProvider from '../auth/SessionProvider.jsx'
import {createQueryClient} from './queryClient.js'
import {getAppRouter} from './router.js'
import {RuntimeConfigContext} from './runtimeConfigContext.js'
import {DATES_SETTINGS, theme} from './theme.js'

/**
 * Todo lo que envuelve a la aplicacion, en este orden: Mantine (y los avisos), la configuracion del
 * entorno, OIDC, la puerta de entrada, la cache de React Query, la sesion y, por fin, el router.
 *
 * react-oidc-context solo procesa la vuelta de Keycloak en /auth/callback; al terminar,
 * restoreReturnTo cambia la URL por la que se pidio antes de entrar, y solo despues AuthGate deja
 * pasar y se crea el router (AppRouter).
 */
export default function AppProviders({config, userManager}) {
    const [queryClient] = useState(() => createQueryClient())

    return (
        <MantineProvider theme={theme} forceColorScheme="light">
            <DatesProvider settings={DATES_SETTINGS}>
                <Notifications position="bottom-left" autoClose={8000} limit={5}/>
                <RuntimeConfigContext value={config}>
                    <AuthProvider
                        userManager={userManager}
                        skipSigninCallback={window.location.pathname !== CALLBACK_PATH}
                        onSigninCallback={restoreReturnTo}>
                        <AuthGate>
                            <QueryClientProvider client={queryClient}>
                                <SessionProvider>
                                    <SessionExpiredModal/>
                                    <AppRouter/>
                                </SessionProvider>
                            </QueryClientProvider>
                        </AuthGate>
                    </AuthProvider>
                </RuntimeConfigContext>
            </DatesProvider>
        </MantineProvider>
    )
}

/**
 * El router, en su propio componente: asi getAppRouter() se llama cuando AuthGate deja pasar, con la
 * URL ya restaurada. Escrito como prop de AppProviders se evaluaba al pintarse AppProviders por primera
 * vez, todavia en /auth/callback?code=…&state=…; el router se quedaba con esa URL (restoreReturnTo cambia
 * la barra con history.replaceState, que el router no ve) y, al entrar, pintaba «no existe».
 */
function AppRouter() {
    return <RouterProvider router={getAppRouter()}/>
}
