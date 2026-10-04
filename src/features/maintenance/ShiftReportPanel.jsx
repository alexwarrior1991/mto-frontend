import {Button, Group, Stack, Text} from '@mantine/core'
import {IconDownload} from '@tabler/icons-react'
import {useMutation} from '@tanstack/react-query'
import {REPORT_FORMATS, TASK_STATUS} from '../../api/maintenance/enums.js'
import {downloadShiftReport} from '../../api/maintenance/reports.js'
import DataTable from '../../ui/DataTable.jsx'
import {countText, kp} from './maintenanceTexts.js'
import {useShiftReport} from './useMaintenance.js'

/**
 * El parte diario del turno como lo compone el servicio (el port de ShiftReportPanel): sus recuentos y
 * una fila por tarea trabajada, y el mismo parte en Excel o PDF, pedido con el token de la persona.
 */
export default function ShiftReportPanel({shift}) {
    const report = useShiftReport(shift.id)
    const download = useMutation({mutationFn: (format) => downloadShiftReport(shift.id, format, {fallbackName: `parte-${shift.code}.${format}`})})
    const data = report.data

    const columns = [
        {key: 'number', label: '#', render: (row) => row.number},
        {key: 'order', label: 'Orden', render: (row) => row.orderCode ?? ''},
        {key: 'profile', label: 'Perfil', render: (row) => row.profileName ?? row.profileCode ?? ''},
        {key: 'kp', label: 'KP', render: (row) => kp(row.kp)},
        {key: 'types', label: 'Tipos', render: (row) => (row.taskTypeCodes ?? []).join(', ')},
        {key: 'works', label: 'Trabajos', render: (row) => row.worksPerformed ?? ''},
        {key: 'defects', label: 'Defectos', render: (row) => row.defectsFound ?? ''},
        {key: 'materials', label: 'Materiales', render: (row) => (row.materials ?? []).join(', ')},
        {key: 'status', label: 'Estado', render: (row) => TASK_STATUS.label(row.status)},
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
        </Stack>
    )
}

function summary(report) {
    return `Tareas: ${countText(report.tasksCompleted, 'completada', 'completadas')}, ${countText(report.tasksPending, 'pendiente', 'pendientes')}`
        + ` · Perfiles revisados: ${report.profilesReviewed}`
        + ` · Defectos: ${countText(report.defectsFound, 'encontrado', 'encontrados')}, ${countText(report.defectsResolved, 'resuelto', 'resueltos')}`
}
