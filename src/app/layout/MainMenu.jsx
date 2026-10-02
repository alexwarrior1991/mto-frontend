import {NavLink, ScrollArea} from '@mantine/core'
import {useMemo} from 'react'
import {Link, useLocation} from 'react-router'
import {useSession} from '../../auth/sessionContext.js'
import {activePath, buildMenu} from '../navigation.js'
import {MENU_ICONS} from './menuIcons.js'

/** El menu lateral: lo que la persona puede abrir (ver navigation.js). */
export default function MainMenu({onNavigate}) {
    const session = useSession()
    const {pathname} = useLocation()
    const menu = useMemo(() => buildMenu(session), [session])
    const active = activePath(menu, pathname)

    return (
        <ScrollArea type="auto" h="100%">
            <nav aria-label="Menú principal">
                {menu.map((item) => item.kind === 'group'
                    ? (
                        <NavLink key={item.key} component="button" type="button" label={item.label}
                                 leftSection={icon(item.icon)} childrenOffset={28}
                                 defaultOpened={item.key !== 'catalogos' || pathname.startsWith('/catalogos/')}>
                            {item.children.map((child) => (
                                <MenuLink key={child.path} link={child} active={child.path === active} onNavigate={onNavigate}/>
                            ))}
                        </NavLink>
                    )
                    : <MenuLink key={item.path} link={item} active={item.path === active} onNavigate={onNavigate}/>)}
            </nav>
        </ScrollArea>
    )
}

function MenuLink({link, active, onNavigate}) {
    return (
        <NavLink component={Link} to={link.path} label={link.label} leftSection={icon(link.icon)} active={active}
                 aria-current={active ? 'page' : undefined} onClick={onNavigate}/>
    )
}

function icon(name) {
    const Icon = name ? MENU_ICONS[name] : null
    return Icon ? <Icon size={18} stroke={1.6}/> : null
}
