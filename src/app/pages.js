import CataloguePage from '../features/catalogues/CataloguePage.jsx'
import DisconnectorsPage from '../features/infrastructure/DisconnectorsPage.jsx'
import ExecutionPackagesPage from '../features/infrastructure/ExecutionPackagesPage.jsx'
import ProfilesPage from '../features/infrastructure/ProfilesPage.jsx'
import SectionInsulatorsPage from '../features/infrastructure/SectionInsulatorsPage.jsx'
import StationsPage from '../features/infrastructure/StationsPage.jsx'
import TracksPage from '../features/infrastructure/TracksPage.jsx'
import JobsPage from '../features/jobs/JobsPage.jsx'
import ClientRolesPage from '../features/users/ClientRolesPage.jsx'
import UserDetailPage from '../features/users/UserDetailPage.jsx'
import UserProfilesPage from '../features/users/UserProfilesPage.jsx'
import UsersPage from '../features/users/UsersPage.jsx'
import HomePage from './pages/HomePage.jsx'

/**
 * La pantalla de cada ruta de routeTable.js, por su clave. Cada fase anade aqui las suyas; una ruta
 * sin pantalla la pinta PendingPage.
 */
export const PAGES = Object.freeze({
    home: HomePage,
    catalogues: CataloguePage,
    executionPackages: ExecutionPackagesPage,
    stations: StationsPage,
    tracks: TracksPage,
    profiles: ProfilesPage,
    disconnectors: DisconnectorsPage,
    sectionInsulators: SectionInsulatorsPage,
    jobs: JobsPage,
    users: UsersPage,
    userProfiles: UserProfilesPage,
    clientRoles: ClientRolesPage,
    user: UserDetailPage,
})
