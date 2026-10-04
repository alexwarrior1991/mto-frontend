import {yesNo} from '../../ui/format.js'
import CatalogueEntryModal from './CatalogueEntryModal.jsx'
import StockCataloguePage from './StockCataloguePage.jsx'
import {CATALOGUES, describeEntry} from './stockTexts.js'

const COLUMNS = Object.freeze([
    {key: 'code', label: 'Código', sortField: 'code', render: (row) => row.code},
    {key: 'name', label: 'Nombre', sortField: 'name', render: (row) => row.name},
    {key: 'active', label: 'Activo', sortField: 'active', render: (row) => yesNo(row.active)},
])

/** Los almacenes (el port de WarehousesView). */
export default function WarehousesPage() {
    return (
        <StockCataloguePage catalogue={CATALOGUES.warehouses} columns={COLUMNS} describe={describeEntry}
                            renderEditor={({row, onClose}) => <CatalogueEntryModal catalogue={CATALOGUES.warehouses} row={row} onClose={onClose}/>}/>
    )
}
