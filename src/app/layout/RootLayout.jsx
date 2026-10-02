import {AppShell} from '@mantine/core'
import {useDisclosure} from '@mantine/hooks'
import {ModalsProvider} from '@mantine/modals'
import {Outlet} from 'react-router'
import AppHeader from './AppHeader.jsx'
import MainMenu from './MainMenu.jsx'

/**
 * El marco de todas las pantallas: la barra, el menu y el contenido. ModalsProvider va aqui dentro
 * para que un dialogo tenga el router y la cache de React Query a mano.
 */
export default function RootLayout() {
    const [menuOpened, {toggle, close}] = useDisclosure(false)

    return (
        <ModalsProvider labels={{confirm: 'Aceptar', cancel: 'Cancelar'}}>
            <AppShell
                header={{height: 56}}
                navbar={{width: 280, breakpoint: 'sm', collapsed: {mobile: !menuOpened}}}
                padding="md">
                <AppShell.Header>
                    <AppHeader menuOpened={menuOpened} onToggleMenu={toggle}/>
                </AppShell.Header>
                <AppShell.Navbar p="xs">
                    <MainMenu onNavigate={close}/>
                </AppShell.Navbar>
                <AppShell.Main>
                    <Outlet/>
                </AppShell.Main>
            </AppShell>
        </ModalsProvider>
    )
}
