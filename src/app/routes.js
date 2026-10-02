import RootLayout from './layout/RootLayout.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'
import RouteErrorPage from './pages/RouteErrorPage.jsx'
import RouteScreen from './RouteScreen.jsx'
import {ROUTES} from './routeTable.js'

/**
 * Las rutas de React Router, sacadas de routeTable.js. React Router elige la mas especifica, asi que
 * las literales ganan a las de parametro (usuarios/perfiles a usuarios/:userId). Cada pantalla lleva
 * su ErrorBoundary para que un fallo al pintarla deje el menu en su sitio.
 */
export function appRoutes() {
    return [{
        path: '/',
        Component: RootLayout,
        ErrorBoundary: RouteErrorPage,
        children: [
            ...ROUTES.map((route) => ({
                ...(route.path === '' ? {index: true} : {path: route.path}),
                Component: RouteScreen,
                ErrorBoundary: RouteErrorPage,
                handle: {route},
            })),
            {path: '*', Component: NotFoundPage},
        ],
    }]
}
