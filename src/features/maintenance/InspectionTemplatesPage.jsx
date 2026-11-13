import {Stack, Text, Title} from '@mantine/core'
import {IconCopyPlus, IconListDetails, IconPencil, IconPlayerPause, IconPlayerPlay, IconPlus} from '@tabler/icons-react'
import {useState} from 'react'
import {
    activeTemplateOf, baseTemplateOf, inPlanOrder, isWritableTemplate, templateActivePatch, templatesAreWritable, templatesInOrder,
} from '../../api/maintenance/catalogs.js'
import {ASSET_TYPE} from '../../api/maintenance/enums.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import ConfirmModal from '../../ui/ConfirmModal.jsx'
import DataTable from '../../ui/DataTable.jsx'
import {formatDateTime, formatQuantity, yesNo} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import InspectionTemplateRenameModal from './InspectionTemplateRenameModal.jsx'
import InspectionTemplateVersionModal from './InspectionTemplateVersionModal.jsx'
import {useInspectionTemplates, useSetInspectionTemplateActive} from './useMaintenance.js'

const TEMPLATE_COLUMNS = Object.freeze([
    {key: 'assetType', label: 'Tipo de activo', render: (template) => ASSET_TYPE.label(template.assetType)},
    {key: 'version', label: 'Versión', render: (template) => template.version ?? ''},
    {key: 'name', label: 'Nombre', render: (template) => template.name ?? ''},
    {key: 'active', label: 'Estado', render: (template) => (template.active === true ? 'Activa' : 'Anterior')},
    {key: 'items', label: 'Puntos', render: (template) => template.items?.length ?? 0},
    {key: 'created', label: 'Creada', render: createdText},
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
 * Las plantillas de inspección por tipo de activo y versión (el port de InspectionTemplatesView). Una
 * inspección copia los puntos de la plantilla activa de su tipo al crearse, así que cambiar la plantilla
 * no cambia las inspecciones hechas.
 *
 * - Quien lee ve la plantilla activa de cada tipo de activo (los cuatro, tengan versiones o no), todas
 *   las versiones y los puntos de la que elija; al abrir, los de la primera activa.
 * - Con maintenance-supervise y maintenance-write juntos se mantienen: «Nueva versión» (de un tipo, o a
 *   partir de una versión), renombrar, y activar o desactivar con su confirmación. Una versión no cambia
 *   nunca sus puntos, y nada se borra.
 * - Ante un servicio anterior (una versión sin lockVersion) no se ofrece escribir nada: sin la clave no
 *   hay ni rutas ni bloqueo. Una versión de un tipo de activo que esta aplicación no conoce solo se lee.
 * - Tras cada escritura se relee la lista entera: crear o activar cambia también la que era activa.
 */
export default function InspectionTemplatesPage({title}) {
    const session = useSession()
    const templates = useInspectionTemplates()
    const rows = templatesInOrder(templates.data)
    const canMaintain = session.hasAll(P.MAINTENANCE_WRITE, P.MAINTENANCE_SUPERVISE) && templatesAreWritable(rows)
    const [chosenId, setChosenId] = useState(null)
    const chosen = rows.find((template) => template.id === chosenId) ?? rows.find((template) => template.active === true) ?? null
    const items = inPlanOrder(chosen?.items)
    // null: nada abierto; {assetType, base}: una versión nueva; {template}: renombrar o confirmar.
    const [creating, setCreating] = useState(null)
    const [renaming, setRenaming] = useState(null)
    const [switching, setSwitching] = useState(null)
    const activating = useSetInspectionTemplateActive()

    const types = ASSET_TYPE.values.map((assetType) => ({
        assetType,
        active: activeTemplateOf(rows, assetType),
        versions: rows.filter((template) => template.assetType === assetType).length,
    }))
    const typeColumns = [
        {key: 'assetType', label: 'Tipo de activo', render: (type) => ASSET_TYPE.label(type.assetType)},
        {
            key: 'active', label: 'Plantilla activa',
            render: (type) => (type.active ? `Versión ${type.active.version} · ${type.active.name ?? ''}` : 'Sin plantilla activa'),
        },
        {key: 'versions', label: 'Versiones', render: (type) => type.versions},
    ]

    const confirmSwitch = () => {
        const {template, active} = switching
        setSwitching(null)
        activating.mutate({id: template.id, patch: templateActivePatch(template, active)}, {
            onSuccess: () => notifySuccess(`${active ? 'Activada' : 'Desactivada'} ${versionLabel(template)}`),
        })
    }

    const versionActions = (template) => (
        <>
            <RowActionButton label={`Puntos de ${templateLabel(template)}`} tooltip="Ver sus puntos" icon={IconListDetails}
                             onClick={() => setChosenId(template.id)}/>
            {canMaintain && isWritableTemplate(template) && (
                <>
                    <RowActionButton label={`Nueva versión a partir de ${versionLabel(template)}`} tooltip="Nueva versión a partir de esta"
                                     icon={IconCopyPlus} onClick={() => setCreating({assetType: template.assetType, base: template})}/>
                    <RowActionButton label={`Renombrar ${versionLabel(template)}`} tooltip="Renombrar" icon={IconPencil}
                                     onClick={() => setRenaming(template)}/>
                    {template.active === true
                        ? <RowActionButton label={`Desactivar ${versionLabel(template)}`} tooltip="Desactivar" icon={IconPlayerPause}
                                           onClick={() => setSwitching({template, active: false})}/>
                        : <RowActionButton label={`Activar ${versionLabel(template)}`} tooltip="Activar" icon={IconPlayerPlay}
                                           onClick={() => setSwitching({template, active: true})}/>}
                </>
            )}
        </>
    )

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <DataTable ariaLabel="Plantilla activa de cada tipo de activo" columns={typeColumns} rows={types} rowKey={(type) => type.assetType}
                       emptyText=""
                       rowActions={canMaintain
                           ? (type) => (
                               <RowActionButton label={`Nueva versión de ${ASSET_TYPE.label(type.assetType)}`} tooltip="Nueva versión" icon={IconPlus}
                                                onClick={() => setCreating({assetType: type.assetType, base: baseTemplateOf(rows, type.assetType)})}/>
                           )
                           : null}/>
            <Title order={3}>Versiones</Title>
            <DataTable ariaLabel={title} columns={TEMPLATE_COLUMNS} rows={rows} loading={templates.isPending} selectedKey={chosen?.id ?? null}
                       emptyText={templates.isError ? 'No se ha podido leer el catálogo.' : 'No hay plantillas.'}
                       rowActions={versionActions} minWidth={900}/>
            <Title order={3}>{chosen ? `Puntos de ${templateLabel(chosen)}` : 'Puntos'}</Title>
            {chosen
                ? <DataTable ariaLabel={`Puntos de ${templateLabel(chosen)}`} columns={ITEM_COLUMNS} rows={items} rowKey={(item) => item.id ?? item.code}
                             emptyText="La plantilla no tiene puntos."/>
                : <Text size="sm" c="dimmed">Elige una plantilla para ver sus puntos.</Text>}
            {creating && (
                <InspectionTemplateVersionModal assetType={creating.assetType} base={creating.base}
                                                active={activeTemplateOf(rows, creating.assetType)}
                                                onSaved={(created) => setChosenId(created.id)} onClose={() => setCreating(null)}/>
            )}
            {renaming && <InspectionTemplateRenameModal template={renaming} label={versionLabel(renaming)} onClose={() => setRenaming(null)}/>}
            {switching && (
                <ConfirmModal title={`${switching.active ? 'Activar' : 'Desactivar'} ${versionLabel(switching.template)}`}
                              confirmLabel={switching.active ? 'Activar' : 'Desactivar'} cancelLabel="Volver"
                              confirmColor={switching.active ? 'blue' : 'red'} onConfirm={confirmSwitch} onClose={() => setSwitching(null)}>
                    {switchWarning(switching, activeTemplateOf(rows, switching.template.assetType))}
                </ConfirmModal>
            )}
        </Stack>
    )
}

function templateLabel(template) {
    return `${template.name ?? ASSET_TYPE.label(template.assetType)} (versión ${template.version ?? '?'})`
}

/** «la versión 2 de Perfil»: cómo se nombra una versión en sus botones, sus diálogos y sus avisos. */
function versionLabel(template) {
    return `la versión ${template.version} de ${ASSET_TYPE.label(template.assetType)}`
}

/** Quién la creó y cuándo, en la zona de la persona; de un servicio anterior, sin audit, nada. */
function createdText(template) {
    return [template.audit?.createdBy, formatDateTime(template.audit?.createdAt)].filter(Boolean).join(' · ')
}

/** Lo que pasa al activar o desactivar una versión, dicho antes de hacerlo. */
function switchWarning({template, active}, current) {
    const type = ASSET_TYPE.label(template.assetType)
    if (!active) {
        return `${type} se queda sin plantilla activa: las inspecciones nuevas de ese tipo no tendrán checklist hasta que se active una versión. `
            + 'Las ya creadas no cambian.'
    }
    const copies = `Las inspecciones nuevas de ${type} copiarán los puntos de la versión ${template.version}; las ya creadas no cambian.`
    return current ? `La versión ${current.version}, la activa ahora, pasa a anterior. ${copies}` : copies
}
