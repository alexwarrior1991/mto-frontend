import {IconCalculator} from '@tabler/icons-react'
import {useState} from 'react'
import {yesNo} from '../../ui/format.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import AssemblyAvailabilityModal from './AssemblyAvailabilityModal.jsx'
import AssemblyEditorModal from './AssemblyEditorModal.jsx'
import StockCataloguePage from './StockCataloguePage.jsx'
import {CATALOGUES, describeAssembly, entryLabel} from './stockTexts.js'

const COLUMNS = Object.freeze([
    {key: 'code', label: 'Código', sortField: 'code', render: (row) => row.code},
    {key: 'name', label: 'Nombre', sortField: 'name', render: (row) => row.name},
    {key: 'components', label: 'Materiales', render: (row) => (row.components ?? []).length},
    {key: 'active', label: 'Activo', sortField: 'active', render: (row) => yesNo(row.active)},
])

/**
 * Los conjuntos (el port de AssembliesView): productos virtuales definidos por su lista de materiales,
 * sin stock propio. La lista es la de cualquier catálogo del almacén, y cada conjunto activo ofrece su
 * disponibilidad por almacén también a quien solo lee, porque es una consulta. Uno retirado no la
 * ofrece: el servicio la rechaza (422 ASM-001).
 */
export default function AssembliesPage() {
    const [checking, setChecking] = useState(null)
    const availability = (row) => row.active === true && (
        <RowActionButton label={`Disponibilidad de ${entryLabel(row)}`} tooltip="Disponibilidad por almacén" icon={IconCalculator}
                         onClick={() => setChecking(row)}/>
    )

    return (
        <>
            <StockCataloguePage catalogue={CATALOGUES.assemblies} columns={COLUMNS} describe={describeAssembly} rowActions={availability}
                                renderEditor={({row, onClose}) => <AssemblyEditorModal row={row} onClose={onClose}/>}/>
            {checking && <AssemblyAvailabilityModal assembly={checking} onClose={() => setChecking(null)}/>}
        </>
    )
}
