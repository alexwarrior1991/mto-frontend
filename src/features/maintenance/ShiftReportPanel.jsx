import {Button, Group, Stack, Text} from '@mantine/core'
import {IconDownload, IconExternalLink} from '@tabler/icons-react'
import {useMutation} from '@tanstack/react-query'
import {useNavigate} from 'react-router'
import {INSPECTION_KIND, INSPECTION_RESULT, REPORT_FORMATS, TASK_STATUS} from '../../api/maintenance/enums.js'
import {downloadShiftReport} from '../../api/maintenance/reports.js'
import {assetLabel} from '../../api/maintenance/values.js'
import {INSTRUMENT_KIND} from '../../api/resources/enums.js'
import DataTable from '../../ui/DataTable.jsx'
import {formatDate} from '../../ui/format.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import {inspectionPath} from './maintenanceRoutes.js'
import {countText, kp} from './maintenanceTexts.js'
import {useShiftReport} from './useMaintenance.js'

/**
 * El parte diario del turno como lo compone el servicio (el port de ShiftReportPanel): sus recuentos,
 * una fila por tarea trabajada (un perfil o un aislador), las inspecciones registradas en el turno, los
 * instrumentos que llevó con su calibración, y el mismo parte en Excel o PDF, pedido con el token de la
 * persona. Aquí no se cuenta nada: el número de inspecciones también es del servicio.
 */
export default function ShiftReportPanel({shift}) {
    const navigate = useNavigate()
    const report = useShiftReport(shift.id)
    const download = useMutation({mutationFn: (format) => downloadShiftReport(shift.id, format, {fallbackName: `parte-${shift.code}.${format}`})})
    const data = report.data

    const columns = [
        {key: 'number', label: '#', render: (row) => row.number},
        {key: 'order', label: 'Orden', render: (row) => row.orderCode ?? ''},
        {key: 'profile', label: 'Activo', render: (row) => row.profileName ?? row.profileCode ?? ''},
        {key: 'kp', label: 'KP', render: (row) => kp(row.kp)},
        {key: 'types', label: 'Tipos', render: (row) => (row.taskTypeCodes ?? []).join(', ')},
        {key: 'works', label: 'Trabajos', render: (row) => row.worksPerformed ?? ''},
        {key: 'defects', label: 'Defectos', render: (row) => row.defectsFound ?? ''},
        {key: 'materials', label: 'Materiales', render: (row) => (row.materials ?? []).join(', ')},
        {key: 'status', label: 'Estado', render: (row) => TASK_STATUS.label(row.status)},
    ]
    const inspectionColumns = [
        {key: 'code', label: 'Código', render: (row) => row.code},
        {key: 'inspectionDate', label: 'Fecha', render: (row) => formatDate(row.inspectionDate)},
        {key: 'asset', label: 'Activo', render: (row) => assetLabel({code: row.assetCode, name: row.assetName})},
        {key: 'kp', label: 'KP', render: (row) => kp(row.kp)},
        {key: 'kind', label: 'Tipo', render: (row) => INSPECTION_KIND.label(row.inspectionKind)},
        {key: 'result', label: 'Resultado', render: (row) => INSPECTION_RESULT.label(row.result)},
        {key: 'inspector', label: 'Inspector', render: (row) => row.inspector ?? ''},
        {key: 'findings', label: 'Observado', render: (row) => row.detectedDefects ?? ''},
        {key: 'opened', label: 'Generó', render: (row) => [row.generatedDefectCode, row.generatedOrderCode].filter(Boolean).join(', ')},
    ]
    const instrumentColumns = [
        {key: 'code', label: 'Código', render: (row) => row.code},
        {key: 'name', label: 'Nombre', render: (row) => row.name ?? ''},
        {key: 'kind', label: 'Tipo', render: (row) => INSTRUMENT_KIND.label(row.kind)},
        {key: 'calibration', label: 'Calibración hasta', render: (row) => formatDate(row.calibrationExpiresOn)},
    ]

    return (
        <Stack>
            {data && <Text size="sm" aria-label="Resumen del parte">{summary(data)}</Text>}
            <Group gap="sm">
                {REPORT_FORMATS.map((format) => (
                    <Button key={format.value} variant="default" leftSection={<IconDownload size={16}/>}
                            loading={download.isPending && download.variables === format.value} onClick={() => download.mutate(format.value)}>
                        {format.label}
                    </Button>
                ))}
            </Group>
            <DataTable ariaLabel={`Parte de ${shift.code}`} columns={columns} rows={data?.rows ?? []} rowKey={(row) => row.taskId ?? row.number}
                       loading={report.isPending} minWidth={1100}
                       emptyText={report.isError ? 'No se ha podido leer el parte.' : 'El turno no tiene tareas trabajadas.'}/>
            <Text fw={500}>Inspecciones</Text>
            <DataTable ariaLabel={`Inspecciones de ${shift.code}`} columns={inspectionColumns} rows={data?.inspections ?? []}
                       rowKey={(row) => row.inspectionId ?? row.code} loading={report.isPending} minWidth={1000}
                       emptyText={report.isError ? 'No se ha podido leer el parte.' : 'No se registró ninguna inspección en el turno.'}
                       rowActions={(row) => <RowActionButton label={`Abrir ${row.code}`} tooltip="Abrir la inspección" icon={IconExternalLink}
                                                             onClick={() => navigate(inspectionPath(row.inspectionId))}/>}/>
            <Text fw={500}>Instrumentos</Text>
            <DataTable ariaLabel={`Instrumentos de ${shift.code}`} columns={instrumentColumns} rows={instrumentsOf(data)} loading={report.isPending}
                       emptyText={report.isError ? 'No se ha podido leer el parte.' : 'El turno no llevó instrumentos.'}/>
        </Stack>
    )
}

/** Los instrumentos del parte: los suyos, o los del turno que trae (un servicio anterior no trae ninguno). */
function instrumentsOf(report) {
    return report?.instruments ?? report?.shift?.instruments ?? []
}

function summary(report) {
    return `Tareas: ${countText(report.tasksCompleted, 'completada', 'completadas')}, ${countText(report.tasksPending, 'pendiente', 'pendientes')}`
        + ` · Perfiles revisados: ${report.profilesReviewed}`
        + ` · Defectos: ${countText(report.defectsFound, 'encontrado', 'encontrados')}, ${countText(report.defectsResolved, 'resuelto', 'resueltos')}`
        + (report.inspectionsRecorded === undefined ? '' : ` · Inspecciones: ${report.inspectionsRecorded}`)
}
