import {MantineProvider} from '@mantine/core'
import {render, screen} from '@testing-library/react'
import {User} from 'oidc-client-ts'
import {createElement} from 'react'
import {describe, expect, it, vi} from 'vitest'
import {SERVICES} from '../api/services.js'
import {decodeJwtPayload} from '../auth/claims.js'
import {P, permissionsFrom, ROLE_CATALOG} from '../auth/permissions.js'
import RequirePermission from '../auth/RequirePermission.jsx'
import {CALLBACK_PATH, currentReturnTo, LOGGED_OUT_PATH, restoreReturnTo, safeReturnTo} from '../auth/returnTo.js'
import {buildSession} from '../auth/session.js'
import {SessionContext} from '../auth/sessionContext.js'
import {sessionExpired} from '../auth/sessionExpired.js'
import {createTokenSource} from '../auth/tokenSource.js'
import {createUserManager} from '../auth/userManager.js'
import realm from './fixtures/realm-client-roles.json'
import {fakeAccessToken, sessionWith} from './session.js'

/**
 * La capa de seguridad (src/auth): de donde salen los permisos, que nunca conceden los roles de realm,
 * donde vive el token y como se renueva. Lo que hacia SecurityLayerTest en el backoffice.
 */

describe('permisos: roles de cliente de los cinco clientes de API', () => {
    it('cada cliente aporta sus roles, y nada mas', () => {
        const claims = decodeJwtPayload(fakeAccessToken({
            clientRoles: {
                'mto-configuration-api': ['config-read', 'lov-manage', 'ops-metrics'],
                'mto-stock-api': ['stock-read', 'users-read'],
                'mto-gateway-api': ['ops-write'],
                account: ['manage-account'],
            },
        }))

        expect([...permissionsFrom(claims)].sort()).toEqual(['config-read', 'lov-manage', 'stock-read'])
    })

    it('un rol de realm nunca abre nada, aunque se llame como un permiso', () => {
        const session = buildSession(fakeAccessToken({
            realmRoles: ['users-read', 'stock-read', 'maintenance-read', 'notification-access-read', 'mto-admin'],
        }))

        expect(session.permissions.size).toBe(0)
        expect(session.has(P.USERS_READ)).toBe(false)
        expect(session.has(P.NOTIFICATION_ACCESS_READ)).toBe(false)
        expect(session.realmRoles).toEqual(['maintenance-read', 'mto-admin', 'notification-access-read', 'stock-read', 'users-read'])
    })

    it('el catalogo coincide con los roles de cliente del realm (sin los de operacion) y no se repite entre clientes', () => {
        const fromRealm = Object.fromEntries(Object.entries(realm.clients).map(([client, roles]) => [
            client, roles.filter((role) => !role.startsWith('ops-')).sort(),
        ]))
        const catalog = Object.fromEntries(Object.entries(ROLE_CATALOG).map(([client, roles]) => [client, [...roles].sort()]))
        expect(catalog).toEqual(fromRealm)

        const all = Object.values(ROLE_CATALOG).flat()
        expect(new Set(all).size).toBe(all.length)
        expect(Object.values(P).sort()).toEqual([...all].sort())
        expect(Object.keys(ROLE_CATALOG)).toEqual(SERVICES.map((service) => service.clientId))
    })
})

describe('sesion: sale del access token', () => {
    it('quien es, que audiencias trae y que puede hacer', () => {
        const session = sessionWith([P.CONFIG_READ, P.CONFIG_WRITE, P.STOCK_READ], {username: 'config.editor'})

        expect(session.username).toBe('config.editor')
        expect(session.audiences).toContain('mto-gateway-api')
        expect(session.has(P.CONFIG_READ)).toBe(true)
        expect(session.hasAll(P.CONFIG_READ, P.CONFIG_WRITE)).toBe(true)
        expect(session.hasAll(P.CONFIG_WRITE, P.LOV_MANAGE)).toBe(false)
        expect(session.hasAny(P.LOV_MANAGE, P.STOCK_READ)).toBe(true)
        expect(session.permissionsByClient.find((client) => client.clientId === 'mto-configuration-api').roles)
            .toEqual(['config-read', 'config-write'])
    })

    it('una audiencia suelta vale como lista, el nombre cae al sub, y un token roto no da nada', () => {
        const single = buildSession(fakeAccessToken({aud: 'mto-stock-api', extra: {preferred_username: undefined}}))
        expect(single.audiences).toEqual(['mto-stock-api'])
        expect(single.username).toMatch(/^sub-/)

        const broken = buildSession('esto.no-es.un-jwt')
        expect(broken.username).toBeNull()
        expect(broken.permissions.size).toBe(0)
        expect(buildSession(null).audiences).toEqual([])
    })

    it('el payload se lee en UTF-8 (un nombre con tildes) y sin verificar la firma', () => {
        const token = fakeAccessToken({extra: {name: 'José Núñez'}})
        expect(decodeJwtPayload(token).name).toBe('José Núñez')
        expect(decodeJwtPayload('a.b')).toBeNull()
        expect(decodeJwtPayload(42)).toBeNull()
    })
})

describe('a donde se vuelve despues de entrar', () => {
    it('solo a una ruta de esta aplicacion', () => {
        expect(safeReturnTo('/actividad/accesos?username=x#arriba')).toBe('/actividad/accesos?username=x#arriba')
        expect(safeReturnTo('//evil.example/x')).toBe('/')
        expect(safeReturnTo('/\\evil.example')).toBe('/')
        expect(safeReturnTo('https://evil.example')).toBe('/')
        expect(safeReturnTo(`${CALLBACK_PATH}?code=1&state=2`)).toBe('/')
        expect(safeReturnTo(LOGGED_OUT_PATH)).toBe('/')
        expect(safeReturnTo('/auth')).toBe('/')
        expect(safeReturnTo('/a\nb')).toBe('/')
        expect(safeReturnTo(undefined)).toBe('/')
    })

    it('la URL pedida viaja en el state y se restaura al volver de Keycloak', () => {
        window.history.replaceState(null, '', '/mantenimiento/ordenes/o1?tab=tareas')
        expect(currentReturnTo()).toBe('/mantenimiento/ordenes/o1?tab=tareas')

        window.history.replaceState(null, '', `${CALLBACK_PATH}?code=abc&state=xyz`)
        restoreReturnTo({state: {returnTo: '/mantenimiento/ordenes/o1?tab=tareas'}})
        expect(window.location.pathname + window.location.search).toBe('/mantenimiento/ordenes/o1?tab=tareas')

        restoreReturnTo({state: {returnTo: '//evil.example'}})
        expect(window.location.pathname).toBe('/')
    })
})

describe('el cliente OIDC: PKCE, token en memoria y renovacion con el refresh token', () => {
    const config = {oidc: {authority: 'http://auth.test/realms/mto', clientId: 'mto-frontend'}}

    it('vuelve a /auth/callback y /auth/logged-out, sin userinfo, sin renovacion automatica y sin vigilar la sesion', () => {
        const userManager = createUserManager(config, 'http://localhost:4200')
        const settings = userManager.settings

        expect(settings.client_id).toBe('mto-frontend')
        expect(settings.response_type).toBe('code')
        expect(settings.scope).toBe('openid')
        expect(settings.redirect_uri).toBe('http://localhost:4200/auth/callback')
        expect(settings.post_logout_redirect_uri).toBe('http://localhost:4200/auth/logged-out')
        expect(settings.automaticSilentRenew).toBe(false)
        expect(settings.monitorSession).toBe(false)
        expect(settings.loadUserInfo).toBe(false)
        expect(settings.disablePKCE).toBe(false)
    })

    it('el token se guarda solo en memoria: ni localStorage ni sessionStorage', async () => {
        const userManager = createUserManager(config, 'http://localhost:4200')
        const accessToken = fakeAccessToken()
        const now = Math.floor(Date.now() / 1000)

        await userManager.storeUser(new User({
            access_token: accessToken,
            refresh_token: 'refresh',
            token_type: 'Bearer',
            profile: {sub: 's', iss: config.oidc.authority, aud: 'mto-frontend', exp: now + 300, iat: now},
            expires_at: now + 300,
        }))

        expect((await userManager.getUser()).access_token).toBe(accessToken)
        expect(window.localStorage.length).toBe(0)
        expect(window.sessionStorage.length).toBe(0)
    })
})

describe('tokenSource: el token para http.js', () => {
    function userManagerWith(user, renew) {
        return {getUser: vi.fn(async () => user), signinSilent: vi.fn(renew)}
    }

    it('devuelve el token vigente sin renovar', async () => {
        const userManager = userManagerWith({access_token: 'vigente', expires_in: 200}, async () => null)
        await expect(createTokenSource(userManager).get()).resolves.toBe('vigente')
        expect(userManager.signinSilent).not.toHaveBeenCalled()
    })

    it('renueva antes de llamar si al token le quedan menos de diez segundos, y una sola vez aunque lo pidan varias llamadas', async () => {
        let resolve
        const userManager = userManagerWith({access_token: 'a punto', refresh_token: 'r', expires_in: 5}, () => new Promise((done) => {
            resolve = done
        }))
        const tokens = createTokenSource(userManager)

        const first = tokens.get()
        const second = tokens.get()
        const third = tokens.renew()
        await vi.waitFor(() => expect(userManager.signinSilent).toHaveBeenCalledTimes(1))
        resolve({access_token: 'renovado'})

        await expect(Promise.all([first, second, third])).resolves.toEqual(['renovado', 'renovado', 'renovado'])
        expect(userManager.signinSilent).toHaveBeenCalledTimes(1)
    })

    it('si la renovacion falla o no hay persona, no hay token', async () => {
        const failing = createTokenSource(userManagerWith({access_token: 'viejo', refresh_token: 'r', expires_in: 0}, async () => {
            throw new Error('invalid_grant')
        }))
        await expect(failing.get()).resolves.toBeNull()
        await expect(createTokenSource(userManagerWith(null, async () => null)).get()).resolves.toBeNull()
    })

    it('sin refresh token no se intenta renovar: oidc-client-ts lo haria con un iframe', async () => {
        const userManager = userManagerWith({access_token: 'viejo', expires_in: 0}, async () => ({access_token: 'iframe'}))
        await expect(createTokenSource(userManager).get()).resolves.toBeNull()
        expect(userManager.signinSilent).not.toHaveBeenCalled()
    })
})

describe('el aviso de sesion caducada', () => {
    it('se abre una vez, avisa a quien escucha y se cierra', () => {
        const listener = vi.fn()
        const unsubscribe = sessionExpired.subscribe(listener)

        sessionExpired.open()
        sessionExpired.open()
        expect(sessionExpired.isOpen()).toBe(true)
        expect(listener).toHaveBeenCalledTimes(1)
        sessionExpired.close()
        expect(sessionExpired.isOpen()).toBe(false)
        unsubscribe()
    })
})

describe('RequirePermission: experiencia de usuario, no seguridad', () => {
    function renderWith(session) {
        return render(createElement(MantineProvider, {env: 'test'},
            createElement(SessionContext, {value: session},
                createElement(RequirePermission, {all: [P.USERS_READ, P.USERS_WRITE], title: 'Usuarios'}, 'contenido'))))
    }

    it('ensena el contenido con todos los permisos y, si falta alguno, dice cual', () => {
        const allowed = renderWith(sessionWith([P.USERS_READ, P.USERS_WRITE]))
        expect(screen.getByText('contenido')).toBeInTheDocument()
        allowed.unmount()

        renderWith(sessionWith([P.USERS_READ]))
        expect(screen.queryByText('contenido')).not.toBeInTheDocument()
        expect(screen.getByText('No tienes permiso para abrir esta pantalla')).toBeInTheDocument()
        expect(screen.getByText('users-write')).toBeInTheDocument()
        expect(screen.queryByText('users-read')).not.toBeInTheDocument()
    })
})
