import {Stack, Text, Title} from '@mantine/core'
import {IconListDetails} from '@tabler/icons-react'
import {useState} from 'react'
import {inPlanOrder, templatesInOrder} from '../../api/maintenance/catalogs.js'
import {ASSET_TYPE} from '../../api/maintenance/enums.js'
import DataTable from '../../ui/DataTable.jsx'
import {formatQuantity, yesNo} from '../../ui/format.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import {useInspectionTemplates} from './useMaintenance.js'

const TEMPLATE_COLUMNS = Object.freeze([
    {key: 'assetType', label: 'Tipo de activo', render: (template) => ASSET_TYPE.label(template.assetType)},
    {key: 'version', label: 'Versión', render: (template) => template.version ?? ''},
    {key: 'name', label: 'Nombre', render: (template) => template.name ?? ''},
    {key: 'active', label: 'Estado', render: (template) => (template.active === true ? 'Activa' : 'Anterior')},
    {key: 'items', label: 'Puntos', render: (template) => template.items?.length ?? 0},
])

const ITEM_COLUMNS = Object.freeze([
    {key: 'code', label: 'Código', render: (item) => item.code},
    {key: 'label', label: 'Punto', render: (item) => item.label ?? ''},
    {key: 'measure', label: 'Medida', render: (item) => yesNo(item.requiresMeasure)},
    {key: 'unit', label: 'Unidad', render: (item) => item.unit ?? ''},
    {key: 'min', label: 'Mínimo', render: (item) => formatQuantity(item.minValue)},
    {key: 'max', label: 'Máximo', render: (item) => formatQuantity(item.maxValue)},
])

/**
 * Las plantillas de inspección por tipo de activo y versión (el port de InspectionTemplatesView), de
 * solo lectura, con los puntos de la que se elija; al abrir, los de la primera activa. Una inspección
 * copia los puntos de la plantilla activa al crearse, así que cambiar la plantilla no cambia las
 * inspecciones hechas.
 */
export default function InspectionTemplatesPage({title}) {
    const templates = useInspectionTemplates()
    const rows = templatesInOrder(templates.data)
    const [chosenId, setChosenId] = useState(null)
    const chosen = rows.find((template) => template.id === chosenId) ?? rows.find((template) => template.active === true) ?? null
    const items = inPlanOrder(chosen?.items)

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <DataTable ariaLabel={title} columns={TEMPLATE_COLUMNS} rows={rows} loading={templates.isPending} selectedKey={chosen?.id ?? null}
                       emptyText={templates.isError ? 'No se ha podido leer el catálogo.' : 'No hay plantillas.'}
                       rowActions={(template) => (
                           <RowActionButton label={`Puntos de ${templateLabel(template)}`} tooltip="Ver sus puntos" icon={IconListDetails}
                                            onClick={() => setChosenId(template.id)}/>
                       )}/>
            <Title order={3}>{chosen ? `Puntos de ${templateLabel(chosen)}` : 'Puntos'}</Title>
            {chosen
                ? <DataTable ariaLabel={`Puntos de ${templateLabel(chosen)}`} columns={ITEM_COLUMNS} rows={items} rowKey={(item) => item.id ?? item.code}
                             emptyText="La plantilla no tiene puntos."/>
                : <Text size="sm" c="dimmed">Elige una plantilla para ver sus puntos.</Text>}
        </Stack>
    )
}

function templateLabel(template) {
    return `${template.name ?? ASSET_TYPE.label(template.assetType)} (versión ${template.version ?? '?'})`
}
