import {useMatches, useParams} from 'react-router'
import {findLovResource} from '../api/configuration/lovResources.js'
import RequirePermission from '../auth/RequirePermission.jsx'
import {usePageTitle} from '../ui/usePageTitle.js'
import {PAGES} from './pages.js'
import NotFoundPage from './pages/NotFoundPage.jsx'
import PendingPage from './pages/PendingPage.jsx'

/**
 * Pinta la pantalla de una entrada de routeTable.js tras sus permisos, o PendingPage si aun no ha
 * llegado. Un catalogo que no existe (catalogos/lo-que-sea) es «no existe», no «sin permiso».
 */
export default function RouteScreen() {
    const route = useMatches().at(-1)?.handle?.route
    const params = useParams()
    const title = titleOf(route, params)
    usePageTitle(title)

    if (!route || title === null) {
        return <NotFoundPage/>
    }
    const Page = PAGES[route.page] ?? PendingPage
    return (
        <RequirePermission all={route.requires ?? []} title={title}>
            <Page route={route} title={title}/>
        </RequirePermission>
    )
}

function titleOf(route, params) {
    if (!route) {
        return null
    }
    if (route.path === 'catalogos/:resource') {
        return findLovResource(params.resource)?.title ?? null
    }
    return route.title
}
