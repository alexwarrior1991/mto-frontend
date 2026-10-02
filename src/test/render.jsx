import {MantineProvider} from '@mantine/core'
import {DatesProvider} from '@mantine/dates'
import {Notifications} from '@mantine/notifications'
import {QueryClientProvider} from '@tanstack/react-query'
import {render} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {createMemoryRouter} from 'react-router'
import {RouterProvider} from 'react-router/dom'
import {vi} from 'vitest'
import {configureHttp} from '../api/http.js'
import {createQueryClient} from '../app/queryClient.js'
import {appRoutes} from '../app/routes.js'
import {RuntimeConfigContext} from '../app/runtimeConfigContext.js'
import {DATES_SETTINGS, theme} from '../app/theme.js'
import SessionExpiredModal from '../auth/SessionExpiredModal.jsx'
import {AuthActionsContext, SessionContext} from '../auth/sessionContext.js'
import {sessionExpired} from '../auth/sessionExpired.js'

export const TEST_CONFIG = Object.freeze({
    oidc: Object.freeze({authority: 'http://auth.test/realms/mto', clientId: 'mto-frontend'}),
    environment: 'pruebas',
    backofficeUrl: 'http://backoffice.test',
})

/**
 * Pinta la aplicacion en una ruta, con la tabla de rutas real y una persona ya dentro: lo mismo que
 * AppProviders, pero sin OIDC. El token es falso y el gateway lo simula MSW (server.use en cada test).
 *
 * @returns {{user: object, router: object, queryClient: object, authActions: {signIn: Function, signOut: Function}}}
 */
export function renderRoute(path, {session, config = TEST_CONFIG, token = 'test-token', renewedToken = null} = {}) {
    if (!session) {
        throw new Error('renderRoute necesita una sesion (sessionWith o loginAs)')
    }
    configureHttp({
        getAccessToken: async () => token,
        renewAccessToken: async () => renewedToken,
        onSessionExpired: sessionExpired.open,
    })
    const queryClient = createQueryClient()
    queryClient.setDefaultOptions({
        queries: {retry: false, refetchOnWindowFocus: false, staleTime: 0},
        mutations: {retry: false},
    })
    const authActions = {signIn: vi.fn(), signOut: vi.fn()}
    const router = createMemoryRouter(appRoutes(), {initialEntries: [path]})
    const user = userEvent.setup()

    const view = render(
        <MantineProvider theme={theme} env="test">
            <DatesProvider settings={DATES_SETTINGS}>
                <Notifications/>
                <RuntimeConfigContext value={config}>
                    <QueryClientProvider client={queryClient}>
                        <SessionContext value={session}>
                            <AuthActionsContext value={authActions}>
                                <SessionExpiredModal/>
                                <RouterProvider router={router}/>
                            </AuthActionsContext>
                        </SessionContext>
                    </QueryClientProvider>
                </RuntimeConfigContext>
            </DatesProvider>
        </MantineProvider>,
    )
    return {...view, user, router, queryClient, authActions}
}
