import CataloguePage from '../features/catalogues/CataloguePage.jsx'
import DisconnectorsPage from '../features/infrastructure/DisconnectorsPage.jsx'
import ExecutionPackagesPage from '../features/infrastructure/ExecutionPackagesPage.jsx'
import ProfilesPage from '../features/infrastructure/ProfilesPage.jsx'
import SectionInsulatorsPage from '../features/infrastructure/SectionInsulatorsPage.jsx'
import StationsPage from '../features/infrastructure/StationsPage.jsx'
import TracksPage from '../features/infrastructure/TracksPage.jsx'
import JobsPage from '../features/jobs/JobsPage.jsx'
import AssetsPage from '../features/maintenance/AssetsPage.jsx'
import InspectionTemplatesPage from '../features/maintenance/InspectionTemplatesPage.jsx'
import TaskTypesPage from '../features/maintenance/TaskTypesPage.jsx'
import TeamsPage from '../features/maintenance/TeamsPage.jsx'
import AssembliesPage from '../features/stock/AssembliesPage.jsx'
import MaterialsPage from '../features/stock/MaterialsPage.jsx'
import MovementsPage from '../features/stock/MovementsPage.jsx'
import ProjectsPage from '../features/stock/ProjectsPage.jsx'
import ReservationsPage from '../features/stock/ReservationsPage.jsx'
import StockPage from '../features/stock/StockPage.jsx'
import SuppliersPage from '../features/stock/SuppliersPage.jsx'
import WarehousesPage from '../features/stock/WarehousesPage.jsx'
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
    stock: StockPage,
    stockMaterials: MaterialsPage,
    stockWarehouses: WarehousesPage,
    stockSuppliers: SuppliersPage,
    stockProjects: ProjectsPage,
    stockMovements: MovementsPage,
    stockReservations: ReservationsPage,
    stockAssemblies: AssembliesPage,
    maintenanceAssets: AssetsPage,
    maintenanceTeams: TeamsPage,
    maintenanceTaskTypes: TaskTypesPage,
    maintenanceTemplates: InspectionTemplatesPage,
})
