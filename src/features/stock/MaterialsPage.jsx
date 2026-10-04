import {formatQuantity, yesNo} from '../../ui/format.js'
import MaterialEditorModal from './MaterialEditorModal.jsx'
import StockCataloguePage from './StockCataloguePage.jsx'
import {CATALOGUES, describeMaterial} from './stockTexts.js'

const COLUMNS = Object.freeze([
    {key: 'code', label: 'Código', sortField: 'code', render: (row) => row.code},
    {key: 'name', label: 'Nombre', sortField: 'name', render: (row) => row.name},
    {key: 'unitOfMeasure', label: 'Unidad', render: (row) => row.unitOfMeasure ?? ''},
    {key: 'minimumStockLevel', label: 'Stock mínimo', sortField: 'minimumStockLevel', render: (row) => formatQuantity(row.minimumStockLevel)},
    {key: 'active', label: 'Activo', sortField: 'active', render: (row) => yesNo(row.active)},
])

/** Los materiales del almacén (el port de MaterialsView). */
export default function MaterialsPage() {
    return (
        <StockCataloguePage catalogue={CATALOGUES.materials} columns={COLUMNS} describe={describeMaterial}
                            renderEditor={({row, onClose}) => <MaterialEditorModal row={row} onClose={onClose}/>}/>
    )
}
