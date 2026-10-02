# mto-frontend

Frontal web del dominio `MTO` (infraestructura ferroviaria de catenaria): una aplicación de página
única (SPA) en **React 19 + Vite 8 + Mantine 9**, en JavaScript, que **sustituye fase a fase al
backoffice Vaadin** (`mto-backoffice`) con las mismas pantallas, las mismas rutas y las mismas
reglas. Como el backoffice, es un **cliente**: sin base de datos y sin lógica de negocio. Lo que una
pantalla necesita y la API no da bien se arregla en el servicio, no aquí.

```
                     /  /assets  /config.json
Navegador ──────────────────────────────────▶ mto-frontend (:4200)
    │                                          Vite en desarrollo, nginx en la imagen
    │      /api/**  (mismo origen, Bearer)              │
    ├──────────────────────────────────────▶ mto-frontend ──▶ mto-gateway (:8090) ──▶ servicios
    │                                       (quita Origin)
    │      entrar, renovar y salir
    └──────────────────────────────────────▶ Keycloak (auth.mto.local:8082, realm mto, cliente mto-frontend)
```

El navegador entra por Keycloak con el cliente público `mto-frontend` (Authorization Code con PKCE),
guarda el token **solo en memoria** y llama a `/api` de su mismo origen; quien le sirve la
aplicación reenvía esas llamadas al gateway. Nunca llama a la URL del gateway, así que CORS no
interviene.

Noveno repositorio del dominio, hermano e independiente de [`mto-configuration`](../mto-configuration),
[`mto-users`](../mto-users), [`mto-stock`](../mto-stock), [`mto-maintenance`](../mto-maintenance),
[`mto-notification`](../mto-notification), [`mto-gateway`](../mto-gateway) y
[`mto-backoffice`](../mto-backoffice); la infraestructura local es de [`mto-platform`](../mto-platform).

## Estado: fase 2

- **Fase 0 · Cimientos**: entrada con Keycloak conservando la URL pedida, token en memoria renovado
  con el refresh token, el marco con el menú filtrado por permisos y **todas las rutas del
  backoffice** registradas, la pantalla de Inicio con el diagnóstico del token (audiencias y
  permisos) y una comprobación de cada servicio a través del gateway, los avisos de error con su
  «Referencia», la imagen con nginx, el CI y la integración con WebStorm.
- **Fase 1 · Catálogos**: los 17 catálogos de `mto-configuration` en una sola pantalla
  (`catalogos/:resource`).
  - Leer y filtrar, sin distinguir mayúsculas ni tildes, y ordenar.
  - Dar de alta, modificar con la versión leída y borrar con confirmación.
  - Activar y desactivar en lote, y el alta múltiple pegando líneas.
  - El tipo de cimentación, de pórtico o de cimentación de anclaje en los tres catálogos que lo
    exigen.
  - Necesita `mto-configuration` con la versión en el JSON de los catálogos.
- **Fase 2 · Infraestructura**: los seis maestros de `mto-configuration` (`infraestructura/*`):
  paquetes de ejecución, estaciones, vías, perfiles, seccionadores y aisladores de sección.
  - Listas paginadas, buscadas, filtradas y ordenadas en el servicio, con los nombres de sus
    referencias.
  - Alta, modificación sobre la fila leída (con su versión) y borrado (lógico) con confirmación.
  - Las ménsulas de un perfil, con su brazo de atirantado, y las agujas de un aislador.
  - El esquema de una vía, en una llamada.
  - El seccionador de un perfil se cambia desde el editor del seccionador; en el perfil se enseña,
    pero no se cambia.
  - Las listas de seccionadores y aisladores necesitan `mto-configuration` con su arreglo
    (alexwarrior1991/mto-configuration#30): sin él, con datos, responden 500.
- Las pantallas que aún no han llegado dicen en qué fase llegan y ofrecen **«Abrir en el
  backoffice»** con la misma ruta. Los enlaces de las notificaciones ya resuelven.

| Fase | Contenido | Equivale en el backoffice |
|---|---|---|
| F1 | Catálogos (`catalogos/:resource`, los 17) | F1 |
| F2 | Infraestructura: los seis maestros, sus hijos y el esquema de vía | F2, F4 y F7 |
| F3 | Trabajos en segundo plano | F3 y F4 |
| F4 | Usuarios | F5 |
| F5 | Almacén | F6 |
| F6 | Mantenimiento (en subfases) | F8 |
| F7 | Notificaciones: la campana, la bandeja, la actividad y los accesos | F9 |
| F8 | Relevo: se retira el backoffice | — |

## Probar en local

### Cómo encaja (para quien viene de Spring)

Con Vaadin la pantalla se calcula en el servidor. Con React el navegador se descarga la aplicación
(HTML y JavaScript) y la ejecuta él mismo; cuando necesita datos, llama a `/api` en su mismo sitio y
quien le sirve la aplicación reenvía la llamada al gateway:

- **en desarrollo** la sirve **Vite** (`npm run dev`), con recarga en caliente al guardar: el
  equivalente de `spring-boot:run` con devtools;
- **desplegada** la sirve **nginx** dentro de una imagen Docker: entrega los ficheros compilados
  (`dist/`, el equivalente del jar) y reenvía `/api` al gateway.

| Para | Maven (hermanos) | mto-frontend |
|---|---|---|
| Bajar dependencias | `./mvnw dependency:resolve` | `npm install` (o `npm ci`, exacto según el lock) |
| Arrancar en desarrollo | `./mvnw spring-boot:run` | `npm run dev` y abrir http://localhost:4200 |
| Tests, sin Docker ni Keycloak | `./mvnw test` | `npm test` |
| Un solo test | `-Dtest=Clase#metodo` | `npx vitest run -t "nombre del caso"` |
| Lint + tests + build | `./mvnw verify` | `npm run verify` |
| Empaquetar | `./mvnw package` (jar) | `npm run build` (carpeta `dist/`) |
| Comprobar el entorno local | — | `npm run doctor` |

### Requisitos (una sola vez)

- **Node 22** (LTS). El fichero `.nvmrc` dice la versión. Con nvm: `nvm install 22`. En Windows,
  el instalador oficial de Node 22 o nvm-windows (que no lee `.nvmrc` solo: `nvm install 22` y
  `nvm use 22`).
- **Docker**, para la plataforma (`mto-platform`).
- La línea **`127.0.0.1 auth.mto.local otel.mto.local`** en el fichero hosts, que ya tienes por la
  plataforma: `/etc/hosts` en Linux y macOS, `C:\Windows\System32\drivers\etc\hosts` en Windows
  (se edita como administrador).
- **El realm con el cambio de la fase 0** (el post-logout de `mto-frontend`): la primera vez,
  desde `mto-platform`, recrea Keycloak y vuelve a aplicar las parciales:

  ```bash
  docker compose up -d --force-recreate keycloak
  ./keycloak/apply-partials.sh
  ```

### Desde WebStorm

El repositorio trae configuraciones de ejecución compartidas en `.run/`: WebStorm las enseña solas
en la barra de arriba.

| Configuración | Qué hace |
|---|---|
| **Arrancar (dev)** | `npm run dev`. La URL sale en la consola, con un clic se abre |
| **Depurar en Chrome** | Abre http://localhost:4200 en Chrome enlazado al depurador: los breakpoints en los `.jsx` paran ahí |
| **Desarrollo + depurar** | Las dos anteriores de un solo clic (si Chrome se adelanta a Vite, recarga la página) |
| **Tests** / **Tests (vigilando)** | `npm test` / `npm run test:watch`. Además cada `it(...)` y cada `describe(...)` lleva su icono verde para lanzarlo solo, y el panel de resultados es como el de JUnit en IntelliJ |
| **Lint**, **Verify**, **Build**, **Doctor**, **E2E** | Los scripts de npm del mismo nombre |

La primera vez:

1. *File → Open* y la carpeta `mto-frontend`.
2. *Settings → Languages & Frameworks → Node.js*: elige Node 22.
3. WebStorm ofrece `npm install` en un aviso al abrir el proyecto; acéptalo.
4. *Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint*: «Automatic ESLint
   configuration» y, si quieres, «Run eslint --fix on save».
5. El formato viene de `.editorconfig` (con las claves `ij_javascript_*` de JetBrains): 4 espacios,
   sin punto y coma, comillas simples y `{x}` en los import. *Reformat Code* (Ctrl+Alt+L) deja el
   estilo del repositorio. La carpeta `.idea/` sigue fuera de git; `.run/` sí entra.
6. La plataforma se levanta desde la pestaña *Terminal* o con el plugin Docker de WebStorm, que
   enseña los contenedores y sus logs.

### Desde la terminal

Con la plataforma ya levantada:

```bash
npm install
npm run doctor
npm run dev
```

En PowerShell 5 (el de Windows por defecto) no existe `&&`: los comandos van en líneas separadas,
como arriba. `apply-partials.sh` de la plataforma se sigue lanzando desde Git Bash.

### Cuatro formas de probar

1. **Tests, sin nada levantado.** `npm test` simula el gateway con MSW (como `MockRestServiceServer`
   en el backoffice) y la sesión con un token falso que pasa por el mapeo real de permisos.
2. **Desarrollo contra tu plataforma** (el día a día). Desde `mto-platform`:

   ```bash
   docker compose --profile all up -d
   ./keycloak/apply-partials.sh
   ```

   y desde `mto-frontend`, `npm run dev` (o *Arrancar (dev)* en WebStorm). Abre
   http://localhost:4200 y entra con `config.responsable` / `local`. Cada cambio en `src/` se ve al
   guardar. Mientras convivan los dos frontales, el contenedor de la SPA no está en
   `--profile all`, así que el 4200 está libre para Vite; `--profile all` sigue trayendo el
   backoffice en el 8085.
3. **La imagen, como en producción.** Con Vite parado, desde `mto-platform`:

   ```bash
   docker compose --profile frontend up -d --build frontend
   ```

   Sirve en http://localhost:4200 y es la forma de probar nginx, la CSP y la configuración por
   variables. También vale `docker compose up -d --build` desde este repositorio.
4. **De punta a punta en un navegador real.** Con la plataforma y la SPA levantadas, `npm run e2e`
   (Playwright) abre Chromium, entra por Keycloak y recorre lo que ya está hecho. La primera vez,
   `npx playwright install chromium` baja el navegador.

### Qué deberías ver

- Al abrir http://localhost:4200 vas al formulario de Keycloak y vuelves a la aplicación.
- **Inicio** dice con quién has entrado, las seis audiencias del token con ✔ (si alguna sale ✘, ese
  servicio rechazará el token), tus permisos por cliente y tus roles de realm (solo informativos).
- **Comprobar servicios**, en Inicio: cada servicio que puedes leer responde a través del gateway.
- El **menú** cambia con la persona: `config.responsable` ve Infraestructura, Trabajos, la bandeja,
  el registro de actividad y los Catálogos; `almacen.lector`, el Almacén.
- Un enlace profundo (por ejemplo http://localhost:4200/actividad/accesos?username=x) sobrevive a
  la entrada: después de Keycloak vuelves a él.
- **Salir** cierra la sesión de Keycloak: volver a entrar pide la contraseña.
- **Catálogos** (con `config.responsable`):
  - Cualquiera de los 17 se lee, se filtra y se ordena.
  - «Nuevo», el lápiz y la papelera de cada fila dan de alta, modifican y borran. Las columnas
    «Modificado» y «Por» dicen quién la tocó.
  - Si otra persona ha guardado la misma entrada desde que la abriste, sale «Conflicto con otro
    cambio: recarga y vuelve a intentarlo» y el diálogo sigue abierto.
  - Una entrada que algún registro usa no se borra: hay que desactivarla.
  - Con `config.lector` no hay ningún botón de escritura.
- **Infraestructura** (con `config.responsable`):
  - Cada lista se pide al servicio por páginas de 50: «Buscar», los filtros y el orden de las
    columnas vuelven a pedirla.
  - Las referencias salen por su nombre («VIA 1 (EP4)»), y `#id` si no se conocen.
  - En **Vías**, el icono de cada fila abre el **esquema**, también con `config.lector`: un poste
    por perfil, con sus ménsulas, su seccionador y los aisladores entre sus vecinos por KP. El
    detalle de cada elemento sale al pasar por encima.
  - En **Perfiles**, las ménsulas (hasta tres) se añaden, modifican y quitan dentro del editor y se
    guardan con el perfil; en **Aisladores de sección**, igual con las agujas.
  - En **Seccionadores**, el perfil se busca escribiendo su identificador.

### Usuarios de desarrollo

La contraseña de todos es `local` (los crea `apply-partials.sh` en `mto-platform`).

| usuario | perfil |
|---|---|
| `config.lector` / `.editor` / `.responsable` / `.auditor` / `.ops` | `mto-viewer` / `mto-editor` / `mto-admin` / `mto-auditor` / `mto-ops` |
| `almacen.lector` / `.operario` / `.responsable` | `mto-warehouse-viewer` / `mto-warehouse-operator` / `mto-warehouse-admin` |
| `mantenimiento.lector` / `.tecnico` / `.responsable` | `mto-maintenance-viewer` / `mto-maintenance-technician` / `mto-maintenance-manager` |
| `usuarios.lector` / `.gestor` / `.responsable` | `mto-users-viewer` / `mto-users-manager` / `mto-users-admin` |
| `notificacion.lector` / `.auditor` / `.responsable` | `mto-notification-viewer` / `mto-notification-auditor` / `mto-notification-admin` |

### `npm run doctor`

Comprueba, antes de arrancar, la versión de Node, que `auth.mto.local` resuelve, que Keycloak
responde con el realm, que el cliente `mto-frontend` admite volver a `localhost:4200` al entrar **y
al salir**, que el gateway responde y que el 4200 está libre. Para cada fallo dice qué hacer.

### Problemas típicos

| Síntoma | Causa y arreglo |
|---|---|
| «No se puede contactar con Keycloak» | Falta la línea del fichero hosts, o Keycloak no ha arrancado (`npm run doctor`) |
| «Invalid redirect uri» al salir | El realm no tiene el cambio de la fase 0: `docker compose up -d --force-recreate keycloak` y `./keycloak/apply-partials.sh` en `mto-platform` |
| «Invalid parameter: redirect_uri» al entrar | La SPA no está en el 4200: Vite no salta de puerto (`strictPort`), así que algo más lo ocupa |
| «Port 4200 is already in use» | El contenedor `frontend` (`docker compose stop frontend`) u otro `npm run dev` |
| Aviso «El servicio no está disponible ahora mismo» | Ese servicio, o el gateway, no está levantado; la «Referencia» del aviso se busca en `docker compose logs gateway` |
| Aviso «El servicio no acepta tu token» | Al token le falta la audiencia de ese servicio: míralo en Inicio |
| En un catálogo, «Modificado» y «Por» salen vacíos, o modificar una cimentación, un pórtico o una cimentación de anclaje falla | `mto-configuration` es anterior a la versión que publica la versión de los catálogos: `docker compose pull configuration && docker compose up -d configuration` en `mto-platform` |
| Al recargar la página hay un parpadeo | Es lo esperado: el token vive solo en memoria y recargar es volver a entrar por el SSO |

## Cómo funciona (mapa para quien viene del backoffice)

| Backoffice (Vaadin) | mto-frontend (React) |
|---|---|
| `client/**` (las interfaces `@HttpExchange`) y `client/error` | `src/api/`: un módulo por servicio, `http.js` y `errors.js` |
| `configuration/security` (roles del access token) | `src/auth/` |
| `ui/**/…View` | `src/features/<módulo>/`: `catalogues/` es `ui/lov`, e `infrastructure/` es `ui/master` |
| `MainLayout` y `@Menu` | `src/app/layout/` y `src/app/routeTable.js` |
| `@RolesAllowed` | `requires` en `routeTable.js` y `RequirePermission` (solo experiencia: manda el 403) |
| `SharedPolling` y `@Push` | `refetchInterval` de React Query |
| `UiErrors` y `ServerValidation` | `src/ui/errors/` |
| `ViewLayerTest` (Karibu) | `src/test/viewLayer.*.test.jsx` (Testing Library + MSW) |

**React en diez líneas.** Una pantalla es un **componente**: una función que recibe datos (*props*)
y devuelve lo que se pinta, escrito en JSX (HTML dentro de JavaScript). Cuando cambian sus datos,
React la vuelve a pintar. Lo que una pantalla recuerda (un filtro, un diálogo abierto) es su
**estado** (`useState`). Los **hooks** son funciones que empiezan por `use` y se llaman siempre al
principio del componente: `useQuery` pide datos al servicio y los guarda en caché (React Query),
`useSession` dice quién ha entrado y qué puede hacer, `useSearchParams` lee y escribe la URL. Mantine
pone los componentes (tablas, formularios, diálogos) y React Router decide qué pantalla toca según
la URL.

**La sesión.** Sin persona dentro, la aplicación va a Keycloak llevando la URL pedida y vuelve a
ella (`/auth/callback`). El token vive en memoria; `src/auth/tokenSource.js` lo renueva con el
refresh token cuando una llamada lo necesita. Si la sesión de Keycloak ha caducado, sale el aviso
«La sesión ha caducado» con **Volver a entrar** (que conserva la URL), sin perder lo que haya en
pantalla.

**Los errores.** `src/api/errors.js` lee los cinco formatos de error del dominio y
`src/ui/errors/messages.js` los dice como el backoffice. Cada llamada lleva un `X-Correlation-Id`
nuevo: es la **Referencia** de los avisos, y con ella se encuentra la llamada en los logs del
gateway y del servicio.

## Desplegar

Lo que se despliega es **una imagen**, `ghcr.io/alexwarrior1991/mto-frontend`, que el CI publica al
fusionar en `master`, igual que en los hermanos. La misma imagen vale para todos los entornos: su
configuración llega por variables y nginx la sirve en `/config.json`.

| Variable | Valor |
|---|---|
| `MTO_OIDC_AUTHORITY` | El realm, tal como lo ve el navegador (el `iss` de los tokens). Obligatoria |
| `MTO_GATEWAY_URL` | El gateway visto desde el contenedor, `http(s)://host:puerto` sin ruta. Obligatoria |
| `MTO_OIDC_CLIENT_ID` | `mto-frontend` (por defecto) |
| `MTO_ENVIRONMENT` | La etiqueta del entorno en la cabecera (vacía en producción) |
| `MTO_BACKOFFICE_URL` | Mientras convivan los dos frontales, a dónde llevan las pantallas pendientes |

Sin las dos obligatorias, o con un valor que no vale, el contenedor no arranca y dice por qué. En el
realm de ese entorno, el cliente `mto-frontend` necesita la URL pública de la SPA como *redirect
URI*, como *web origin* y como *post-logout redirect URI*. Delante hace falta **HTTPS**: fuera de
`localhost` el navegador no da `crypto.subtle` y sin él no hay PKCE. El gateway no cambia.

La imagen sirve la SPA en el 8080 con nginx sin privilegios, reenvía `/api/` al gateway quitando
`Origin` y las cookies, deja subir hasta 20 MB (las importaciones de `mto-configuration`), pone una
CSP que solo deja ejecutar lo propio y llamar al origen y al realm, y responde un 503
`problem+json` si el gateway no contesta.

## Pruebas

| Fichero | Qué cubre |
|---|---|
| `src/test/clientLayer.test.js` | `src/api` contra el gateway simulado: Bearer y correlación, la query, los cinco formatos de error, el 401 con renovación, la paginación, los enumerados, merge-patch, fechas, descargas, los textos de los avisos y, por servicio, sus contratos (los catálogos: rutas y cuerpos, la versión leída, el tipo por su id y los dos 409; los maestros: el `/filter` con su página, su orden y su cuerpo limpio, la fila leída con los hijos a `null`, `{id, code}` y `{}`, el esquema y las empresas) |
| `src/test/securityLayer.test.js` | `src/auth`: los permisos solo de los cinco clientes, un rol de realm que no abre nada, el catálogo comparado con el realm, el token solo en memoria, la renovación de un solo vuelo y la URL de vuelta |
| `src/test/viewLayer.*.test.jsx` | Las pantallas con la tabla de rutas real, un fichero por módulo: el marco (Inicio, el menú, sin permiso, pendientes, las sondas, la sesión caducada), los catálogos (los casos de `ViewLayerTest` del backoffice y el tipo de los tres que lo exigen) y la infraestructura (las listas en el servicio, los editores con la fila leída, las ménsulas y las agujas, vaciar una referencia, el perfil de un seccionador y el esquema de una vía) |
| `src/test/app.test.js` | Licencias libres, las rutas del backoffice y los enlaces de `mto-notification`, la configuración, nginx y el proxy de Vite sin `Origin`, las configuraciones de WebStorm |
| `e2e/*.spec.js` | Playwright contra la plataforma real (solo en local): la entrada y el marco, un catálogo de punta a punta con entradas de usar y tirar, y un paquete, una estación y una vía de usar y tirar con su esquema |

## Puertos

| Puerto | Qué |
|---|---|
| 4200 | La SPA: `npm run dev` **o** el contenedor, nunca los dos. Es el *redirect URI* del cliente en el realm |
| 8090 | El gateway, al que Vite reenvía `/api` en desarrollo |
| 8082 | Keycloak (`auth.mto.local`) |
| 8085 | El backoffice, mientras conviva |
