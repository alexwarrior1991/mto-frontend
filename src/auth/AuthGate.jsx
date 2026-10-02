import {Button, Text} from '@mantine/core'
import {useEffect, useRef, useState} from 'react'
import {useAuth} from 'react-oidc-context'
import FullPageMessage from '../ui/FullPageMessage.jsx'
import {currentReturnTo, LOGGED_OUT_PATH} from './returnTo.js'

/**
 * Nada de la aplicacion se pinta sin una persona dentro. Sin usuario, se va a Keycloak una sola vez
 * llevando la URL pedida en el state, para volver a ella (un enlace de una notificacion sobrevive a
 * la entrada). Despues de salir no se vuelve a la pantalla de antes, sino al inicio.
 *
 * Con usuario se pinta la aplicacion aunque su token caduque: eso lo resuelven http.js y el aviso de
 * sesion caducada, sin perder lo que haya en pantalla.
 */
export default function AuthGate({children}) {
    const auth = useAuth()
    const attempted = useRef(false)
    const [redirectError, setRedirectError] = useState(null)
    const needsSignIn = !auth.isLoading && !auth.user && !auth.activeNavigator && !auth.error && !redirectError

    useEffect(() => {
        if (!needsSignIn || attempted.current) {
            return
        }
        attempted.current = true
        const returnTo = window.location.pathname === LOGGED_OUT_PATH ? '/' : currentReturnTo()
        auth.signinRedirect({state: {returnTo}}).catch((error) => setRedirectError(error))
    }, [needsSignIn, auth])

    if (redirectError) {
        return (
            <FullPageMessage
                title="No se puede contactar con Keycloak"
                action={<Button onClick={() => window.location.reload()}>Reintentar</Button>}>
                <Text>
                    Para entrar, el navegador tiene que llegar a Keycloak. Comprueba que está levantado y que
                    el fichero hosts tiene la línea «127.0.0.1 auth.mto.local». En local, «npm run doctor» lo
                    comprueba.
                </Text>
                <Text size="sm" c="dimmed">{redirectError.message}</Text>
            </FullPageMessage>
        )
    }

    if (auth.error && !auth.user) {
        return (
            <FullPageMessage
                title="No se ha podido completar la entrada"
                action={<Button onClick={() => auth.signinRedirect({state: {returnTo: '/'}})}>Volver a entrar</Button>}>
                <Text size="sm" c="dimmed">{auth.error.message}</Text>
            </FullPageMessage>
        )
    }

    if (!auth.user) {
        return <FullPageMessage title="Entrando…" loading/>
    }

    return children
}
