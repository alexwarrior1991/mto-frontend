import {P} from '../auth/permissions.js'

/**
 * Las rutas de la aplicacion son EXACTAMENTE las del backoffice: mto-notification enlaza a ellas en
 * sus avisos (/mantenimiento/ordenes/{id}, /usuarios/{id}, /actividad?category=...) y el correo las
 * hace absolutas. Estan todas desde la fase 0, cada una con su permiso: lo que aun no esta hecho lo
 * pinta PendingPage, con un enlace a la misma ruta del backoffice.
 *
 * Cada entrada:
 * - path: la ruta, sin barra inicial (las literales ganan a las de parametro: usuarios/perfiles a
 *   usuarios/:userId);
 * - title: el titulo de la pantalla;
 * - page: la clave de su pantalla en app/pages.js (sin ella, PendingPage);
 * - requires: los permisos que hacen falta, todos (experiencia de usuario: manda el 403 del servicio);
 * - phase: la fase de esta aplicacion en la que llega la pantalla;
 * - menu: si sale en el menu, con su grupo, su orden (el @Menu del backoffice), su icono y, si cambia,
 *   su etiqueta.
 */

export const MENU_GROUPS = Object.freeze({
    infraestructura: {label: 'Infraestructura', icon: 'infrastructure'},
    usuarios: {label: 'Usuarios', icon: 'users'},
    almacen: {label: 'Almacén', icon: 'warehouse'},
    mantenimiento: {label: 'Mantenimiento', icon: 'maintenance'},
    actividad: {label: 'Actividad', icon: 'activity'},
})

const CONFIG = [P.CONFIG_READ]
const USERS = [P.USERS_READ]
const STOCK = [P.STOCK_READ]
const MAINTENANCE = [P.MAINTENANCE_READ]

export const ROUTES = Object.freeze([
    {path: '', title: 'Inicio', page: 'home', menu: {order: 0, icon: 'home'}},

    {path: 'catalogos/:resource', title: 'Catálogos', page: 'catalogues', requires: CONFIG, phase: 1},

    {path: 'infraestructura/paquetes', title: 'Paquetes de ejecución', page: 'executionPackages', requires: CONFIG, phase: 2, menu: {group: 'infraestructura', order: 10, icon: 'packages'}},
    {path: 'infraestructura/estaciones', title: 'Estaciones', page: 'stations', requires: CONFIG, phase: 2, menu: {group: 'infraestructura', order: 11, icon: 'stations'}},
    {path: 'infraestructura/vias', title: 'Vías', page: 'tracks', requires: CONFIG, phase: 2, menu: {group: 'infraestructura', order: 12, icon: 'tracks'}},
    {path: 'infraestructura/perfiles', title: 'Perfiles', page: 'profiles', requires: CONFIG, phase: 2, menu: {group: 'infraestructura', order: 13, icon: 'profiles'}},
    {path: 'infraestructura/seccionadores', title: 'Seccionadores', page: 'disconnectors', requires: CONFIG, phase: 2, menu: {group: 'infraestructura', order: 14, icon: 'disconnectors'}},
    {path: 'infraestructura/aisladores', title: 'Aisladores de sección', page: 'sectionInsulators', requires: CONFIG, phase: 2, menu: {group: 'infraestructura', order: 15, icon: 'insulators'}},

    {path: 'trabajos', title: 'Trabajos', page: 'jobs', requires: CONFIG, phase: 3, menu: {order: 30, icon: 'jobs'}},

    {path: 'usuarios', title: 'Usuarios', page: 'users', requires: USERS, phase: 4, menu: {group: 'usuarios', order: 40, icon: 'users'}},
    {path: 'usuarios/perfiles', title: 'Perfiles de usuario', page: 'userProfiles', requires: USERS, phase: 4, menu: {group: 'usuarios', order: 41, icon: 'userProfiles'}},
    {path: 'usuarios/roles', title: 'Roles de cliente', page: 'clientRoles', requires: USERS, phase: 4, menu: {group: 'usuarios', order: 42, icon: 'roles'}},
    {path: 'usuarios/:userId', title: 'Usuario', page: 'user', requires: USERS, phase: 4},

    {path: 'almacen', title: 'Existencias', page: 'stock', requires: STOCK, phase: 5, menu: {group: 'almacen', order: 50, icon: 'warehouse'}},
    {path: 'almacen/materiales', title: 'Materiales', page: 'stockMaterials', requires: STOCK, phase: 5, menu: {group: 'almacen', order: 51, icon: 'materials'}},
    {path: 'almacen/almacenes', title: 'Almacenes', page: 'stockWarehouses', requires: STOCK, phase: 5, menu: {group: 'almacen', order: 52, icon: 'warehouses'}},
    {path: 'almacen/proveedores', title: 'Proveedores', page: 'stockSuppliers', requires: STOCK, phase: 5, menu: {group: 'almacen', order: 53, icon: 'suppliers'}},
    {path: 'almacen/proyectos', title: 'Proyectos', page: 'stockProjects', requires: STOCK, phase: 5, menu: {group: 'almacen', order: 54, icon: 'projects'}},
    {path: 'almacen/movimientos', title: 'Movimientos', page: 'stockMovements', requires: STOCK, phase: 5, menu: {group: 'almacen', order: 55, icon: 'movements'}},
    {path: 'almacen/reservas', title: 'Reservas', page: 'stockReservations', requires: STOCK, phase: 5, menu: {group: 'almacen', order: 56, icon: 'reservations'}},
    {path: 'almacen/conjuntos', title: 'Conjuntos', page: 'stockAssemblies', requires: STOCK, phase: 5, menu: {group: 'almacen', order: 57, icon: 'assemblies'}},

    {path: 'mantenimiento', title: 'Órdenes', requires: MAINTENANCE, phase: 6, menu: {group: 'mantenimiento', order: 60, icon: 'maintenance'}},
    {path: 'mantenimiento/ordenes/:orderId', title: 'Orden', requires: MAINTENANCE, phase: 6},
    {path: 'mantenimiento/activos', title: 'Activos', requires: MAINTENANCE, phase: 6, menu: {group: 'mantenimiento', order: 61, icon: 'assets'}},
    {path: 'mantenimiento/turnos', title: 'Turnos', requires: MAINTENANCE, phase: 6, menu: {group: 'mantenimiento', order: 62, icon: 'shifts'}},
    {path: 'mantenimiento/turnos/:shiftId', title: 'Turno', requires: MAINTENANCE, phase: 6},
    {path: 'mantenimiento/inspecciones', title: 'Inspecciones', requires: MAINTENANCE, phase: 6, menu: {group: 'mantenimiento', order: 63, icon: 'inspections'}},
    {path: 'mantenimiento/inspecciones/:inspectionId', title: 'Inspección', requires: MAINTENANCE, phase: 6},
    {path: 'mantenimiento/defectos', title: 'Defectos', requires: MAINTENANCE, phase: 6, menu: {group: 'mantenimiento', order: 64, icon: 'defects'}},
    {path: 'mantenimiento/defectos/:defectId', title: 'Defecto', requires: MAINTENANCE, phase: 6},
    {path: 'mantenimiento/informes', title: 'Informes', requires: MAINTENANCE, phase: 6, menu: {group: 'mantenimiento', order: 65, icon: 'reports'}},
    {path: 'mantenimiento/equipos', title: 'Equipos', requires: MAINTENANCE, phase: 6, menu: {group: 'mantenimiento', order: 66, icon: 'teams'}},
    {path: 'mantenimiento/tipos-de-tarea', title: 'Tipos de tarea', requires: MAINTENANCE, phase: 6, menu: {group: 'mantenimiento', order: 67, icon: 'taskTypes'}},
    {path: 'mantenimiento/plantillas', title: 'Plantillas de inspección', requires: MAINTENANCE, phase: 6, menu: {group: 'mantenimiento', order: 68, icon: 'templates'}},

    {path: 'notificaciones', title: 'Notificaciones', requires: [P.NOTIFICATION_INBOX], phase: 7, menu: {order: 80, icon: 'notifications'}},
    {path: 'actividad', title: 'Registro de actividad', requires: [P.NOTIFICATION_ACTIVITY_READ], phase: 7, menu: {group: 'actividad', order: 82, icon: 'activity'}},
    {path: 'actividad/accesos', title: 'Accesos', requires: [P.NOTIFICATION_ACCESS_READ], phase: 7, menu: {group: 'actividad', order: 83, icon: 'access'}},
])
