import {Badge, Button, Center, Group, Loader, Stack, Text, Title} from '@mantine/core'
import {IconAlertTriangle, IconArrowLeft, IconHistory, IconListCheck, IconPencil, IconRefresh, IconTool} from '@tabler/icons-react'
import {useState} from 'react'
import {Navigate, useNavigate, useParams} from 'react-router'
import {NotFoundError} from '../../api/errors.js'
import {CHECK_ITEM_RESULT, INSPECTION_KIND, INSPECTION_RESULT, inspectionFoundSomething} from '../../api/maintenance/enums.js'
import {inspectionRevisionsPath} from '../../api/maintenance/inspections.js'
import {itemsInOrder} from '../../api/maintenance/tasks.js'
import {assetLabel} from '../../api/maintenance/values.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import DataTable from '../../ui/DataTable.jsx'
import {errorMessage} from '../../ui/errors/messages.js'
import {formatDate, formatQuantity} from '../../ui/format.js'
import RevisionsModal from '../../ui/RevisionsModal.jsx'
import CheckItemsModal from './CheckItemsModal.jsx'
import InspectionEditorModal from './InspectionEditorModal.jsx'
import {CorrectiveOrderModal, DefectFromInspectionModal} from './InspectionOutcomeModals.jsx'
import {defectPath, INSPECTIONS_PATH, orderPath} from './maintenanceRoutes.js'
import {describeInspection, kp} from './maintenanceTexts.js'
import {useConfigurationNames} from './useMaintenanceNames.js'
import {useInspection, useSaveInspectionItem} from './useMaintenance.js'

/** mantenimiento/inspecciones/:inspectionId: la ficha de una inspección (el port de InspectionDetailView), con key por id. */
export default function InspectionDetailPage() {
    const {inspectionId} = useParams()
    return <InspectionDetail key={inspectionId} inspectionId={inspectionId}/>
}

/**
 * La cabecera, los puntos (contestables con maintenance-write) y lo que generó. Si el resultado
 * encontró algo, se ofrecen «Crear defecto» y «Crear orden correctiva»; una vez creados, en su lugar
 * están los enlaces a ellos (el servicio devolvería lo mismo: las dos llamadas son idempotentes).
 */
function InspectionDetail({inspectionId}) {
    const session = useSession()
    const canWrite = session.has(P.MAINTENANCE_WRITE)
    const navigate = useNavigate()
    const names = useConfigurationNames({tracks: true})
    const inspection = useInspection(inspectionId)
    const saving = useSaveInspectionItem(inspectionId)
    // El diálogo abierto: 'edit', 'items', 'defect', 'order' o 'history'.
    const [dialog, setDialog] = useState(null)
    const close = () => setDialog(null)

    if (inspection.error instanceof NotFoundError) {
        return <Navigate to={INSPECTIONS_PATH} replace/>
    }
    if (inspection.isError && !inspection.data) {
        return (
            <Stack align="flex-start">
                <Text>No se ha podido leer la inspección: {errorMessage(inspection.error)}</Text>
                <Group>
                    <Button variant="default" leftSection={<IconArrowLeft size={16}/>} onClick={() => navigate(INSPECTIONS_PATH)}>Volver a la lista</Button>
                    <Button leftSection={<IconRefresh size={16}/>} loading={inspection.isFetching} onClick={() => void inspection.refetch()}>
                        Reintentar
                    </Button>
                </Group>
            </Stack>
        )
    }
    if (!inspection.data) {
        return <Center py="xl"><Loader aria-label="Cargando la inspección"/></Center>
    }

    const current = inspection.data
    const foundSomething = inspectionFoundSomething(current.result)
    const items = itemsInOrder(current.items)
    const saveItem = (item, patch) => saving.mutateAsync({itemId: item.id, patch}).then((updated) => updated?.items ?? [])

    const columns = [
        {key: 'code', label: 'Código', render: (item) => item.code},
        {key: 'label', label: 'Punto', render: (item) => item.label ?? ''},
        {key: 'measured', label: 'Medida', render: (item) => measure(item.measuredValue, item.unit)},
        {key: 'adjusted', label: 'Tras el ajuste', render: (item) => formatQuantity(item.valueAfterAdjustment)},
        {key: 'result', label: 'Resultado', render: (item) => (item.itemResult ? CHECK_ITEM_RESULT.label(item.itemResult) : '')},
        {key: 'range', label: 'Rango', render: (item) => (item.outOfRange === true ? 'Fuera de rango' : '')},
    ]

    return (
        <Stack>
            <Group gap="sm" align="center">
                <Title order={2}>{`${current.code} · ${formatDate(current.inspectionDate)}`}</Title>
                <Badge aria-label="Resultado de la inspección" variant="light" color={resultColor(current.result)}>
                    {INSPECTION_RESULT.label(current.result)}
                </Badge>
            </Group>
            <Stack gap={2} aria-label="Resumen de la inspección">
                <Text size="sm">
                    {[`Activo: ${assetLabel(current.asset)}`, `Vía: ${names.trackName(current.trackId)}`, `KP ${kp(current.kp) || '-'}`,
                        `Tipo: ${current.inspectionKind ? INSPECTION_KIND.label(current.inspectionKind) : '-'}`,
                        `Inspector: ${current.inspector ?? '-'}`].join(' · ')}
                </Text>
                {[['Descripción', current.description], ['Defectos observados', current.detectedDefects],
                    ['Acciones recomendadas', current.recommendedActions]].filter(([, text]) => text?.trim()).map(([label, text]) => (
                    <Text key={label} size="sm">{`${label}: ${text}`}</Text>
                ))}
            </Stack>
            <Group gap="sm">
                <Button variant="default" leftSection={<IconArrowLeft size={16}/>} onClick={() => navigate(INSPECTIONS_PATH)}>Volver a la lista</Button>
                <Button variant="default" leftSection={<IconHistory size={16}/>} onClick={() => setDialog('history')}>Historial</Button>
                {current.originOrderId && (
                    <Button variant="default" leftSection={<IconTool size={16}/>} onClick={() => navigate(orderPath(current.originOrderId))}>
                        Orden de origen
                    </Button>
                )}
                {canWrite && <Button leftSection={<IconPencil size={16}/>} onClick={() => setDialog('edit')}>Modificar</Button>}
                {canWrite && items.length > 0 && (
                    <Button variant="default" leftSection={<IconListCheck size={16}/>} onClick={() => setDialog('items')}>Contestar puntos</Button>
                )}
                {current.generatedDefectId
                    ? (
                        <Button variant="default" leftSection={<IconAlertTriangle size={16}/>} onClick={() => navigate(defectPath(current.generatedDefectId))}>
                            Ver el defecto
                        </Button>
                    )
                    : canWrite && foundSomething && (
                        <Button leftSection={<IconAlertTriangle size={16}/>} onClick={() => setDialog('defect')}>Crear defecto</Button>
                    )}
                {current.generatedOrderId
                    ? (
                        <Button variant="default" leftSection={<IconTool size={16}/>} onClick={() => navigate(orderPath(current.generatedOrderId))}>
                            Ver la orden correctiva
                        </Button>
                    )
                    : canWrite && foundSomething && (
                        <Button leftSection={<IconTool size={16}/>} onClick={() => setDialog('order')}>Crear orden correctiva</Button>
                    )}
            </Group>
            <Title order={3}>Puntos</Title>
            <DataTable ariaLabel={`Puntos de ${current.code}`} columns={columns} rows={items} emptyText="La inspección no tiene puntos." minWidth={760}/>
            {dialog === 'edit' && <InspectionEditorModal inspection={current} onClose={close}/>}
            {dialog === 'items' && <CheckItemsModal title={`Puntos de ${current.code}`} items={current.items} save={saveItem} onClose={close}/>}
            {dialog === 'defect' && <DefectFromInspectionModal inspection={current} onClose={close}/>}
            {dialog === 'order' && (
                <CorrectiveOrderModal inspection={current} onClose={close} onCreated={(order) => navigate(orderPath(order.id))}/>
            )}
            {dialog === 'history' && (
                <RevisionsModal label={current.code} path={inspectionRevisionsPath(current.id)} describe={describeInspection} onClose={close}/>
            )}
        </Stack>
    )
}

function measure(value, unit) {
    if (value === null || value === undefined) {
        return ''
    }
    return unit ? `${formatQuantity(value)} ${unit}` : formatQuantity(value)
}

function resultColor(result) {
    if (result === 'OK') {
        return 'teal'
    }
    return result === 'UNSAFE' || result === 'MAJOR_DEFECT' ? 'red' : 'yellow'
}
