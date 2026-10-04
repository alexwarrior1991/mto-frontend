import {isSynchronizedProject} from '../../api/stock/catalogues.js'
import {yesNo} from '../../ui/format.js'
import CatalogueEntryModal from './CatalogueEntryModal.jsx'
import StockCataloguePage from './StockCataloguePage.jsx'
import {CATALOGUES, describeProject, projectOrigin} from './stockTexts.js'

const COLUMNS = Object.freeze([
    {key: 'code', label: 'Código', sortField: 'code', render: (row) => row.code},
    {key: 'name', label: 'Nombre', sortField: 'name', render: (row) => row.name},
    {key: 'origin', label: 'Origen', render: projectOrigin},
    {key: 'active', label: 'Activo', sortField: 'active', render: (row) => yesNo(row.active)},
])

/**
 * Los proyectos del almacén (el port de ProjectsView). Uno sincronizado desde mto-configuration (un
 * paquete de ejecución) es de su origen: el servicio rechaza su PUT con 422 PRJ-001, así que aquí no
 * se ofrece modificarlo; se cambia allí. Su historial sí se ofrece.
 */
export default function ProjectsPage() {
    return (
        <StockCataloguePage catalogue={CATALOGUES.projects} columns={COLUMNS} describe={describeProject}
                            isEditable={(row) => !isSynchronizedProject(row)}
                            renderEditor={({row, onClose}) => <CatalogueEntryModal catalogue={CATALOGUES.projects} row={row} onClose={onClose}/>}/>
    )
}
