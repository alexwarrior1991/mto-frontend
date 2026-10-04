import {yesNo} from '../../ui/format.js'
import CatalogueEntryModal from './CatalogueEntryModal.jsx'
import StockCataloguePage from './StockCataloguePage.jsx'
import {CATALOGUES, describeEntry} from './stockTexts.js'

const COLUMNS = Object.freeze([
    {key: 'code', label: 'Código', sortField: 'code', render: (row) => row.code},
    {key: 'name', label: 'Nombre', sortField: 'name', render: (row) => row.name},
    {key: 'active', label: 'Activo', sortField: 'active', render: (row) => yesNo(row.active)},
])

/** Los proveedores (el port de SuppliersView). */
export default function SuppliersPage() {
    return (
        <StockCataloguePage catalogue={CATALOGUES.suppliers} columns={COLUMNS} describe={describeEntry}
                            renderEditor={({row, onClose}) => <CatalogueEntryModal catalogue={CATALOGUES.suppliers} row={row} onClose={onClose}/>}/>
    )
}
