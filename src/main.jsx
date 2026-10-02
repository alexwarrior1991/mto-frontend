import '@mantine/core/styles.layer.css'
import '@mantine/dates/styles.layer.css'
import '@mantine/notifications/styles.layer.css'
import './styles/app.css'
import 'dayjs/locale/es'
import {MantineProvider} from '@mantine/core'
import dayjs from 'dayjs'
import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {configureHttp} from './api/http.js'
import AppProviders from './app/AppProviders.jsx'
import FatalScreen from './app/pages/FatalScreen.jsx'
import {loadRuntimeConfig} from './app/runtimeConfig.js'
import {theme} from './app/theme.js'
import {sessionExpired} from './auth/sessionExpired.js'
import {createTokenSource} from './auth/tokenSource.js'
import {createUserManager} from './auth/userManager.js'

dayjs.locale('es')

const root = createRoot(document.getElementById('root'))

/**
 * El arranque: la configuracion del entorno, el cliente OIDC y el token para http.js. Si no hay
 * configuracion valida no hay nada que hacer, y se dice.
 */
async function start() {
    try {
        const config = await loadRuntimeConfig()
        const userManager = createUserManager(config)
        void userManager.clearStaleState()
        const tokenSource = createTokenSource(userManager)
        configureHttp({
            getAccessToken: tokenSource.get,
            renewAccessToken: tokenSource.renew,
            onSessionExpired: sessionExpired.open,
        })
        root.render(
            <StrictMode>
                <AppProviders config={config} userManager={userManager}/>
            </StrictMode>,
        )
    } catch (error) {
        root.render(
            <StrictMode>
                <MantineProvider theme={theme} forceColorScheme="light">
                    <FatalScreen error={error}/>
                </MantineProvider>
            </StrictMode>,
        )
    }
}

void start()
