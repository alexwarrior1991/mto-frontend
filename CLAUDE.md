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
  `correlation.js`, `paging.js` (las tres formas de paginar, y `toPageParams` y `toOffsetParams`, de
  la página de la pantalla a la del servicio), `enums.js` (`defineEnum`: enumerados
  tolerantes), `mergePatch.js` (`buildMergePatch`), `dates.js`, `download.js` (fetch + Blob),
  `services.js` (**los servicios del dominio en un solo sitio**: prefijo, cliente de Keycloak,
  roles, sonda; de aquí salen el catálogo de permisos, las audiencias esperadas y las sondas),
  `probes.js` y un módulo por servicio (`configuration/`, y en cada fase `users/`, `stock/`…):
  `configuration/lovResources.js` (los 17 catálogos, y en tres el tipo que exigen: `parent`) y
  `configuration/lovs.js` (sus endpoints y cómo viaja una entrada: `newLovEntry`, `changedLovEntry`,
  `lovEntryWithEnabled`) y `configuration/masters.js` (los seis maestros: `filterMasters`, el CRUD,
  `trackSchematic`, `listBusinessEntities`, y cómo viaja uno: `masterBody`, `MASTER_CHILDREN`,
  `lovRef`, `CLEARED_LOV_REF`) y `configuration/jobs.js` (los trabajos en segundo plano: `JOB_TYPE`
  y `JOB_STATUS` tolerantes, `JOB_FAMILIES` y `familyOf`, `isTerminal`, `isDownloadable`,
  `hasErrorReport`, los lanzadores `importProfiles`, `importLovs`, `exportProfiles` y `republish`,
  `listJobs`, `getJob` por familia, `downloadJobFile` y `rejectedJobOf`, el trabajo de un 429).
  `users/` es `mto-users`: `users/users.js` (el port de `UsersClient`, de sus DTO y de `TakeOut`: la
  búsqueda `searchUsers` con `first`/`max`, que rechaza antes de llamar lo que el servicio rechazaría;
  el alta, la modificación, `setUserEnabled`, el borrado, la contraseña, el correo de acciones, las
  sesiones normales y offline y las credenciales; cómo viaja uno, `newUserRequest` y
  `changedUserRequest`, que devuelve `null` si no cambió nada; `REQUIRED_ACTION` y las etiquetas que
  dejan tal cual lo desconocido; y `takeOut`, los tres pasos en su orden), `users/roles.js` (los
  clientes, sus roles y sus miembros, los roles de una persona, añadir con `PUT {roles}` y quitar con
  un `DELETE` con el mismo cuerpo) y `users/profiles.js` (el catálogo, lo que concede un perfil, sus
  miembros, los de una persona, asignar con un `PUT` sin cuerpo y quitar).
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
  `format.js`, `usePageTitle.js`, `FullPageMessage.jsx`, `ForbiddenNotice.jsx`, `notifySuccess.js`
  (el aviso verde de tres segundos), `ConfirmModal.jsx` (confirmar lo que no se deshace),
  `ServerDataTable.jsx` (la lista paginada en el servidor: orden de una columna asc → desc → sin
  orden, `Pagination` y acciones por fila), `DataTable.jsx` (una lista que ya está entera en la
  pantalla, sin paginar), `RowActionButton.jsx` (una acción de fila con su nombre completo,
  «Modificar VIA 1»), `TriStateFilter.jsx` (todo, sí o no; «todo» no viaja), `LazyTabs.jsx` (el port
  de `LazyPanel`: pestañas que piden sus datos la primera vez que se abren y no al reelegirlas) y
  `OffsetPager.jsx` (anteriores y siguientes para una lista sin total). Cada fase añade aquí lo que
  comparte (`RevisionsModal`…).
- `features/<módulo>/` — las pantallas de cada fase (`catalogues`, `infrastructure`, `jobs`, `users`,
  `stock`, `maintenance`, `notifications`). No llaman a `fetch`: usan `api/`. `catalogues/` es el port
  de `ui/lov`:
  - `CataloguePage`, con `key` por recurso para que cambiar de catálogo empiece de cero;
  - `CatalogueTable`, `CatalogueEditorModal` (`@mantine/form`) y `CatalogueBulkCreateModal`;
  - `bulkLines.js` (el parser del alta múltiple), `catalogueRows.js` (filtrar, ordenar y contar) y
    `useCatalogue.js` (la clave `['configuration', 'lovs', recurso]` y las escrituras que releen).

  `infrastructure/` es el port de `ui/master`:
  - `MasterPage` (el port de `MasterView`): la lista de un maestro con su búsqueda, sus filtros, sus
    columnas, «Modificado» y la columna de acciones siempre presente; una página por maestro
    (`ExecutionPackagesPage`, `StationsPage`, `TracksPage`, `ProfilesPage`, `DisconnectorsPage`,
    `SectionInsulatorsPage`) pone columnas, filtros y editor;
  - `MasterEditorModal` (el marco de cada editor) y un editor por maestro sobre `@mantine/form`, con
    las propiedades llamadas como los campos del servicio;
  - `ChildrenTable` (los hijos que el editor gestiona), `CantileverModal`, `SwitchModal` y
    `ProfilePicker` (un perfil buscado en el servidor);
  - `TrackSchematicModal`, `SchematicSvg` y `schematicLayout.js` (las cuentas puras del dibujo);
  - `masterResources.js`, `references.js` (nombres de las referencias y `#id`), `formValues.js` (de
    DTO a formulario y vuelta), `useMasters.js` (listas, escrituras y referencias) y
    `useCatalogues.js` (varios catálogos para los desplegables, con la caché de `catalogues/`).

  `jobs/` es el port de `ui/jobs`:
  - `JobsPage` (el port de `JobsView`): los lanzadores que permite la sesión y el historial;
  - `LauncherCard` (el marco, una región con nombre) y `ExportCard`, `ImportCard` (las dos
    importaciones, con `FileInput` y el tope de 20 MB) y `RepublishCard`;
  - `JobHistory` (la lista del servicio con sus filtros, «Descargar» y «Errores») y `JobErrorsModal`;
  - `sessionJobs.js` (el port de `JobLog`: los trabajos de la pestaña con su etiqueta y su último
    estado, en memoria, leídos con `useSyncExternalStore`), `useJobs.js` (`useJobList`, la vuelta de
    seguimiento con su sondeo y el aviso al terminar, y `useLaunchJob`, el 202 y el 429) y
    `jobTexts.js` (etiquetas, progreso y recuentos).

  `users/` es el port de `ui/users`:
  - `UsersPage` (el port de `UsersView`): la lista paginada en el servidor, con la búsqueda, el
    atributo y el estado, y sus acciones por fila; `UserEditorModal`, el alta y la modificación;
  - `UserDetailPage` (el port de `UserDetailView`, con `key` por id): la cabecera, los botones por
    permiso, `ResetPasswordModal`, `ActionsEmailModal` y las cuatro pestañas en `LazyTabs`
    (`UserProfilesPanel`, `UserRolesPanel`, `UserSessionsPanel` y `UserCredentialsPanel`);
  - `UserProfilesPage` y `ClientRolesPage`, los dos catálogos de solo lectura con su filtro local, y
    `MembersSection`, los miembros de un perfil o de un rol con `OffsetPager`;
  - `useUsers.js` (las claves `['users', …]`, las consultas, las escrituras y `listFilter`, lo que
    pide la lista), `userForms.js` (lo que exigen los formularios y los valores de partida),
    `userAttributes.js` (el port de `UserAttributes`: `clave=valor` por línea) y `userTexts.js`
    (textos, recuentos, la ruta de una ficha y las filas de los roles).
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
  imagen). Nunca se llama a la URL del gateway. El gateway es la única autoridad CORS (a los
  servicios no les reenvía `Origin`), y sin `Origin` tampoco él ve una petición CORS: la SPA no
  depende de su lista de orígenes y una misma imagen vale para cualquier dominio. Es seguro porque
  la API se autentica con Bearer y no con cookies (nginx quita también las cookies).
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
  `BUS-002` y `USR-409` no; los 409 de estado de mantenimiento no piden recargar; un 422 sin errores
  por campo es una regla de negocio). Un cuerpo HTML nunca se enseña. Un fallo se avisa en un solo sitio, el
  `onError` de `queryClient.js`; quien lo trata él mismo lo dice con `meta: {notifyError: false}`
  (los formularios, que llevan los errores a sus campos con `applyServerErrors` y dejan el diálogo
  abierto; la campana, cuyo fallo no avisa).
- **Una sesión caducada no deja un diálogo muerto ni redirige sola**: sale `SessionExpiredModal`
  con «Volver a entrar» (que conserva la URL) y «Cerrar» (para copiar lo que haya sin guardar).
- **Ningún dato se convierte en HTML.** ESLint prohíbe `dangerouslySetInnerHTML`, `innerHTML`,
  `insertAdjacentHTML` y `document.write`. El esquema de vía es SVG de React y el `payload` de la
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
- **Una entrada de catálogo se modifica entera, con la versión leída.**
  - El `PUT` de `mto-configuration` sustituye la entrada, así que viaja la fila leída con lo cambiado
    encima (`changedLovEntry`): `drawingNumber`, el tipo y lo desconocido vuelven tal cual.
  - El `versionNumber` es el bloqueo optimista: si otra persona guardó antes, 409 `CON-001`, el
    diálogo sigue abierto con lo escrito y el aviso pide recargar. En un lote, una sola fila vieja
    rechaza el lote entero.
  - El alta solo lleva lo escrito. Tres catálogos exigen su tipo (`parent` en `lovResources.js`), que
    viaja como `{id}`.
  - El borrado es físico, y una entrada en uso no se borra (409 `BUS-002`): la confirmación lo dice.
  - La pantalla no compara versiones ni reimplementa reglas. El catálogo llega entero, así que
    filtrar (sin mayúsculas ni tildes) y ordenar son locales.
- **Un maestro se edita sobre la fila leída y se devuelve entero** (`masterBody`).
  - Viaja la fila de la lista (sin pedir el detalle) con lo cambiado encima: el `versionNumber` y lo
    que la pantalla no conoce vuelven tal cual, y una versión vieja es 409 `CON-001` con el diálogo
    abierto.
  - Una colección de hijos que el editor no toca viaja a `null` («de esta no digo nada»), y la que
    toca va entera, porque el hijo que falta se borra.
  - Una referencia a catálogo viaja como `{id, code}`, porque el servicio la resuelve por código. Si
    no se toca, vuelve la leída; si se vacía una opcional del perfil, viaja `{}` (`null` es «no la
    toques»).
  - El seccionador de un perfil se enseña pero no se cambia desde el perfil, y viaja como se leyó: el
    vínculo es del seccionador y se cambia en su editor (su `profileId`, obligatorio).
  - Borrar es lógico y lo que cuelga se queda, y la confirmación lo dice. Las listas se paginan en el
    servicio (`POST /filter`, 50 por página); paquetes, estaciones y vías se cargan enteros (1000
    filas) solo para nombrar las referencias.
- **Solo se sondea con la pantalla abierta** (`refetchInterval` de React Query con
  `refetchIntervalInBackground: false`): los trabajos en curso cada 2 s, la campana cada 30 s.
- **Un trabajo se lanza y se sigue; no se espera.**
  - Lanzar responde 202 con el trabajo, o 429 con el trabajo ya rechazado y un `Retry-After`
    (`rejectedJobOf`): se apunta como rechazado y el aviso dice cuándo reintentar, no es un fallo.
  - La lista es la del servicio (`GET /jobs`, sin `sort`: ordena él). Se vuelve a pedir cada 2 s
    mientras haya en la página algo sin terminar o un trabajo de la pestaña en curso; los de la
    pestaña que no estén en la página se piden a su familia en la misma vuelta (`useJobList`).
  - Un fallo del sondeo no se avisa cada 2 s (`meta: {notifyError: false}`): se enseña fijo encima de
    la tabla mientras el último intento falle.
  - `sessionJobs` solo guarda la etiqueta con la que la pestaña lanzó cada trabajo y su último
    estado, para pintarla encima y avisar una vez cuando termina. Recargar la pierde, como el token.
  - Las filas no traen los errores por elemento: «Errores» los pide al detalle. Un tipo desconocido
    no tiene familia (ni detalle ni descarga) y un estado desconocido cuenta como terminado.
  - El fichero se pide por familia e id con el token (`downloadJobFile`); nunca el `downloadUrl` ni el
    `Location` del servicio. Una exportación se descarga `COMPLETED`; una importación también
    `COMPLETED_WITH_ERRORS`, porque su fichero es el informe. Un 410 pide relanzar el trabajo.
- **Un usuario se modifica con lo que cambió, y la lista se pide como la pide Keycloak.**
  - El `PUT` de `mto-users` es parcial: `null` no toca, `''` vacía, y los atributos van enteros o no
    van (`changedUserRequest`, contra lo leído). El nombre de usuario y `enabled` no viajan nunca
    (activar tiene su `PATCH`). Sin cambios no se llama.
  - La lista pide cada página con `first`/`max` (50; el servicio no da más de 200) y trae el total
    en la misma respuesta. No se ordena, porque la API no ordena.
  - La búsqueda y el atributo se excluyen, porque el servicio los rechaza juntos (`SEARCH-400`):
    escribir en uno deshabilita el otro, y si los dos llegaran con texto, `listFilter` manda solo la
    búsqueda. Un atributo mal formado no pide nada. Si la lista necesita orden u otro filtro, se pide
    en `mto-users`, no se arregla aquí.
- **En la ficha, asignar y quitar pintan lo que devuelve el servicio.**
  - Perfiles, roles, activar y modificar dejan en la caché la respuesta, que `mto-users` relee de
    Keycloak antes de contestar, y no se vuelve a pedir. Un perfil es un rol de realm, así que
    cambiarlo relee la pestaña de roles (si se abrió).
  - Lo demás se relee: las sesiones y las credenciales tras cualquier cierre, salga bien o no; la
    cabecera y las credenciales tras fijar una contraseña (Keycloak añade «Cambiar la contraseña»); y
    la cabecera, la lista y las sesiones tras «sacar a la persona».
  - La cabecera (`['users', 'user', id]`) no es prefijo de sus pestañas: releerla no relee lo pintado.
- **Las pestañas de una ficha piden sus datos al abrirse** (`LazyTabs`), nunca con las `Tabs` de
  Mantine tal cual: montan todas a la vez y, en el navegador, reelegir una vuelve a pedirlo. Una
  pestaña sin abrir no tiene consulta, así que releer no la pide.
- **«Sacar a la persona» son tres llamadas en ese orden, y no se funden en una.** `takeOut` hace
  `PATCH /enabled {false}`, `DELETE /sessions` y `DELETE /offline-sessions`, para en el primer fallo y
  devuelve lo hecho y el paso que falló, que el aviso dice con su «Referencia». El botón pide
  `users-write` **y** `users-sessions-write`.
- **Una ficha que no existe se dice una vez y vuelve a su lista.** La consulta lleva
  `meta.notFoundMessage` («No existe el usuario …»), que `queryClient.js` usa con un 404 en vez del
  aviso genérico. Un id con «:» (los federados) va codificado en la ruta y en la llamada.
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
- `src/test/viewLayer.<módulo>.test.jsx` (`shell`, `catalogues`, `infrastructure`, `jobs`, `users`) —
  las pantallas con la tabla de rutas real (`renderRoute(path, {session})` en `render.jsx`, con
  `createMemoryRouter` y Mantine en `env="test"`). Las sesiones se hacen con `loginAs(usuarioDeDesarrollo)` o
  `sessionWith([permisos])` (`session.js`): un token sin firmar que pasa por el mapeo real. Los casos
  son los de `ViewLayerTest` del backoffice, portados por fase. Se busca por rol y nombre
  (`getByRole('button', {name: 'Nuevo'})`). Lo que se sondea (los trabajos) corre con el reloj falso
  que avanza solo (`vi.useFakeTimers({shouldAdvanceTime: true})`): cada vuelta es
  `advanceTimersByTimeAsync(2000)` dentro de `act`, y `renderRoute` le pasa ese reloj a user-event.
  Un `Textarea` con `autosize` no se usa: Mantine lee `document.fonts`, que jsdom no tiene (se pone
  `rows` y `resize`, como en el alta múltiple de catálogos).
- `src/test/app.test.js` — licencias, paridad de rutas y enlaces, configuración, nginx y el proxy de
  Vite, `.run/`.

`setup.js` hace fallar el test que llame a algo sin manejador (`onUnhandledFrame` de MSW 3; la opción
`onUnhandledRequest` ya no existe) y limpia avisos, sesión caducada, almacenamiento y `configureHttp`
tras cada caso. `e2e/` (Playwright) recorre la fase contra la plataforma real; no corre en el CI. El
CI construye además la imagen y la prueba de humo (`/config.json`, la CSP, el fallback de la SPA, el
503 sin gateway y que sin su configuración no arranca).
