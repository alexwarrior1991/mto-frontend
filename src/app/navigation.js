import {LOV_RESOURCES} from '../api/configuration/lovResources.js'
import {P} from '../auth/permissions.js'
import {MENU_GROUPS, ROUTES} from './routeTable.js'

/**
 * El menu de la persona: solo lo que puede abrir, agrupado y en el orden del backoffice (Inicio,
 * Infraestructura, Trabajos, Usuarios, Almacen, Mantenimiento, Notificaciones, Actividad y, al final,
 * los Catalogos). Un grupo sale si la persona puede abrir algo de el, y se ordena por su primera
 * entrada.
 *
 * Esconder no es proteger: quien manda es el 403 del servicio.
 */
export function buildMenu(session) {
    const items = []
    const groups = new Map()
    for (const route of ROUTES) {
        if (!route.menu || !session.hasAll(...(route.requires ?? []))) {
            continue
        }
        const link = {
            kind: 'link',
            path: route.path ? `/${route.path}` : '/',
            label: route.menu.label ?? route.title,
            icon: route.menu.icon,
            order: route.menu.order,
        }
        const key = route.menu.group
        if (!key) {
            items.push(link)
            continue
        }
        let group = groups.get(key)
        if (!group) {
            group = {kind: 'group', key, label: MENU_GROUPS[key].label, icon: MENU_GROUPS[key].icon, order: link.order, children: []}
            groups.set(key, group)
            items.push(group)
        }
        group.order = Math.min(group.order, link.order)
        group.children.push(link)
    }
    groups.forEach((group) => group.children.sort(byOrder))
    items.sort(byOrder)

    // Los catalogos van a mano, como en el backoffice: su pantalla lleva el recurso en la ruta.
    if (session.has(P.CONFIG_READ)) {
        items.push({
            kind: 'group',
            key: 'catalogos',
            label: 'Catálogos',
            icon: 'catalogues',
            order: Number.POSITIVE_INFINITY,
            children: LOV_RESOURCES.map((resource) => ({
                kind: 'link',
                path: `/catalogos/${resource.path}`,
                label: resource.title,
            })),
        })
    }
    return items
}

/** La entrada del menu que corresponde a una URL: la exacta, o la mas larga que la contenga (la ficha de una orden marca Ordenes). */
export function activePath(menu, pathname) {
    const links = menu.flatMap((item) => item.kind === 'group' ? item.children : [item])
    const exact = links.find((link) => link.path === pathname)
    if (exact) {
        return exact.path
    }
    const containing = links
        .filter((link) => link.path !== '/' && pathname.startsWith(`${link.path}/`))
        .sort((a, b) => b.path.length - a.path.length)
    return containing[0]?.path ?? null
}

function byOrder(a, b) {
    return a.order - b.order
}
