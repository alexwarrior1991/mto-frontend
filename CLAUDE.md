# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

`mto-frontend`: frontal web del dominio `MTO` (infraestructura ferroviaria de catenaria). SPA en
**React 19 + Vite 8 + Mantine 9**, en **JavaScript** (sin TypeScript), que **sustituye fase a fase a
`mto-backoffice`** (Vaadin) con las mismas pantallas, las mismas rutas y las mismas reglas. Es un
**cliente**: sin base de datos y sin lógica de negocio. Lo que una pantalla necesita y la API no da
bien se arregla en el servicio (`mto-configuration`, `mto-users`, `mto-stock`, `mto-maintenance` o
`mto-notification`), no aquí. `README.md` es la referencia funcional y operativa (probar en local,
WebStorm, desplegar).

⚠️ `mto-backoffice` es la **especificación funcional**: su `CLAUDE.md` («Reglas que no se rompen») y
su código (`client/**`, `ui/**`) dicen qué hace cada pantalla. Cada fase empieza releyendo el módulo
del backoffice que porta. Los servicios y `mto-gateway` son **repos hermanos independientes**; la
infraestructura local (Keycloak, el gateway, los servicios) la levanta `mto-platform`. El cliente
`mto-frontend` del realm vive en el realm base de `mto-platform` (`keycloak/mto-realm.json` y
`mto-realm-local.json`, con la misma edición en los dos), no en este repositorio.

⚠️ Solo licencias libres (MIT, Apache-2.0, BSD…). Nada con versión de pago (MUI X Pro, AG Grid
Enterprise, Highcharts…); `src/test/app.test.js` recorre el lock y falla si aparece.

Documentación y comentarios en castellano, código en inglés, commits en castellano. Estilo: el de
`.editorconfig` (4 espacios, sin punto y coma, comillas simples, `{x}` sin espacios), que es el que
aplica WebStorm, el IDE del equipo.

## Comandos

```bash
npm install
npm run dev                           # http://localhost:4200, proxy de /api al gateway (8090)
npm test                              # todo en Node: ni Docker, ni Keycloak, ni gateway
npx vitest run src/test/clientLayer.test.js        # un fichero
npx vitest run -t "un 401 renueva el token"         # un caso
npm run lint
npm run verify                        # lint + tests + build, lo que hace el CI
npm run doctor                        # comprueba el entorno local y dice qué falta
npm run e2e                           # Playwright contra la plataforma levantada (solo en local)
```

Entorno local: `cd ../mto-platform && docker compose --profile all up -d && ./keycloak/apply-partials.sh`
(con `127.0.0.1 auth.mto.local otel.mto.local` en el fichero hosts). Puerto **4200** fijo
(`strictPort`): es el redirect URI del cliente en el realm, y lo comparten Vite y el contenedor,
nunca a la vez. Node 22 (`.nvmrc`); `jsdom` va fijado a la 29 porque la 30 exige Node 22.22.2.
Todo lo que se ejecuta en local es npm o Node (también `scripts/doctor.mjs`): funciona igual en
Windows desde WebStorm, con las configuraciones compartidas de `.run/`.

## Arquitectura

Bajo `src/`, por capas que vigila ESLint (`no-restricted-imports` por carpeta):

- `api/` — **JavaScript puro**, ni React ni Mantine. `http.js` (`apiFetch`: la única puerta hacia la
  API, solo rutas `/api/` del mismo origen, Bearer, `X-Correlation-Id` nuevo por llamada, 401 →
  renovar y repetir una vez; el token le llega con `configureHttp`), `errors.js` (los cinco formatos
  de error y la jerarquía `ApiError`: `ValidationError` 400/422, `SessionExpiredError` y
  `TokenRejectedError` 401, `ForbiddenError`, `NotFoundError`, `ConflictError`,
  `TooManyRequestsError` 429 con el cuerpo, `UnavailableError` 502/503/504, `NetworkError`),
  `correlation.js`, `paging.js` (las tres formas de paginar), `enums.js` (`defineEnum`: enumerados
  tolerantes), `mergePatch.js` (`buildMergePatch`), `dates.js`, `download.js` (fetch + Blob),
  `services.js` (**los servicios del dominio en un solo sitio**: prefijo, cliente de Keycloak,
  roles, sonda; de aquí salen el catálogo de permisos, las audiencias esperadas y las sondas),
  `probes.js` y un módulo por servicio (`configuration/`, y en cada fase `users/`, `stock/`…).
- `auth/` — OIDC con `oidc-client-ts` + `react-oidc-context`. `userManager.js` (token en memoria,
  PKCE, sin renovación automática), `tokenSource.js` (el token para `http.js` y su renovación con el
  refresh token, de un solo vuelo), `returnTo.js` (las rutas `/auth/callback` y `/auth/logged-out`,
  y la URL de vuelta saneada), `claims.js`, `permissions.js` (`ROLE_CATALOG`, `P`,
  `permissionsFrom`), `session.js` (`buildSession` desde el access token), `sessionContext.js`
  (`useSession`, `useAuthActions`), `SessionProvider.jsx`, `AuthGate.jsx` (nada se pinta sin persona
  dentro), `RequirePermission.jsx`, `sessionExpired.js` y `SessionExpiredModal.jsx`.
- `app/` — la composición: `AppProviders.jsx` (Mantine → configuración → OIDC → `AuthGate` → React
  Query → sesión → router), `runtimeConfig.js` (`/config.json`), `queryClient.js` (el aviso de error
  global), `theme.js`, **`routeTable.js`** (todas las rutas del backoffice, con su título, sus
  permisos, su fase y su entrada de menú), `pages.js` (la pantalla de cada ruta; lo que falta lo
  pinta `PendingPage`), `routes.js`, `router.js`, `RouteScreen.jsx`, `navigation.js` (el menú),
  `layout/` (`RootLayout`, `AppHeader`, `MainMenu`) y `pages/` (Inicio con el diagnóstico y las
  sondas, pendiente, sin permiso, no existe, error de ruta, error fatal).
- `ui/` — lo compartido, que no conoce los módulos: `errors/` (`messages.js`, la tabla de `UiErrors`;
  `notifyError.js`; `serverValidation.js`, el port de `ServerValidation`; `ErrorNotice.jsx`),
  `format.js`, `usePageTitle.js`, `FullPageMessage.jsx`, `ForbiddenNotice.jsx`. Cada fase añade aquí
  lo que comparte (`ServerDataTable`, `OffsetPager`, `RevisionsModal`, `LazyTabs`…).
- `features/<módulo>/` — las pantallas de cada fase (`catalogues`, `infrastructure`, `jobs`, `users`,
  `stock`, `maintenance`, `notifications`). No llaman a `fetch`: usan `api/`.
- `main.jsx` — el arranque: `/config.json`, el `UserManager`, `configureHttp` y el render.

Fuera de `src/`: `docker/` (las plantillas de nginx y el script que comprueba las variables al
arrancar), `Dockerfile`, `compose.yaml` (solo la aplicación, en la red de `mto-platform`),
`scripts/doctor.mjs`, `e2e/` (Playwright), `.run/` (WebStorm) y `.github/workflows/ci.yml`.

### Reglas que no se rompen

- **El token vive solo en memoria y solo sale hacia `/api` del mismo origen y hacia Keycloak.**
  `InMemoryWebStorage` como `userStore`; en `sessionStorage` solo el state y el `code_verifier` de
  PKCE. ESLint prohíbe `localStorage` y `sessionStorage` fuera de `auth/userManager.js`. Recargar la
  página es volver a entrar por el SSO (un rebote breve); cada pestaña tiene su token.
- **Se renueva solo con el refresh token, bajo demanda.** `automaticSilentRenew` está apagado:
  `tokenSource` renueva cuando a un token le quedan menos de 10 s o cuando un servicio responde 401,
  una vez, y en un solo vuelo. Sin refresh token no se intenta nada, porque `oidc-client-ts` probaría
  con un iframe (`silent_redirect_uri` toma por defecto `redirect_uri`) y entre `localhost:4200` y
  `auth.mto.local` las cookies de terceros están bloqueadas. Así, además, la inactividad de la
  sesión SSO de Keycloak cuenta de verdad.
- **`/api` va por el mismo origen y el proxy quita `Origin`** (Vite en desarrollo, nginx en la
  imagen). Nunca se llama a la URL del gateway. El gateway reenvía `Origin` y cada servicio tiene su
  propio CORS (solo 4200): sin `Origin`, ni uno ni otros ven una petición CORS. Es seguro porque la
  API se autentica con Bearer y no con cookies (nginx quita también las cookies).
- **Los permisos son roles de cliente de los cinco clientes de API**, leídos del **access token**
  (`resource_access`), y solo los del catálogo de cada cliente. Un rol de realm nunca concede nada,
  aunque se llame como un permiso; los nombres no se repiten entre clientes. `securityLayer.test.js`
  compara `ROLE_CATALOG` con los roles de cliente del realm (`fixtures/realm-client-roles.json`).
- **El menú y `RequirePermission` no son la seguridad.** Esconden lo que la persona no puede abrir;
  manda el 403 de cada servicio, que se notifica. Los botones siguen los permisos del servicio con
  `session.hasAll(...)`.
- **Las rutas son exactamente las del backoffice**, porque `mto-notification` enlaza a ellas
  (`/mantenimiento/ordenes/{id}`, `/actividad?category=…`) y el correo las hace absolutas. Todas
  están en `routeTable.js` desde la fase 0; `app.test.js` las compara con las del backoffice y con
  los enlaces de `notification-rules.yml` (`fixtures/`). Las literales ganan a las de parámetro
  (`usuarios/perfiles` a `usuarios/:userId`). Una pantalla que aún no ha llegado la pinta
  `PendingPage`, con «Abrir en el backoffice» mientras convivan.
- **La URL pedida sobrevive a la entrada.** Viaja en el `state` de OIDC y `restoreReturnTo` la
  restaura saneada (`safeReturnTo`: solo rutas de esta aplicación). El router se crea después, así
  que nunca ve `?code=…&state=…`.
- **Cada llamada lleva un `X-Correlation-Id` nuevo** (UUID). Es la «Referencia» de los avisos de
  error: `traceId` si lo trae el cuerpo, si no su `correlationId`, si no la cabecera de la
  respuesta, si no el id que se mandó.
- **Los errores se tipan en `api/errors.js`**, no en las pantallas, y se dicen en
  `ui/errors/messages.js` con la tabla de `UiErrors` del backoffice (`CON-001` pide recargar y
  `BUS-002` no; los 409 de estado de mantenimiento no piden recargar; un 422 sin errores por campo es
  una regla de negocio). Un cuerpo HTML nunca se enseña. Un fallo se avisa en un solo sitio, el
  `onError` de `queryClient.js`; quien lo trata él mismo lo dice con `meta: {notifyError: false}`
  (los formularios, que llevan los errores a sus campos con `applyServerErrors` y dejan el diálogo
  abierto; la campana, cuyo fallo no avisa).
- **Una sesión caducada no deja un diálogo muerto ni redirige sola**: sale `SessionExpiredModal`
  con «Volver a entrar» (que conserva la URL) y «Cerrar» (para copiar lo que haya sin guardar).
- **Ningún dato se convierte en HTML.** ESLint prohíbe `dangerouslySetInnerHTML`, `innerHTML`,
  `insertAdjacentHTML` y `document.write`. El esquema de vía será SVG de React y el `payload` de la
  actividad, texto. Un enlace que llega de un servicio: si es interno empieza por una sola `/`; si es
  `http(s)` se abre en otra pestaña con `noopener`; cualquier otro esquema se descarta.
- **Los enumerados que se leen de un servicio toleran lo desconocido** (`defineEnum`): `UNKNOWN`
  («Desconocido») no se ofrece en los desplegables y no abre nada. El dato leído no se reescribe:
  un valor que nadie tocó vuelve al servicio tal cual.
- **Las fechas viajan en la query como texto ISO** (LocalDate `YYYY-MM-DD`, YearMonth `YYYY-MM`,
  Instant en UTC); `http.js` rechaza un `Date`. Un filtro por días cubre los dos extremos enteros.
- **Los ficheros se descargan con `fetch` y un `Blob`, con el Bearer** (`api/download.js`). Nunca un
  `<a href>` a `/api` (no llevaría el token), ni el `Location` ni el `downloadUrl` de un servicio
  (son rutas internas).
- **Las formas de modificar son las del servicio**, y cada fase porta la suya: catálogos con el
  `versionNumber` leído; maestros editados sobre una copia y devueltos enteros, con las colecciones
  hijas a `null` salvo que se toquen; usuarios con un `PUT` parcial (`null` no toca, `''` vacía);
  mantenimiento con `PATCH` merge-patch y la `version` leída (`buildMergePatch`).
- **Solo se sondea con la pantalla abierta** (`refetchInterval` de React Query con
  `refetchIntervalInBackground: false`): los trabajos en curso cada 2 s, la campana cada 30 s.
- **La configuración del entorno llega en tiempo de ejecución** (`/config.json`): una imagen vale
  para todos los entornos. Nada de `VITE_*`; la base de la API es siempre `/api`.
- **Un servicio nuevo (por ejemplo `mto-field`) se añade en un solo sitio por pieza**: su entrada en
  `api/services.js` (de ahí salen permisos, audiencias y sondas), su módulo en `api/` y `features/`,
  sus rutas en `routeTable.js`; en la plataforma, su ruta en el gateway y su audience mapper en el
  cliente `mto-frontend` (`check_realm_consistency.py` exige todas las audiencias en todo cliente de
  login). Ninguna lista de servicios se escribe a mano en más de un sitio.
- **Todo lo local es npm o Node**: nada de bash ni de variables en línea en los scripts de
  `package.json`; los `.sh` solo viven dentro de la imagen y van fijados a LF (`.gitattributes`). Las
  configuraciones de `.run/` llaman a scripts que existen (`app.test.js`).

### Tests

Una capa por fichero; se añaden casos, no ficheros (salvo la vista, que va un fichero por módulo).
Todo corre en Node con Vitest y jsdom, sin Docker:

- `src/test/clientLayer.test.js` — `api/` contra el gateway simulado con **MSW** (`server.use` en
  cada caso; sin manejadores por defecto). Cada fase añade el bloque de contratos de su servicio.
- `src/test/securityLayer.test.js` — `auth/`.
- `src/test/viewLayer.<módulo>.test.jsx` — las pantallas con la tabla de rutas real
  (`renderRoute(path, {session})` en `render.jsx`, con `createMemoryRouter` y Mantine en
  `env="test"`). Las sesiones se hacen con `loginAs(usuarioDeDesarrollo)` o
  `sessionWith([permisos])` (`session.js`): un token sin firmar que pasa por el mapeo real. Los casos
  son los de `ViewLayerTest` del backoffice, portados por fase. Se busca por rol y nombre
  (`getByRole('button', {name: 'Nuevo'})`).
- `src/test/app.test.js` — licencias, paridad de rutas y enlaces, configuración, nginx y el proxy de
  Vite, `.run/`.

`setup.js` hace fallar el test que llame a algo sin manejador (`onUnhandledFrame` de MSW 3; la opción
`onUnhandledRequest` ya no existe) y limpia avisos, sesión caducada, almacenamiento y `configureHttp`
tras cada caso. `e2e/` (Playwright) recorre la fase contra la plataforma real; no corre en el CI. El
CI construye además la imagen y la prueba de humo (`/config.json`, la CSP, el fallback de la SPA, el
503 sin gateway y que sin su configuración no arranca).
