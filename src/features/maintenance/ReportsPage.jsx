import {Button, Group, Select, Stack, Text, Title} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {IconDownload, IconSearch} from '@tabler/icons-react'
import {useMutation} from '@tanstack/react-query'
import {useState} from 'react'
import {toYearMonthParam} from '../../api/dates.js'
import {ASSET_TYPE, REPORT_FORMATS} from '../../api/maintenance/enums.js'
import {downloadMonthlyReport, downloadProgressReport, getMonthlyReport, getProgressReport} from '../../api/maintenance/reports.js'
import DataTable from '../../ui/DataTable.jsx'
import {formatPercent, formatQuantity} from '../../ui/format.js'
import LazyTabs from '../../ui/LazyTabs.jsx'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import {ReferenceSelect} from './MaintenancePickers.jsx'
import {countText} from './maintenanceTexts.js'
import {useConfigurationNames} from './useMaintenanceNames.js'

const MONTHS = 24

/**
 * mantenimiento/informes: los informes de mantenimiento (el port de ReportsView), el avance del
 * preventivo y el resumen de un mes. Cada consulta pide el JSON y lo pinta con los nombres de paquetes
 * y vías; las cifras son las del servicio (el avance llega como fracción y solo se pinta como
 * porcentaje). Tras consultar aparecen los ficheros Excel y PDF de esa misma consulta, fijada al
 * pulsar: descargan lo que se ve aunque luego cambien los filtros. Un fallo se avisa y no deja nada.
 */
export default function ReportsPage({title}) {
    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <LazyTabs tabs={[
                {value: 'progress', label: 'Avance', render: () => <ProgressReport/>},
                {value: 'monthly', label: 'Mensual', render: () => <MonthlyReport/>},
            ]}/>
        </Stack>
    )
}

function ProgressReport() {
    const names = useConfigurationNames({tracks: true})
    const [filters, setFilters] = useState({executionPackageId: null, trackId: null, assetType: null, from: null, to: null})
    const change = (field) => (value) => setFilters((previous) => ({...previous, [field]: value}))
    // Una consulta es una acción: lo que se pidió queda en variables, y es lo que descargan los ficheros.
    const report = useMutation({mutationFn: (query) => getProgressReport(query)})
    const data = report.isSuccess ? report.data : null

    const columns = [
        {key: 'package', label: 'Paquete', render: (row) => names.packageName(row.executionPackageId)},
        {key: 'track', label: 'Vía', render: (row) => names.trackName(row.trackId)},
        {key: 'type', label: 'Tipo', render: (row) => (row.assetType ? ASSET_TYPE.label(row.assetType) : '')},
        {key: 'checked', label: 'Revisados', render: (row) => `${row.checkedAssets} de ${row.totalAssets}`},
        {key: 'ratio', label: 'Avance', render: (row) => formatPercent(row.completionRatio)},
        {key: 'km', label: 'Km', render: (row) => `${formatQuantity(row.coveredKm)} de ${formatQuantity(row.totalKm)} km`},
    ]

    return (
        <Stack>
            <Group align="flex-end" gap="sm">
                <ReferenceSelect label="Paquete" placeholder="Todos" w={200} options={names.packageOptions} value={filters.executionPackageId}
                                 onChange={change('executionPackageId')}/>
                <ReferenceSelect label="Vía" placeholder="Todas" w={220} options={names.trackOptions} value={filters.trackId}
                                 onChange={change('trackId')}/>
                <Select label="Tipo de activo" placeholder="Todos" clearable w={180} data={ASSET_TYPE.selectable()} value={filters.assetType}
                        onChange={change('assetType')}/>
                <DateInput label="Desde" clearable w={150} valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                           value={filters.from} onChange={change('from')}/>
                <DateInput label="Hasta" clearable w={150} valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                           value={filters.to} onChange={change('to')}/>
                <Button leftSection={<IconSearch size={16}/>} loading={report.isPending} onClick={() => report.mutate({...filters})}>Consultar</Button>
            </Group>
            {data && (
                <>
                    <Text size="sm" aria-label="Resumen del avance">
                        {`${data.checkedAssets} de ${data.totalAssets} activos revisados (${formatPercent(data.completionRatio)}) · `
                            + `${formatQuantity(data.coveredKm)} de ${formatQuantity(data.totalKm)} km`}
                    </Text>
                    <Downloads label="el avance" download={(format) => downloadProgressReport(report.variables, format)}/>
                    <DataTable ariaLabel="Avance por paquete, vía y tipo" columns={columns} rows={data.rows ?? []}
                               rowKey={(row) => `${row.executionPackageId}-${row.trackId}-${row.assetType}`} emptyText="Nada que revisar con esos filtros."
                               minWidth={760}/>
                </>
            )}
        </Stack>
    )
}

function MonthlyReport() {
    const names = useConfigurationNames()
    const months = lastMonths(MONTHS)
    const [month, setMonth] = useState(months[0].value)
    const [packageId, setPackageId] = useState(null)
    const [error, setError] = useState(null)
    const report = useMutation({mutationFn: (query) => getMonthlyReport(query)})
    const data = report.isSuccess ? report.data : null

    const query = () => {
        if (!month) {
            setError('Elige un mes')
            return
        }
        setError(null)
        report.mutate({month, executionPackageId: packageId})
    }

    const columns = [
        {key: 'material', label: 'Material', render: (line) => line.materialCode ?? ''},
        {key: 'consumed', label: 'Consumido', render: (line) => formatQuantity(line.consumedQuantity)},
        {key: 'unit', label: 'Unidad', render: (line) => line.unit ?? ''},
    ]

    return (
        <Stack>
            <Group align="flex-end" gap="sm">
                <Select label="Mes" w={200} data={months} value={month} onChange={setMonth} error={error} clearable/>
                <ReferenceSelect label="Paquete" placeholder="Todos" w={200} options={names.packageOptions} value={packageId} onChange={setPackageId}/>
                <Button leftSection={<IconSearch size={16}/>} loading={report.isPending} onClick={query}>Consultar</Button>
            </Group>
            {data && (
                <>
                    <Stack gap={2} aria-label="Resumen del mes">
                        <Text size="sm">
                            {`Turnos: ${countText(data.shiftsPlanned, 'planificado', 'planificados')}, ${countText(data.shiftsClosed, 'cerrado', 'cerrados')}, `
                                + `${countText(data.shiftsCancelled, 'cancelado', 'cancelados')} · ${data.netWorkMinutes} min netos `
                                + `(${formatQuantity(data.averageNetMinutesPerShift)} por turno)`}
                        </Text>
                        <Text size="sm">
                            {`Órdenes completadas: ${data.ordersCompleted} · Tareas completadas: ${data.tasksCompleted} · `
                                + `Perfiles revisados: ${data.profilesChecked} · ${formatQuantity(data.coveredKm)} km`}
                        </Text>
                        <Text size="sm">
                            {`Defectos: ${countText(data.defectsDetected, 'detectado', 'detectados')}, ${countText(data.defectsResolved, 'resuelto', 'resueltos')}`
                                + ` · Órdenes correctivas: ${data.correctiveOrdersCreated}`}
                        </Text>
                    </Stack>
                    <Downloads label="el mes" download={(format) => downloadMonthlyReport(report.variables, format)}/>
                    <DataTable ariaLabel="Materiales consumidos en el mes" columns={columns} rows={data.materials ?? []}
                               rowKey={(line) => line.materialId ?? line.materialCode} emptyText="Ningún material consumido."/>
                </>
            )}
        </Stack>
    )
}

/** Los ficheros de la consulta que se ve: uno por formato, pedidos con el token de la persona. */
function Downloads({label, download}) {
    const saving = useMutation({mutationFn: download})
    return (
        <Group gap="sm" aria-label={`Descargar ${label}`}>
            {REPORT_FORMATS.map((format) => (
                <Button key={format.value} variant="default" leftSection={<IconDownload size={16}/>}
                        loading={saving.isPending && saving.variables === format.value} onClick={() => saving.mutate(format.value)}>
                    {format.label}
                </Button>
            ))}
        </Group>
    )
}

/** Los últimos meses, el actual primero: «octubre 2026», que viaja como 2026-10. */
function lastMonths(count) {
    const now = new Date()
    const name = new Intl.DateTimeFormat('es', {month: 'long'})
    return Array.from({length: count}, (_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth() - index, 1)
        return {value: toYearMonthParam(date), label: `${name.format(date)} ${date.getFullYear()}`}
    })
}
