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

## Estado: fase 7

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
- **Fase 3 · Trabajos**: los trabajos en segundo plano de `mto-configuration` (`trabajos`).
  - Exportar los perfiles de una vía, importar el maestro de perfiles o el catálogo de LOV (de
    verdad o en simulación) y republicar datos maestros, cada uno tras su permiso.
  - El historial es el del servicio, paginado y filtrado por tipo y estado. Se vuelve a pedir cada
    dos segundos mientras haya algo en curso, y nunca con la pestaña oculta.
  - Un trabajo lanzado desde la pestaña avisa al terminar, también si no está en la página que se
    ve. Si el servicio no tiene hueco (429), se apunta como rechazado y dice cuándo reintentar.
  - El fichero de una exportación y el informe de una importación se descargan con el token. Los
    errores por elemento se piden al detalle del trabajo.
- **Fase 4 · Usuarios**: los usuarios, perfiles y roles de cliente del realm, a través de
  `mto-users` (`usuarios`, `usuarios/:userId`, `usuarios/perfiles` y `usuarios/roles`).
  - La lista se pide al servicio por páginas de 50 (`first` y `max`, con su total), buscada por
    texto o filtrada por un atributo exacto, que no van juntos. La API no ordena.
  - Alta (con contraseña temporal, acciones al entrar y atributos), modificación con solo lo que
    cambió, activar y desactivar, y borrar con confirmación.
  - La ficha de una persona, con sus perfiles, sus roles de cliente, sus sesiones (normales y
    offline) y sus credenciales en pestañas que piden sus datos la primera vez que se abren.
    Asignar y quitar pintan lo que devuelve el servicio.
  - La contraseña temporal, el correo de acciones y «Sacar a la persona»: desactivar, cerrar las
    sesiones y revocar las offline, en ese orden, parando en el primer fallo.
  - Los catálogos de perfiles y de roles, de solo lectura, con lo que concede cada perfil y quién
    tiene cada uno, paseados por páginas sin total.
- **Fase 5 · Almacén**: el inventario de `mto-stock` (`almacen` y `almacen/*`).
  - Los cinco catálogos (materiales, almacenes, proveedores, proyectos y conjuntos), paginados,
    buscados, filtrados y ordenados en el servicio. Un catálogo no se borra: se retira desmarcando
    «Activo». Un proyecto sincronizado desde `mto-configuration` no se modifica aquí.
  - Las existencias de un material, en un almacén o en todos, con las cifras del servicio, su libro
    y los materiales bajo mínimo.
  - El libro entero con sus filtros, y las cuatro operaciones: entrada, salida, transferencia y
    ajuste (este último, con `stock-adjust`).
  - Las reservas: alta, modificación, la salida que las consume con referencia y notas, consumir,
    liberar y cancelar (con `stock-delete`), solo en las activas.
  - Un conjunto con su lista de materiales entera y cuántos se pueden montar en un almacén.
  - El historial de cada fila de catálogo y de cada reserva.
  - Necesita `mto-stock` con su arreglo (alexwarrior1991/mto-stock#21): sin él, modificar la lista
    de un conjunto responde 500 y consumir una reserva no deja la salida en el libro.
- **Fase 6 · Mantenimiento**: el mantenimiento de la catenaria de `mto-maintenance` (`mantenimiento`
  y `mantenimiento/*`).
  - Los activos, paginados y filtrados en el servicio. Un tramo de vía se da de alta aquí; perfiles,
    seccionadores y aisladores llegan de `mto-configuration`, y de ellos solo se cambian la
    descripción y el intervalo del preventivo. El estado dice quién desactivó cada uno, y solo se
    reactiva lo que se desactivó aquí.
  - Las órdenes y su ficha, con los botones que admite su estado (planificar, asignar, iniciar,
    completar y cancelar) y las pestañas de tareas, materiales, defectos, inspecciones y estados.
    Una modificación es un merge-patch con lo que cambió y la versión leída.
  - Las líneas de material, que se reservan y se consumen en `mto-stock`: cada una ofrece lo que
    admiten su estado y su petición al almacén sin respuesta, y se sincroniza o se quita.
  - Los turnos, con sus tareas, sus perfiles y su parte: iniciar y cerrar, asignar tareas de las
    órdenes de su vía y trabajarlas, con su checklist, los defectos encontrados y el material gastado.
  - Las inspecciones con su checklist y el defecto y la orden correctiva que generan, y los defectos
    con sus transiciones: vincular a una orden, resolver, cerrar y descartar.
  - Los informes de avance y mensual, en pantalla y como fichero (Excel o PDF), y los catálogos:
    equipos, tipos de tarea y plantillas de inspección.
  - El historial de cada ficha y de cada activo, y los estados de una orden o un defecto.
  - Cancelar una orden, completarla con `force` y resolver, cerrar o descartar un defecto piden
    `maintenance-supervise` además de `maintenance-write`; desactivar un activo y quitar una línea de
    material, `maintenance-delete`.
  - Necesita `mto-maintenance` con su arreglo (alexwarrior1991/mto-maintenance#17): sin él, el
    historial de una orden, una tarea, una inspección o un defecto sobre un perfil, un seccionador o
    un aislador responde 500, y algunos errores salen como un 500 o un conflicto genérico en vez de
    decir lo que pasa.
- **Fase 7 · Notificaciones**: la bandeja y el registro de `mto-notification` (`notificaciones`,
  `actividad` y `actividad/accesos`).
  - La campana de la barra, con lo que queda sin leer (hasta «100+»), pedida al entrar y cada 30 s
    mientras la pantalla está abierta. Un fallo deja el número como estaba, sin aviso. Solo sale con
    `notification-inbox`, que llevan todos los perfiles del dominio.
  - La bandeja de cada persona, que abre con las no leídas y se filtra y ordena en el servicio. Abrir
    una la marca como leída y después sigue su enlace, con sus filtros; uno absoluto se abre en otra
    pestaña. «Marcar todas como leídas» llega hasta la más reciente que se ve.
  - El registro de actividad, con los filtros del servicio y los que llegan en la URL desde una
    notificación, sin los accesos. El detalle de una línea pide sus datos publicados, que la lista no
    trae.
  - Los accesos, con su permiso aparte (`notification-access-read`), por usuario, IP, tipo y
    resultado. Una IP a medio escribir no se pide.
  - Con alexwarrior1991/mto-notification#8, el servicio deja de consultar el DNS cuando le llega una
    IP mal escrita; esta pantalla no la manda.
- Ya no queda ninguna pantalla pendiente: cada ruta del backoffice tiene la suya, y los enlaces de
  las notificaciones abren la de esta aplicación. Queda el relevo, que retira el backoffice.

| Fase | Contenido | Equivale en el backoffice |
|---|---|---|
| F1 | Catálogos (`catalogos/:resource`, los 17) | F1 |
| F2 | Infraestructura: los seis maestros, sus hijos y el esquema de vía | F2, F4 y F7 |
| F3 | Trabajos en segundo plano | F3 y F4 |
| F4 | Usuarios | F5 |
| F5 | Almacén | F6 |
| F6 | Mantenimiento: activos, órdenes con sus tareas y materiales, turnos, inspecciones, defectos, informes y catálogos | F8 |
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
  el registro de actividad y los Catálogos; `usuarios.lector`, Usuarios; `almacen.lector`, el
  Almacén; `mantenimiento.lector`, Mantenimiento y, en lectura, Infraestructura, Catálogos, Trabajos
  y Almacén, de donde salen los nombres de vías, paquetes, almacenes y proyectos; `notificacion.lector`,
  la bandeja y el registro de actividad, y `notificacion.auditor`, además, los Accesos.
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
- **Trabajos** (con `config.responsable`):
  - «Exportar» con una vía sale como «Trabajo encolado» y como fila del historial. La fila avanza
    sola hasta «Terminado» y entonces ofrece «Descargar».
  - Importar `profile-master.xlsx` o `lov-master.xlsx` (están en `mto-configuration/data/`), mejor
    primero en «Simulación», deja un informe para descargar. «Errores» enseña los primeros fallos
    por fila.
  - Con `config.lector` solo se puede exportar. El catálogo de LOV pide además `lov-manage`.
  - Si el servicio ya no admite más trabajos a la vez, el nuevo sale «Rechazado», y el aviso dice
    cuándo volver a intentarlo.
- **Usuarios** (con `usuarios.responsable`; `usuarios.gestor` lo puede todo menos borrar, y
  `usuarios.lector` solo leer):
  - «Buscar» y «Atributo clave:valor» piden la lista al servicio; escribir en uno deshabilita el
    otro. Un atributo solo se guarda y se encuentra si el realm admite atributos no gestionados, como
    el de `mto-platform`.
  - «Nuevo» da de alta con una contraseña temporal y lo que Keycloak pedirá al entrar.
  - La ficha (el nombre de cada fila) tiene sus botones según tus permisos y cuatro pestañas:
    perfiles y roles se asignan y se quitan, y las sesiones y las credenciales se cierran o se quitan.
  - «Acciones por correo» manda el enlace a través de Keycloak: en local el correo llega a Mailpit
    (http://localhost:8025).
  - «Sacar a la persona» la desactiva, cierra sus sesiones y revoca las offline. No lo pruebes contigo
    mismo: te sacaría a ti.
  - **Perfiles de usuario** y **Roles de cliente** enseñan lo que concede cada perfil y quién tiene
    cada uno, solo por asignación directa.
- **Almacén** (con `almacen.responsable`; `almacen.operario` lo puede todo menos cancelar reservas y
  ajustar, y `almacen.lector` solo leer):
  - En **Existencias**, al elegir un material salen sus cifras (físico, reservado, disponible y
    mínimo), su libro y los botones de operar. Debajo, los materiales bajo mínimo, que siguen al
    almacén elegido; el ojo de cada fila elige ese material.
  - Una entrada sube el físico. Una salida sin disponible responde «No hay stock disponible
    suficiente» y deja el diálogo abierto para corregirla.
  - En **Reservas**, la lista empieza en las activas; elegir otra vez «Activa» las enseña todas. Solo
    una activa ofrece cambios. Consumirla deja una salida en el libro, y «Salida con esta reserva»
    hace lo mismo con referencia y notas.
  - En **Conjuntos**, la calculadora de cada fila dice cuántos se pueden montar en un almacén y qué
    componente lo limita. Volver a añadir un material a la lista cambia su cantidad.
  - El reloj de cada fila es su historial. Una fila que aún no tiene ninguno lo dice, sin error.
- **Mantenimiento** (con `mantenimiento.responsable`; `mantenimiento.tecnico` lo puede todo menos
  cancelar una orden, completarla con `force`, resolver, cerrar o descartar un defecto, desactivar un
  activo y quitar una línea de material, y `mantenimiento.lector` solo leer):
  - En **Activos**, «Nuevo tramo» da de alta un tramo de una vía. Un perfil, un seccionador o un
    aislador llegado de `mto-configuration` solo deja cambiar la descripción y el intervalo del
    preventivo, y su estado dice quién lo desactivó.
  - En **Órdenes**, el icono de cada fila abre la ficha, que solo enseña los botones que admite su
    estado. Si otra persona la ha cambiado desde que la abriste, sale «Conflicto con otro cambio:
    recarga y vuelve a intentarlo» y el diálogo sigue abierto.
  - Planificar una orden reserva sus materiales en el almacén. En la pestaña **Materiales**, el
    estado de cada línea dice cómo va con el almacén, y su motivo sale al pasar por encima.
  - En **Turnos**, un turno en curso asigna tareas de las órdenes abiertas de su vía y las completa
    con su checklist, los defectos encontrados y el material gastado. Su **Parte** es el del servicio.
  - Una **inspección** que encontró algo ofrece crear el defecto y la orden correctiva, o abrirlos si
    ya existen.
  - En **Informes**, «Consultar» pinta el avance o el mes, y «Excel» y «PDF» descargan lo consultado,
    aunque después cambien los filtros.
  - «Historial» abre las revisiones de cada ficha; la pestaña **Estados**, las transiciones con su
    comentario.
- **Notificaciones** (con `usuarios.responsable`, cuyo perfil recibe los avisos de las cuentas y lee el
  registro y los accesos; `notificacion.lector` lee la bandeja y el registro, y `notificacion.auditor`,
  además, los accesos):
  - La **campana** de la barra dice cuántas notificaciones te quedan sin leer y se actualiza sola cada
    30 s mientras la pantalla está abierta. Lleva a la bandeja.
  - Dar de alta a alguien en **Usuarios** te deja, en unos segundos, «Alta de usuario: …» en la bandeja,
    que abre con las no leídas («Recargar» la vuelve a pedir). La flecha de la fila, o un doble clic, la
    marca como leída y te lleva a la ficha de esa persona.
  - Una notificación que enlaza al **registro de actividad** lo abre con sus filtros puestos. La lupa
    de cada línea abre su detalle, con los datos que publicó el servicio.
  - En **Accesos** salen las entradas y los fallos de cada cuenta, que `mto-notification` lee de
    Keycloak cada 20 s. La IP se busca completa.
  - «Marcar todas como leídas» deja la bandeja y la campana sin nada pendiente.

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
| Modificar un conjunto responde «Error inesperado (500)», o una reserva consumida no sale en el libro | `mto-stock` es anterior a su arreglo (alexwarrior1991/mto-stock#21): `docker compose pull stock && docker compose up -d stock` en `mto-platform` |
| El historial de una orden, una tarea, una inspección o un defecto sobre un perfil, un seccionador o un aislador responde «Error inesperado (500)» | `mto-maintenance` es anterior a su arreglo (alexwarrior1991/mto-maintenance#17): `docker compose pull maintenance && docker compose up -d maintenance` en `mto-platform` |
| No sale la campana | Te falta `notification-inbox`, de `mto-notification-api`: míralo en los permisos de Inicio. Todos los perfiles del dominio lo llevan |
| Una acción no deja su notificación | Llega por RabbitMQ a `mto-notification`, que decide con sus reglas a quién avisa: `docker compose logs notification` en `mto-platform`. Un acceso tarda hasta 20 s más, porque se lee de Keycloak por sondeo |
| Al recargar la página hay un parpadeo | Es lo esperado: el token vive solo en memoria y recargar es volver a entrar por el SSO |

## Cómo funciona (mapa para quien viene del backoffice)

| Backoffice (Vaadin) | mto-frontend (React) |
|---|---|
| `client/**` (las interfaces `@HttpExchange`) y `client/error` | `src/api/`: un módulo por servicio, `http.js` y `errors.js` |
| `configuration/security` (roles del access token) | `src/auth/` |
| `ui/**/…View` | `src/features/<módulo>/`: `catalogues/` es `ui/lov`, `infrastructure/` es `ui/master`, `jobs/` es `ui/jobs`, `users/` es `ui/users`, `stock/` es `ui/stock`, `maintenance/` es `ui/maintenance` y `notifications/` es `ui/notification` |
| `MainLayout` y `@Menu` | `src/app/layout/` y `src/app/routeTable.js` |
| `@RolesAllowed` | `requires` en `routeTable.js` y `RequirePermission` (solo experiencia: manda el 403) |
| `SharedPolling` y `@Push` | `refetchInterval` de React Query, solo con la pantalla abierta y la pestaña visible |
| `InboxBell` (la campana, con `SharedPolling`) | `src/features/notifications/InboxBell.jsx`, con `refetchInterval` cada 30 s |
| `NotificationLinks` (a dónde lleva una notificación) | `src/api/notification/links.js` y `src/features/notifications/useFollowLink.js` |
| `EventDetailDialog` (una línea del registro entera) | `src/features/notifications/EventDetailModal.jsx` |
| `JobLog` (en la `VaadinSession`) | `src/features/jobs/sessionJobs.js` (en memoria, por pestaña) |
| `Downloads` y `DownloadHandler` | `src/api/download.js`: `fetch` con el Bearer y un `Blob` |
| `UiErrors` y `ServerValidation` | `src/ui/errors/` |
| `RevisionsDialog` (el historial de una fila) | `src/ui/RevisionsModal.jsx` |
| Los `ComboBox` perezosos (`StockPickers`, `MaintenancePickers`, el perfil de un seccionador) | `src/ui/ServerSearchSelect.jsx` y `ServerSearchMultiSelect.jsx` |
| `MergePatch` y los `*Form.toPatch(original)` de mantenimiento | `src/api/mergePatch.js` (`buildMergePatch`) y el `*Patch` de cada módulo de `src/api/maintenance/` |
| `LazyPanel` (la pestaña que pide sus datos al abrirse) | `src/ui/LazyTabs.jsx` |
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
| `MTO_BACKOFFICE_URL` | Mientras convivan los dos frontales, a dónde lleva «Abrir en el backoffice» de una pantalla pendiente (desde la fase 7 no queda ninguna; se retira con el relevo) |

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
| `src/test/clientLayer.test.js` | `src/api` contra el gateway simulado: Bearer y correlación, la query, los cinco formatos de error, el 401 con renovación, la paginación, los enumerados, merge-patch, fechas, descargas, los textos de los avisos y, por servicio, sus contratos (los catálogos: rutas y cuerpos, la versión leída, el tipo por su id y los dos 409; los maestros: el `/filter` con su página, su orden y su cuerpo limpio, la fila leída con los hijos a `null`, `{id, code}` y `{}`, el esquema y las empresas; los trabajos: las importaciones multipart con `dryRun`, la exportación y el republicado sin barra final, la lista sin `sort`, el detalle por familia, el fichero por familia e id con el 410, el 429 con el trabajo rechazado, qué está terminado y qué se descarga, y lo desconocido; los usuarios: la búsqueda con `first`/`max` y su total, el atributo repetido y codificado, lo que se rechaza antes de llamar, el alta y el `PUT` parcial con solo lo cambiado, el `PATCH` de activo, la contraseña y el correo, las sesiones y las credenciales, los roles con el `DELETE` con cuerpo, los perfiles con el `PUT` sin cuerpo, los catálogos y sus miembros sin total, «sacar a la persona» en su orden y parando en el primer fallo, y un id con «:» codificado; el almacén: los catálogos con su búsqueda, su estado, el `Pageable` y el orden siempre con el id para desempatar, el alta sin `active` y la modificación con él, el proyecto sincronizado, las cifras, bajo mínimo y el libro de un material, el libro entero con sus filtros, las cuatro operaciones con lo vacío fuera y la fecha en UTC, la vida de una reserva, el conjunto con su lista y su disponibilidad, el historial con su 404, lo desconocido y el JSON de error de `mto-stock`; el mantenimiento: las listas con su orden y el id para desempatar, lo desconocido, su JSON de error, el merge-patch con lo cambiado, lo vaciado y la versión (los conjuntos sin orden, lo que admite cada estado y el proyecto de almacén sin `stock-read`), los activos, los catálogos y los equipos enteros, el ciclo de una orden con el cuerpo de cada transición, las tareas, los turnos, trabajar una tarea, las inspecciones y los defectos con lo que generan, las líneas de material con su petición en duda y el almacén caído o diciendo que no, los informes en JSON y como fichero, y el historial con su 404; las notificaciones: la bandeja con sus filtros y su orden, que desempata por la fecha, el contador acotado, las marcas como `POST` sin cuerpo y el `NTF-404`, el registro con todos sus filtros, sin los accesos (que se rechazan antes de llamar) y con `includeSuperseded` solo cuando es verdadero, el detalle con su `payload`, los accesos con la IP comprobada antes de llamar, lo desconocido, el `REQ-400` de un `sort` y a dónde lleva un enlace) |
| `src/test/securityLayer.test.js` | `src/auth`: los permisos solo de los cinco clientes, un rol de realm que no abre nada, el catálogo comparado con el realm, el token solo en memoria, la renovación de un solo vuelo y la URL de vuelta |
| `src/test/viewLayer.*.test.jsx` | Las pantallas con la tabla de rutas real, un fichero por módulo: el marco (Inicio, el menú, sin permiso, pendientes, las sondas, la sesión caducada), los catálogos (los casos de `ViewLayerTest` del backoffice y el tipo de los tres que lo exigen) y la infraestructura (las listas en el servicio, los editores con la fila leída, las ménsulas y las agujas, vaciar una referencia, el perfil de un seccionador y el esquema de una vía) y los trabajos (lanzar y seguir hasta la descarga y los errores, la simulación, el 429, el trabajo fuera de la página, la lista en el servicio, lo desconocido, los permisos, la pestaña oculta, el fallo del sondeo, los 20 MB y el 410), con el reloj falso, y los usuarios (los casos de `ViewLayerTest` del backoffice: la lista en el servicio con la exclusión entre búsqueda y atributo, el editor con solo lo cambiado, la ficha con sus pestañas perezosas y cada botón tras su permiso, perfiles y roles pintando la respuesta, la contraseña con el KC-400 de verdad, el correo con su 502, las sesiones, las credenciales, «sacar a la persona» y los catálogos con sus miembros), y el almacén (los casos de `ViewLayerTest` del backoffice: los catálogos en el servicio, la lectura sin controles, el alta sin estado y la modificación con él, los errores por campo, el proyecto sincronizado y el editor de materiales; las cifras y el libro de un material y los bajo mínimo; el libro entero filtrado; la entrada, la salida sin stock, la transferencia y el ajuste con su permiso; las reservas con lo que admite cada una; los conjuntos con su lista y su disponibilidad; el historial y su 404. Y lo que el backoffice no hacía: un código repetido sin pedir recargar, los filtros con lo retirado, el error sobre la lista de materiales bajo ella y consumir dejando viejo el libro), y el mantenimiento (los casos de `ViewLayerTest` del backoffice: el menú y lo que el perfil lee de los otros módulos, los activos con su origen y quién los desactivó, los catálogos, las órdenes con lo que admite su estado, el merge-patch con el `CON-001` y el diálogo abierto, las tareas, las líneas de material con su petición en duda, los turnos con sus tareas asignadas y trabajadas, las inspecciones y los defectos con lo que generan, los informes con sus descargas y el historial de cada ficha), y las notificaciones (los casos de `ViewLayerTest` del backoffice: la campana con su número, tras su permiso, refrescada cada 30 s y con un fallo que deja el número; el menú con cada pantalla tras su permiso; la bandeja que abre con las no leídas, filtra y ordena en el servicio, marca al abrir y sigue el enlace con sus filtros, «marcar todas» y el `NTF-404`; el registro con sus filtros y los de la URL, sin los accesos, y el detalle con su `payload`; los accesos desde el enlace de una regla. Y lo que el backoffice no hacía: el detalle que pide los datos publicados, ninguna línea del registro para una notificación de un acceso, un enlace absoluto en otra pestaña y otro esquema descartado, y una IP a medio escribir sin pedir) |
| `src/test/app.test.js` | Licencias libres, las rutas del backoffice y los enlaces de `mto-notification`, la configuración, nginx y el proxy de Vite sin `Origin`, las configuraciones de WebStorm |
| `e2e/*.spec.js` | Playwright contra la plataforma real (solo en local): la entrada y el marco, un catálogo de punta a punta con entradas de usar y tirar, un paquete, una estación y una vía de usar y tirar con su esquema, una exportación hasta su descarga y la simulación del catálogo de LOV, una persona de usar y tirar de su alta a su borrado (con su atributo, un perfil, un rol, la contraseña temporal, el correo en Mailpit y «sacar a la persona») y los dos catálogos de usuarios, y un almacén, un proyecto, un material y un conjunto de usar y tirar (una entrada, una reserva consumida que sale en el libro, un ajuste que deja el material bajo mínimo, la disponibilidad antes y después de modificar la lista, el historial y la retirada de todo), y un tramo de usar y tirar con una orden de principio a fin (planificada e iniciada, su tarea trabajada en un turno con posesión total que se inicia y se cierra, y completada con sus estados y su historial), el informe de avance de su vía descargado, el tramo desactivado al final y el mantenimiento en lectura, y un alta y una baja de usuario que avisan en la bandeja (la campana, cada una abierta y marcada siguiendo su enlace hasta la ficha y hasta el registro con sus filtros, el detalle con sus datos publicados, los accesos de la propia cuenta y «marcar todas») y el registro sin los accesos |

## Puertos

| Puerto | Qué |
|---|---|
| 4200 | La SPA: `npm run dev` **o** el contenedor, nunca los dos. Es el *redirect URI* del cliente en el realm |
| 8090 | El gateway, al que Vite reenvía `/api` en desarrollo |
| 8082 | Keycloak (`auth.mto.local`) |
| 8085 | El backoffice, mientras conviva |
